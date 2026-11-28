// The redesign's src/components/EmployerTeamView.tsx (the Team page) and
// src/app/employer/team/page.tsx, ported. Same UI and flow — the
// collapsible "How your team works", inviting a teammate (with a Hiring
// manager's jobs), the members list with its role tabs and search, role
// changes and removals behind a confirm, resending invites, editing a Hiring
// manager's jobs, and the activity log — on team.*, with every string
// through t().
//
// v3 addition (v1's, not the redesign's): teammates' account-deletion
// requests this person may approve, in a card of the same style, shown only
// when there are any (TeamDeletionRequests).
import {
  hasFullAccess,
  TEAM_ROLE_PILL,
  TEAM_ROLES,
  type TeamRole,
} from "@jobgiga-app/api/shared/team-roles";
import { POSITIONS } from "@jobgiga-app/api/shared/positions";
import { ORPCError } from "@orpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmployerDashboardShell } from "@/components/dashboard/employer-dashboard-shell";
import { AnimatedRibbon } from "@/components/landing/animated-ribbon";
import { Dropdown } from "@/components/landing/dropdown";
import {
  BriefcaseIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  PencilIcon,
  SearchIcon,
  UserIcon,
  UsersIcon,
  XIcon,
} from "@/components/landing/icons";
import { Modal } from "@/components/landing/modal";
import { gradientFrameClass, inputClass as formInputClass } from "@/lib/landing/form-styles";
import { employerHomePath } from "@/lib/route-guards";
import { orpc, queryClient } from "@/utils/orpc";
import { TeamDeletionRequests } from "./team-deletion-requests";

const inputClass = formInputClass("teal");
const OTHER_POSITION = "__other__" as const;

type TeamData = Awaited<ReturnType<typeof orpc.team.list.call>>;
type TeamMember = TeamData["members"][number];
type ActivityEntry = TeamData["activity"][number];
type JobOption = TeamData["jobPostings"][number];

// Members-list tabs: everyone, then each kind of access.
const TABS = [
  { key: "all", roles: TEAM_ROLES },
  { key: "admins", roles: ["owner", "admin"] },
  { key: "hiring_manager", roles: ["hiring_manager"] },
  { key: "panel", roles: ["panel"] },
] as const satisfies readonly { key: string; roles: readonly TeamRole[] }[];
type TabKey = (typeof TABS)[number]["key"];

const ROLE_ICON: Record<TeamRole, (props: { className?: string }) => React.ReactElement> = {
  owner: UsersIcon,
  admin: UsersIcon,
  hiring_manager: BriefcaseIcon,
  panel: CalendarIcon,
};

// Statuses a Hiring manager can usefully be put on — drafts included, so
// they're set up before the posting goes live.
const ASSIGNABLE_STATUSES = new Set(["draft", "pending", "active", "flagged", "filled", "closed"]);

function relativeTimeAgo(t: TFunction, value: string): string {
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / (1000 * 60));
  if (minutes < 1) return t("team.ago.justNow");
  if (minutes < 60) return t("team.ago.minutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("team.ago.hours", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("dashboard.ago.days", { count: days });
  return t("dashboard.ago.weeks", { count: Math.floor(days / 7) });
}

function describeActivity(t: TFunction, entry: ActivityEntry): string {
  const vars = {
    actor: entry.actorLabel,
    email: entry.targetEmail,
    toRole: entry.toRole ? t(`team.roles.${entry.toRole}`) : "",
    fromRole: entry.fromRole ? t(`team.roles.${entry.fromRole}`) : "",
    job: entry.detail ?? t("team.activity.aJob"),
  };
  const known = ["invited", "resent_invite", "role_changed", "removed", "joined", "declined", "job_assigned", "job_unassigned"];
  return t(`team.activity.${known.includes(entry.action) ? entry.action : "updated"}`, vars);
}

/** "a Hiring manager" / "an Admin" — the article goes with the role in each language. */
function roleWithArticle(t: TFunction, role: TeamRole) {
  return t(`team.rolesWithArticle.${role}`);
}

function MemberAvatar({ url }: { url: string | null }) {
  // A broken photo (e.g. a removed Google photo) falls back to the icon.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || failedUrl === url) {
    return (
      <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand-teal-soft text-brand-teal-dark">
        <UserIcon className="h-[16px] w-[16px]" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      // Google account photos rate-limit requests that carry another site's referrer.
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(url)}
      className="h-[38px] w-[38px] shrink-0 rounded-full object-cover"
    />
  );
}

/** Checkbox list of the company's postings — the invite form and "Edit jobs" both use it. */
function JobPicker({ jobs, selected, onChange }: { jobs: JobOption[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useTranslation("common");
  const assignable = jobs.filter((j) => ASSIGNABLE_STATUSES.has(j.status));
  if (assignable.length === 0) {
    return <p className="rounded-[12px] bg-[#F8FAFB] p-[12px] text-xs text-[#9AA3B2]">{t("team.noJobsYet")}</p>;
  }
  return (
    <div className="scrollbar-thin-teal flex max-h-[240px] flex-col gap-[6px] overflow-y-auto">
      {assignable.map((job) => {
        const checked = selected.includes(job.id);
        return (
          <button
            key={job.id}
            type="button"
            role="checkbox"
            aria-checked={checked}
            onClick={() => onChange(checked ? selected.filter((id) => id !== job.id) : [...selected, job.id])}
            className={`flex items-center gap-[10px] rounded-[12px] border px-[12px] py-[9px] text-left transition-colors ${
              checked ? "border-brand-teal-dark bg-brand-teal-soft" : "border-[#EAEDF2] bg-white hover:bg-[#F8FAFB]"
            }`}
          >
            <span
              className={`flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[5px] border ${
                checked ? "border-brand-teal-dark bg-brand-teal-dark text-white" : "border-black/[0.2] bg-white"
              }`}
            >
              {checked && <CheckIcon className="h-[9px] w-[9px]" />}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-[#141B2E]">{job.title}</span>
            <span className="shrink-0 text-xs text-[#9AA3B2]">{t(`team.jobStatus.${job.status}`, { defaultValue: job.status })}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The page: the shell, and the team once team.list has loaded. */
export function EmployerTeamView() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const listQuery = useQuery({ ...orpc.team.list.queryOptions(), retry: false, meta: { suppressErrorToast: true } });
  // Changed your own role to one without Team access: off to your new home.
  const forbidden = listQuery.error instanceof ORPCError && listQuery.error.code === "FORBIDDEN";
  useEffect(() => {
    if (forbidden) void employerHomePath().then((to) => navigate({ to }));
  }, [forbidden, navigate]);
  return (
    <EmployerDashboardShell active="team" heading={t("team.heading")} subheading={t("team.subheading")}>
      {listQuery.isPending ? (
        <p className="rounded-[14px] bg-white/70 p-[16px] text-center text-xs text-[#9AA3B2]">{t("nav.loading")}</p>
      ) : listQuery.isError ? (
        forbidden ? null : <div className="rounded-[14px] border border-[#EAD9D6] bg-[#FBF3F1] p-[16px] text-center text-sm text-[#A66A61]">
          {t("team.loadError")}
        </div>
      ) : (
        <TeamContent data={listQuery.data} />
      )}
    </EmployerDashboardShell>
  );
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

function TeamContent({ data }: { data: TeamData }) {
  const { t } = useTranslation("common");
  const { members, activity, jobAssignments, jobPostings, currentUserId, currentUserRole, ownerPosition } = data;
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("admin");
  const [inviteJobIds, setInviteJobIds] = useState<string[]>([]);
  const [invitePositionChoice, setInvitePositionChoice] = useState<(typeof POSITIONS)[number] | "" | "__other__">("");
  const [invitePositionOther, setInvitePositionOther] = useState("");
  const invitePosition = invitePositionChoice === OTHER_POSITION ? invitePositionOther : invitePositionChoice;
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resentIds, setResentIds] = useState<Set<string>>(() => new Set());
  const [tab, setTab] = useState<TabKey>("all");
  // "Edit jobs" for one Hiring manager.
  const [editingJobs, setEditingJobs] = useState<{ member: TeamMember; jobIds: string[] } | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  // Removing someone, or changing a role, waits for an explicit yes.
  const [confirming, setConfirming] = useState<
    { kind: "remove"; member: TeamMember } | { kind: "role"; member: TeamMember; role: TeamRole } | null
  >(null);

  const inviteMutation = useMutation(orpc.team.invite.mutationOptions());
  const changeRoleMutation = useMutation(orpc.team.changeRole.mutationOptions());
  const removeMutation = useMutation(orpc.team.remove.mutationOptions());
  const resendMutation = useMutation(orpc.team.resendInvite.mutationOptions());
  const setJobsMutation = useMutation(orpc.team.setJobs.mutationOptions());

  const isOwner = currentUserRole === "owner";
  // Only an Owner can hand out (or take away) Owner.
  const roleOptions = TEAM_ROLES.filter((r) => r !== "owner" || isOwner).map((r) => ({ value: r, label: t(`team.roles.${r}`) }));

  const ownerCount = members.filter((m) => m.role === "owner").length;
  const searchTerm = search.trim().toLowerCase();
  const tabRoles: readonly TeamRole[] = TABS.find((x) => x.key === tab)?.roles ?? TEAM_ROLES;
  const inTab = members.filter((m) => tabRoles.includes(m.role));
  const visibleMembers = searchTerm
    ? inTab.filter((m) => {
        const position = m.role === "owner" ? (m.position ?? ownerPosition) : m.position;
        return [m.name, m.email, position].some((v) => (v ?? "").toLowerCase().includes(searchTerm));
      })
    : inTab;

  /** Everything that reads the team, the role or a Hiring manager's jobs. */
  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.team.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.employer.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.job.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.application.key() }),
    ]);
  }

  async function handleResend(id: string) {
    setResendingId(id);
    setError(null);
    try {
      await resendMutation.mutateAsync({ id });
      setResentIds((prev) => new Set(prev).add(id));
      await refresh();
    } catch (err) {
      setError(errorMessage(err, t("team.errors.resend")));
    } finally {
      setResendingId(null);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setError(null);
    try {
      const result = await inviteMutation.mutateAsync({
        email: inviteEmail.trim(),
        role: inviteRole,
        position: invitePosition.trim() || null,
        ...(inviteRole === "hiring_manager" ? { jobPostingIds: inviteJobIds } : {}),
      });
      queryClient.setQueryData(orpc.team.list.queryKey(), (old) =>
        old ? { ...old, members: result.members, jobAssignments: result.jobAssignments } : old,
      );
      // Show the tab the new person landed in.
      setTab(inviteRole === "hiring_manager" ? "hiring_manager" : inviteRole === "panel" ? "panel" : "all");
      setInviteEmail("");
      setInviteRole("admin");
      setInviteJobIds([]);
      setInvitePositionChoice("");
      setInvitePositionOther("");
      await refresh();
    } catch (err) {
      setError(errorMessage(err, t("team.errors.invite")));
    }
  }

  async function handleRoleChange(id: string, role: TeamRole, confirmed = false) {
    const member = members.find((m) => m.id === id);
    if (!member || member.role === role) return;
    // A role decides what someone can see and do, so every change asks first.
    if (!confirmed) {
      setConfirming({ kind: "role", member, role });
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      await changeRoleMutation.mutateAsync({ id, role });
      await refresh();
    } catch (err) {
      setError(errorMessage(err, t("team.errors.changeRole")));
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await removeMutation.mutateAsync({ id });
      await refresh();
    } catch (err) {
      setError(errorMessage(err, t("team.errors.remove")));
    } finally {
      setBusyId(null);
    }
  }

  async function saveJobs() {
    if (!editingJobs) return;
    setJobsError(null);
    try {
      await setJobsMutation.mutateAsync({ id: editingJobs.member.id, jobPostingIds: editingJobs.jobIds });
      setEditingJobs(null);
      await refresh();
    } catch (err) {
      setJobsError(errorMessage(err, t("team.errors.saveJobs")));
    }
  }

  const who = (m: TeamMember) => m.name || m.email;
  // The member list doesn't say who registered the company (a v3 gap), so
  // the "you'll become its main contact" note shows only if it ever does.
  const isRegistrant = (m: TeamMember) => "isRegistrant" in m && (m as { isRegistrant?: boolean }).isRegistrant === true;

  return (
    <div className="flex flex-col gap-[20px]">
      <TeamDeletionRequests />

      {/* Same collapsible explainer as the Interviews page's "How scheduling interviews works". */}
      <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`}>
        <div className="relative overflow-hidden rounded-[19px] bg-white p-[16px] sm:p-[22px]">
          {!howItWorksOpen && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-[70px] overflow-hidden rounded-b-[19px] sm:h-[95px] lg:h-[130px]"
            >
              <div className="-mt-[67px] sm:-mt-[92px] lg:-mt-[125px]">
                <AnimatedRibbon />
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setHowItWorksOpen((o) => !o)}
            aria-expanded={howItWorksOpen}
            className="relative flex w-full items-center gap-[8px] text-left"
          >
            <p className="text-sm text-[#141B2E]">{t("team.howItWorks.title")}</p>
            <ChevronDownIcon
              className={`ml-auto h-[10px] w-[10px] text-[#9AA3B2] transition-transform ${howItWorksOpen ? "" : "-rotate-90"}`}
            />
          </button>
          <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${howItWorksOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <div className="overflow-hidden">
              <div className="mt-[12px] grid grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-4">
                {([1, 2, 3, 4] as const).map((step) => (
                  <div key={step} className="flex flex-col gap-[4px] rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[14px]">
                    <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brand-teal-dark text-xs text-white">
                      {step}
                    </span>
                    <p className="mt-[4px] text-xs text-[#141B2E]">{t(`team.howItWorks.step${step}.title`)}</p>
                    <p className="text-xs text-[#4B5468]">{t(`team.howItWorks.step${step}.detail`)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Each card is its own stacking layer, so a dropdown opening downward
          needs its card above the ones below it. */}
      <div className={`relative z-20 animate-fade-in-up ${gradientFrameClass("teal")}`}>
        <div className="flex flex-col gap-[14px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
          <div>
            <p className="text-sm text-[#141B2E]">{t("team.invite.title")}</p>
            <p className="mt-[2px] text-xs text-[#4B5468]">{t("team.invite.hint")}</p>
          </div>
          <form onSubmit={handleInvite} className="flex flex-col gap-[10px]">
            <div className="flex flex-col gap-[10px] sm:flex-row sm:items-end">
              <div className="sm:flex-1">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t("team.invite.emailPlaceholder")}
                  aria-label={t("employerOnboarding.emailAddress")}
                  className={inputClass}
                />
              </div>
              <div className="w-full sm:w-[200px]">
                <Dropdown
                  id="invitePosition"
                  label={t("employerOnboarding.position")}
                  searchable
                  searchPlaceholder={t("employerOnboarding.searchPositions")}
                  value={invitePositionChoice}
                  options={[
                    { value: "" as const, label: t("team.invite.positionOptional") },
                    ...POSITIONS.map((p) => ({ value: p as (typeof POSITIONS)[number] | "" | "__other__", label: p })),
                    { value: OTHER_POSITION, label: t("employerOnboarding.other") },
                  ]}
                  onChange={(v) => setInvitePositionChoice(v)}
                />
              </div>
              <div className="w-full sm:w-[170px]">
                <Dropdown id="inviteRole" label={t("team.role")} value={inviteRole} options={roleOptions} onChange={(v) => setInviteRole(v)} />
              </div>
              <button
                type="submit"
                disabled={inviteMutation.isPending || !inviteEmail.trim()}
                className="flex h-[38px] items-center justify-center rounded-[12px] bg-brand-teal-dark px-[18px] text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {inviteMutation.isPending ? t("auth.sending") : t("team.invite.send")}
              </button>
            </div>
            {invitePositionChoice === OTHER_POSITION && (
              <input
                type="text"
                value={invitePositionOther}
                onChange={(e) => setInvitePositionOther(e.target.value)}
                placeholder={t("team.invite.positionOtherPlaceholder")}
                className={`${inputClass} sm:max-w-[320px]`}
              />
            )}

            {/* What the picked role can do — so nobody guesses. */}
            <div className="flex items-start gap-[10px] rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB] p-[12px]">
              {(() => {
                const Icon = ROLE_ICON[inviteRole];
                const pill = TEAM_ROLE_PILL[inviteRole];
                return (
                  <span className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full ${pill.bg} ${pill.text}`}>
                    <Icon className="h-[14px] w-[14px]" />
                  </span>
                );
              })()}
              <div className="min-w-0">
                <p className="text-xs text-[#141B2E]">{t(`team.roles.${inviteRole}`)}</p>
                <p className="mt-[1px] text-xs leading-[18px] text-[#4B5468]">{t(`team.roleDescriptions.${inviteRole}`)}</p>
              </div>
            </div>

            {inviteRole === "hiring_manager" && (
              <div className="flex flex-col gap-[8px]">
                <div>
                  <p className="text-xs text-[#141B2E]">{t("team.invite.theirJobs")}</p>
                  <p className="mt-[1px] text-xs text-[#9AA3B2]">{t("team.invite.theirJobsHint")}</p>
                </div>
                <JobPicker jobs={jobPostings} selected={inviteJobIds} onChange={setInviteJobIds} />
              </div>
            )}
          </form>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>

      <div className={`relative z-10 animate-fade-in-up ${gradientFrameClass("teal")}`} style={{ animationDelay: "60ms" }}>
        <div className="flex flex-col gap-[14px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
          <div className="flex flex-wrap items-center justify-between gap-[10px]">
            <p className="text-sm text-[#141B2E]">
              {searchTerm
                ? t("team.memberCountOf", { shown: visibleMembers.length, count: inTab.length })
                : t("team.memberCount", { count: inTab.length })}
            </p>
            <div
              role="tablist"
              aria-label={t("team.tabsLabel")}
              className="scrollbar-hide flex max-w-full gap-[4px] overflow-x-auto rounded-full bg-[#F1F4F8] p-[3px]"
            >
              {TABS.map((x) => {
                const count = members.filter((m) => (x.roles as readonly TeamRole[]).includes(m.role)).length;
                const selected = tab === x.key;
                return (
                  <button
                    key={x.key}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setTab(x.key)}
                    className={`flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-full px-[12px] py-[6px] text-xs transition-colors ${
                      selected ? "bg-white text-[#141B2E] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#4B5468] hover:text-[#141B2E]"
                    }`}
                  >
                    {t(`team.tabs.${x.key}`)}
                    <span className={selected ? "text-brand-teal-dark" : "text-[#9AA3B2]"}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-[8px] rounded-[12px] border border-black/[0.1] px-[12px] focus-within:border-brand-teal-dark">
            <SearchIcon className="h-[13px] w-[13px] shrink-0 text-[#9AA3B2]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("team.searchPlaceholder")}
              aria-label={t("team.searchLabel")}
              className="h-[38px] w-full bg-transparent text-sm text-[#141B2E] outline-none placeholder:text-[#9AA3B2]"
            />
          </div>
          {searchTerm && visibleMembers.length === 0 && <p className="text-sm text-[#9AA3B2]">{t("team.noSearchMatch", { query: search.trim() })}</p>}
          {!searchTerm && inTab.length === 0 && (
            <p className="rounded-[12px] bg-[#F8FAFB] p-[14px] text-xs leading-[18px] text-[#9AA3B2]">{t(`team.tabEmpty.${tab}`)}</p>
          )}
          <div className="flex flex-col gap-[8px]">
            {visibleMembers.map((member) => {
              const pill = TEAM_ROLE_PILL[member.role];
              const isSelf = member.userId === currentUserId;
              const isLastOwner = member.role === "owner" && ownerCount === 1;
              // Admins can't touch an Owner's role (the server refuses too).
              const canEditRole = isOwner || member.role !== "owner";
              const displayPosition = member.role === "owner" ? (member.position ?? ownerPosition) : member.position;
              const jobs = jobAssignments[member.id] ?? [];
              const inviteExpired =
                member.status === "pending" && !!member.inviteExpiresAt && new Date(member.inviteExpiresAt).getTime() < Date.now();
              return (
                <div key={member.id} className="@container rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB] p-[12px]">
                  <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[10px]">
                    <MemberAvatar url={member.avatarUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[#141B2E]">
                        {who(member)}
                        {isSelf && <span className="text-[#9AA3B2]"> {t("applicants.evaluation.you")}</span>}
                      </p>
                      <p className="truncate text-xs text-[#9AA3B2]">
                        {displayPosition ? `${displayPosition} · ${member.email}` : member.email}
                      </p>
                    </div>

                    <div className="order-last flex w-full flex-wrap items-center gap-[8px] @[34rem]:order-none @[34rem]:w-auto">
                      {member.status === "pending" && (
                        <div className="flex items-center gap-[6px]">
                          {inviteExpired && !resentIds.has(member.id) ? (
                            <span className="rounded-full bg-[#FFF1E6] px-[9px] py-[3px] text-xs text-[#B4561F]">{t("team.inviteExpired")}</span>
                          ) : (
                            <span className="rounded-full bg-[#F1F4F8] px-[9px] py-[3px] text-xs text-[#4B5468]">{t("team.pending")}</span>
                          )}
                          <button
                            type="button"
                            disabled={resendingId === member.id}
                            onClick={() => handleResend(member.id)}
                            className="text-xs text-brand-teal-dark underline hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {resendingId === member.id ? t("auth.sending") : resentIds.has(member.id) ? t("team.sent") : t("team.resend")}
                          </button>
                        </div>
                      )}

                      {canEditRole ? (
                        <div className="w-[160px]">
                          <Dropdown
                            id={`role-${member.id}`}
                            label={t("team.role")}
                            value={member.role}
                            disabled={busyId === member.id}
                            options={roleOptions}
                            onChange={(v) => handleRoleChange(member.id, v)}
                          />
                        </div>
                      ) : (
                        <span className={`rounded-full px-[9px] py-[3px] text-xs ${pill.bg} ${pill.text}`}>{t(`team.roles.${member.role}`)}</span>
                      )}
                    </div>

                    {isSelf ? (
                      // You can't remove yourself — an empty slot keeps the columns lined up.
                      <span className="h-[32px] w-[32px] shrink-0" aria-hidden />
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === member.id || isLastOwner || !canEditRole}
                        onClick={() => setConfirming({ kind: "remove", member })}
                        aria-label={t("team.removeLabel", { name: who(member) })}
                        title={isLastOwner ? t("team.lastOwner") : !canEditRole ? t("team.onlyOwnerRemoves") : undefined}
                        className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full text-[#9AA3B2] hover:bg-black/[0.05] hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <XIcon className="h-[12px] w-[12px]" />
                      </button>
                    )}
                  </div>

                  {member.role === "hiring_manager" && (
                    <div className="mt-[10px] flex flex-wrap items-center gap-[6px] border-t border-[#EAEDF2] pt-[10px]">
                      <BriefcaseIcon className="h-[12px] w-[12px] shrink-0 text-[#3B5BDB]" />
                      {jobs.length === 0 ? (
                        <span className="text-xs text-[#9AA3B2]">{t("team.noJobsAssigned")}</span>
                      ) : (
                        jobs.map((job) => (
                          <span key={job.id} className="max-w-[220px] truncate rounded-full bg-[#EAF0FE] px-[9px] py-[2px] text-xs text-[#3B5BDB]">
                            {job.title}
                          </span>
                        ))
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setJobsError(null);
                          setEditingJobs({ member, jobIds: jobs.map((j) => j.id) });
                        }}
                        className="ml-auto flex items-center gap-[4px] text-xs text-brand-teal-dark hover:underline"
                      >
                        <PencilIcon className="h-[10px] w-[10px]" />
                        {jobs.length === 0 ? t("team.assignJobs") : t("team.editJobs")}
                      </button>
                    </div>
                  )}
                  {member.role === "panel" && (
                    <div className="mt-[10px] flex items-center gap-[6px] border-t border-[#EAEDF2] pt-[10px]">
                      <CalendarIcon className="h-[12px] w-[12px] shrink-0 text-[#7C5CD1]" />
                      <span className="text-xs text-[#4B5468]">{t("team.panelNote")}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {editingJobs && (
        <Modal ariaLabel={t("team.jobsFor", { name: who(editingJobs.member) })} onClose={() => setEditingJobs(null)}>
          <p className="text-lg font-semibold text-[#141B2E]">{t("team.jobsFor", { name: who(editingJobs.member) })}</p>
          <p className="mt-[6px] text-sm leading-[20px] text-[#4B5468]">{t("team.jobsForHint")}</p>
          <div className="mt-[14px]">
            <JobPicker
              jobs={jobPostings}
              selected={editingJobs.jobIds}
              onChange={(jobIds) => setEditingJobs((prev) => (prev ? { ...prev, jobIds } : prev))}
            />
          </div>
          {jobsError && <p className="mt-[10px] text-xs text-red-500">{jobsError}</p>}
          <div className="mt-[18px] flex gap-[8px]">
            <button
              type="button"
              disabled={setJobsMutation.isPending}
              onClick={saveJobs}
              className="flex h-[40px] flex-1 items-center justify-center rounded-full bg-brand-teal-dark text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {setJobsMutation.isPending ? t("employerOnboarding.saving") : t("employerOnboarding.save")}
            </button>
            <button
              type="button"
              onClick={() => setEditingJobs(null)}
              className="flex h-[40px] items-center justify-center rounded-full border border-black/[0.1] px-[18px] text-sm text-[#141B2E] hover:bg-black/[0.03]"
            >
              {t("applicants.cancel")}
            </button>
          </div>
        </Modal>
      )}

      {confirming &&
        (() => {
          const { member } = confirming;
          const name = who(member);
          const toRole = confirming.kind === "role" ? confirming.role : null;
          const jobCount = jobAssignments[member.id]?.length ?? 0;
          return (
            <Modal
              ariaLabel={confirming.kind === "remove" ? t("team.removeLabel", { name }) : t("team.changeRoleLabel", { name })}
              onClose={() => setConfirming(null)}
            >
              <p className="text-lg font-semibold text-[#141B2E]">
                {toRole ? t("team.confirm.makeTitle", { name, role: roleWithArticle(t, toRole) }) : t("team.confirm.removeTitle", { name })}
              </p>
              <p className="mt-[8px] text-sm leading-[20px] text-[#4B5468]">
                {confirming.kind === "remove"
                  ? member.status === "pending"
                    ? t("team.confirm.removePending")
                    : t("team.confirm.removeActive")
                  : t(`team.roleDescriptions.${toRole}`)}
              </p>
              {toRole && (
                <div className="mt-[10px] flex items-center gap-[8px] text-xs text-[#4B5468]">
                  <span className={`rounded-full px-[9px] py-[3px] ${TEAM_ROLE_PILL[member.role].bg} ${TEAM_ROLE_PILL[member.role].text}`}>
                    {t(`team.roles.${member.role}`)}
                  </span>
                  <span aria-hidden>→</span>
                  <span className={`rounded-full px-[9px] py-[3px] ${TEAM_ROLE_PILL[toRole].bg} ${TEAM_ROLE_PILL[toRole].text}`}>
                    {t(`team.roles.${toRole}`)}
                  </span>
                </div>
              )}
              {toRole && !hasFullAccess(member.role) && hasFullAccess(toRole) && (
                <p className="mt-[10px] rounded-[12px] border border-[#FBE7B3] bg-brand-gold-soft p-[10px] text-xs leading-[18px] text-[#141B2E]">
                  <span className="font-semibold">{t("team.confirm.fullAccessBold", { name })}</span> {t("team.confirm.fullAccessRest")}
                </p>
              )}
              {toRole && hasFullAccess(member.role) && !hasFullAccess(toRole) && (
                <p className="mt-[10px] rounded-[12px] bg-[#F8FAFB] p-[10px] text-xs leading-[18px] text-[#4B5468]">
                  {t("team.confirm.loseAccess", { name, role: t(`team.roles.${toRole}`) })}
                </p>
              )}
              {toRole && member.userId === currentUserId && (
                <p className="mt-[10px] rounded-[12px] border border-[#FBE7B3] bg-brand-gold-soft p-[10px] text-xs leading-[18px] text-[#141B2E]">
                  <span className="font-semibold">{t("team.confirm.ownRoleBold")}</span> {t("team.confirm.ownRoleRest")}
                </p>
              )}
              {toRole && member.role === "hiring_manager" && jobCount > 0 && (
                <p className="mt-[10px] rounded-[12px] bg-[#F8FAFB] p-[10px] text-xs leading-[18px] text-[#4B5468]">
                  {hasFullAccess(toRole)
                    ? t("team.confirm.stopJobsFull", { count: jobCount, role: t(`team.roles.${toRole}`) })
                    : t("team.confirm.stopJobs", { count: jobCount })}
                </p>
              )}
              {isRegistrant(member) && member.role === "owner" && (
                <p className="mt-[10px] rounded-[12px] border border-[#FBE7B3] bg-brand-gold-soft p-[10px] text-xs leading-[18px] text-[#141B2E]">
                  {t("team.confirm.registrantBefore", { name })} <span className="font-semibold">{t("team.confirm.registrantBold")}</span>{" "}
                  {t("team.confirm.registrantAfter")}
                </p>
              )}
              <div className="mt-[18px] flex gap-[8px]">
                <button
                  type="button"
                  disabled={busyId === member.id}
                  onClick={async () => {
                    setConfirming(null);
                    if (confirming.kind === "remove") await handleRemove(member.id);
                    else await handleRoleChange(member.id, confirming.role, true);
                  }}
                  className={`flex h-[40px] flex-1 items-center justify-center rounded-full text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-60 ${
                    confirming.kind === "remove" ? "bg-red-500" : "bg-brand-teal-dark"
                  }`}
                >
                  {toRole ? t("team.confirm.yesMake", { role: t(`team.roles.${toRole}`) }) : t("team.confirm.yesRemove")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(null)}
                  className="flex h-[40px] items-center justify-center rounded-full border border-black/[0.1] px-[18px] text-sm text-[#141B2E] hover:bg-black/[0.03]"
                >
                  {t("applicants.cancel")}
                </button>
              </div>
            </Modal>
          );
        })()}

      {activity.length > 0 && (
        <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`} style={{ animationDelay: "120ms" }}>
          <div className="flex flex-col gap-[10px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
            <p className="text-sm text-[#141B2E]">{t("team.activityTitle")}</p>
            <div className="flex flex-col gap-[8px]">
              {activity.map((entry) => (
                <div key={entry.id} className="flex items-start justify-between gap-[12px] text-xs">
                  <p className="text-[#4B5468]">{describeActivity(t, entry)}</p>
                  <p className="shrink-0 text-[#9AA3B2]">{relativeTimeAgo(t, entry.createdAt)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
