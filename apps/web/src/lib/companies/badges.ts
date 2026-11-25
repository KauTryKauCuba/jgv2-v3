import {
  BoltIcon,
  BriefcaseIcon,
  BuildingIcon,
  CheckCircleIcon,
  ImageIcon,
  StarIcon,
  UserCheckIcon,
  UsersIcon,
} from "@/components/landing/icons";

// The milestones a company can earn on JobGiga, from the redesign. Order here
// is display order. Labels live in the translation files under
// companies.badges.{key} (label, short, description); the colours feed the
// glossy medal gradient in BadgeMedal, one hue per badge.
// TODO(api): earned badges come from the database once it exists.

export const BADGE_KEYS = [
  "profile_completed",
  "logo_added",
  "profile_boosted",
  "first_job_posted",
  "screening_enabled",
  "first_candidate_screened",
  "first_hire",
  "team_builder",
] as const;

export type BadgeKey = (typeof BADGE_KEYS)[number];

export interface BadgeDefinition {
  key: BadgeKey;
  icon: typeof BuildingIcon;
  colorFrom: string;
  colorTo: string;
  ribbon: string;
}

export const BADGE_DEFINITIONS: readonly BadgeDefinition[] = [
  { key: "profile_completed", icon: BuildingIcon, colorFrom: "#5EEAD4", colorTo: "#0D9488", ribbon: "#0F766E" },
  { key: "logo_added", icon: ImageIcon, colorFrom: "#86EFAC", colorTo: "#16A34A", ribbon: "#15803D" },
  { key: "profile_boosted", icon: StarIcon, colorFrom: "#D8B4FE", colorTo: "#9333EA", ribbon: "#7E22CE" },
  { key: "first_job_posted", icon: BriefcaseIcon, colorFrom: "#FDBA74", colorTo: "#EA580C", ribbon: "#C2410C" },
  { key: "screening_enabled", icon: BoltIcon, colorFrom: "#FDE68A", colorTo: "#D97706", ribbon: "#B45309" },
  { key: "first_candidate_screened", icon: CheckCircleIcon, colorFrom: "#93C5FD", colorTo: "#2563EB", ribbon: "#1D4ED8" },
  { key: "first_hire", icon: UserCheckIcon, colorFrom: "#FDA4AF", colorTo: "#E11D48", ribbon: "#BE123C" },
  { key: "team_builder", icon: UsersIcon, colorFrom: "#A5B4FC", colorTo: "#4F46E5", ribbon: "#4338CA" },
];

/** The earned ones, in display order. */
export function earnedBadges(keys: readonly BadgeKey[]) {
  return BADGE_DEFINITIONS.filter((badge) => keys.includes(badge.key));
}
