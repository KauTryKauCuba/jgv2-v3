// The redesign's Smart Match scoring (src/lib/matching.ts), ported as-is.
// Client-safe parts only: the weights, the criteria flags and the scoring
// functions. Apply-time screening (screeningEligibilityCheck) comes with the
// Post a job / Apply pages, which collect the answers it checks.

export const MATCH_WEIGHTS = {
	skills: 0.35,
	softSkills: 0.1,
	experience: 0.15,
	niceToHaveSkills: 0.1,
	industry: 0.1,
	workArrangement: 0.1,
	employmentType: 0.1,
} as const;

export type MatchComponent = keyof typeof MATCH_WEIGHTS;
export type MatchBreakdown = Record<MatchComponent, number | null>;

// Saved on organization.smart_match_criteria. The 7 MatchComponent keys gate
// weightedScore(); the 2 hard-filter keys gate hardFilterCheck().
export type CriteriaFlags = Record<MatchComponent | "workAuthorization" | "drivingLicense", boolean>;

export const DEFAULT_CRITERIA: CriteriaFlags = {
	skills: true,
	softSkills: true,
	experience: true,
	niceToHaveSkills: true,
	industry: true,
	workArrangement: true,
	employmentType: true,
	workAuthorization: true,
	drivingLicense: true,
};

export const CRITERIA_KEYS = Object.keys(DEFAULT_CRITERIA) as (keyof CriteriaFlags)[];

// A saved object may predate a criterion — missing keys count as on.
export function withCriteriaDefaults(stored: Partial<CriteriaFlags> | null | undefined): CriteriaFlags {
	return { ...DEFAULT_CRITERIA, ...(stored ?? {}) };
}

function normalize(value: string): string {
	return value.trim().toLowerCase();
}

/** Share (0..1) of the required skills the candidate has; null when none are required. */
export function skillsOverlapScore(
	required: string[],
	have: string[],
	canonicalize: (skill: string) => string = normalize,
): number | null {
	if (required.length === 0) return null;
	const haveSet = new Set(have.map(canonicalize));
	const matched = required.filter((skill) => haveSet.has(canonicalize(skill))).length;
	return matched / required.length;
}

export function experienceFitScore(minYearsRequired: number | null, candidateYears: number): number | null {
	if (!minYearsRequired || minYearsRequired <= 0) return null;
	return Math.min(candidateYears / minYearsRequired, 1);
}

export function industryMatchScore(postingIndustry: string | null, candidateIndustry: string): number | null {
	if (!postingIndustry) return null;
	return normalize(postingIndustry) === normalize(candidateIndustry) ? 1 : 0;
}

export function workArrangementMatchScore(postingArrangement: string, candidateArrangement: string): number {
	return postingArrangement === candidateArrangement ? 1 : 0;
}

export function employmentTypeMatchScore(postingType: string, candidateType: string): number {
	return normalize(postingType) === normalize(candidateType) ? 1 : 0;
}

export function hardFilterCheck(params: {
	requiredWorkAuthorizations: string[];
	candidateWorkAuthorization: string;
	requiredDrivingLicense: string | null;
	candidateDrivingLicense: string | null;
	enabledWorkAuthorization?: boolean;
	enabledDrivingLicense?: boolean;
}): { eligible: boolean; reasons: string[] } {
	const reasons: string[] = [];
	if (
		params.enabledWorkAuthorization !== false &&
		params.requiredWorkAuthorizations.length > 0 &&
		!params.requiredWorkAuthorizations.includes(params.candidateWorkAuthorization)
	) {
		reasons.push("Work authorization doesn't match what this posting accepts");
	}
	if (
		params.enabledDrivingLicense !== false &&
		params.requiredDrivingLicense &&
		params.candidateDrivingLicense !== params.requiredDrivingLicense
	) {
		reasons.push("Doesn't hold the required driving license");
	}
	return { eligible: reasons.length === 0, reasons };
}

// Reweights across the components that have a value, so a posting missing a
// signal isn't penalised. A switched-off criterion is left out the same way.
export function weightedScore(breakdown: MatchBreakdown, enabled?: Partial<CriteriaFlags>): number {
	let weightedSum = 0;
	let totalWeight = 0;
	for (const key of Object.keys(MATCH_WEIGHTS) as MatchComponent[]) {
		if (enabled?.[key] === false) continue;
		const value = breakdown[key];
		if (value === null) continue;
		const weight = MATCH_WEIGHTS[key];
		weightedSum += weight * value;
		totalWeight += weight;
	}
	if (totalWeight === 0) return 0;
	return Math.round((weightedSum / totalWeight) * 100);
}
