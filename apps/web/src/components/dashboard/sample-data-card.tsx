import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { orpc } from "@/utils/orpc";

type Part = "postings" | "team" | "applicants" | "companies";

// Applicants hang off the postings, so they're cleared first. Postings go
// in first (the team's Hiring managers are assigned to them), then the team,
// then applicants — whose interview panels include those teammates.
const REMOVE_ORDER: Part[] = ["applicants", "postings", "team", "companies"];
const ADD_ORDER: Part[] = ["postings", "team", "applicants", "companies"];

/**
 * The redesign's DummyDataCard: My Profile's one switch for demo data —
 * sample job postings, applicants (with interviews and scorecards),
 * teammates and the two real-branded demo companies, all added or removed
 * together (sampleData.add / sampleData.remove, one part at a time, in the
 * redesign's order). Owners and Admins only; hidden on a demo company.
 */
export function SampleDataCard() {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const statusQuery = useQuery({ ...orpc.sampleData.status.queryOptions(), meta: { suppressErrorToast: true } });
  const addMutation = useMutation({ ...orpc.sampleData.add.mutationOptions(), meta: { suppressErrorToast: true } });
  const removeMutation = useMutation({ ...orpc.sampleData.remove.mutationOptions(), meta: { suppressErrorToast: true } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const status = statusQuery.data;
  const hasSampleData = status?.hasSampleData ?? false;
  const visible = !!status?.canManage;

  // The "Get sample data" bar links here (#sample-data) — the card only
  // appears once its status has loaded, so scroll to it then.
  useEffect(() => {
    if (visible && window.location.hash === "#sample-data") {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [visible]);

  if (!visible) return null;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const removing = hasSampleData;
      for (const part of removing ? REMOVE_ORDER : ADD_ORDER) {
        if (removing) await removeMutation.mutateAsync({ part });
        else await addMutation.mutateAsync({ part });
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("dashboard.sampleData.error"));
    } finally {
      // Every page that shows postings, applicants, interviews or the team —
      // and the company switcher (the demo companies) — reads fresh data.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orpc.sampleData.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.employer.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.employer.companies.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.job.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.application.key() }),
        queryClient.invalidateQueries({ queryKey: orpc.team.key() }),
      ]);
      setBusy(false);
    }
  }

  return (
    // id = the target of the "Get sample data" bar under the navbar.
    <div
      id="sample-data"
      ref={cardRef}
      className={`animate-fade-in-up scroll-mt-[100px] ${gradientFrameClass("teal")}`}
      style={{ animationDelay: "160ms" }}
    >
      <div className="flex flex-col gap-[10px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
        <div className="flex items-center justify-between gap-[8px]">
          <p className="text-sm text-[#141B2E]">{t("dashboard.sampleData.title")}</p>
          {hasSampleData && (
            <span className="rounded-full bg-brand-gold-soft px-[8px] py-[2px] text-xs text-brand-gold-dark">
              {t("dashboard.sampleData.on")}
            </span>
          )}
        </div>
        <p className="text-xs text-[#4B5468]">
          {hasSampleData ? t("dashboard.sampleData.bodyOn") : t("dashboard.sampleData.bodyOff")}
        </p>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="button"
          disabled={busy}
          onClick={toggle}
          className="mt-[4px] flex h-[36px] items-center justify-center rounded-full border border-black/[0.1] text-sm text-[#141B2E] hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy
            ? hasSampleData
              ? t("dashboard.sampleData.removing")
              : t("dashboard.sampleData.adding")
            : hasSampleData
              ? t("dashboard.sampleData.remove")
              : t("dashboard.sampleData.add")}
        </button>
      </div>
    </div>
  );
}
