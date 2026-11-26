import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { UnsavedChangesGuardBoundary, useUnsavedChangesGuard } from "@/components/form/unsaved-changes-guard";
import { AnimatedRibbon } from "@/components/landing/animated-ribbon";
import {
  BriefcaseIcon,
  CheckCircleIcon,
  DraftIcon,
  FileIcon,
  HeartIcon,
  HomeIcon,
  UserIcon,
} from "@/components/landing/icons";
import { Navbar } from "@/components/landing/navbar";
import { useCenterActiveTab } from "@/hooks/use-center-active-tab";
import { showComingSoon } from "@/lib/coming-soon";
import { NavLinkIcon } from "./nav-link-icon";
import { SidebarResumeCard } from "./sidebar-resume-card";

export type JobseekerNavKey =
  | "overview"
  | "applications"
  | "saved"
  | "coverLetters"
  | "resumeDesigner"
  | "resumeReview"
  | "profile";

// A sidebar spinner clears itself after this long even if the page never arrives.
const NAV_PENDING_TIMEOUT_MS = 10_000;

// `ready: false` — the page isn't in v3 yet; the item is there (as in the
// redesign) and says "coming soon" when clicked. TODO(route) for each.
const NAV_ITEMS = [
  { key: "overview", href: "/jobseeker/dashboard", icon: HomeIcon, ready: true },
  { key: "applications", href: "/jobseeker/applications", icon: BriefcaseIcon, ready: false },
  { key: "saved", href: "/jobseeker/saved", icon: HeartIcon, ready: false },
  { key: "coverLetters", href: "/jobseeker/cover-letters", icon: FileIcon, ready: false },
  { key: "resumeDesigner", href: "/jobseeker/resume-designer", icon: DraftIcon, ready: false },
  { key: "resumeReview", href: "/jobseeker/resume-review", icon: CheckCircleIcon, ready: false },
  { key: "profile", href: "/jobseeker/profile", icon: UserIcon, ready: false },
] as const;

// Split out so useUnsavedChangesGuard() runs inside the boundary the shell renders.
function Sidebar({
  active,
  resume,
}: {
  active: JobseekerNavKey;
  resume: { fileName: string; fileSize: number | null } | null;
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const guardNavigation = useUnsavedChangesGuard();
  const barRef = useCenterActiveTab<HTMLElement>();
  const routerLoading = useRouterState({ select: (s) => s.status === "pending" });
  const [clickedKey, setClickedKey] = useState<JobseekerNavKey | null>(null);
  useEffect(() => {
    if (clickedKey === null) return;
    const timer = setTimeout(() => setClickedKey(null), NAV_PENDING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [clickedKey]);

  return (
    // `contents` below xl lets the resume card drop under the page content
    // on phones and tablets instead of pushing it below the fold.
    <div className="contents xl:sticky xl:top-[85px] xl:flex xl:w-[220px] xl:shrink-0 xl:flex-col xl:gap-[16px]">
      <aside
        ref={barRef}
        className="scrollbar-hide flex shrink-0 flex-row gap-[4px] overflow-x-auto rounded-full bg-[#F1F4F8] p-[4px] xl:flex-col xl:gap-[2px] xl:rounded-[14px] xl:border xl:border-[#EAEDF2] xl:bg-white xl:p-[10px]"
      >
        {NAV_ITEMS.map((item) => (
          <a
            key={item.key}
            href={item.href}
            aria-current={item.key === active ? "page" : undefined}
            onClick={(e) => {
              e.preventDefault();
              if (item.key === active) return;
              if (!item.ready) {
                showComingSoon();
                return;
              }
              guardNavigation(() => {
                setClickedKey(item.key);
                navigate({ to: item.href });
              });
            }}
            className={`flex shrink-0 items-center gap-[10px] whitespace-nowrap rounded-full px-[16px] py-[10px] text-sm text-[#4B5468] transition-colors hover:bg-black/[0.03] aria-[current=page]:bg-white aria-[current=page]:text-[#141B2E] aria-[current=page]:shadow-[0_1px_2px_rgba(0,0,0,0.06)] xl:rounded-[10px] xl:aria-[current=page]:bg-brand-gold-soft xl:aria-[current=page]:text-brand-gold-dark xl:aria-[current=page]:shadow-none ${
              item.key === active ? "animate-fade-in-up" : ""
            }`}
          >
            <NavLinkIcon icon={item.icon} pending={routerLoading && clickedKey === item.key} />
            {t(`dashboard.jobseekerNav.${item.key}`)}
          </a>
        ))}
      </aside>

      <div className="order-last xl:order-none">
        <SidebarResumeCard initialResume={resume} />
      </div>
    </div>
  );
}

/**
 * The redesign's JobseekerDashboardShell: navbar, sidebar, the page's
 * heading and content, and the ribbon — gold, the jobseeker's colour.
 *
 * Not in v3 yet (they come with their own pages and features): the floating
 * AI assistant, the phone-verify bar (it opens My Profile), the reward popup
 * and the "My Rewards" item.
 */
export function JobseekerDashboardShell({
  active,
  heading,
  headerAction,
  subheading,
  resume = null,
  children,
}: {
  active: JobseekerNavKey;
  heading: React.ReactNode;
  headerAction?: React.ReactNode;
  subheading: React.ReactNode;
  resume?: { fileName: string; fileSize: number | null } | null;
  children: React.ReactNode;
}) {
  return (
    <UnsavedChangesGuardBoundary>
      <main className="flex min-h-[100svh] flex-col overflow-x-clip bg-brand-gold-page pb-[92px]">
        <div className="lg:sticky lg:top-0 lg:z-30 lg:bg-brand-gold-page">
          <Navbar pageRole="jobseeker" appShell />
        </div>

        <div className="app-shell pt-[20px]">
          <div className="flex flex-col gap-[24px] xl:flex-row xl:items-start">
            <Sidebar active={active} resume={resume} />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-[12px]">
                <h1 className="font-sans text-xl font-semibold text-[#141B2E]" style={{ lineHeight: 1.15, letterSpacing: "-0.02em" }}>
                  {heading}
                </h1>
                {headerAction}
              </div>
              <p className="mt-[6px] text-sm leading-[20px] text-[#4B5468]">{subheading}</p>

              <div className="mt-[24px]">{children}</div>
            </div>
          </div>
        </div>

        {/* Pushes the ribbon to the bottom of the screen. */}
        <div className="flex-1" />
        {/* Clipped to its top half and pulled down past the bottom padding, so
            it bleeds off the bottom edge. */}
        <div className="-mb-[92px] h-[80px] overflow-hidden sm:h-[110px] lg:h-[150px]">
          <AnimatedRibbon accent="gold" />
        </div>
      </main>
    </UnsavedChangesGuardBoundary>
  );
}
