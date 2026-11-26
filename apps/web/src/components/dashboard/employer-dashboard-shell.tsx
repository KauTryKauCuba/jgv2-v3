import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { UnsavedChangesGuardBoundary, useUnsavedChangesGuard } from "@/components/form/unsaved-changes-guard";
import { AnimatedRibbon } from "@/components/landing/animated-ribbon";
import {
  BriefcaseIcon,
  BuildingIcon,
  CalendarIcon,
  ChevronDownIcon,
  HomeIcon,
  MegaphoneIcon,
  UserIcon,
  UsersIcon,
} from "@/components/landing/icons";
import { Navbar } from "@/components/landing/navbar";
import { useCenterActiveTab } from "@/hooks/use-center-active-tab";
import { showComingSoon } from "@/lib/coming-soon";
import { NavLinkIcon } from "./nav-link-icon";

export type EmployerNavKey =
  | "overview"
  | "jobs"
  | "applicants"
  | "interviews"
  | "company"
  | "advertisement"
  | "team"
  | "profile";

// Remembered per browser, like the redesign.
const SIDEBAR_COLLAPSED_KEY = "jobgiga:employerSidebarCollapsed";
const NAV_PENDING_TIMEOUT_MS = 10_000;

// `ready: false` — the page isn't in v3 yet; the item is there (as in the
// redesign) and says "coming soon" when clicked. TODO(route) for each.
const NAV_ITEMS = [
  { key: "overview", href: "/employer/dashboard", icon: HomeIcon, ready: true },
  { key: "jobs", href: "/employer/jobs", icon: BriefcaseIcon, ready: false },
  { key: "applicants", href: "/employer/applicants", icon: UsersIcon, ready: false },
  { key: "interviews", href: "/employer/interviews", icon: CalendarIcon, ready: false },
  { key: "company", href: "/employer/company", icon: BuildingIcon, ready: false },
  { key: "advertisement", href: "/employer/advertisement", icon: MegaphoneIcon, ready: false },
  { key: "team", href: "/employer/team", icon: UsersIcon, ready: false },
  { key: "profile", href: "/employer/profile", icon: UserIcon, ready: false },
] as const;

// A panelist only sits on interviews (the redesign's Panel role); the pages
// themselves will enforce the same.
const PANEL_NAV: EmployerNavKey[] = ["interviews", "profile"];

const NAV_ITEM =
  "flex shrink-0 items-center gap-[10px] whitespace-nowrap rounded-full px-[16px] py-[10px] text-sm text-[#4B5468] transition-colors hover:bg-black/[0.03] xl:h-[40px] xl:rounded-[10px]";
const NAV_ITEM_SELECTED =
  "bg-white text-[#141B2E] shadow-[0_1px_2px_rgba(0,0,0,0.06)] xl:bg-brand-teal-soft xl:text-brand-teal-dark xl:shadow-none";

function Sidebar({
  active,
  canManage,
  collapsed,
  onToggleCollapsed,
}: {
  active: EmployerNavKey;
  canManage: boolean;
  // Icon-only, xl+ only — below that it's already the compact pill row.
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const guardNavigation = useUnsavedChangesGuard();
  const barRef = useCenterActiveTab<HTMLElement>();
  const routerLoading = useRouterState({ select: (s) => s.status === "pending" });
  const [clickedKey, setClickedKey] = useState<EmployerNavKey | null>(null);
  useEffect(() => {
    if (clickedKey === null) return;
    const timer = setTimeout(() => setClickedKey(null), NAV_PENDING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [clickedKey]);

  const items = canManage ? NAV_ITEMS : NAV_ITEMS.filter((item) => PANEL_NAV.includes(item.key));
  const itemClass = (selected: boolean) =>
    `${NAV_ITEM} ${selected ? `${NAV_ITEM_SELECTED} animate-fade-in-up` : ""} ${collapsed ? "xl:justify-center xl:px-0" : ""}`;

  return (
    <aside
      ref={barRef}
      className="scrollbar-hide flex shrink-0 flex-row gap-[4px] overflow-x-auto rounded-full bg-[#F1F4F8] p-[4px] xl:flex-col xl:gap-[2px] xl:rounded-[14px] xl:border xl:border-[#EAEDF2] xl:bg-white xl:p-[10px]"
    >
      {items.map((item) => {
        const label = t(`dashboard.employerNav.${item.key}`);
        return (
          <a
            key={item.key}
            href={item.href}
            aria-current={item.key === active ? "page" : undefined}
            title={collapsed ? label : undefined}
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
            className={itemClass(item.key === active)}
          >
            <NavLinkIcon icon={item.icon} pending={routerLoading && clickedKey === item.key} />
            <span className={collapsed ? "xl:hidden" : ""}>{label}</span>
          </a>
        );
      })}
      {/* Collapse / expand — xl only, where the vertical layout has width to reclaim. */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? t("dashboard.expandSidebar") : t("dashboard.collapseSidebar")}
        title={collapsed ? t("dashboard.expandSidebar") : t("dashboard.collapseSidebar")}
        className="hidden shrink-0 items-center justify-center rounded-[10px] py-[10px] text-[#9AA3B2] transition-colors hover:bg-black/[0.03] hover:text-[#4B5468] xl:flex"
      >
        <ChevronDownIcon className={`h-[11px] w-[11px] transition-transform ${collapsed ? "-rotate-90" : "rotate-90"}`} />
      </button>
    </aside>
  );
}

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The redesign's EmployerDashboardShell: navbar, the collapsible sidebar,
 * the page's heading and content, and the ribbon — teal, the employer's
 * colour. v3 is a single-page app, so the collapsed state is read before
 * the first paint without the redesign's before-paint script.
 *
 * Not in v3 yet (they come with their own pages and features): the AI
 * assistant bar and its Dashboard / Chat switch, the company switcher (it
 * only shows for someone in more than one company), the "Get sample data"
 * and phone-verify bars, the reward popup and "My Rewards".
 */
export function EmployerDashboardShell({
  active,
  canManage = true,
  heading,
  headerAction,
  subheading,
  children,
}: {
  active: EmployerNavKey;
  canManage?: boolean;
  heading: React.ReactNode;
  headerAction?: React.ReactNode;
  subheading: React.ReactNode;
  children: React.ReactNode;
}) {
  // The rail sticks 85px below the top — unless it's taller than the
  // screen, then it scrolls with the page until its bottom is in view.
  const railRef = useRef<HTMLDivElement>(null);
  const [railTop, setRailTop] = useState(85);
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const update = () => setRailTop(Math.min(85, window.innerHeight - rail.offsetHeight - 16));
    const observer = new ResizeObserver(update);
    observer.observe(rail);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(readCollapsed);
  function toggleSidebarCollapsed() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // Won't persist past a reload, but still applies now.
      }
      return next;
    });
  }

  return (
    <UnsavedChangesGuardBoundary>
      <main className="flex min-h-[100svh] flex-col overflow-x-clip bg-brand-teal-page pb-[92px]">
        <div className="lg:sticky lg:top-0 lg:z-30 lg:bg-brand-teal-page">
          <Navbar pageRole="employer" appShell />
        </div>

        <div className="flex flex-1 flex-col">
          <div className="app-shell pt-[20px]">
            <div className="flex flex-col gap-[24px] xl:flex-row xl:items-start">
              {/* `contents` below xl flattens this column so it stacks with the
                  page; xl makes it the sticky rail. */}
              <div
                ref={railRef}
                className={`contents xl:sticky xl:z-20 xl:flex xl:shrink-0 xl:flex-col xl:gap-[10px] ${
                  sidebarCollapsed ? "xl:w-[64px]" : "xl:w-[220px]"
                }`}
                style={{ top: railTop }}
              >
                <Sidebar
                  active={active}
                  canManage={canManage}
                  collapsed={sidebarCollapsed}
                  onToggleCollapsed={toggleSidebarCollapsed}
                />
              </div>

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

          <div className="flex-1" />
          <div className="-mb-[92px] h-[80px] overflow-hidden sm:h-[110px] lg:h-[150px]">
            <AnimatedRibbon />
          </div>
        </div>
      </main>
    </UnsavedChangesGuardBoundary>
  );
}
