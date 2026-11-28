import { member, organization, organizationAddress, organizationBadge, user } from "@jobgiga-app/db/schema/auth";
import { employerOnboardingDraft } from "@jobgiga-app/db/schema/onboarding";
import { ORPCError } from "@orpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { lookupCompany } from "../lib/employer/company-lookup";
import { hasFullAccess, loadCurrentCompany } from "../lib/employer/access";
import { loadCompanyLimitInfo, loadMemberships, pickMembership, setActiveCompanyQuery } from "../lib/employer/memberships";
import { toTeamRole } from "../shared/team-roles";
import { getSalaryInsight, suggestJobPosting, suggestPostingSkills, suggestSalary } from "../lib/employer/job-ai";
import { buildDashboardData, computeMatchResults, loadEmployerAccess } from "../lib/employer/dashboard";
import { loadHiringManagerOptions } from "../lib/employer/scope";
import { sanitizeDescriptionHtml } from "../lib/sanitize-html";
import type { Storage } from "../lib/storage/types";
import {
	fileUrl,
	isBase64DataUrl,
	keyFromFileUrl,
	saveBase64Upload,
	saveBufferUpload,
	type UploadCategory,
} from "../lib/uploads";
import {
	AWARD_TITLE_MAX,
	DRESS_CODES,
	GALLERY_PHOTO_KEY,
	LEADER_FIELD_MAX,
	LEADER_PHOTO_KEY,
	MAX_AWARDS,
	MAX_GALLERY_PHOTOS,
	MAX_LEADERS,
	parseFacilities,
} from "../shared/company-workplace";
import { INDUSTRIES } from "../shared/industries";
import { CRITERIA_KEYS, type CriteriaFlags } from "../shared/matching";
import { MALAYSIA_STATES } from "../shared/malaysia";
import { isValidMalaysianPhone, toMalaysianMobileE164 } from "../shared/phone";
import { toIso } from "../shared/application-status";
import type { EmployerAddress, EmployerProfile } from "../shared/employer-profile";

// The redesign's /api/employer/{onboarding-draft,lookup-company,uploads,
// profile} routes as oRPC procedures. Validation rules and error messages are
// kept exactly. Changed for v3:
// - the company is v1's `organization` row (v1 column names where they
//   exist) and "About you" is the registrant's `member` row;
// - files go through the storage module — the database stores keys, the
//   browser gets /files/ URLs (SSM certificates are private, see
//   lib/storage/file-access.ts);
// - photos are resized in the browser before upload (the redesign used
//   sharp on the server, which can't run on Cloudflare Workers);
// - only first-time onboarding is ported for saving. Editing an existing
//   company (PATCH, Company Profile, teammates, "Add a company") comes with
//   those pages.

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed like the other routers.
type AnyDb = any;

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"] as const;
const COMPANY_TYPES = ["Startup", "SME", "MNC", "GLC", "Government"] as const;
// Read per request: on Cloudflare Workers, Date at module load (outside a
// request) is 1970, so a module-level constant would be wrong there.
const currentYear = () => new Date().getFullYear();
const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const SSM_DOCUMENT_DATA_URL = /^data:(application\/pdf|image\/(jpeg|png|webp));base64,/;
const SSM_DOCUMENT_KEY = /^ssm-documents\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/;
const BANNER_KEY = /^banners\/[0-9a-f-]{36}\.(webp|png|jpg)$/;

function bad(message: string): never {
	throw new ORPCError("BAD_REQUEST", { message });
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
	return value === undefined || value === null || typeof value === "string";
}

function isValidEmail(value: unknown): value is string {
	return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

type NewsItem = { title: string; url: string };

function isNewsItemArray(value: unknown): value is NewsItem[] {
	return (
		Array.isArray(value) &&
		value.every(
			(item) =>
				item &&
				typeof item === "object" &&
				isNonEmptyString((item as Record<string, unknown>).title) &&
				isNonEmptyString((item as Record<string, unknown>).url),
		)
	);
}

type AddressInput = {
	label: string;
	addressLine1: string;
	addressLine2: string | null;
	area?: string | null;
	city: string;
	state: (typeof MALAYSIA_STATES)[number];
	postcode: string;
	isJobDefault?: boolean;
};

function isValidAddressArray(value: unknown): value is AddressInput[] {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		value.every((item) => {
			if (!item || typeof item !== "object") return false;
			const a = item as Record<string, unknown>;
			return (
				isNonEmptyString(a.label) &&
				isNonEmptyString(a.addressLine1) &&
				isOptionalString(a.addressLine2) &&
				isOptionalString(a.area) &&
				(typeof a.area !== "string" || a.area.trim().length <= 80) &&
				isNonEmptyString(a.city) &&
				typeof a.state === "string" &&
				(MALAYSIA_STATES as readonly string[]).includes(a.state) &&
				typeof a.postcode === "string" &&
				/^\d{5}$/.test(a.postcode.trim())
			);
		})
	);
}

type WorkplaceValues = {
	galleryPhotos?: string[];
	facilities?: string[];
	dressCode?: string | null;
	awards?: { title: string; year: number | null }[];
	leaders?: { name: string; title: string; photoKey: string | null }[];
};

// The redesign's parseWorkplace — photos arrive as URLs this API handed out
// and are checked as storage keys.
function parseWorkplace(input: Record<string, unknown>): { ok: true; values: WorkplaceValues } | { ok: false; error: string } {
	const values: WorkplaceValues = {};
	const { galleryPhotos, facilities, dressCode, awards, leaders } = input;

	if (galleryPhotos !== undefined) {
		const keys = Array.isArray(galleryPhotos)
			? galleryPhotos.map((u) => (typeof u === "string" ? keyFromFileUrl(u) : u))
			: null;
		if (!keys || keys.length > MAX_GALLERY_PHOTOS || !keys.every((k) => typeof k === "string" && GALLERY_PHOTO_KEY.test(k))) {
			return { ok: false, error: `Invalid photos — add up to ${MAX_GALLERY_PHOTOS}.` };
		}
		values.galleryPhotos = [...new Set(keys as string[])];
	}
	if (facilities !== undefined) {
		const parsed = parseFacilities(facilities);
		if (!parsed.ok) return { ok: false, error: parsed.error };
		values.facilities = parsed.value;
	}
	if (dressCode !== undefined) {
		if (dressCode !== null && !(DRESS_CODES as readonly unknown[]).includes(dressCode)) {
			return { ok: false, error: "Invalid dress code." };
		}
		values.dressCode = (dressCode as string | null) ?? null;
	}
	if (awards !== undefined) {
		if (!Array.isArray(awards) || awards.length > MAX_AWARDS) return { ok: false, error: `Add up to ${MAX_AWARDS} awards.` };
		const cleaned: { title: string; year: number | null }[] = [];
		for (const item of awards) {
			const a = (item ?? {}) as Record<string, unknown>;
			if (!isNonEmptyString(a.title) || a.title.trim().length > AWARD_TITLE_MAX) {
				return { ok: false, error: "Give each award a name (up to 120 characters)." };
			}
			const year = a.year === null || a.year === undefined ? null : a.year;
			if (year !== null && !(typeof year === "number" && Number.isInteger(year) && year >= 1900 && year <= currentYear())) {
				return { ok: false, error: `Award years must be between 1900 and ${currentYear()}.` };
			}
			cleaned.push({ title: a.title.trim(), year: year as number | null });
		}
		values.awards = cleaned;
	}
	if (leaders !== undefined) {
		if (!Array.isArray(leaders) || leaders.length > MAX_LEADERS) return { ok: false, error: `Add up to ${MAX_LEADERS} people.` };
		const cleaned: { name: string; title: string; photoKey: string | null }[] = [];
		for (const item of leaders) {
			const l = (item ?? {}) as Record<string, unknown>;
			if (!isNonEmptyString(l.name) || l.name.trim().length > LEADER_FIELD_MAX) {
				return { ok: false, error: "Give each person a name." };
			}
			if (!isNonEmptyString(l.title) || l.title.trim().length > LEADER_FIELD_MAX) {
				return { ok: false, error: "Give each person a role, e.g. Founder & CEO." };
			}
			const photoKey = typeof l.photoUrl === "string" ? keyFromFileUrl(l.photoUrl) : (l.photoUrl ?? null);
			if (photoKey !== null && !(typeof photoKey === "string" && LEADER_PHOTO_KEY.test(photoKey))) {
				return { ok: false, error: "Invalid leadership photo — please upload it again." };
			}
			cleaned.push({ name: l.name.trim(), title: l.title.trim(), photoKey: photoKey as string | null });
		}
		values.leaders = cleaned;
	}
	return { ok: true, values };
}

// The exact field list the form's "Make your company stand out" checklist
// checks (the redesign's isProfileBoosted).
function isProfileBoosted(profile: {
	logo: string | null;
	description: string | null;
	website: string | null;
	email: string | null;
	phone: string | null;
	linkedin: string | null;
	foundedYear: number | null;
	companyType: string | null;
}): boolean {
	return (
		!!profile.logo &&
		!!profile.description &&
		!!profile.website &&
		!!profile.email &&
		!!profile.phone &&
		!!profile.linkedin &&
		profile.foundedYear !== null &&
		!!profile.companyType
	);
}

// ── Onboarding draft ────────────────────────────────────────────────────────
// A free-form JSON blob of the whole in-progress form, autosaved on every
// change. Each freshly picked file (a `data:` URL) is saved once, here, and
// its URL sent back so the form uses that from then on (the multi-MB data
// never sits in the database). The draft stores storage keys.
type FileField = { accepts: RegExp; maxLength: number; category: UploadCategory };
const FILE_FIELDS: Record<string, FileField> = {
	avatarUrl: { accepts: /^data:image\//, maxLength: 6_000_000, category: "avatars" },
	logoUrl: { accepts: /^data:image\//, maxLength: 6_000_000, category: "logos" },
	officePhotoUrl: { accepts: /^data:image\//, maxLength: 6_000_000, category: "office-photos" },
	bannerUrl: { accepts: /^data:image\//, maxLength: 14_000_000, category: "banners" },
	ssmDocumentUrl: { accepts: SSM_DOCUMENT_DATA_URL, maxLength: 14_000_000, category: "ssm-documents" },
};

async function readDraft(db: AnyDb, userId: string): Promise<Record<string, unknown> | null> {
	const [row] = await db
		.select({ data: employerOnboardingDraft.data })
		.from(employerOnboardingDraft)
		.where(eq(employerOnboardingDraft.userId, userId))
		.limit(1);
	if (!row) return null;
	try {
		return JSON.parse(row.data) as Record<string, unknown>;
	} catch {
		return null;
	}
}

// Stored keys → the URLs the browser uses.
function draftForBrowser(origin: string, draft: Record<string, unknown>) {
	const out = { ...draft };
	for (const field of Object.keys(FILE_FIELDS)) {
		if (typeof out[field] === "string") out[field] = fileUrl(origin, out[field] as string);
	}
	if (Array.isArray(out.galleryPhotos)) {
		out.galleryPhotos = out.galleryPhotos.map((k) => (typeof k === "string" ? fileUrl(origin, k) : k));
	}
	if (Array.isArray(out.leaders)) {
		out.leaders = out.leaders.map((l) =>
			l && typeof l === "object" && typeof (l as { photoUrl?: unknown }).photoUrl === "string"
				? { ...l, photoUrl: fileUrl(origin, (l as { photoUrl: string }).photoUrl) }
				: l,
		);
	}
	return out;
}

async function saveDataUrl(storage: Storage | undefined, dataUrl: string, category: UploadCategory) {
	if (!storage) throw new Error("File storage isn't configured.");
	return saveBase64Upload(storage, dataUrl, category);
}

export const employerRouter = {
	getDraft: protectedProcedure.handler(async ({ context }) => {
		const draft = await readDraft(context.db, context.session.user.id);
		return { draft: draft ? draftForBrowser(context.origin, draft) : null };
	}),

	saveDraft: protectedProcedure.input(z.record(z.string(), z.unknown())).handler(async ({ input, context }) => {
		const db = context.db as AnyDb;
		const userId = context.session.user.id;
		const previous = await readDraft(db, userId);
		const previousSsmDocumentKey = previous?.ssmDocumentUrl ?? null;

		const draft = { ...input };
		// What each freshly picked file was saved as, for the form to swap in.
		const resolved: Record<string, string | null> = {};
		for (const [field, { accepts, maxLength, category }] of Object.entries(FILE_FIELDS)) {
			const value = draft[field];
			if (typeof value !== "string") continue;
			if (!isBase64DataUrl(value)) {
				// A URL we handed out earlier → its key (external URLs pass through).
				draft[field] = keyFromFileUrl(value);
				continue;
			}
			let saved: string | null = null;
			if (accepts.test(value) && value.length <= maxLength) {
				try {
					saved = await saveDataUrl(context.storage, value, category);
				} catch {
					// Unreadable file — dropped rather than kept as a data URL.
				}
			}
			draft[field] = saved;
			resolved[field] = saved ? fileUrl(context.origin, saved) : null;
		}

		// Finish accepts the draft's SSM document as this user's own upload, so
		// the draft may only hold one this user actually uploaded through it —
		// never a key pointing at someone else's certificate.
		if (
			typeof draft.ssmDocumentUrl === "string" &&
			!("ssmDocumentUrl" in resolved) &&
			draft.ssmDocumentUrl !== previousSsmDocumentKey
		) {
			draft.ssmDocumentUrl = null;
		}
		if (Array.isArray(draft.galleryPhotos)) {
			draft.galleryPhotos = draft.galleryPhotos.map((u) => (typeof u === "string" ? keyFromFileUrl(u) : u));
		}
		if (Array.isArray(draft.leaders)) {
			draft.leaders = draft.leaders.map((l) =>
				l && typeof l === "object" && typeof (l as { photoUrl?: unknown }).photoUrl === "string"
					? { ...l, photoUrl: keyFromFileUrl((l as { photoUrl: string }).photoUrl) }
					: l,
			);
		}

		const json = JSON.stringify(draft);
		await db
			.insert(employerOnboardingDraft)
			.values({ userId, data: json })
			.onConflictDoUpdate({ target: employerOnboardingDraft.userId, set: { data: json } });
		return { ok: true as const, resolved };
	}),

	deleteDraft: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		await db.delete(employerOnboardingDraft).where(eq(employerOnboardingDraft.userId, context.session.user.id));
		return { ok: true as const };
	}),

	// ── "Fill with AI" ──────────────────────────────────────────────────────
	lookupCompany: protectedProcedure.input(z.object({ companyName: z.string() })).handler(async ({ input, context }) => {
		const response = await lookupCompany(
			context.db,
			{
				perplexityKey: context.ai.perplexityKey,
				mimoKey: context.ai.mimoKey,
				logoDevKey: context.ai.logoDevKey ?? null,
			},
			context.session.user.id,
			input.companyName,
		);
		if (!response.ok) {
			throw new ORPCError(response.status >= 500 ? "BAD_GATEWAY" : "BAD_REQUEST", { message: response.error });
		}
		const { ok: _ok, ...rest } = response;
		return rest;
	}),

	// ── Gallery / leadership photos, uploaded the moment they're picked ─────
	uploadPhoto: protectedProcedure
		.input(z.object({ kind: z.string(), image: z.instanceof(File) }))
		.handler(async ({ input, context }) => {
			const { kind, image } = input;
			if (kind !== "gallery" && kind !== "leader") bad("Invalid photo type.");
			if (image.size === 0) bad("Choose a photo to upload.");
			if (!/^image\/(jpeg|png|webp)$/.test(image.type)) bad("Upload a JPG, PNG or WebP photo.");
			if (image.size > PHOTO_MAX_BYTES) bad("That photo is too large (max 10 MB).");
			if (!context.storage) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "File storage isn't configured." });
			const key = await saveBufferUpload(
				context.storage,
				new Uint8Array(await image.arrayBuffer()),
				image.type,
				kind === "gallery" ? "gallery" : "leaders",
			);
			return { url: fileUrl(context.origin, key) as string };
		}),

	// ── Finish: create the company ──────────────────────────────────────────
	saveProfile: protectedProcedure.input(z.record(z.string(), z.unknown())).handler(async ({ input, context }) => {
		const db = context.db as AnyDb;
		const userId = context.session.user.id;
		const {
			avatarUrl,
			contactName,
			contactRole,
			contactPosition,
			contactPhone,
			contactEmail,
			companyName,
			ssmNumber,
			ssmDocumentUrl,
			industry,
			industryCategory,
			companySize,
			addresses,
			companyDescription,
			logoUrl,
			benefits,
			websiteUrl,
			companyEmail,
			companyPhone,
			companyLinkedin,
			companyFacebook,
			companyInstagram,
			foundedYear,
			companyType,
			officePhotoUrl,
			bannerUrl,
			recentNews,
		} = input;

		// No company yet: onboarding creates one. Already in one: Company
		// Profile / My Profile edit it (the redesign's POST /api/employer/profile).
		// `createNew` registers an additional company ("Add a company") instead
		// of editing the current one — checked against this account's company
		// limit before anything (uploads included) is saved.
		const creating = input.createNew === true;
		if (creating) {
			const { canAdd, limit } = await loadCompanyLimitInfo(db, userId);
			if (!canAdd) {
				throw new ORPCError("FORBIDDEN", {
					message: `You've reached your limit of ${limit} companies. Contact JobGiga to add more.`,
				});
			}
		}
		const current = creating ? null : await loadCurrentCompany(db, userId, context.activeOrganizationId);
		if (current && !hasFullAccess(current.accessLevel)) {
			throw new ORPCError("FORBIDDEN", { message: "Only an owner or admin can edit the company profile." });
		}

		if (!isOptionalString(avatarUrl) || (typeof avatarUrl === "string" && avatarUrl.length > 6_000_000)) {
			bad("Invalid profile photo.");
		}
		if (!isOptionalString(companyDescription)) bad("Invalid company description.");
		if (!isOptionalString(logoUrl) || (typeof logoUrl === "string" && logoUrl.length > 6_000_000)) {
			bad("Invalid company logo.");
		}
		if (!Array.isArray(benefits) || !benefits.every(isNonEmptyString)) bad("Invalid benefits list.");
		if (!isOptionalString(websiteUrl)) bad("Invalid website URL.");
		if (isNonEmptyString(companyEmail) && !isValidEmail(companyEmail)) bad("Enter a valid company email.");
		if (!isOptionalString(companyPhone) || (isNonEmptyString(companyPhone) && !isValidMalaysianPhone(companyPhone))) {
			bad("Enter a valid company phone number, e.g. 03-1234 5678.");
		}
		if (!isOptionalString(companyLinkedin)) bad("Invalid company LinkedIn link.");
		if (!isOptionalString(companyFacebook)) bad("Invalid company Facebook link.");
		if (!isOptionalString(companyInstagram)) bad("Invalid company Instagram link.");
		if (
			foundedYear !== null &&
			foundedYear !== undefined &&
			!(typeof foundedYear === "number" && Number.isInteger(foundedYear) && foundedYear >= 1800 && foundedYear <= currentYear())
		) {
			bad("Invalid founded year.");
		}
		if (
			companyType !== null &&
			companyType !== undefined &&
			!(typeof companyType === "string" && (COMPANY_TYPES as readonly string[]).includes(companyType))
		) {
			bad("Invalid company type.");
		}
		if (!isOptionalString(officePhotoUrl) || (typeof officePhotoUrl === "string" && officePhotoUrl.length > 6_000_000)) {
			bad("Invalid office photo.");
		}
		// Cover banner: a freshly picked image (data URL), the already-saved one
		// (our own banners/ key), null to remove it, or omitted — never an
		// arbitrary outside URL.
		const bannerKeyIn = typeof bannerUrl === "string" && !isBase64DataUrl(bannerUrl) ? keyFromFileUrl(bannerUrl) : null;
		if (
			bannerUrl !== undefined &&
			bannerUrl !== null &&
			!(
				typeof bannerUrl === "string" &&
				((isBase64DataUrl(bannerUrl) && bannerUrl.startsWith("data:image/") && bannerUrl.length <= 14_000_000) ||
					(bannerKeyIn !== null && BANNER_KEY.test(bannerKeyIn)))
			)
		) {
			bad("Invalid cover banner.");
		}
		if (recentNews !== undefined && recentNews !== null && !isNewsItemArray(recentNews)) bad("Invalid recent news.");
		const workplace = parseWorkplace(input);
		if (!workplace.ok) bad(workplace.error);
		if (!isNonEmptyString(contactName)) bad("Enter your full name.");
		if (!isNonEmptyString(contactRole)) bad("Enter your role at the company.");
		if (!isNonEmptyString(contactPosition)) bad("Enter your position at the company.");
		if (!isNonEmptyString(contactPhone)) bad("Enter your phone number.");
		if (!isValidEmail(contactEmail)) bad("Enter a valid contact email.");
		if (!isNonEmptyString(companyName)) bad("Enter your company name.");
		if (!isNonEmptyString(ssmNumber)) bad("Enter your SSM registration number.");
		// A freshly picked file (data URL, PDF or image), the one this user's
		// draft already saved (its private key), null, or omitted.
		const ssmKeyIn = typeof ssmDocumentUrl === "string" && !isBase64DataUrl(ssmDocumentUrl) ? keyFromFileUrl(ssmDocumentUrl) : null;
		if (
			ssmDocumentUrl !== undefined &&
			ssmDocumentUrl !== null &&
			!(
				typeof ssmDocumentUrl === "string" &&
				((isBase64DataUrl(ssmDocumentUrl) &&
					SSM_DOCUMENT_DATA_URL.test(ssmDocumentUrl) &&
					ssmDocumentUrl.length <= 14_000_000) ||
					(ssmKeyIn !== null && SSM_DOCUMENT_KEY.test(ssmKeyIn)))
			)
		) {
			bad("Invalid SSM document — upload a PDF, JPG, PNG or WebP, up to 10 MB.");
		}
		if (!isNonEmptyString(industry)) bad("Enter your industry.");
		if (typeof industryCategory !== "string" || !(INDUSTRIES as readonly string[]).includes(industryCategory)) {
			bad("Choose your industry category.");
		}
		if (!isValidAddressArray(addresses)) bad("Enter at least one complete company address.");
		if (typeof companySize !== "string" || !COMPANY_SIZES.includes(companySize as (typeof COMPANY_SIZES)[number])) {
			bad("Choose a company size.");
		}

		// An existing SSM document must be the one this user's own draft saved —
		// the file route grants access to whichever company references a file,
		// so accepting someone else's key here would hand over their certificate.
		if (ssmKeyIn !== null && ssmKeyIn !== (current?.ssmDocumentKey ?? null)) {
			const draft = await readDraft(db, userId);
			if (ssmKeyIn !== (draft?.ssmDocumentUrl ?? null)) bad("Invalid SSM document — please upload it again.");
		}

		// Data URLs are saved to storage once, here; URLs we handed out go back to keys.
		const storage = context.storage;
		const resolveImage = async (value: unknown, category: UploadCategory): Promise<string | null> => {
			if (!isNonEmptyString(value)) return null;
			if (isBase64DataUrl(value)) return saveDataUrl(storage, value, category);
			return keyFromFileUrl(value.trim());
		};
		const avatarKey = await resolveImage(avatarUrl, "avatars");
		const logoKey = await resolveImage(logoUrl, "logos");
		const officePhotoKey = await resolveImage(officePhotoUrl, "office-photos");
		let bannerKey: string | null;
		try {
			bannerKey = isBase64DataUrl(bannerUrl) ? await saveDataUrl(storage, bannerUrl as string, "banners") : bannerKeyIn;
		} catch {
			bad("Couldn't read that cover banner — try a JPG or PNG.");
		}
		const ssmDocumentKey = isBase64DataUrl(ssmDocumentUrl)
			? await saveDataUrl(storage, ssmDocumentUrl as string, "ssm-documents")
			: ssmDocumentUrl === undefined
				? (current?.ssmDocumentKey ?? null)
				: ssmKeyIn;
		// A new or changed document, or a changed SSM number, restarts review —
		// even for a verified company. Otherwise the status stays as it was.
		const ssmNeedsReview =
			!current || ssmDocumentKey !== current.ssmDocumentKey || ssmNumber.trim() !== current.ssmNumber;
		const ssmVerificationStatus = ssmNeedsReview
			? ssmDocumentKey
				? "pending"
				: "unverified"
			: current!.ssmVerificationStatus;

		const organizationId = current?.organizationId ?? crypto.randomUUID();
		const cleanName = companyName.trim();
		const description = isNonEmptyString(companyDescription) ? sanitizeDescriptionHtml(companyDescription.trim()) : null;
		const website = isNonEmptyString(websiteUrl) ? websiteUrl.trim() : null;
		const email = isNonEmptyString(companyEmail) ? companyEmail.trim().toLowerCase() : null;
		const phone = isNonEmptyString(companyPhone) ? companyPhone.trim() : null;
		const linkedin = isNonEmptyString(companyLinkedin) ? companyLinkedin.trim() : null;
		const founded = typeof foundedYear === "number" ? foundedYear : null;
		const type = isNonEmptyString(companyType) ? companyType : null;
		const now = new Date().toISOString();

		// Exactly one default for job posts: the first one marked, else the first.
		const defaultIndex = Math.max(
			0,
			addresses.findIndex((a) => a.isJobDefault === true),
		);
		const earned = ["profile_completed"];
		if (logoKey) earned.push("logo_added");
		if (
			isProfileBoosted({
				logo: logoKey,
				description,
				website,
				email,
				phone,
				linkedin,
				foundedYear: founded,
				companyType: type,
			})
		) {
			earned.push("profile_boosted");
		}

		const companyValues = {
			legalName: cleanName,
			displayName: cleanName,
			companyLogo: logoKey,
			companySize,
			ssmNumber: ssmNumber.trim(),
			website,
			email,
			phoneNumber: phone,
			description,
			facebookUrl: isNonEmptyString(companyFacebook) ? companyFacebook.trim() : null,
			linkedinUrl: linkedin,
			instagramUrl: isNonEmptyString(companyInstagram) ? companyInstagram.trim() : null,
			industry: industry.trim(),
			industryCategory,
			foundedYear: founded,
			companyType: type,
			benefits: (benefits as string[]).map((b) => b.trim()),
			officePhotoKey,
			recentNews: isNewsItemArray(recentNews)
				? recentNews.map((item) => ({ title: item.title.trim(), url: item.url.trim() }))
				: [],
			galleryPhotos: workplace.values.galleryPhotos ?? [],
			facilities: workplace.values.facilities ?? [],
			dressCode: workplace.values.dressCode ?? null,
			awards: workplace.values.awards ?? [],
			leaders: workplace.values.leaders ?? [],
			ssmDocumentKey,
			ssmVerificationStatus,
			...(ssmNeedsReview && current ? { ssmVerifiedAt: null, ssmRejectionReason: null } : {}),
			updatedAt: now,
		};
		const contactValues = {
			name: contactName.trim(),
			email: contactEmail.trim().toLowerCase(),
			contactRole: contactRole.trim(),
			positionTitle: contactPosition.trim(),
			phoneNumber: contactPhone.trim(),
			avatarKey,
		};

		await db.batch([
			...(current
				? [
						db
							.update(organization)
							// Omitted banner = keep the current one.
							.set({ ...companyValues, ...(bannerUrl !== undefined ? { bannerKey } : {}) })
							.where(eq(organization.id, organizationId)),
						// "About you" is the saver's own membership row.
						db.update(member).set(contactValues).where(eq(member.id, current.memberId)),
						db.delete(organizationAddress).where(eq(organizationAddress.organizationId, organizationId)),
					]
				: [
						db.insert(organization).values({ id: organizationId, ...companyValues, bannerKey, createdByUserId: userId }),
						db.insert(member).values({
							id: crypto.randomUUID(),
							organizationId,
							userId,
							...contactValues,
							// v1's team role / access level for the company's registrant.
							role: "hr manager",
							accessLevel: "owner",
						}),
					]),
			...addresses.map((a, i) =>
				db.insert(organizationAddress).values({
					id: crypto.randomUUID(),
					organizationId,
					label: a.label.trim(),
					addressLine1: a.addressLine1.trim(),
					addressLine2: isNonEmptyString(a.addressLine2) ? a.addressLine2.trim() : null,
					area: isNonEmptyString(a.area) ? a.area.trim() : null,
					city: a.city.trim(),
					state: a.state,
					postcode: a.postcode.trim(),
					isJobDefault: i === defaultIndex,
					sortOrder: i,
				}),
			),
			...earned.map((badgeKey) =>
				db.insert(organizationBadge).values({ id: crypto.randomUUID(), organizationId, badgeKey }).onConflictDoNothing(),
			),
			db.delete(employerOnboardingDraft).where(eq(employerOnboardingDraft.userId, userId)),
			// A brand-new company becomes the one the dashboard shows from now on.
			...(current ? [] : [setActiveCompanyQuery(db, context.session.session.id, organizationId)]),
		]);

		return {
			ok: true as const,
			profileId: organizationId,
			...(bannerUrl !== undefined ? { bannerUrl: fileUrl(context.origin, bannerKey) } : {}),
			ssmDocumentUrl: fileUrl(context.origin, ssmDocumentKey),
			ssmVerificationStatus,
		};
	}),

	// Company Profile and My Profile (the redesign's getEmployerProfileForUser
	// + getEmployerAddresses + getEarnedBadges): the saved company and the
	// signer-in's own "About you", in the shape the form edits.
	// ── Company switcher (the redesign's GET /api/employer/companies) ─────────
	// Every company this employer belongs to, which one is current, and the
	// account's company limit for "+ Add a company".
	companies: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const userId = context.session.user.id;
		const [memberships, limitInfo] = await Promise.all([loadMemberships(db, userId), loadCompanyLimitInfo(db, userId)]);
		const current = pickMembership(memberships, context.activeOrganizationId);
		const ids = memberships.map((m) => m.organizationId);
		const orgs = ids.length
			? ((await db
					.select({
						id: organization.id,
						displayName: organization.displayName,
						legalName: organization.legalName,
						logo: organization.companyLogo,
						industry: organization.industry,
						companySize: organization.companySize,
						createdByUserId: organization.createdByUserId,
					})
					.from(organization)
					.where(inArray(organization.id, ids))) as AnyDb[])
			: [];
		// The registrant's name from their own membership row, for "Owner: …".
		const owners = ids.length
			? ((await db
					.select({ organizationId: member.organizationId, userId: member.userId, name: member.name })
					.from(member)
					.where(inArray(member.organizationId, ids))) as AnyDb[])
			: [];
		const byId = new Map(orgs.map((o) => [o.id as string, o]));
		return {
			companies: memberships.map((m) => {
				const org = byId.get(m.organizationId);
				const owner = owners.find((o) => o.organizationId === m.organizationId && o.userId === org?.createdByUserId);
				return {
					id: m.organizationId,
					companyName: ((org?.displayName as string | null) || (org?.legalName as string | null)) ?? "",
					logoUrl: fileUrl(context.origin, org?.logo),
					role: toTeamRole(m.role, m.accessLevel),
					ownerName: (owner?.name as string | null) ?? "",
					industry: (org?.industry as string | null) ?? "",
					companySize: (org?.companySize as string | null) ?? "",
					joinedAt: toIso(m.joinedAt),
				};
			}),
			currentId: current?.organizationId ?? null,
			companyLimit: { used: limitInfo.used, limit: limitInfo.limit, canAdd: limitInfo.canAdd },
		};
	}),

	// "Add a company" (the redesign's /employer/companies/new page data): the
	// account's company limit, and "About you" prefilled from a company they
	// registered — the current one if they registered it, else their first —
	// or from the account itself.
	addCompanyContext: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const userId = context.session.user.id;
		const [memberships, limitInfo] = await Promise.all([loadMemberships(db, userId), loadCompanyLimitInfo(db, userId)]);
		const current = pickMembership(memberships, context.activeOrganizationId);
		const owned = memberships.filter((m) => m.createdByUserId === userId);
		const source = current && current.createdByUserId === userId ? current : owned[0];
		const [me] = source
			? ((await db.select().from(member).where(eq(member.id, source.memberId)).limit(1)) as AnyDb[])
			: [];
		const aboutYou = me
			? {
					avatarUrl: fileUrl(context.origin, me.avatarKey) ?? context.session.user.image ?? null,
					contactName: (me.name as string | null) ?? context.session.user.name ?? "",
					contactRole: (me.contactRole as string | null) ?? "",
					contactPosition: (me.positionTitle as string | null) ?? "",
					contactPhone: (me.phoneNumber as string | null) ?? "",
					contactEmail: (me.email as string | null) ?? context.session.user.email,
				}
			: {
					avatarUrl: context.session.user.image ?? null,
					contactName: context.session.user.name ?? "",
					contactEmail: context.session.user.email,
				};
		return { hasCompany: memberships.length > 0, limit: limitInfo, aboutYou };
	}),

	// The redesign's POST /api/employer/switch-company: the only way the
	// session's company changes. Membership is checked here, never trusted
	// from the browser.
	switchCompany: protectedProcedure.input(z.object({ organizationId: z.string() })).handler(async ({ input, context }) => {
		const db = context.db as AnyDb;
		const memberships = await loadMemberships(db, context.session.user.id);
		if (!memberships.some((m) => m.organizationId === input.organizationId)) {
			throw new ORPCError("FORBIDDEN", { message: "You don't have access to that company." });
		}
		await setActiveCompanyQuery(db, context.session.session.id, input.organizationId);
		return { ok: true };
	}),

	getProfile: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const userId = context.session.user.id;
		const current = await loadCurrentCompany(db, userId, context.activeOrganizationId);
		if (!current) throw new ORPCError("NOT_FOUND", { message: "Finish onboarding first." });
		const [[org], [me], addresses, badges, [account]] = await Promise.all([
			db.select().from(organization).where(eq(organization.id, current.organizationId)).limit(1),
			db.select().from(member).where(eq(member.id, current.memberId)).limit(1),
			db
				.select()
				.from(organizationAddress)
				.where(eq(organizationAddress.organizationId, current.organizationId))
				.orderBy(asc(organizationAddress.sortOrder)),
			db
				.select({ badgeKey: organizationBadge.badgeKey, earnedAt: organizationBadge.earnedAt })
				.from(organizationBadge)
				.where(eq(organizationBadge.organizationId, current.organizationId)),
			db.select({ phoneNumber: user.phoneNumber, phoneVerified: user.phoneVerified }).from(user).where(eq(user.id, userId)).limit(1),
		]);
		const url = (key: string | null | undefined) => fileUrl(context.origin, key);
		const contactPhone = (me.phoneNumber as string | null) ?? "";
		const e164 = toMalaysianMobileE164(contactPhone);
		const profile: EmployerProfile = {
			id: org.id,
			avatarUrl: url(me.avatarKey),
			contactName: me.name ?? "",
			contactRole: me.contactRole ?? "",
			contactPosition: me.positionTitle ?? "",
			contactPhone,
			contactEmail: me.email ?? context.session.user.email,
			companyName: org.displayName,
			ssmNumber: org.ssmNumber ?? "",
			ssmDocumentUrl: url(org.ssmDocumentKey),
			ssmVerificationStatus: org.ssmVerificationStatus,
			ssmRejectionReason: org.ssmRejectionReason ?? null,
			industry: org.industry ?? "",
			industryCategory: org.industryCategory ?? "",
			companySize: org.companySize ?? "",
			companyDescription: org.description ?? null,
			logoUrl: url(org.companyLogo),
			benefits: org.benefits ?? [],
			websiteUrl: org.website ?? null,
			companyEmail: org.email ?? null,
			companyPhone: org.phoneNumber ?? null,
			companyLinkedin: org.linkedinUrl ?? null,
			companyFacebook: org.facebookUrl ?? null,
			companyInstagram: org.instagramUrl ?? null,
			foundedYear: org.foundedYear ?? null,
			companyType: org.companyType ?? null,
			officePhotoUrl: url(org.officePhotoKey),
			bannerUrl: url(org.bannerKey),
			recentNews: org.recentNews ?? [],
			galleryPhotos: ((org.galleryPhotos ?? []) as string[]).map((k) => url(k) as string),
			facilities: org.facilities ?? [],
			dressCode: org.dressCode ?? null,
			awards: org.awards ?? [],
			leaders: ((org.leaders ?? []) as { name: string; title: string; photoUrl: string | null }[]).map((l) => ({
				...l,
				photoUrl: url(l.photoUrl),
			})),
		};
		return {
			profile,
			addresses: (addresses as AnyDb[]).map(
				(a): EmployerAddress => ({
					id: a.id,
					label: a.label,
					addressLine1: a.addressLine1,
					addressLine2: a.addressLine2 ?? null,
					area: a.area ?? null,
					city: a.city,
					state: a.state,
					postcode: a.postcode,
					isJobDefault: Boolean(a.isJobDefault),
				}),
			),
			earnedBadges: Object.fromEntries((badges as AnyDb[]).map((b) => [b.badgeKey, toIso(b.earnedAt)])) as Record<string, string>,
			canManage: hasFullAccess(current.accessLevel),
			// So the phone field shows "verified" on its first frame.
			phoneStatus: {
				canVerify: true,
				verified: !!e164 && !!account?.phoneVerified && account.phoneNumber === e164,
			},
		};
	}),

	// The redesign's employer dashboard (app/employer/dashboard/page.tsx +
	// buildDashboardData): everything its cards show, from v1's job,
	// application and interviews tables, plus the Smart Match settings.
	dashboard: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const access = await loadEmployerAccess(db, context.session.user.id, context.activeOrganizationId);
		if (!access) throw new ORPCError("FORBIDDEN", { message: "Not signed in as an employer." });
		return {
			data: await buildDashboardData(db, context.origin, access.organizationId, access.scope),
			// canManage = can move applicants (anyone but a Panel member);
			// fullAccess = Owner or Admin (posting jobs, Team, company settings).
			canManage: access.canManage,
			fullAccess: access.fullAccess,
			teamRole: access.teamRole,
			smartMatchEnabled: access.smartMatchEnabled,
			criteria: access.criteria,
		};
	}),

	// The redesign's GET /api/employer/applicants/matches: every active
	// applicant, scored (Top Matches, and the score badges on Recent applicants).
	topMatches: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const access = await loadEmployerAccess(db, context.session.user.id, context.activeOrganizationId);
		if (!access) return { results: [] };
		return { results: await computeMatchResults(db, context.origin, access.organizationId, access.criteria, access.scope) };
	}),

	// The redesign's PATCH /api/employer/smart-match-settings: the on/off
	// switch and which criteria count. Company-wide, so managers only.
	updateSmartMatchSettings: protectedProcedure
		.input(
			z.object({
				enabled: z.boolean().optional(),
				criteria: z.object(Object.fromEntries(CRITERIA_KEYS.map((k) => [k, z.boolean()]))).partial().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			const access = await loadEmployerAccess(db, context.session.user.id, context.activeOrganizationId);
			if (!access?.fullAccess) {
				throw new ORPCError("FORBIDDEN", { message: "Only an owner or admin can change match settings." });
			}
			const set: Record<string, unknown> = {};
			if (input.enabled !== undefined) set.smartMatchEnabled = input.enabled;
			if (input.criteria) set.smartMatchCriteria = { ...access.criteria, ...input.criteria } as CriteriaFlags;
			if (Object.keys(set).length > 0) {
				await db.update(organization).set(set).where(eq(organization.id, access.organizationId));
			}
			return { ok: true as const };
		}),

	// ── Post a job's helpers ──

	// The redesign's POST /api/employer/suggest-job-posting ("Fill with AI"):
	// the whole posting drafted from its title.
	suggestJobPosting: protectedProcedure
		.input(
			z.object({
				jobTitle: z.string(),
				companyIndustry: z.string().nullish(),
				companySize: z.string().nullish(),
				companyLocation: z.string().nullish(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!input.jobTitle.trim()) bad("Enter a job title first.");
			const out = await suggestJobPosting(context.db, context.ai, context.session.user.id, input);
			if (!out.ok) throw new ORPCError(out.status >= 500 ? "BAD_GATEWAY" : "BAD_REQUEST", { message: out.error });
			return { result: out.result, usage: out.usage, provider: out.provider, durationMs: out.durationMs };
		}),

	// The redesign's POST /api/employer/suggest-salary.
	suggestSalary: protectedProcedure.input(z.record(z.string(), z.unknown())).handler(async ({ input, context }) => {
		const out = await suggestSalary(context.db, context.ai, context.session.user.id, input);
		if (!out.ok) throw new ORPCError(out.status >= 500 ? "BAD_GATEWAY" : "BAD_REQUEST", { message: out.error });
		return { suggestion: out.suggestion };
	}),

	// The redesign's POST /api/employer/suggest-skills.
	suggestSkills: protectedProcedure.input(z.object({ jobTitle: z.string() })).handler(async ({ input, context }) => {
		if (!input.jobTitle.trim()) bad("Enter a job title first.");
		const out = await suggestPostingSkills(context.db, context.ai, context.session.user.id, input.jobTitle);
		if (!out.ok) throw new ORPCError(out.status >= 500 ? "BAD_GATEWAY" : "BAD_REQUEST", { message: out.error });
		return { suggestions: out.suggestions, usage: out.usage, durationMs: out.durationMs };
	}),

	// The redesign's GET /api/employer/salary-insights.
	salaryInsight: protectedProcedure
		.input(z.object({ title: z.string(), industry: z.string().nullish(), state: z.string().nullish() }))
		.handler(async ({ input, context }) => {
			const title = input.title.trim().slice(0, 120);
			if (!title) return { insight: null };
			return {
				insight: await getSalaryInsight(context.db, {
					title,
					industry: input.industry?.slice(0, 120) || null,
					state: input.state?.slice(0, 60) || null,
				}),
			};
		}),

	// Post a job's company details: addresses (the default work location),
	// company benefits (pre-filled), and who can be shown as the contact.
	postJobContext: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const current = await loadCurrentCompany(db, context.session.user.id, context.activeOrganizationId);
		if (!current) throw new ORPCError("NOT_FOUND", { message: "Finish onboarding first." });
		const [[org], addresses, members] = await Promise.all([
			db.select().from(organization).where(eq(organization.id, current.organizationId)).limit(1),
			db
				.select()
				.from(organizationAddress)
				.where(eq(organizationAddress.organizationId, current.organizationId))
				.orderBy(asc(organizationAddress.sortOrder)),
			db
				.select({ userId: member.userId, name: member.name, email: member.email, positionTitle: member.positionTitle, avatarKey: member.avatarKey })
				.from(member)
				.where(and(eq(member.organizationId, current.organizationId), eq(member.status, "active"))),
		]);
		return {
			canManage: hasFullAccess(current.accessLevel),
			company: { name: org.displayName as string, logoUrl: fileUrl(context.origin, org.companyLogo), industry: org.industry ?? null, size: org.companySize ?? null },
			companyBenefits: (org.benefits ?? []) as string[],
			addresses: (addresses as AnyDb[]).map(
				(a): EmployerAddress => ({
					id: a.id,
					label: a.label,
					addressLine1: a.addressLine1,
					addressLine2: a.addressLine2 ?? null,
					area: a.area ?? null,
					city: a.city,
					state: a.state,
					postcode: a.postcode,
					isJobDefault: Boolean(a.isJobDefault),
				}),
			),
			// Public details only — no email or phone reaches the page.
			contactOptions: (members as AnyDb[])
				.filter((m) => m.userId)
				.map((m) => ({
					userId: m.userId as string,
					name: (m.name as string | null) || ((m.email as string | null) ?? "").split("@")[0] || "",
					position: (m.positionTitle as string | null) ?? null,
					avatarUrl: fileUrl(context.origin, m.avatarKey),
				})),
			// The team's Hiring managers (joined or invited), for "Hiring managers" on the form.
			hiringManagerOptions: await loadHiringManagerOptions(db, context.origin, current.organizationId),
		};
	}),
};
