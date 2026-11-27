import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";
import { EmployerDashboardOverview } from "./employer-dashboard-overview";
import { EmployerDashboardShell } from "./employer-dashboard-shell";

/**
 * The redesign's EmployerDashboard: the shell, "Post a job", and the
 * Overview — or a notice if the data can't be loaded (employer.dashboard).
 */
export function EmployerDashboard() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const me = useQuery({ ...orpc.auth.me.queryOptions(), meta: { suppressErrorToast: true } });
  const dashboardQuery = useQuery({ ...orpc.employer.dashboard.queryOptions(), meta: { suppressErrorToast: true } });
  const canManage = dashboardQuery.data?.canManage ?? true;
  const name = me.data?.name || session?.user.name;
  const firstName = name?.split(" ")[0] || t("dashboard.there");

  return (
    <EmployerDashboardShell
      active="overview"
      canManage={canManage}
      heading={t("dashboard.welcomeBack", { name: firstName })}
      headerAction={
        <div className="flex flex-wrap items-center gap-[8px]">
          {canManage && (
            <button
              type="button"
              onClick={() => navigate({ to: "/employer/jobs/postajob" })}
              className="flex h-[38px] items-center justify-center rounded-full bg-brand-teal-dark px-[22px] text-sm text-white transition-opacity hover:opacity-90"
            >
              {t("dashboard.employer.postJob")}
            </button>
          )}
        </div>
      }
      subheading={canManage ? t("dashboard.employer.subheading") : t("dashboard.employer.subheadingLimited")}
    >
      {dashboardQuery.isPending ? (
        <p className="rounded-[14px] bg-white/70 p-[16px] text-center text-xs text-[#9AA3B2]">{t("nav.loading")}</p>
      ) : dashboardQuery.isError || !dashboardQuery.data ? (
        <div className="rounded-[14px] border border-[#EAD9D6] bg-[#FBF3F1] p-[16px] text-center text-sm text-[#A66A61]">
          {t("dashboard.employer.loadError")}
        </div>
      ) : (
        <EmployerDashboardOverview
          data={dashboardQuery.data.data}
          initialSmartMatchEnabled={dashboardQuery.data.smartMatchEnabled}
          initialCriteria={dashboardQuery.data.criteria}
          canManage={canManage}
        />
      )}
    </EmployerDashboardShell>
  );
}
