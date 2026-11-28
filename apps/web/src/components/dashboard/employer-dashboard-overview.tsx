import type { DashboardData } from "@jobgiga-app/api/lib/employer/dashboard";
import type { CriteriaFlags } from "@jobgiga-app/api/shared/matching";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BriefcaseIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  DraftIcon,
  EyeIcon,
  FlagIcon,
  PencilIcon,
  PlusIcon,
  StackIcon,
  UserIcon,
  UsersIcon,
  XCircleIcon,
  XIcon,
} from "@/components/landing/icons";
import { showComingSoon } from "@/lib/coming-soon";
import { APPLICATION_STATUS_COLOR, relativeTimeAgo, statusLabel } from "@/lib/dashboard/pipeline";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { orpc } from "@/utils/orpc";
import { InterviewCountdown } from "./interview-countdown";
import { TopMatchesCard } from "./top-matches-card";

// Same bands as the Top Matches card, so a score reads the same everywhere.
function matchBand(score: number): { bg: string; text: string } {
  if (score >= 80) return { bg: "bg-[#E7F6EC]", text: "text-[#2F9E56]" };
  if (score >= 60) return { bg: "bg-brand-teal-soft", text: "text-brand-teal-dark" };
  return { bg: "bg-[#F1F4F8]", text: "text-[#4B5468]" };
}

// The posting status pill, as on Manage Job. v1's statuses arrive with
// "published" already called "active".
const POSTING_STATUS_PILL: Record<string, { bg: string; text: string }> = {
  active: { bg: "bg-brand-teal-soft", text: "text-brand-teal-dark" },
  pending: { bg: "bg-brand-gold-soft", text: "text-brand-gold-dark" },
  filled: { bg: "bg-[#E7F6EC]", text: "text-[#2F9E56]" },
  closed: { bg: "bg-black/[0.04]", text: "text-[#9AA3B2]" },
  draft: { bg: "bg-[#F1ECFB]", text: "text-[#7C5CD1]" },
  rejected: { bg: "bg-red-50", text: "text-red-500" },
  flagged: { bg: "bg-[#FFEFE3]", text: "text-[#C2600A]" },
};

function SectionCard({
  title,
  viewAllHref,
  children,
  animationDelayMs = 0,
}: {
  title: string;
  viewAllHref?: string;
  children: React.ReactNode;
  animationDelayMs?: number;
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  return (
    <div className={`h-full animate-fade-in-up ${gradientFrameClass("teal")}`} style={{ animationDelay: `${animationDelayMs}ms` }}>
      <div className="flex h-full flex-col gap-[14px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
        <div className="flex items-center justify-between gap-[8px]">
          <p className="text-sm text-[#141B2E]">{title}</p>
          {viewAllHref && (
            <a
              href={viewAllHref}
              onClick={(e) => {
                e.preventDefault();
                if (viewAllHref === "/employer/jobs") navigate({ to: "/employer/jobs" });
                else if (viewAllHref === "/employer/applicants") navigate({ to: "/employer/applicants" });
                else if (viewAllHref === "/employer/interviews") navigate({ to: "/employer/interviews" });
                else showComingSoon();
              }}
              className="text-sm text-brand-teal-dark hover:underline"
            >
              {t("dashboard.viewAllArrow")}
            </a>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[14px] bg-[#F8FAFB] p-[16px] text-center text-xs text-[#9AA3B2]">{children}</p>;
}

type StatTileProps = {
  label: string;
  value: number;
  sublabel: string;
  sublabelColorClass: string;
  actionLabel: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>;
  gradient: string;
  onClick: () => void;
};

// Every Overview tile looks the same; it either scrolls to a card on this
// page or opens another page (those pages aren't in v3 yet: "coming soon").
function StatTile({ label, value, sublabel, sublabelColorClass, actionLabel, icon: Icon, gradient, onClick }: StatTileProps) {
  const disabled = value === 0;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`${label}: ${value}. ${actionLabel}.`}
      className={`gradient-noise group relative block h-full w-full overflow-hidden rounded-[20px] bg-gradient-to-b to-white to-90% p-[18px] text-left transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-teal-dark ${
        disabled ? "cursor-default opacity-60" : "cursor-pointer hover:-translate-y-[2px]"
      }`}
      style={{ backgroundImage: `linear-gradient(to bottom, ${gradient}, white 90%)` }}
    >
      <span aria-hidden className="pointer-events-none absolute -top-[5%] -right-[5%]">
        <Icon
          className="icon-gradient-color h-[84px] w-[84px] opacity-40"
          strokeWidth={0.63}
          style={{ "--icon-accent": gradient } as React.CSSProperties}
        />
      </span>
      <div className="relative flex h-full flex-col justify-between gap-[16px]">
        <div>
          <span className="inline-flex items-center gap-[6px] rounded-[6px] bg-white/90 px-[10px] py-[5px] text-[11px] text-[#4B5468]">
            <Icon className="h-[11px] w-[11px]" />
            {label}
          </span>
          <p className="mt-[12px] text-[26px] leading-none text-[#202033]">{value}</p>
          <p className={`mt-[6px] text-xs ${sublabelColorClass}`}>{sublabel}</p>
        </div>
        <div className="flex items-center justify-between gap-[8px] rounded-[10px] bg-white/95 px-[12px] py-[10px]">
          <span className="text-xs text-[#4B5468]">{actionLabel}</span>
          <span
            aria-hidden
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] border border-[#BFC1C6] text-sm text-[#4B5468] transition-transform group-hover:translate-x-[2px]"
          >
            →
          </span>
        </div>
      </div>
    </button>
  );
}

// Click-and-drag to pan a sideways-scrolling row with a mouse, like a
// carousel. Touch is left to the browser. A real drag swallows the click it
// ends on, so dragging across a tile doesn't open it.
function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const state = useRef({ dragging: false, moved: false, startX: 0, startScrollLeft: 0 });
  const [progress, setProgress] = useState(0);

  function measureProgress() {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setProgress(max <= 0 ? 0 : Math.min(1, Math.max(0, el.scrollLeft / max)));
  }

  return {
    ref,
    progress,
    className: "cursor-grab select-none active:cursor-grabbing",
    onPointerDown(e: React.PointerEvent<T>) {
      if (e.pointerType !== "mouse") return;
      const el = ref.current;
      if (!el) return;
      state.current = { dragging: true, moved: false, startX: e.clientX, startScrollLeft: el.scrollLeft };
      el.setPointerCapture(e.pointerId);
    },
    onPointerMove(e: React.PointerEvent<T>) {
      const el = ref.current;
      if (!el || !state.current.dragging) return;
      const dx = e.clientX - state.current.startX;
      if (Math.abs(dx) > 4) state.current.moved = true;
      el.scrollLeft = state.current.startScrollLeft - dx;
      measureProgress();
    },
    onPointerUp(e: React.PointerEvent<T>) {
      const el = ref.current;
      if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      state.current.dragging = false;
    },
    onClickCapture(e: React.MouseEvent<T>) {
      if (state.current.moved) {
        e.preventDefault();
        e.stopPropagation();
        state.current.moved = false;
      }
    },
    onScroll: measureProgress,
  };
}

// Dots under the sideways row: a fixed few standing in for the scroll position.
function ScrollDots({ progress, count = 3 }: { progress: number; count?: number }) {
  const active = Math.min(count - 1, Math.round(progress * (count - 1)));
  return (
    <div className="flex items-center justify-center gap-[6px]">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={`h-[8px] rounded-full transition-all ${i === active ? "w-[24px] bg-brand-teal-dark" : "w-[8px] bg-[#E5E8ED]"}`}
        />
      ))}
    </div>
  );
}

const OVERVIEW_HIDDEN_TILES_KEY = "jobgiga:employerOverviewHiddenTiles";
const OVERVIEW_ORDER_KEY = "jobgiga:employerOverviewTileOrder";

function readStoredList(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function SlidersIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 14 14"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d="M1.5 4h5M9 4h3.5M1.5 10h3M7 10h5.5M6.5 2.3v3.4M9.5 8.3v3.4" />
    </svg>
  );
}

function ApplicantAvatar({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-brand-teal-soft text-brand-teal-dark">
        <UserIcon className="h-[14px] w-[14px]" />
      </div>
    );
  }
  return <img src={url} alt="" className="h-[32px] w-[32px] shrink-0 rounded-full object-cover" />;
}

/**
 * The redesign's EmployerDashboardOverview: the Overview tiles (drag to
 * reorder, hide or show them under Arrange — remembered in this browser),
 * upcoming interviews, Top Matches, recent applicants, where applicants
 * stand, per-posting performance and the hiring trend.
 */
export function EmployerDashboardOverview({
  data,
  initialSmartMatchEnabled,
  initialCriteria,
  canManage = true,
}: {
  data: DashboardData;
  initialSmartMatchEnabled: boolean;
  initialCriteria: CriteriaFlags;
  canManage?: boolean;
}) {
  const { t, i18n } = useTranslation("common");
  const navigate = useNavigate();
  const locale = i18n.resolvedLanguage === "ms" ? "ms-MY" : "en-MY";
  // The same scores Top Matches uses (one shared request), for the badges on
  // Recent applicants.
  const matchesQuery = useQuery({
    ...orpc.employer.topMatches.queryOptions(),
    enabled: initialSmartMatchEnabled,
    meta: { suppressErrorToast: true },
  });
  const matchByApplicationId = new Map((matchesQuery.data?.results ?? []).map((r) => [r.applicationId, r]));

  const overviewDrag = useDragScroll<HTMLDivElement>();
  const [hiddenTileIds, setHiddenTileIds] = useState<string[]>(() => readStoredList(OVERVIEW_HIDDEN_TILES_KEY) ?? []);
  const [tileOrder, setTileOrder] = useState<string[] | null>(() => readStoredList(OVERVIEW_ORDER_KEY));
  const [editingOverview, setEditingOverview] = useState(false);
  const [dragTileId, setDragTileId] = useState<string | null>(null);

  function toggleTileHidden(id: string) {
    setHiddenTileIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(OVERVIEW_HIDDEN_TILES_KEY, JSON.stringify(next));
      } catch {
        // Won't last past a reload, but still applies now.
      }
      return next;
    });
  }

  function reorderTiles(draggedId: string, targetId: string) {
    setTileOrder((prev) => {
      const base = prev ?? statTiles.map((tile) => tile.id);
      const current = base.filter((id) => id !== draggedId);
      current.splice(current.indexOf(targetId), 0, draggedId);
      try {
        localStorage.setItem(OVERVIEW_ORDER_KEY, JSON.stringify(current));
      } catch {
        // Won't last past a reload, but still applies now.
      }
      return current;
    });
  }

  function resetOverviewLayout() {
    setHiddenTileIds([]);
    setTileOrder(null);
    try {
      localStorage.removeItem(OVERVIEW_HIDDEN_TILES_KEY);
      localStorage.removeItem(OVERVIEW_ORDER_KEY);
    } catch {
      // Nothing to clean up.
    }
  }

  const maxFunnelCount = Math.max(1, ...data.funnel.map((f) => f.count));
  const maxHiringCount = Math.max(1, ...data.hiringTrend.map((h) => h.hires));

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const tile = (id: string, value: number, icon: StatTileProps["icon"], gradient: string, sublabelColorClass: string, onClick: () => void) => ({
    id,
    label: t(`dashboard.tiles.${id}.label`),
    value,
    sublabel: t(`dashboard.tiles.${id}.sublabel`),
    actionLabel: t(`dashboard.tiles.${id}.action`),
    icon,
    gradient,
    sublabelColorClass,
    onClick,
  });
  const toApplicants = (status: string) => () => navigate({ to: "/employer/applicants", search: { status } });
  const toInterviews = (response: "reschedule_requested" | "no_show") => () =>
    navigate({ to: "/employer/interviews", search: { response } });
  const statTiles = [
    tile("active-postings", data.stats.activePostings, BriefcaseIcon, "#8CE6D9", "text-[#0B6E63]", () => scrollToSection("posting-performance")),
    tile("total-applicants", data.stats.totalApplicants, UsersIcon, "#BBC3D2", "text-[#4B5468]", () => scrollToSection("recent-applicants")),
    tile("interviews-this-week", data.stats.interviewsThisWeek, CalendarIcon, "#C7CBF7", "text-[#7C5CD1]", () => scrollToSection("upcoming-interviews")),
    tile("needs-evaluation", data.stats.needsEvaluation, PencilIcon, "#FFCFA3", "text-[#B06A2A]", toApplicants("evaluation")),
    tile("reschedule-requests", data.stats.rescheduleRequests, CalendarIcon, "#FFCDA1", "text-[#C2600A]", toInterviews("reschedule_requested")),
    tile("postings-needing-attention", data.stats.postingsNeedingAttention, FlagIcon, "#F9B9B9", "text-red-500", () => navigate({ to: "/employer/jobs" })),
    tile("no-shows", data.stats.noShows, XCircleIcon, "#D4D7DC", "text-[#4B5468]", toInterviews("no_show")),
    tile("new-applicants", data.stats.newApplicants, StackIcon, "#C9CFDA", "text-[#4B5468]", toApplicants("applied")),
    tile("kiv", data.stats.kiv, ClockIcon, "#B9C3F9", "text-[#5566B0]", toApplicants("kiv")),
    tile("stale-offers", data.stats.staleOffers, DraftIcon, "#FFCDA1", "text-[#B06A2A]", toApplicants("offer")),
    tile("interviewed-not-evaluated", data.stats.interviewedNotEvaluated, CheckCircleIcon, "#A5C6F7", "text-[#3B6FBF]", toApplicants("interviewed")),
  ];

  // The saved order first; any tile it doesn't mention keeps its place at the end.
  const orderedTiles = tileOrder
    ? [...statTiles].sort((a, b) => {
        const ai = tileOrder.indexOf(a.id);
        const bi = tileOrder.indexOf(b.id);
        return (ai === -1 ? tileOrder.length : ai) - (bi === -1 ? tileOrder.length : bi);
      })
    : statTiles;
  const visibleTiles = orderedTiles.filter((item) => !hiddenTileIds.includes(item.id));

  function formatScheduledAt(iso: string): string {
    return new Date(iso).toLocaleString(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Kuala_Lumpur",
    });
  }
  // "Sep", as in the redesign ("en-MY" would say "Sept").
  const monthLabel = (month: number) =>
    new Date(2000, month, 1).toLocaleString(i18n.resolvedLanguage === "ms" ? "ms-MY" : "en-US", { month: "short" });

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-[20px]">
      {!data.hasPostings && (
        <div className={gradientFrameClass("teal")}>
          <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
            <p className="text-sm text-[#141B2E]">{t("dashboard.employer.getStarted")}</p>
            <p className="mt-[6px] text-xs text-[#4B5468]">
              {canManage ? t("dashboard.employer.getStartedBody") : t("dashboard.employer.getStartedBodyLimited")}
            </p>
          </div>
        </div>
      )}

      <div className={`${gradientFrameClass("teal")} animate-fade-in-up`}>
        <div className="flex flex-col gap-[14px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
          <div className="flex items-center justify-between gap-[8px]">
            <p className="text-sm text-[#141B2E]">{t("dashboard.employer.overview")}</p>
            <div className="flex items-center gap-[8px]">
              {editingOverview && (
                <button
                  type="button"
                  onClick={resetOverviewLayout}
                  className="rounded-full border border-[#EAEDF2] px-[12px] py-[6px] text-xs text-[#4B5468] hover:bg-[#F8FAFB]"
                >
                  {t("dashboard.employer.reset")}
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditingOverview((v) => !v)}
                className={`flex items-center gap-[6px] rounded-full px-[12px] py-[6px] text-xs transition-colors ${
                  editingOverview
                    ? "bg-brand-teal-dark text-white hover:opacity-90"
                    : "border border-[#EAEDF2] text-[#4B5468] hover:bg-[#F8FAFB]"
                }`}
              >
                {editingOverview ? (
                  t("dashboard.employer.done")
                ) : (
                  <>
                    <SlidersIcon className="h-[12px] w-[12px]" />
                    {t("dashboard.employer.arrange")}
                  </>
                )}
              </button>
            </div>
          </div>

          {editingOverview ? (
            <div className="scrollbar-hide -mx-[22px] -my-[14px] overflow-x-auto px-[22px] py-[14px]">
              <div className="flex w-max gap-[12px]">
                {orderedTiles.map((item) => {
                  const hidden = hiddenTileIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => {
                        setDragTileId(item.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setDragTileId(null)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragTileId && dragTileId !== item.id) reorderTiles(dragTileId, item.id);
                        setDragTileId(null);
                      }}
                      className={`relative w-[220px] shrink-0 cursor-grab active:cursor-grabbing ${dragTileId === item.id ? "opacity-30" : ""}`}
                    >
                      <div className={`pointer-events-none transition-all ${hidden ? "opacity-40 grayscale" : ""}`}>
                        <StatTile {...item} />
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleTileHidden(item.id)}
                        aria-label={hidden ? t("dashboard.employer.showTile", { label: item.label }) : t("dashboard.employer.hideTile", { label: item.label })}
                        className="absolute -top-[8px] -right-[8px] z-10 flex h-[26px] w-[26px] items-center justify-center rounded-full border border-[#EAEDF2] bg-white text-[#4B5468] shadow-[0_2px_6px_rgba(0,0,0,0.12)] hover:bg-[#F8FAFB]"
                      >
                        {hidden ? <PlusIcon className="h-[11px] w-[11px]" /> : <XIcon className="h-[11px] w-[11px]" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : visibleTiles.length === 0 ? (
            <EmptyRow>{t("dashboard.employer.allHidden")}</EmptyRow>
          ) : (
            <>
              <div
                ref={overviewDrag.ref}
                onPointerDown={overviewDrag.onPointerDown}
                onPointerMove={overviewDrag.onPointerMove}
                onPointerUp={overviewDrag.onPointerUp}
                onPointerCancel={overviewDrag.onPointerUp}
                onClickCapture={overviewDrag.onClickCapture}
                onScroll={overviewDrag.onScroll}
                className={`scrollbar-hide -mx-[22px] -my-[4px] overflow-x-auto px-[22px] py-[4px] ${overviewDrag.className}`}
              >
                <div className="flex w-max gap-[12px]">
                  {visibleTiles.map((item) => (
                    <div key={item.id} className="w-[220px] shrink-0">
                      <StatTile {...item} />
                    </div>
                  ))}
                </div>
              </div>
              <ScrollDots progress={overviewDrag.progress} />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-[20px] lg:grid-cols-2">
        <div id="upcoming-interviews" className="scroll-mt-[100px]">
          <SectionCard title={t("dashboard.employer.upcomingInterviews")} viewAllHref="/employer/interviews" animationDelayMs={0}>
            {data.upcomingInterviews.length === 0 ? (
              <EmptyRow>{t("dashboard.employer.noInterviews")}</EmptyRow>
            ) : (
              <div className="flex flex-col gap-[8px]">
                {data.upcomingInterviews.map((interview) => (
                  <div key={interview.applicationId} className="flex flex-col gap-[8px] rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB] p-[12px]">
                    <div className="flex items-center gap-[8px]">
                      <ApplicantAvatar url={interview.applicantAvatarUrl} />
                      <div className="min-w-0">
                        <p className="truncate text-xs text-[#141B2E]">{interview.applicantName}</p>
                        <p className="mt-[1px] truncate text-xs text-[#9AA3B2]">{interview.jobPostingTitle}</p>
                      </div>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-x-[10px] gap-y-[2px] rounded-[10px] bg-[#F1ECFB] px-[10px] py-[6px]">
                      <p className="flex shrink-0 items-center gap-[6px] text-xs text-[#7C5CD1]">
                        <CalendarIcon className="h-[12px] w-[12px]" />
                        {t("dashboard.employer.round", { round: interview.round })} · {t(`dashboard.interviewModes.${interview.mode}`)}
                      </p>
                      <p className="shrink-0 text-xs text-[#4B5468]">
                        {formatScheduledAt(interview.scheduledAt)}
                        {interview.durationMinutes ? ` · ${t("dashboard.employer.minutes", { count: interview.durationMinutes })}` : ""}
                      </p>
                      <InterviewCountdown scheduledAt={interview.scheduledAt} className="shrink-0 text-xs text-[#7C5CD1]" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <SectionCard title={t("dashboard.matches.title")} animationDelayMs={60}>
          <TopMatchesCard initialEnabled={initialSmartMatchEnabled} initialCriteria={initialCriteria} canEditSettings={canManage} />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-[20px] lg:grid-cols-2">
        <div id="recent-applicants" className="scroll-mt-[100px]">
          <SectionCard title={t("dashboard.employer.recentApplicants")} viewAllHref="/employer/applicants" animationDelayMs={120}>
            {data.recentApplicants.length === 0 ? (
              <EmptyRow>{t("dashboard.employer.noApplicants")}</EmptyRow>
            ) : (
              <div className="flex flex-col gap-[8px]">
                {data.recentApplicants.map((applicant) => {
                  const color = APPLICATION_STATUS_COLOR[applicant.status] ?? APPLICATION_STATUS_COLOR.applied!;
                  const match = matchByApplicationId.get(applicant.applicationId);
                  const band = match ? matchBand(match.score) : null;
                  return (
                    <div key={applicant.applicationId} className="@container rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB] p-[12px]">
                      <div className="flex items-start gap-[10px] @[30rem]:items-center">
                        <ApplicantAvatar url={applicant.applicantAvatarUrl} />
                        <div className="flex min-w-0 flex-1 flex-col gap-[6px] @[30rem]:flex-row @[30rem]:items-center @[30rem]:gap-[10px]">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs text-[#141B2E]">{applicant.applicantName}</p>
                            <p className="mt-[1px] truncate text-xs text-[#9AA3B2]">
                              {applicant.jobPostingTitle}
                              <span className="mx-[6px] text-[#C7CDD7]">·</span>
                              {relativeTimeAgo(t, applicant.appliedAt)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-[6px] @[30rem]:shrink-0 @[30rem]:justify-end">
                            {band && match && (
                              <span className={`rounded-full px-[9px] py-[3px] text-xs ${band.bg} ${band.text}`}>
                                {t("dashboard.employer.jobMatch", { score: match.score })}
                              </span>
                            )}
                            {match && !match.eligible && (
                              <span
                                className="rounded-full bg-[#FDEDE8] px-[9px] py-[3px] text-xs text-[#C2410C]"
                                title={match.ineligibleReasons.join("; ") || t("dashboard.matches.doesntMeet")}
                              >
                                {t("dashboard.matches.failedScreening")}
                              </span>
                            )}
                            <span className={`rounded-full px-[9px] py-[3px] text-xs ${color.bg} ${color.text}`}>
                              {statusLabel(t, applicant.status)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>

        <SectionCard title={t("dashboard.employer.whereApplicantsStand")} animationDelayMs={180}>
          <div className="flex flex-col gap-[8px]">
            {data.funnel.map((stage) => (
              <div key={stage.stage} className="flex items-center gap-[10px]">
                <span className="w-[110px] shrink-0 text-xs text-[#4B5468]">{statusLabel(t, stage.stage)}</span>
                <div className="h-[10px] flex-1 overflow-hidden rounded-full bg-[#F1F4F8]">
                  <div className="h-full rounded-full bg-brand-teal-dark" style={{ width: `${(stage.count / maxFunnelCount) * 100}%` }} />
                </div>
                <span className="w-[20px] shrink-0 text-right text-xs text-[#141B2E]">{stage.count}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#9AA3B2]">{t("dashboard.employer.funnelNote")}</p>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-[20px] lg:grid-cols-2">
        <div id="posting-performance" className="scroll-mt-[100px]">
          <SectionCard title={t("dashboard.employer.perPosting")} viewAllHref="/employer/jobs" animationDelayMs={240}>
            {data.postingPerformance.length === 0 ? (
              <EmptyRow>{t("dashboard.employer.noPostings")}</EmptyRow>
            ) : (
              <div className="grid grid-cols-1 gap-[12px] sm:grid-cols-2">
                {data.postingPerformance.map((posting) => {
                  const pill = POSTING_STATUS_PILL[posting.status];
                  return (
                    // Like the redesign: ?id= is carried along, though Manage Job
                    // opens on its list either way.
                    <a
                      key={posting.id}
                      href={`/employer/jobs?id=${posting.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate({ to: "/employer/jobs", search: { id: posting.id } });
                      }}
                      className="flex flex-col gap-[8px] rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB] p-[12px] transition-colors hover:border-brand-teal-dark"
                    >
                      <div className="flex flex-wrap items-center gap-[6px]">
                        <p className="truncate text-xs text-[#141B2E]">{posting.title}</p>
                        {pill && (
                          <span className={`rounded-full px-[10px] py-[3px] text-xs ${pill.bg} ${pill.text}`}>
                            {t(`dashboard.postingStatus.${posting.status}`)}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[2px] text-xs text-[#4B5468]">
                        <span className="flex items-center gap-[4px]">
                          <EyeIcon className="h-[13px] w-[13px] text-[#9AA3B2]" />
                          {posting.viewCount}
                        </span>
                        <span className="text-[#C7CDD7]">·</span>
                        <span className="flex items-center gap-[4px]">
                          <UsersIcon className="h-[13px] w-[13px] text-[#9AA3B2]" />
                          {posting.applicantCount}
                        </span>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>

        <SectionCard title={t("dashboard.employer.hiringTrend")} animationDelayMs={300}>
          {data.avgTimeToHireDays === null ? (
            <EmptyRow>{t("dashboard.employer.noHires")}</EmptyRow>
          ) : (
            <>
              <div className="flex items-end justify-between gap-[6px]">
                {data.hiringTrend.map((month) => (
                  <div key={month.month} className="flex flex-1 flex-col items-center gap-[4px]">
                    <div className="flex h-[80px] w-full items-end">
                      <div
                        className="w-full rounded-t-[6px] bg-brand-teal-dark"
                        style={{ height: `${Math.max(4, (month.hires / maxHiringCount) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-[#9AA3B2]">{monthLabel(month.month)}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-[6px] rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB] p-[12px]">
                <ClockIcon className="h-[14px] w-[14px] text-[#9AA3B2]" />
                <span className="text-xs text-[#4B5468]">
                  {t("dashboard.employer.avgTimeToHire", { count: data.avgTimeToHireDays })}
                  <span className="ml-[4px] font-normal text-[#9AA3B2]">{t("dashboard.employer.estimated")}</span>
                </span>
              </div>
            </>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
