// The redesign's src/app/employer/advertisement/page.tsx and
// src/components/EmployerAdvertisementTabs.tsx: the shell, the two kinds
// of ads as tabs, and each tab's view once ads.page has loaded. Both tabs
// stay mounted while hidden, so switching never loses an unsaved upload.
// The tab is the `?tab=job` search param (the redesign's initialTab).
import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { EmployerDashboardShell } from "@/components/dashboard/employer-dashboard-shell";
import { employerHomePath } from "@/lib/route-guards";
import { orpc } from "@/utils/orpc";
import { EmployerAdvertisementView } from "./employer-advertisement-view";
import { EmployerJobAdsView } from "./employer-job-ads-view";

export type AdvertisementTab = "company" | "job";

const segment = (active: boolean) =>
  `flex-1 whitespace-nowrap rounded-full px-[14px] py-[7px] text-sm transition-colors ${
    active ? "bg-white text-[#141B2E] shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#4B5468] hover:text-[#141B2E]"
  }`;

export function EmployerAdvertisementPage({ tab }: { tab: AdvertisementTab }) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const pageQuery = useQuery({ ...orpc.ads.page.queryOptions(), retry: false, meta: { suppressErrorToast: true } });
  // Lost Owner/Admin access while here (the redesign's redirectScopedTeammate): off to your home.
  const forbidden = pageQuery.error instanceof ORPCError && pageQuery.error.code === "FORBIDDEN";
  useEffect(() => {
    if (forbidden) void employerHomePath().then((to) => navigate({ to }));
  }, [forbidden, navigate]);

  const setTab = (next: AdvertisementTab) =>
    navigate({ to: "/employer/advertisement", search: next === "job" ? { tab: "job" } : {}, replace: true });

  return (
    <EmployerDashboardShell active="advertisement" heading={t("advertisement.heading")} subheading={t("advertisement.subheading")}>
      {pageQuery.isPending ? (
        <p className="rounded-[14px] bg-white/70 p-[16px] text-center text-xs text-[#9AA3B2]">{t("nav.loading")}</p>
      ) : pageQuery.isError ? (
        forbidden ? null : (
          <div className="rounded-[14px] border border-[#EAD9D6] bg-[#FBF3F1] p-[16px] text-center text-sm text-[#A66A61]">
            {t("advertisement.loadError")}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-[20px]">
          <div className="flex w-full max-w-[420px] rounded-full bg-[#F1F4F8] p-[4px]" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "company"} onClick={() => setTab("company")} className={segment(tab === "company")}>
              {t("advertisement.tabs.company")}
            </button>
            <button type="button" role="tab" aria-selected={tab === "job"} onClick={() => setTab("job")} className={segment(tab === "job")}>
              {t("advertisement.tabs.job")}
            </button>
          </div>

          <div role="tabpanel" hidden={tab !== "company"}>
            {/* key: a fresh form after a company switch (the redesign's key={profile.id}). */}
            <EmployerAdvertisementView key={pageQuery.data.company.id} data={pageQuery.data} />
          </div>

          <div role="tabpanel" hidden={tab !== "job"}>
            <EmployerJobAdsView key={pageQuery.data.company.id} data={pageQuery.data} />
          </div>
        </div>
      )}
    </EmployerDashboardShell>
  );
}
