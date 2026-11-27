import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLinkIcon } from "@/components/dashboard/nav-link-icon";
import { AnimatedRibbon } from "@/components/landing/animated-ribbon";
import {
  BriefcaseIcon,
  ConnectionsIcon,
  GiftIcon,
  HomeIcon,
  ImageIcon,
  MegaphoneIcon,
  PaletteIcon,
  StarIcon,
  TrendUpIcon,
  UserCheckIcon,
  UserIcon,
  UsersIcon,
} from "@/components/landing/icons";
import { Navbar } from "@/components/landing/navbar";
import { useCenterActiveTab } from "@/hooks/use-center-active-tab";
import { showComingSoon } from "@/lib/coming-soon";

export type SuperadminNavKey =
  | "overview"
  | "job-postings"
  | "jobseekers"
  | "employers"
  | "matching"
  | "company-ads"
  | "job-ads"
  | "welcome-popup"
  | "themes"
  | "campaigns"
  | "ai-usage"
  | "admins";

const NAV_PENDING_TIMEOUT_MS = 10_000;

// `ready: false` — the page isn't in v3 yet; the item is there (as in the
// redesign) and says "coming soon" when clicked.
const NAV_ITEMS = [
  { key: "overview", href: "/superadmin/dashboard", icon: HomeIcon, ready: true },
  { key: "job-postings", href: "/superadmin/job-postings", icon: BriefcaseIcon, ready: true },
  // TODO(route): /superadmin/jobseekers
  { key: "jobseekers", href: "/superadmin/jobseekers", icon: UserIcon, ready: false },
  { key: "employers", href: "/superadmin/employers", icon: UsersIcon, ready: true },
  // TODO(route): /superadmin/matching
  { key: "matching", href: "/superadmin/matching", icon: ConnectionsIcon, ready: false },
  // TODO(route): /superadmin/company-ads
  { key: "company-ads", href: "/superadmin/company-ads", icon: MegaphoneIcon, ready: false },
  // TODO(route): /superadmin/job-ads
  { key: "job-ads", href: "/superadmin/job-ads", icon: ImageIcon, ready: false },
  // TODO(route): /superadmin/welcome-popup
  { key: "welcome-popup", href: "/superadmin/welcome-popup", icon: StarIcon, ready: false },
  // TODO(route): /superadmin/themes
  { key: "themes", href: "/superadmin/themes", icon: PaletteIcon, ready: false },
  // TODO(route): /superadmin/campaigns
  { key: "campaigns", href: "/superadmin/campaigns", icon: GiftIcon, ready: false },
  // TODO(route): /superadmin/ai-usage
  { key: "ai-usage", href: "/superadmin/ai-usage", icon: TrendUpIcon, ready: false },
  // TODO(route): /superadmin/admins
  { key: "admins", href: "/superadmin/admins", icon: UserCheckIcon, ready: false },
] as const satisfies readonly { key: SuperadminNavKey; href: string; icon: unknown; ready: boolean }[];

/**
 * The redesign's SuperadminDashboardShell: the same sidebar/shell/ribbon
 * layout as the employer dashboard, but in the superadmin blue (the
 * /superadmin route layout swaps the brand-teal-* colours) so it's never
 * mistaken for the employer side.
 *
 * Not in v3 yet: the number of campaign rewards waiting for approval beside
 * "Campaigns" (the redesign fetches /api/superadmin/campaigns/pending-count)
 * — campaigns don't exist in v3, so there's no badge.
 */
export function SuperadminDashboardShell({
  active,
  heading,
  headerAction,
  subheading,
  children,
}: {
  active: SuperadminNavKey;
  heading: React.ReactNode;
  headerAction?: React.ReactNode;
  subheading: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const barRef = useCenterActiveTab<HTMLElement>();
  const routerLoading = useRouterState({ select: (s) => s.status === "pending" });
  const [clickedKey, setClickedKey] = useState<SuperadminNavKey | null>(null);
  useEffect(() => {
    if (clickedKey === null) return;
    const timer = setTimeout(() => setClickedKey(null), NAV_PENDING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [clickedKey]);

  return (
    <main className="flex min-h-[100svh] flex-col overflow-x-clip bg-brand-teal-page pb-[92px]">
      <div className="lg:sticky lg:top-0 lg:z-30 lg:bg-brand-teal-page">
        <Navbar pageRole="employer" appShell />
      </div>

      <div className="app-shell pt-[20px]">
        <div className="flex flex-col gap-[24px] xl:flex-row xl:items-start">
          <aside
            ref={barRef}
            className="scrollbar-hide flex shrink-0 flex-row gap-[4px] overflow-x-auto rounded-full bg-[#F1F4F8] p-[4px] xl:sticky xl:top-[85px] xl:w-[220px] xl:flex-col xl:gap-[2px] xl:rounded-[14px] xl:border xl:border-[#EAEDF2] xl:bg-white xl:p-[10px]"
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
                  setClickedKey(item.key);
                  navigate({ to: item.href });
                }}
                className={`flex shrink-0 items-center gap-[10px] whitespace-nowrap rounded-full px-[16px] py-[10px] text-sm text-[#4B5468] transition-colors hover:bg-black/[0.03] aria-[current=page]:bg-white aria-[current=page]:text-[#141B2E] aria-[current=page]:shadow-[0_1px_2px_rgba(0,0,0,0.06)] xl:rounded-[10px] xl:aria-[current=page]:bg-brand-teal-soft xl:aria-[current=page]:text-brand-teal-dark xl:aria-[current=page]:shadow-none ${
                  item.key === active ? "animate-fade-in-up" : ""
                }`}
              >
                <NavLinkIcon icon={item.icon} pending={routerLoading && clickedKey === item.key} />
                {t(`superadmin.nav.${item.key}`)}
              </a>
            ))}
          </aside>

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
    </main>
  );
}

/** A loading or error notice in place of a superadmin page's content. */
export function SuperadminPageMessage({ error = false, children }: { error?: boolean; children: React.ReactNode }) {
  return error ? (
    <div className="rounded-[14px] border border-[#EAD9D6] bg-[#FBF3F1] p-[16px] text-center text-sm text-[#A66A61]">{children}</div>
  ) : (
    <p className="rounded-[14px] bg-white/70 p-[16px] text-center text-xs text-[#9AA3B2]">{children}</p>
  );
}
