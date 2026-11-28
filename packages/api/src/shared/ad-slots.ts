// The redesign's src/lib/ad-slots.ts: ad booking rules, shared by the server
// (which enforces them) and the employer's booking calendar (which shows
// them) so the two never disagree. Dates are Malaysia calendar days as
// "YYYY-MM-DD" strings; a booking shows from its start date and is gone on
// its end date (exclusive).
//
// v3 difference: the numbers live on v1's `ad_placements` row (max_slots,
// duration_days, book_ahead_months, max_active_per_company), so every rule
// takes an `AdRules`. The API sends the rules to the browser with the page data.

export type AdRules = {
	/** Ads that can run at the same time (max_slots). */
	slots: number;
	/** How long every booking runs (duration_days). */
	runDays: number;
	/** How far ahead a start date can be booked. */
	bookAheadMonths: number;
	/** Bookings one company can hold at once (one running, one booked next). */
	maxActivePerCompany: number;
};

/** The redesign's numbers — also what migration 0012 puts on both placements. */
export const DEFAULT_AD_RULES: AdRules = { slots: 10, runDays: 30, bookAheadMonths: 3, maxActivePerCompany: 2 };

/** When the "ending soon" notice shows. */
export const AD_ENDING_SOON_DAYS = 3;
export const AD_HEADLINE_MAX = 80;
export const AD_VIDEO_MAX_SECONDS = 30;
export const AD_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const AD_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** Today in Malaysia, as "YYYY-MM-DD". Read inside a function (Workers' 1970 rule). */
export function todayMY(now: Date = new Date()): string {
	return now.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

function toUTC(iso: string) {
	const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
	return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number) {
	return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
	return fromUTC(toUTC(iso) + days * 86_400_000);
}

/** Same day N months later, clamped to the month's last day (31 Jan + 1 → 28/29 Feb). */
export function addMonths(iso: string, months: number): string {
	const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
	const target = new Date(Date.UTC(y, m - 1 + months, 1));
	const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
	target.setUTCDate(Math.min(d, lastDay));
	return fromUTC(target.getTime());
}

export function daysBetween(fromIso: string, toIso: string): number {
	return Math.round((toUTC(toIso) - toUTC(fromIso)) / 86_400_000);
}

export function isIsoDate(value: unknown): value is string {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	return fromUTC(toUTC(value)) === value;
}

export function runEndDate(start: string, rules: AdRules) {
	return addDays(start, rules.runDays);
}

/** The latest start date that can be booked today. */
export function lastBookableStart(today: string, rules: AdRules) {
	return addMonths(today, rules.bookAheadMonths);
}

/** "21 Oct 2026" — the run's last showing day is endDate − 1. `locale` is "en" or "ms". */
export function formatAdDate(iso: string, withYear = true, locale = "en") {
	const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
	return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale === "ms" ? "ms-MY" : "en-GB", {
		day: "numeric",
		month: "short",
		...(withYear ? { year: "numeric" } : {}),
		timeZone: "UTC",
	});
}

export function formatAdRun(start: string, end: string, locale = "en") {
	return `${formatAdDate(start, false, locale)} – ${formatAdDate(addDays(end, -1), true, locale)}`;
}

export type SlotBooking = { id: string; startDate: string; endDate: string };

export type StartCheck = { ok: true } | { ok: false; reason: "past" | "too_far" | "full" | "overlap" };

/**
 * Whether a run starting on `start` fits: no day of it already at the slot
 * count (counting every slot-holding booking — pending ones too, since they
 * hold their slot while being reviewed), and not overlapping this company's
 * own other bookings. `excludeId` leaves out a booking being edited or moved.
 */
export function checkCapacity(
	start: string,
	allBookings: SlotBooking[],
	ownBookings: SlotBooking[],
	rules: AdRules,
	excludeId?: string,
): StartCheck {
	const end = runEndDate(start, rules);
	if (ownBookings.some((b) => b.id !== excludeId && b.startDate < end && start < b.endDate)) {
		return { ok: false, reason: "overlap" };
	}
	const others = allBookings.filter((b) => b.id !== excludeId && b.startDate < end && start < b.endDate);
	for (let day = start; day < end; day = addDays(day, 1)) {
		let used = 0;
		for (const b of others) if (b.startDate <= day && day < b.endDate) used++;
		if (used >= rules.slots) return { ok: false, reason: "full" };
	}
	return { ok: true };
}

/** checkCapacity, plus the booking window (today up to bookAheadMonths ahead). */
export function checkStart(
	start: string,
	today: string,
	allBookings: SlotBooking[],
	ownBookings: SlotBooking[],
	rules: AdRules,
	excludeId?: string,
): StartCheck {
	if (start < today) return { ok: false, reason: "past" };
	if (start > lastBookableStart(today, rules)) return { ok: false, reason: "too_far" };
	return checkCapacity(start, allBookings, ownBookings, rules, excludeId);
}

/**
 * The earliest start from `from` up to `until` with room for a full run.
 * Booking uses the normal window; moving an overdue unreviewed booking may
 * look further ahead.
 */
export function nextFreeStart(
	from: string,
	until: string,
	allBookings: SlotBooking[],
	ownBookings: SlotBooking[],
	rules: AdRules,
	excludeId?: string,
): string | null {
	for (let day = from; day <= until; day = addDays(day, 1)) {
		if (checkCapacity(day, allBookings, ownBookings, rules, excludeId).ok) return day;
	}
	return null;
}

/** Slot-holding ads on one day (for "7 of 10 slots in use"). */
export function slotsInUse(day: string, allBookings: SlotBooking[]) {
	return allBookings.filter((b) => b.startDate <= day && day < b.endDate).length;
}

/** Slot-holding ads per day, from today to the end of the last bookable run — for the booking calendar. */
export function dailySlotCounts(bookings: SlotBooking[], today: string, rules: AdRules): Record<string, number> {
	const counts: Record<string, number> = {};
	const last = runEndDate(lastBookableStart(today, rules), rules);
	for (let day = today; day < last; day = addDays(day, 1)) counts[day] = 0;
	for (const b of bookings) {
		for (let day = b.startDate < today ? today : b.startDate; day < b.endDate && day < last; day = addDays(day, 1)) {
			counts[day] = (counts[day] ?? 0) + 1;
		}
	}
	return counts;
}

export type AdPhase = "pending" | "scheduled" | "live" | "ended" | "rejected";

/** What a booking is right now — approved ones are scheduled, live or ended depending on the date. */
export function adPhase(ad: { status: string; startDate: string; endDate: string }, today: string): AdPhase {
	if (ad.status === "rejected") return "rejected";
	if (ad.status === "pending") return "pending";
	if (today < ad.startDate) return "scheduled";
	if (today < ad.endDate) return "live";
	return "ended";
}

/**
 * checkStart for the browser calendar, which gets per-day slot counts
 * (dailySlotCounts) instead of everyone's bookings. Same rules; `excludeId`
 * (one of `ownBookings`) is taken back out of the counts while it's edited.
 */
export function checkStartFromCounts(
	start: string,
	today: string,
	counts: Record<string, number>,
	ownBookings: SlotBooking[],
	rules: AdRules,
	excludeId?: string,
): StartCheck {
	if (start < today) return { ok: false, reason: "past" };
	if (start > lastBookableStart(today, rules)) return { ok: false, reason: "too_far" };
	const end = runEndDate(start, rules);
	if (ownBookings.some((b) => b.id !== excludeId && b.startDate < end && start < b.endDate)) {
		return { ok: false, reason: "overlap" };
	}
	const excluded = ownBookings.find((b) => b.id === excludeId);
	for (let day = start; day < end; day = addDays(day, 1)) {
		const own = excluded && excluded.startDate <= day && day < excluded.endDate ? 1 : 0;
		if ((counts[day] ?? 0) - own >= rules.slots) return { ok: false, reason: "full" };
	}
	return { ok: true };
}

export function nextFreeStartFromCounts(
	today: string,
	counts: Record<string, number>,
	ownBookings: SlotBooking[],
	rules: AdRules,
	excludeId?: string,
): string | null {
	for (let day = today; day <= lastBookableStart(today, rules); day = addDays(day, 1)) {
		if (checkStartFromCounts(day, today, counts, ownBookings, rules, excludeId).ok) return day;
	}
	return null;
}
