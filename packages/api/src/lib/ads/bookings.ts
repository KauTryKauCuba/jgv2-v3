import {
	AD_PLACEMENT_SLUG,
	AD_REQUEST_STATUS,
	AD_STATUS,
	AD_TYPE,
	adPlacements,
	adRequests,
	ads,
} from "@jobgiga-app/db/schema/ads";
import { organization } from "@jobgiga-app/db/schema/auth";
import { JOB_STATUS, job } from "@jobgiga-app/db/schema/jobs";
import { and, asc, desc, eq, gt, inArray, lt, lte } from "drizzle-orm";
import {
	type AdRules,
	DEFAULT_AD_RULES,
	adPhase,
	addDays,
	nextFreeStart,
	runEndDate,
	type SlotBooking,
} from "../../shared/ad-slots";
import { fileUrl } from "../uploads";

// The redesign's lib/company-ads.ts + lib/job-ads.ts on v1's ad tables:
// - a booking is an `ad_requests` row (start/end dates, pending/approved/rejected);
// - approving it adds v1's `ads` row with a slot number (see approveAdRequest);
// - "scheduled / live / ended" come from the dates, as in the redesign.
// Notifications (live, ending soon, ended, moved) aren't sent: v3 has no
// notifications yet.

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed here.
type AnyDb = any;

export type AdKind = "company" | "job";

export type Placement = { id: number; rules: AdRules };

const SLUG: Record<AdKind, string> = { company: AD_PLACEMENT_SLUG.COMPANY, job: AD_PLACEMENT_SLUG.JOB };

/** The placement row for company or job ads, with its rules. Migration 0012 adds both rows. */
export async function loadPlacement(db: AnyDb, kind: AdKind): Promise<Placement | null> {
	const [row] = (await db.select().from(adPlacements).where(eq(adPlacements.slug, SLUG[kind])).limit(1)) as AnyDb[];
	if (!row) return null;
	return {
		id: row.id as number,
		rules: {
			slots: row.maxSlots ?? DEFAULT_AD_RULES.slots,
			runDays: row.durationDays ?? DEFAULT_AD_RULES.runDays,
			bookAheadMonths: row.bookAheadMonths ?? DEFAULT_AD_RULES.bookAheadMonths,
			maxActivePerCompany: row.maxActivePerCompany ?? DEFAULT_AD_RULES.maxActivePerCompany,
		},
	};
}

/** Ids travel to the browser as strings (the redesign's uuids); v1's are integers. */
export const toAdId = (id: number) => String(id);

/** The browser URL for an ad's media. The key carries a fresh uuid, so a replaced file never shows cached. */
export function adMediaUrl(origin: string, mediaKey: string | null) {
	return fileUrl(origin, mediaKey) ?? "";
}

/**
 * Bookings holding a slot today or later: pending (held while reviewed) or
 * approved, not yet ended.
 */
export async function loadSlotBookings(
	db: AnyDb,
	placementId: number,
	today: string,
): Promise<(SlotBooking & { companyId: string })[]> {
	const rows = (await db
		.select({
			id: adRequests.id,
			companyId: adRequests.companyId,
			startDate: adRequests.startDate,
			endDate: adRequests.endDate,
		})
		.from(adRequests)
		.where(
			and(
				eq(adRequests.placementId, placementId),
				inArray(adRequests.status, [AD_REQUEST_STATUS.PENDING, AD_REQUEST_STATUS.APPROVED]),
				gt(adRequests.endDate, today),
			),
		)) as AnyDb[];
	return rows.map((r) => ({ id: toAdId(r.id), companyId: r.companyId, startDate: r.startDate, endDate: r.endDate }));
}

const companyColumns = {
	companyId: organization.id,
	companyName: organization.displayName,
	companyLegalName: organization.legalName,
	companyLogo: organization.companyLogo,
	companyIndustry: organization.industryCategory,
	companySsm: organization.ssmVerificationStatus,
};

const requestColumns = {
	id: adRequests.id,
	adType: adRequests.adType,
	adName: adRequests.adName,
	mediaKey: adRequests.mediaKey,
	mediaType: adRequests.mediaType,
	status: adRequests.status,
	rejectionReason: adRequests.rejectionReason,
	startDate: adRequests.startDate,
	endDate: adRequests.endDate,
	createdAt: adRequests.createdAt,
	updatedAt: adRequests.updatedAt,
	reviewedAt: adRequests.reviewedAt,
	jobId: adRequests.jobId,
};

const jobColumns = {
	jobTitle: job.title,
	jobLocation: job.location,
	jobEmploymentType: job.employmentType,
	jobStatus: job.status,
};

/** v1 stores "YYYY-MM-DD HH:MM:SS"; the browser gets ISO. */
function iso(value: string | null | undefined) {
	if (!value) return null;
	return value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
}

function toRow(origin: string, today: string, r: AnyDb) {
	return {
		id: toAdId(r.id),
		mediaType: (r.mediaType === "video" ? "video" : "image") as "image" | "video",
		mediaUrl: adMediaUrl(origin, r.mediaKey),
		headline: r.adName as string,
		phase: adPhase({ status: r.status, startDate: r.startDate, endDate: r.endDate }, today),
		rejectionReason: (r.rejectionReason as string | null) ?? null,
		startDate: r.startDate as string,
		endDate: r.endDate as string,
		submittedAt: iso(r.updatedAt ?? r.createdAt) as string,
		reviewedAt: iso(r.reviewedAt),
		jobPostingId: (r.jobId as string | null) ?? null,
		jobTitle: (r.jobTitle as string | null) ?? null,
		jobLocation: (r.jobLocation as string | null) ?? "",
		jobEmploymentType: (r.jobEmploymentType as string | null) ?? "",
		jobStatus: (r.jobStatus as string | null) ?? null,
		jobOpen: r.jobStatus === JOB_STATUS.PUBLISHED,
		companyId: r.companyId as string,
		companyName: ((r.companyName as string | null) || (r.companyLegalName as string | null)) ?? "",
		companyLogoUrl: fileUrl(origin, r.companyLogo),
		companyIndustry: (r.companyIndustry as string | null) ?? null,
		companyVerified: r.companySsm === "verified",
	};
}

export type AdRow = ReturnType<typeof toRow>;

/** One company's bookings: everything still active, plus its five most recent past ones. */
export async function loadCompanyBookings(db: AnyDb, origin: string, placementId: number, companyId: string, today: string) {
	const rows = (await db
		.select({ ...requestColumns, ...companyColumns, ...jobColumns })
		.from(adRequests)
		.innerJoin(organization, eq(organization.id, adRequests.companyId))
		.leftJoin(job, eq(job.id, adRequests.jobId))
		.where(and(eq(adRequests.placementId, placementId), eq(adRequests.companyId, companyId)))
		.orderBy(desc(adRequests.startDate), desc(adRequests.id))) as AnyDb[];
	const withPhase = rows.map((r) => toRow(origin, today, r));
	const active = withPhase.filter((r) => r.phase !== "ended" && r.phase !== "rejected").reverse();
	const past = withPhase.filter((r) => r.phase === "ended" || r.phase === "rejected").slice(0, 5);
	return { active, past };
}

/** Approved ads running today, up to the slot count. Job ads also need their posting open. */
export async function loadLiveAds(db: AnyDb, origin: string, kind: AdKind, placement: Placement, today: string) {
	const rows = (await db
		.select({ ...requestColumns, ...companyColumns, ...jobColumns })
		.from(adRequests)
		.innerJoin(organization, eq(organization.id, adRequests.companyId))
		.leftJoin(job, eq(job.id, adRequests.jobId))
		.where(
			and(
				eq(adRequests.placementId, placement.id),
				eq(adRequests.status, AD_REQUEST_STATUS.APPROVED),
				lte(adRequests.startDate, today),
				gt(adRequests.endDate, today),
				...(kind === "job" ? [eq(job.status, JOB_STATUS.PUBLISHED)] : []),
			),
		)
		.orderBy(asc(adRequests.startDate), asc(adRequests.reviewedAt))
		.limit(placement.rules.slots)) as AnyDb[];
	return rows.map((r) => toRow(origin, today, r));
}

/** Every booking, for the superadmin page, with what it is today. */
export async function loadAllBookings(db: AnyDb, origin: string, placementId: number, today: string) {
	const rows = (await db
		.select({ ...requestColumns, ...companyColumns, ...jobColumns })
		.from(adRequests)
		.innerJoin(organization, eq(organization.id, adRequests.companyId))
		.leftJoin(job, eq(job.id, adRequests.jobId))
		.where(eq(adRequests.placementId, placementId))
		.orderBy(asc(adRequests.startDate), asc(adRequests.createdAt))) as AnyDb[];
	return rows.map((r) => toRow(origin, today, r));
}

/** The company's open job postings — the ones a job ad can be booked for. */
export async function loadAdvertisableJobs(db: AnyDb, companyId: string) {
	const rows = (await db
		.select({ id: job.id, title: job.title, location: job.location, employmentType: job.employmentType })
		.from(job)
		.where(and(eq(job.organizationId, companyId), eq(job.status, JOB_STATUS.PUBLISHED)))
		.orderBy(desc(job.createdAt))) as AnyDb[];
	return rows.map((r) => ({
		id: r.id as string,
		title: r.title as string,
		location: (r.location as string | null) ?? "",
		employmentType: (r.employmentType as string | null) ?? "",
	}));
}

/**
 * The lowest slot number free for the whole run, among approved ads that
 * overlap it — v1's `ads.slot_number`, picked automatically instead of by
 * the superadmin (the redesign has no slot picker).
 */
async function freeSlotNumber(db: AnyDb, placement: Placement, startDate: string, endDate: string) {
	const overlapping = (await db
		.select({ slotNumber: ads.slotNumber })
		.from(ads)
		.where(and(eq(ads.placementId, placement.id), lt(ads.startsAt, endDate), gt(ads.endsAt, startDate)))) as {
		slotNumber: number;
	}[];
	const used = new Set(overlapping.map((o) => o.slotNumber));
	for (let n = 1; n <= placement.rules.slots + overlapping.length; n++) if (!used.has(n)) return n;
	return placement.rules.slots + 1;
}

/** The queries that approve a pending request: v1's status change plus its `ads` row. */
export async function approveAdRequestQueries(
	db: AnyDb,
	placement: Placement,
	request: { id: number; companyId: string; jobId: string | null; startDate: string; endDate: string },
	adminId: string,
	today: string,
) {
	const slotNumber = await freeSlotNumber(db, placement, request.startDate, request.endDate);
	return [
		db
			.update(adRequests)
			.set({
				status: AD_REQUEST_STATUS.APPROVED,
				rejectionReason: null,
				reviewedByAdminId: adminId,
				reviewedAt: new Date().toISOString(),
			})
			.where(eq(adRequests.id, request.id)),
		db.delete(ads).where(eq(ads.adRequestId, request.id)),
		db.insert(ads).values({
			adRequestId: request.id,
			companyId: request.companyId,
			jobId: request.jobId,
			placementId: placement.id,
			slotNumber,
			// Dates as v1 keeps them (comparable text); the run's day range is on the request.
			startsAt: request.startDate,
			endsAt: request.endDate,
			status: request.startDate > today ? AD_STATUS.SCHEDULED : AD_STATUS.ACTIVE,
		}),
	];
}

/**
 * The redesign's syncCompanyAds/syncJobAds housekeeping, done lazily when a
 * page with ads loads: an unreviewed booking whose start day went by moves to
 * the next free date, and v1's `ads.status` follows the dates (scheduled →
 * active → expired). No notifications yet.
 */
export async function syncAds(db: AnyDb, placement: Placement, today: string) {
	const overdue = (await db
		.select({ id: adRequests.id, companyId: adRequests.companyId, startDate: adRequests.startDate })
		.from(adRequests)
		.where(
			and(
				eq(adRequests.placementId, placement.id),
				eq(adRequests.status, AD_REQUEST_STATUS.PENDING),
				lt(adRequests.startDate, today),
			),
		)) as { id: number; companyId: string; startDate: string }[];
	for (const ad of overdue) {
		const all = await loadSlotBookings(db, placement.id, today);
		const own = all.filter((b) => b.companyId === ad.companyId);
		// From tomorrow, so the review has a day; past the usual window if needed.
		const newStart = nextFreeStart(addDays(today, 1), addDays(today, 730), all, own, placement.rules, toAdId(ad.id));
		if (!newStart) continue;
		await db
			.update(adRequests)
			.set({ startDate: newStart, endDate: runEndDate(newStart, placement.rules) })
			.where(
				and(
					eq(adRequests.id, ad.id),
					eq(adRequests.status, AD_REQUEST_STATUS.PENDING),
					eq(adRequests.startDate, ad.startDate),
				),
			);
	}
	await db.batch([
		db
			.update(ads)
			.set({ status: AD_STATUS.ACTIVE })
			.where(and(eq(ads.placementId, placement.id), eq(ads.status, AD_STATUS.SCHEDULED), lte(ads.startsAt, today))),
		db
			.update(ads)
			.set({ status: AD_STATUS.EXPIRED })
			.where(
				and(
					eq(ads.placementId, placement.id),
					inArray(ads.status, [AD_STATUS.SCHEDULED, AD_STATUS.ACTIVE]),
					lte(ads.endsAt, today),
				),
			),
	]);
}

export const AD_TYPE_FOR: Record<AdKind, string> = { company: AD_TYPE.COMPANY, job: AD_TYPE.JOB };
