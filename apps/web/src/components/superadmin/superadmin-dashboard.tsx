import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { orpc } from "@/utils/orpc";
import { SuperadminDashboardShell, SuperadminPageMessage } from "./superadmin-dashboard-shell";

// `href` only for pages v3 has — a tile for a page it doesn't have yet
// (jobseekers, AI usage) keeps the look without the link.
type Tile = {
  label: string;
  value: string | number;
  urgent?: boolean;
  href?: "/superadmin/job-postings" | "/superadmin/employers";
  hash?: string;
};

function TileGrid({ title, tiles }: { title: string; tiles: Tile[] }) {
  return (
    <div className="rounded-[20px] bg-gradient-to-br from-brand-teal via-white to-brand-teal p-px shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_40px_-24px_rgba(20,27,46,0.2)]">
      <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
        <p className="mb-[12px] text-sm text-[#141B2E]">{title}</p>
        <div className="grid grid-cols-2 gap-[12px] sm:grid-cols-3 lg:grid-cols-4">
          {tiles.map((tile) => {
            const body = (
              <>
                <span className="text-xl text-[#141B2E]">{tile.value}</span>
                <span className={`text-xs ${tile.urgent ? "text-[#A67C00]" : "text-[#4B5468]"}`}>{tile.label}</span>
              </>
            );
            const className = `flex flex-col gap-[4px] rounded-[14px] border p-[14px] ${
              tile.urgent ? "border-[#FBE7B3] bg-[#FFF3D6]" : "border-[#EAEDF2] bg-[#F8FAFB]"
            }`;
            return tile.href ? (
              <Link key={tile.label} to={tile.href} hash={tile.hash} className={`${className} transition-opacity hover:opacity-80`}>
                {body}
              </Link>
            ) : (
              <div key={tile.label} className={className}>
                {body}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * The redesign's /superadmin/dashboard: the review queue and accounts, and
 * how the platform is being used (admin.dashboard).
 *
 * Not in v3 yet, so their tiles aren't either: video pitches, cover letters
 * written and notifications sent this week.
 */
export function SuperadminDashboard() {
  const { t } = useTranslation("common");
  const dashboardQuery = useQuery({ ...orpc.admin.dashboard.queryOptions(), meta: { suppressErrorToast: true } });
  const data = dashboardQuery.data;

  const reviewTiles: Tile[] = data
    ? [
        { label: t("superadmin.dashboard.tiles.pending"), value: data.pending, urgent: data.pending > 0, href: "/superadmin/job-postings" },
        { label: t("superadmin.dashboard.tiles.active"), value: data.active, href: "/superadmin/job-postings" },
        { label: t("superadmin.dashboard.tiles.flagged"), value: data.flagged, urgent: data.flagged > 0, href: "/superadmin/job-postings" },
        { label: t("superadmin.dashboard.tiles.rejected"), value: data.rejected, href: "/superadmin/job-postings" },
        { label: t("superadmin.dashboard.tiles.employers"), value: data.employers, href: "/superadmin/employers" },
        // v1's account-deletion requests that need a platform admin (not in the redesign).
        {
          label: t("superadmin.dashboard.tiles.deletionRequests"),
          value: data.deletionRequests,
          urgent: data.deletionRequests > 0,
          href: "/superadmin/employers",
          hash: "deletion-requests",
        },
        // TODO(route): /superadmin/jobseekers — link this tile once the page exists.
        { label: t("superadmin.dashboard.tiles.jobseekers"), value: data.jobseekers },
      ]
    : [];

  const activityTiles: Tile[] = data
    ? [
        { label: t("superadmin.dashboard.tiles.applications"), value: data.applications },
        { label: t("superadmin.dashboard.tiles.applicationsThisWeek"), value: data.applicationsThisWeek },
        { label: t("superadmin.dashboard.tiles.interviews"), value: data.interviews },
        { label: t("superadmin.dashboard.tiles.hires"), value: data.hires },
        {
          label: t("superadmin.dashboard.tiles.waitingLong"),
          value: data.waitingLong,
          urgent: data.waitingLong > 0,
          href: "/superadmin/employers",
        },
        { label: t("superadmin.dashboard.tiles.savedJobs"), value: data.savedJobs },
        // TODO(route): /superadmin/ai-usage — link this tile once the page exists.
        { label: t("superadmin.dashboard.tiles.aiCost"), value: `$${data.aiCostUsd.toFixed(2)}` },
      ]
    : [];

  return (
    <SuperadminDashboardShell
      active="overview"
      heading={t("superadmin.dashboard.heading")}
      subheading={t("superadmin.dashboard.subheading")}
    >
      {dashboardQuery.isPending ? (
        <SuperadminPageMessage>{t("nav.loading")}</SuperadminPageMessage>
      ) : dashboardQuery.isError || !data ? (
        <SuperadminPageMessage error>{t("superadmin.loadError")}</SuperadminPageMessage>
      ) : (
        <div className="flex flex-col gap-[20px]">
          <TileGrid title={t("superadmin.dashboard.reviewTitle")} tiles={reviewTiles} />
          <TileGrid title={t("superadmin.dashboard.activityTitle")} tiles={activityTiles} />
        </div>
      )}
    </SuperadminDashboardShell>
  );
}
