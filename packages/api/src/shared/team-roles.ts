// The redesign's lib/team-roles.ts (client-safe), plus how v3 stores each role
// on v1's member row (role + access_level) — the user's chosen mapping.

// Team roles at a company — shared by server and client (no server-only
// imports here). The two "full access" roles run the whole company account;
// the other two are scoped to part of the hiring work:
//
// - Hiring manager: the job postings they're assigned to (Post a job / Manage
//   Job / the Team page), plus any interview panel they're added to. They
//   move those applicants through the pipeline and get their notifications.
// - Panel member: only the candidates whose interview panel they're on —
//   they see the interview and the candidate, and submit their scorecard.

export const TEAM_ROLES = ["owner", "admin", "hiring_manager", "panel"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === "string" && (TEAM_ROLES as readonly string[]).includes(value);
}

export const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  owner: "Owner",
  admin: "Admin",
  hiring_manager: "Hiring manager",
  panel: "Panel member",
};

// What the role can do, in a line — the invite page/email, the Team page's
// role picker and the welcome step all use the same wording.
export const TEAM_ROLE_DESCRIPTION: Record<TeamRole, string> = {
  owner: "Full access, including managing other owners.",
  admin: "Post jobs, review applicants, schedule interviews and invite teammates.",
  hiring_manager: "Reviews and moves applicants for the jobs they're assigned to, and joins their interviews.",
  panel: "Joins the interviews they're added to and submits their evaluation.",
};

export const TEAM_ROLE_PILL: Record<TeamRole, { bg: string; text: string }> = {
  owner: { bg: "bg-[#FFF3D6]", text: "text-[#A67C00]" },
  admin: { bg: "bg-[#E6F9FA]", text: "text-[#008990]" },
  hiring_manager: { bg: "bg-[#EAF0FE]", text: "text-[#3B5BDB]" },
  panel: { bg: "bg-[#F1ECFB]", text: "text-[#7C5CD1]" },
};

/** Owners and Admins — the whole company account (jobs, team, company profile, ads). */
export function hasFullAccess(role: TeamRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** Where this role's dashboard starts — a Panel member has no jobs or applicants list of their own. */
export function employerHomePath(role: TeamRole | null | undefined): string {
  return role === "panel" ? "/employer/interviews" : "/employer/dashboard";
}

/** The redesign's role → v1's member.role + member.access_level. */
export const V1_MEMBER_FOR_ROLE: Record<TeamRole, { role: string; accessLevel: string }> = {
  owner: { role: "hr manager", accessLevel: "owner" },
  admin: { role: "hr staff", accessLevel: "admin" },
  hiring_manager: { role: "hr staff", accessLevel: "hiring_manager" },
  panel: { role: "panelist", accessLevel: "panel" },
};

/**
 * v1's member row → the redesign's role. Rows v1 wrote before v3 (no
 * hiring_manager access level): owner/admin by access level, a panelist (or
 * "panel" access) is a Panel member, any other HR member is an Admin.
 */
export function toTeamRole(role: string | null | undefined, accessLevel: string | null | undefined): TeamRole {
  if (accessLevel === "owner") return "owner";
  if (accessLevel === "hiring_manager") return "hiring_manager";
  if (accessLevel === "panel" || role === "panelist") return "panel";
  return "admin";
}
