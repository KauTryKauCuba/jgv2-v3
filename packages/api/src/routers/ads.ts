import { AD_REQUEST_STATUS, adRequests, ads as adsTable } from "@jobgiga-app/db/schema/ads";
import { organization } from "@jobgiga-app/db/schema/auth";
import { JOB_STATUS, job } from "@jobgiga-app/db/schema/jobs";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, protectedProcedure, publicProcedure } from "../index";
import {
	AD_TYPE_FOR,
	type AdKind,
	approveAdRequestQueries,
	loadAdvertisableJobs,
	loadAllBookings,
	loadCompanyBookings,
	loadLiveAds,
	loadPlacement,
	loadSlotBookings,
	type Placement,
	syncAds,
	toAdId,
} from "../lib/ads/bookings";
import { loadEmployerAccess } from "../lib/employer/dashboard";
import { fileUrl, saveBufferUpload } from "../lib/uploads";
import {
	AD_HEADLINE_MAX,
	AD_IMAGE_MAX_BYTES,
	AD_VIDEO_MAX_BYTES,
	adPhase,
	checkCapacity,
	checkStart,
	dailySlotCounts,
	formatAdDate,
	isIsoDate,
	lastBookableStart,
	nextFreeStart,
	runEndDate,
	todayMY,
} from "../shared/ad-slots";

// The redesign's advertisement routes on v1's ad tables (lib/ads/bookings.ts):
// - employer: /api/employer/advertisement + /api/employer/job-ads (book,
//   edit, book again, cancel) → `page`, `book`, `cancel`;
// - superadmin: /api/superadmin/company-ads/[id] + job-ads/[id] → `adminList`, `review`;
// - public: the landing page's and job search's live ads → `live`.
// Not ported: notifications (none in v3 yet), ffmpeg video conversion (videos
// are stored as uploaded — the user's choice), and v1's ad credits (billing
// is still undecided).

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed here.
type AnyDb = any;

const kindSchema = z.enum(["company", "job"]);

function bad(message: string): never {
	throw new ORPCError("BAD_REQUEST", { message });
}

async function placementOrFail(db: AnyDb, kind: AdKind): Promise<Placement> {
	const placement = await loadPlacement(db, kind);
	if (!placement) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Ad placements aren't set up." });
	return placement;
}

/** The redesign's getFullEmployerAccess: only an Owner or Admin manages ads. */
async function requireAdEmployer(db: AnyDb, userId: string, activeOrganizationId: string | null) {
	const access = await loadEmployerAccess(db, userId, activeOrganizationId);
	if (!access) throw new ORPCError("UNAUTHORIZED", { message: "Not signed in as an employer." });
	if (!access.fullAccess) throw new ORPCError("FORBIDDEN", { message: "Only an owner or admin can manage advertisements." });
	return access;
}

async function ownRequest(db: AnyDb, id: string, companyId: string, placementId: number) {
	const numeric = Number(id);
	if (!Number.isInteger(numeric) || numeric <= 0) return null;
	const [row] = (await db
		.select()
		.from(adRequests)
		.where(and(eq(adRequests.id, numeric), eq(adRequests.companyId, companyId), eq(adRequests.placementId, placementId)))
		.limit(1)) as AnyDb[];
	return row ?? null;
}

function reasonMessage(kind: AdKind, reason: "past" | "too_far" | "full" | "overlap", placement: Placement) {
	switch (reason) {
		case "past":
			return "That date has already passed — pick today or later.";
		case "too_far":
			return `You can book up to ${placement.rules.bookAheadMonths} months ahead — pick an earlier date.`;
		case "full":
			return kind === "job"
				? `All ${placement.rules.slots} featured job slots are taken for part of that month.`
				: `All ${placement.rules.slots} slots are taken for part of that month.`;
		case "overlap":
			return kind === "job"
				? "That overlaps your other job ad booking — pick a date after it ends."
				: "That overlaps your other booking — pick a date after it ends.";
	}
}

function tooManyMessage(kind: AdKind, max: number) {
	return kind === "job"
		? `You already have ${max} job ad bookings — the most allowed. You can book again when one ends.`
		: `You already have ${max} bookings — the most allowed. You can book again when one ends.`;
}

/** Saves an uploaded image or video under company-ads/ or job-ads/. Images arrive resized by the browser. */
async function saveAdMedia(storage: AnyDb, kind: AdKind, file: File) {
	const folder = kind === "company" ? "company-ads" : "job-ads";
	if (/^image\/(jpeg|png|webp)$/.test(file.type)) {
		if (file.size > AD_IMAGE_MAX_BYTES) bad("That image is too large (max 10 MB).");
		const key = await saveBufferUpload(storage, new Uint8Array(await file.arrayBuffer()), file.type, folder);
		return { mediaType: "image" as const, mediaKey: key };
	}
	if (/^video\/(mp4|webm)$/.test(file.type)) {
		if (file.size > AD_VIDEO_MAX_BYTES) bad("That video is too large (max 100 MB).");
		const key = await saveBufferUpload(storage, new Uint8Array(await file.arrayBuffer()), file.type, folder);
		return { mediaType: "video" as const, mediaKey: key };
	}
	if (file.type.startsWith("video/")) bad("Upload the video as an MP4 or WebM file.");
	bad(kind === "job" ? "Upload artwork (a JPG, PNG or WebP image, or a video)." : "Upload a JPG, PNG or WebP image, or a video.");
}

/** "Book again": a copy of an earlier booking's file, so each booking owns its own. */
async function copyAdMedia(storage: AnyDb, kind: AdKind, mediaKey: string, mediaType: string) {
	const bytes = await storage.read(mediaKey);
	if (!bytes) bad("That ad's file is no longer available — upload it again.");
	const extension = mediaKey.split(".").pop() ?? "bin";
	const key = `${kind === "company" ? "company-ads" : "job-ads"}/${crypto.randomUUID()}.${extension}`;
	await storage.save(key, bytes);
	return { mediaType: mediaType === "video" ? ("video" as const) : ("image" as const), mediaKey: key };
}

async function deleteAdMedia(storage: AnyDb, mediaKey: string | null | undefined) {
	if (!storage || !mediaKey) return;
	try {
		await storage.delete(mediaKey);
	} catch {
		// A missing file is fine — the row is what matters.
	}
}

export const adsRouter = {
	/** Everything the employer's Advertisement page shows, both tabs. */
	page: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const access = await requireAdEmployer(db, context.session.user.id, context.activeOrganizationId);
		const companyId = access.organizationId;
		const today = todayMY();
		const [companyPlacement, jobPlacement] = await Promise.all([
			placementOrFail(db, "company"),
			placementOrFail(db, "job"),
		]);
		await Promise.all([syncAds(db, companyPlacement, today), syncAds(db, jobPlacement, today)]);

		const [org] = (await db
			.select({
				id: organization.id,
				displayName: organization.displayName,
				legalName: organization.legalName,
				logo: organization.companyLogo,
				industry: organization.industryCategory,
				ssm: organization.ssmVerificationStatus,
			})
			.from(organization)
			.where(eq(organization.id, companyId))
			.limit(1)) as AnyDb[];

		const [companySlots, companyBookings, liveCompanyAds, jobSlots, jobBookings, jobs] = await Promise.all([
			loadSlotBookings(db, companyPlacement.id, today),
			loadCompanyBookings(db, context.origin, companyPlacement.id, companyId, today),
			loadLiveAds(db, context.origin, "company", companyPlacement, today),
			loadSlotBookings(db, jobPlacement.id, today),
			loadCompanyBookings(db, context.origin, jobPlacement.id, companyId, today),
			loadAdvertisableJobs(db, companyId),
		]);
		const own = (bookings: typeof companySlots) =>
			bookings.filter((b) => b.companyId === companyId).map((b) => ({ id: b.id, startDate: b.startDate, endDate: b.endDate }));

		return {
			today,
			company: {
				id: companyId,
				name: ((org?.displayName as string | null) || (org?.legalName as string | null)) ?? "",
				logoUrl: fileUrl(context.origin, org?.logo),
				industry: (org?.industry as string | null) ?? null,
				verified: org?.ssm === "verified",
			},
			companyAds: {
				rules: companyPlacement.rules,
				counts: dailySlotCounts(companySlots, today, companyPlacement.rules),
				ownBookings: own(companySlots),
				active: companyBookings.active,
				past: companyBookings.past,
				otherLiveAds: liveCompanyAds.filter((a) => a.companyId !== companyId),
			},
			jobAds: {
				rules: jobPlacement.rules,
				counts: dailySlotCounts(jobSlots, today, jobPlacement.rules),
				ownBookings: own(jobSlots),
				active: jobBookings.active,
				past: jobBookings.past,
				jobs,
			},
		};
	}),

	/**
	 * Book (or edit) a company or job ad — the redesign's POST
	 * /api/employer/advertisement and /api/employer/job-ads:
	 * - company ads: `headline`; job ads: `jobId` (an open posting);
	 * - `startDate`: "YYYY-MM-DD", or "asap" for the earliest free date;
	 * - `media`: a new file; or `reuseFromId` (Book again); or neither when
	 *   editing (keeps the current file);
	 * - `bookingId`: edit that booking (waiting, scheduled or rejected) — it
	 *   goes back to waiting for review either way.
	 */
	book: protectedProcedure
		.input(
			z.object({
				kind: kindSchema,
				headline: z.string().optional(),
				jobId: z.string().optional(),
				startDate: z.string(),
				bookingId: z.string().optional(),
				reuseFromId: z.string().optional(),
				media: z.instanceof(File).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			const userId = context.session.user.id;
			const access = await requireAdEmployer(db, userId, context.activeOrganizationId);
			const companyId = access.organizationId;
			const kind = input.kind;
			const placement = await placementOrFail(db, kind);
			if (!context.storage) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "File storage isn't configured." });

			// What the ad is: a headline, or the job posting it features.
			let adName: string;
			let jobId: string | null = null;
			if (kind === "company") {
				const headline = (input.headline ?? "").trim();
				if (!headline) bad("Add a headline for your ad.");
				if (headline.length > AD_HEADLINE_MAX) bad(`Keep the headline to ${AD_HEADLINE_MAX} characters.`);
				adName = headline;
			} else {
				if (!input.jobId) bad("Choose the job posting to feature.");
				const [posting] = (await db
					.select({ id: job.id, title: job.title, status: job.status })
					.from(job)
					.where(and(eq(job.id, input.jobId), eq(job.organizationId, companyId)))
					.limit(1)) as AnyDb[];
				if (!posting) throw new ORPCError("NOT_FOUND", { message: "Job posting not found." });
				if (posting.status !== JOB_STATUS.PUBLISHED) bad("Only a live job posting can be featured — this one isn't open.");
				adName = posting.title;
				jobId = posting.id;
			}

			const startInput = input.startDate.trim();
			if (startInput !== "asap" && !isIsoDate(startInput)) bad("Choose a start date.");

			const today = todayMY();
			const editing = input.bookingId ? await ownRequest(db, input.bookingId, companyId, placement.id) : null;
			if (input.bookingId && !editing) throw new ORPCError("NOT_FOUND", { message: "Booking not found." });
			if (editing) {
				const phase = adPhase(editing, today);
				if (phase === "live" || phase === "ended") {
					bad("A running or finished ad can't be edited — book a new one instead.");
				}
			}
			const file = input.media && input.media.size > 0 ? input.media : null;
			const reuseFrom =
				!file && !editing && input.reuseFromId ? await ownRequest(db, input.reuseFromId, companyId, placement.id) : null;
			if (!file && !editing && !reuseFrom) {
				bad(kind === "job" ? "Upload artwork (an image or video) for your job ad." : "Upload an image or video for your ad.");
			}
			// A rejected booking holds no slot, so resubmitting it counts against
			// the per-company limit like a new booking.
			const holdsSlot = !!editing && editing.status !== AD_REQUEST_STATUS.REJECTED;
			const max = placement.rules.maxActivePerCompany;

			const all = await loadSlotBookings(db, placement.id, today);
			const own = all.filter((b) => b.companyId === companyId);
			if (!holdsSlot && own.length >= max) throw new ORPCError("CONFLICT", { message: tooManyMessage(kind, max) });

			const editId = editing ? toAdId(editing.id) : undefined;
			let startDate: string;
			if (startInput === "asap") {
				const free = nextFreeStart(today, lastBookableStart(today, placement.rules), all, own, placement.rules, editId);
				if (!free) {
					throw new ORPCError("CONFLICT", {
						message: `There's no free slot in the next ${placement.rules.bookAheadMonths} months right now — please check back soon.`,
					});
				}
				startDate = free;
			} else {
				const check = checkStart(startInput, today, all, own, placement.rules, editId);
				if (!check.ok) {
					const next = nextFreeStart(today, lastBookableStart(today, placement.rules), all, own, placement.rules, editId);
					const hint = check.reason === "full" && next ? ` The next free start is ${formatAdDate(next)}.` : "";
					throw new ORPCError("CONFLICT", { message: reasonMessage(kind, check.reason, placement) + hint });
				}
				startDate = startInput;
			}

			// Media last, after every check, so a refused booking leaves no file behind.
			const media = file
				? await saveAdMedia(context.storage, kind, file)
				: reuseFrom
					? await copyAdMedia(context.storage, kind, reuseFrom.mediaKey, reuseFrom.mediaType)
					: null;

			const values = {
				adName,
				jobId,
				startDate,
				endDate: runEndDate(startDate, placement.rules),
				status: AD_REQUEST_STATUS.PENDING,
				rejectionReason: null,
				reviewedAt: null,
				reviewedByAdminId: null,
				submittedByUserId: userId,
				updatedAt: new Date().toISOString(),
				...(media ?? {}),
			};

			let savedId: number;
			if (editing) {
				// Back to review: an approved booking gives up its `ads` slot row.
				await db.batch([
					db.update(adRequests).set(values).where(eq(adRequests.id, editing.id)),
					db.delete(adsTable).where(eq(adsTable.adRequestId, editing.id)),
				]);
				savedId = editing.id;
				if (media) await deleteAdMedia(context.storage, editing.mediaKey);
			} else {
				const [created] = (await db
					.insert(adRequests)
					.values({ ...values, companyId, placementId: placement.id, adType: AD_TYPE_FOR[kind] })
					.returning({ id: adRequests.id })) as { id: number }[];
				if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Couldn't save the booking." });
				savedId = created.id;

				// D1 has no locks (the redesign used a Postgres advisory lock): check
				// again now the row exists, and give it back if someone else took the
				// last slot for these dates at the same moment.
				const after = await loadSlotBookings(db, placement.id, today);
				const afterOwn = after.filter((b) => b.companyId === companyId);
				const recheck = checkCapacity(startDate, after, afterOwn, placement.rules, toAdId(savedId));
				if (!recheck.ok || afterOwn.length > max) {
					await db.delete(adRequests).where(eq(adRequests.id, savedId));
					await deleteAdMedia(context.storage, media?.mediaKey);
					throw new ORPCError("CONFLICT", {
						message:
							afterOwn.length > max
								? tooManyMessage(kind, max)
								: reasonMessage(kind, recheck.ok ? "full" : recheck.reason, placement),
					});
				}
			}
			return { id: toAdId(savedId), startDate, endDate: values.endDate };
		}),

	/** Cancel a booking (frees its slot) or remove a past one from the list. */
	cancel: protectedProcedure.input(z.object({ kind: kindSchema, id: z.string() })).handler(async ({ input, context }) => {
		const db = context.db as AnyDb;
		const access = await requireAdEmployer(db, context.session.user.id, context.activeOrganizationId);
		const placement = await placementOrFail(db, input.kind);
		const booking = await ownRequest(db, input.id, access.organizationId, placement.id);
		if (!booking) throw new ORPCError("NOT_FOUND", { message: "Booking not found." });
		// v1's `ads` row goes with it (on delete cascade).
		await db.delete(adRequests).where(eq(adRequests.id, booking.id));
		await deleteAdMedia(context.storage, booking.mediaKey);
		return { ok: true };
	}),

	/** Approved ads running today — the employer landing page's spotlight and the jobseeker page's featured jobs. */
	live: publicProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const today = todayMY();
		const [companyPlacement, jobPlacement] = await Promise.all([loadPlacement(db, "company"), loadPlacement(db, "job")]);
		if (companyPlacement) await syncAds(db, companyPlacement, today);
		if (jobPlacement) await syncAds(db, jobPlacement, today);
		const [companyAds, jobAds] = await Promise.all([
			companyPlacement ? loadLiveAds(db, context.origin, "company", companyPlacement, today) : [],
			jobPlacement ? loadLiveAds(db, context.origin, "job", jobPlacement, today) : [],
		]);
		return {
			companyAds: companyAds.map((a) => ({
				id: a.id,
				mediaType: a.mediaType,
				mediaUrl: a.mediaUrl,
				headline: a.headline,
				companyId: a.companyId,
				companyName: a.companyName,
				companyLogoUrl: a.companyLogoUrl,
				companyIndustry: a.companyIndustry,
				companyVerified: a.companyVerified,
			})),
			jobAds: jobAds.map((a) => ({
				id: a.id,
				mediaType: a.mediaType,
				mediaUrl: a.mediaUrl,
				jobPostingId: a.jobPostingId,
				jobTitle: a.jobTitle ?? a.headline,
				jobLocation: a.jobLocation,
				jobEmploymentType: a.jobEmploymentType,
				companyId: a.companyId,
				companyName: a.companyName,
				companyLogoUrl: a.companyLogoUrl,
				companyVerified: a.companyVerified,
			})),
		};
	}),

	/** Superadmin: every company or job ad booking, with what it is today. */
	adminList: adminProcedure.input(z.object({ kind: kindSchema })).handler(async ({ input, context }) => {
		const db = context.db as AnyDb;
		const today = todayMY();
		const placement = await placementOrFail(db, input.kind);
		await syncAds(db, placement, today);
		return { today, rules: placement.rules, ads: await loadAllBookings(db, context.origin, placement.id, today) };
	}),

	/**
	 * Superadmin: approve (it shows from its start date) or reject / take down
	 * (with a reason shown back to the employer). Rejecting frees the slot.
	 */
	review: adminProcedure
		.input(
			z.object({
				kind: kindSchema,
				id: z.string(),
				action: z.enum(["approve", "reject"]),
				reason: z.string().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			const placement = await placementOrFail(db, input.kind);
			const numeric = Number(input.id);
			const [existing] = Number.isInteger(numeric)
				? ((await db
						.select()
						.from(adRequests)
						.where(and(eq(adRequests.id, numeric), eq(adRequests.placementId, placement.id)))
						.limit(1)) as AnyDb[])
				: [];
			if (!existing) throw new ORPCError("NOT_FOUND", { message: "Not found." });
			const today = todayMY();

			if (input.action === "approve") {
				if (existing.status !== AD_REQUEST_STATUS.PENDING) bad("This ad isn't waiting for review.");
				await db.batch(await approveAdRequestQueries(db, placement, existing, context.session.user.id, today));
				return { ok: true };
			}

			const reason = (input.reason ?? "").trim();
			if (!reason) bad("Give a reason for rejecting this ad.");
			await db.batch([
				db
					.update(adRequests)
					.set({
						status: AD_REQUEST_STATUS.REJECTED,
						rejectionReason: reason,
						reviewedByAdminId: context.session.user.id,
						reviewedAt: new Date().toISOString(),
					})
					.where(eq(adRequests.id, existing.id)),
				// v1's adminDeleteAd: the running ad leaves its slot.
				db.delete(adsTable).where(eq(adsTable.adRequestId, existing.id)),
			]);
			return { ok: true };
		}),
};
