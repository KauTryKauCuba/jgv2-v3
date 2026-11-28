import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useUnsavedChangesGuard } from "@/components/form/unsaved-changes-guard";
import { XIcon } from "@/components/landing/icons";
import { orpc } from "@/utils/orpc";

/**
 * The redesign's SampleDataBanner: a full-width teal bar under the employer
 * navbar pointing new employers at My Profile's "Sample data" card, so they
 * can try every feature with demo data. The server decides whether it shows
 * (sampleData.status → showBar): only to an Owner or Admin who hasn't closed
 * it (remembered on their account, so on every device) and whose current
 * company has no sample data yet. It re-checks whenever sample data is added
 * or removed (the card invalidates sampleData) or the company is switched
 * (the switcher clears every query).
 *
 * Mounted by the employer dashboard shell, right under the navbar.
 */
export function SampleDataBanner() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const guardNavigation = useUnsavedChangesGuard();
  const queryClient = useQueryClient();
  const statusQuery = useQuery({ ...orpc.sampleData.status.queryOptions(), meta: { suppressErrorToast: true } });
  const dismissMutation = useMutation({ ...orpc.sampleData.dismissBanner.mutationOptions(), meta: { suppressErrorToast: true } });

  if (!statusQuery.data?.showBar) return null;

  function dismiss() {
    queryClient.setQueryData(orpc.sampleData.status.queryKey(), (old) => (old ? { ...old, showBar: false } : old));
    // Best-effort — worst case it shows again on the next page load.
    dismissMutation.mutate(undefined);
  }

  return (
    <div className="bg-brand-teal-dark text-white">
      <div className="app-shell flex items-center gap-[12px] py-[10px]">
        <p className="min-w-0 flex-1 text-sm leading-[20px]">
          <span className="font-semibold">{t("dashboard.sampleDataBar.title")}</span>{" "}
          {/* The detail line is dropped on phones so the button keeps its room. */}
          <span className="hidden text-white/85 sm:inline">{t("dashboard.sampleDataBar.body")}</span>
        </p>
        <button
          type="button"
          onClick={() => guardNavigation(() => navigate({ to: "/employer/profile", hash: "sample-data" }))}
          className="flex h-[32px] shrink-0 items-center rounded-full bg-white px-[14px] text-sm text-brand-teal-dark transition-opacity hover:opacity-90"
        >
          {t("dashboard.sampleDataBar.cta")}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("dashboard.sampleDataBar.close")}
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
        >
          <XIcon className="h-[12px] w-[12px]" />
        </button>
      </div>
    </div>
  );
}
