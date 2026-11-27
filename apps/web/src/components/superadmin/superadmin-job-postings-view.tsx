import type { PublicCustomQuestion } from "@jobgiga-app/api/shared/screening-questions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { JobPostingDetails, PostingCard, toJobPosting, type JobPosting } from "@/components/jobs/job-posting-details";
import { RichTextContent } from "@/components/jobs/rich-text-content";
import { XIcon } from "@/components/landing/icons";
import { formatSalary } from "@/lib/jobs/format";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { orpc } from "@/utils/orpc";
import { SuperadminDashboardShell, SuperadminPageMessage } from "./superadmin-dashboard-shell";

type ListData = Awaited<ReturnType<typeof orpc.admin.listJobPostings.call>>;
type PendingRow = ListData["pending"][number];

const REPORT_REASONS = ["spam", "scam", "discriminatory", "misleading", "inappropriate", "other"];

// The redesign's report rows. Jobseekers can't report postings in v3 yet, so
// admin.listJobPostings always sends an empty list — the Reports tab is kept
// working for when they can.
type ReportRow = {
  report: { id: string; reason: string; details: string | null; createdAt: string };
  postingId: string;
  postingTitle: string;
  postingStatus: string;
  companyName: string;
  reporterName: string;
};

const TABS = ["pending", "active", "flagged", "reports"] as const;
type TabKey = (typeof TABS)[number];

/**
 * The redesign's JobseekerViewModal: a posting exactly as jobseekers see it
 * — the browse card ("In the job list") beside the full details panel
 * ("When they open it"). Rendered into <body> so a transformed/animated
 * ancestor can't trap the fixed overlay. `footer` holds the caller's actions.
 */
function JobseekerViewModal({
  posting,
  subtitle,
  onClose,
  footer,
}: {
  posting: JobPosting;
  subtitle: string;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const { t } = useTranslation("common");
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("employerJobs.jobseekerView")}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-[1100px] flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-16px_rgba(0,0,0,0.24)]"
      >
        <div className="flex items-center justify-between border-b border-black/[0.06] px-[22px] py-[16px]">
          <div>
            <p className="text-sm text-[#141B2E]">{t("employerJobs.jobseekerView")}</p>
            <p className="mt-[2px] text-xs text-[#9AA3B2]">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full hover:bg-black/[0.04]"
            aria-label={t("superadmin.jobPostings.closeJobseekerView")}
          >
            <XIcon className="h-[14px] w-[14px]" />
          </button>
        </div>

        <div className="scrollbar-thin-teal flex-1 overflow-y-auto bg-brand-gold-page px-[16px] py-[20px] sm:px-[22px]">
          <div className="grid grid-cols-1 gap-[16px] lg:grid-cols-[300px_1fr] lg:items-start">
            {/* Stays put while the details panel scrolls (side-by-side layout only). */}
            <div className="lg:sticky lg:top-0">
              <p className="mb-[8px] text-xs text-[#9AA3B2]">{t("employerJobs.inTheJobList")}</p>
              <PostingCard posting={posting} selected />
            </div>
            <div>
              <p className="mb-[8px] text-xs text-[#9AA3B2]">{t("employerJobs.whenTheyOpenIt")}</p>
              <div className={gradientFrameClass("gold")}>
                <div className="rounded-[19px] bg-white p-[16px] sm:p-[24px]">
                  <JobPostingDetails posting={posting} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {footer && (
          <div className="flex flex-col gap-[8px] border-t border-black/[0.06] px-[22px] py-[16px] sm:flex-row">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * The redesign's SuperadminJobPostingsView: pending postings to approve or
 * reject, live ones to flag, flagged ones awaiting the employer's fix, and
 * jobseekers' reports (admin.listJobPostings / admin.updateJobPosting).
 */
export function SuperadminJobPostingsView() {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const listQuery = useQuery({ ...orpc.admin.listJobPostings.queryOptions(), meta: { suppressErrorToast: true } });
  const updateMutation = useMutation(orpc.admin.updateJobPosting.mutationOptions());

  const [tab, setTab] = useState<TabKey>("pending");
  const [viewingRow, setViewingRow] = useState<PendingRow | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [flaggingId, setFlaggingId] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState("");
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = listQuery.data?.pending ?? [];
  const activeRows = listQuery.data?.active ?? [];
  const flaggedRows = listQuery.data?.flagged ?? [];
  const reportRows = useMemo(() => (listQuery.data?.reports ?? []) as ReportRow[], [listQuery.data]);

  const visibleRows = tab === "pending" ? rows : tab === "active" ? activeRows : flaggedRows;

  // Grouped by posting so a posting reported by several jobseekers shows as
  // one card listing every reason, rather than one row per report.
  const groupedReports = useMemo(() => {
    const groups = new Map<
      string,
      {
        postingId: string;
        postingTitle: string;
        postingStatus: string;
        companyName: string;
        reports: ReportRow["report"][];
        reporterNames: string[];
      }
    >();
    for (const r of reportRows) {
      const existing = groups.get(r.postingId);
      if (existing) {
        existing.reports.push(r.report);
        existing.reporterNames.push(r.reporterName);
      } else {
        groups.set(r.postingId, {
          postingId: r.postingId,
          postingTitle: r.postingTitle,
          postingStatus: r.postingStatus,
          companyName: r.companyName,
          reports: [r.report],
          reporterNames: [r.reporterName],
        });
      }
    }
    return Array.from(groups.values());
  }, [reportRows]);

  // Drops the posting from the lists straight away (as the redesign does),
  // then refetches everything admin.* so the dashboard counts follow.
  function removeLocally(change: (data: ListData) => ListData) {
    queryClient.setQueryData<ListData>(orpc.admin.listJobPostings.queryKey(), (prev) => (prev ? change(prev) : prev));
    void queryClient.invalidateQueries({ queryKey: orpc.admin.key() });
  }

  async function approve(id: string) {
    setError(null);
    setBusyId(id);
    try {
      await updateMutation.mutateAsync({ id, action: "approve" });
      removeLocally((d) => ({ ...d, pending: d.pending.filter((r) => r.posting.id !== id) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("superadmin.jobPostings.approveError"));
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    if (!rejectReason.trim()) return;
    setError(null);
    setBusyId(id);
    try {
      await updateMutation.mutateAsync({ id, action: "reject", reason: rejectReason.trim() });
      removeLocally((d) => ({ ...d, pending: d.pending.filter((r) => r.posting.id !== id) }));
      setRejectingId(null);
      setRejectReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("superadmin.jobPostings.rejectError"));
    } finally {
      setBusyId(null);
    }
  }

  async function flag(id: string) {
    if (!flagReason.trim()) return;
    setError(null);
    setBusyId(id);
    try {
      await updateMutation.mutateAsync({ id, action: "flag", reason: flagReason.trim() });
      // Flagging moves the posting out of "active" — same loop-back-to-
      // pending workflow as rejecting, so it drops off this list until the
      // employer edits and resubmits it. Also clears any reports for it
      // since they're now resolved.
      removeLocally((d) => ({
        ...d,
        active: d.active.filter((r) => r.posting.id !== id),
        reports: (d.reports as ReportRow[]).filter((r) => r.postingId !== id),
      }));
      setFlaggingId(null);
      setFlagReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("superadmin.jobPostings.flagError"));
    } finally {
      setBusyId(null);
    }
  }

  async function dismissReports(postingId: string) {
    setError(null);
    setBusyId(postingId);
    try {
      await updateMutation.mutateAsync({ id: postingId, action: "dismiss_reports" });
      removeLocally((d) => ({ ...d, reports: (d.reports as ReportRow[]).filter((r) => r.postingId !== postingId) }));
      setDismissingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("superadmin.jobPostings.dismissError"));
    } finally {
      setBusyId(null);
    }
  }

  // What jobseekers would actually get — a hidden salary is stripped for
  // them server-side, so it's left out here too.
  function jobseekerPosting(row: PendingRow): JobPosting {
    const posting = row.posting.showSalary ? row.posting : { ...row.posting, salaryMin: null, salaryMax: null };
    return toJobPosting(t, {
      ...row,
      posting: { ...posting, customScreeningQuestions: posting.customScreeningQuestions as PublicCustomQuestion[] },
    });
  }

  return (
    <SuperadminDashboardShell
      active="job-postings"
      heading={t("superadmin.nav.job-postings")}
      subheading={t("superadmin.jobPostings.subheading")}
    >
      {listQuery.isPending ? (
        <SuperadminPageMessage>{t("nav.loading")}</SuperadminPageMessage>
      ) : listQuery.isError || !listQuery.data ? (
        <SuperadminPageMessage error>{t("superadmin.loadError")}</SuperadminPageMessage>
      ) : (
        <>
          <div
            role="tablist"
            aria-label={t("superadmin.jobPostings.tabsLabel")}
            className="scrollbar-hide inline-flex max-w-full gap-[4px] overflow-x-auto rounded-full bg-[#F1F4F8] p-[4px]"
          >
            {TABS.map((key) => {
              const count =
                key === "pending"
                  ? rows.length
                  : key === "active"
                    ? activeRows.length
                    : key === "flagged"
                      ? flaggedRows.length
                      : groupedReports.length;
              const selected = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(key)}
                  className={`flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-full px-[16px] py-[8px] text-sm transition-colors ${
                    selected ? "bg-white text-[#141B2E] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#4B5468] hover:text-[#141B2E]"
                  }`}
                >
                  {t(`superadmin.jobPostings.tabs.${key}`)}
                  <span className={selected ? "text-brand-teal-dark" : "text-[#9AA3B2]"}>{count}</span>
                </button>
              );
            })}
          </div>

          <div className={`mt-[16px] ${gradientFrameClass("teal")}`}>
            <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
              {error && <p className="text-xs text-red-500">{error}</p>}

              {tab === "reports" ? (
                groupedReports.length === 0 ? (
                  <p className="mt-[14px] rounded-[14px] bg-[#F8FAFB] p-[16px] text-xs text-[#9AA3B2]">
                    {t("superadmin.jobPostings.empty.reports")}
                  </p>
                ) : (
                  <div className="mt-[14px] flex flex-col gap-[12px]">
                    {groupedReports.map((group) => (
                      <div key={group.postingId} className="rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[16px]">
                        <div className="flex flex-wrap items-start justify-between gap-[8px]">
                          <div>
                            <p className="text-sm text-[#141B2E]">{group.postingTitle}</p>
                            <p className="mt-[2px] text-xs text-[#4B5468]">{group.companyName}</p>
                          </div>
                          <span className="rounded-full bg-[#F1F4F8] px-[10px] py-[3px] text-xs text-[#4B5468]">
                            {t("superadmin.jobPostings.reportCount", { count: group.reports.length })}
                          </span>
                        </div>

                        <div className="mt-[10px] flex flex-col gap-[8px]">
                          {group.reports.map((r, i) => (
                            <div key={r.id} className="rounded-[12px] border border-[#FBDBBE] bg-[#FFF7F0] p-[10px]">
                              <div className="flex items-center justify-between gap-[8px]">
                                <span className="text-xs text-[#C2600A]">
                                  {REPORT_REASONS.includes(r.reason) ? t(`superadmin.jobPostings.reportReasons.${r.reason}`) : r.reason}
                                </span>
                                <span className="text-xs text-[#9A5209]">{group.reporterNames[i]}</span>
                              </div>
                              {r.details && <p className="mt-[4px] text-xs text-[#9A5209]">{r.details}</p>}
                            </div>
                          ))}
                        </div>

                        {flaggingId === group.postingId ? (
                          <div className="mt-[12px] flex flex-col gap-[8px] border-t border-black/[0.06] pt-[12px]">
                            <input
                              type="text"
                              autoFocus
                              value={flagReason}
                              onChange={(e) => setFlagReason(e.target.value)}
                              placeholder={t("superadmin.jobPostings.flagReasonPlaceholder")}
                              className="h-[38px] w-full rounded-[12px] border border-black/[0.1] px-[14px] text-sm text-[#141B2E] outline-none placeholder:text-[#9AA3B2] focus:border-brand-teal-dark"
                            />
                            <div className="flex gap-[8px]">
                              <button
                                type="button"
                                disabled={!flagReason.trim() || busyId === group.postingId}
                                onClick={() => flag(group.postingId)}
                                className="flex h-[36px] items-center justify-center rounded-full bg-orange-500 px-[16px] text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {t("superadmin.jobPostings.confirmFlag")}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setFlaggingId(null);
                                  setFlagReason("");
                                }}
                                className="flex h-[36px] items-center justify-center rounded-full border border-black/[0.1] px-[16px] text-sm text-[#141B2E] hover:bg-black/[0.03]"
                              >
                                {t("superadmin.cancel")}
                              </button>
                            </div>
                          </div>
                        ) : dismissingId === group.postingId ? (
                          <div className="mt-[12px] flex flex-col gap-[8px] border-t border-black/[0.06] pt-[12px]">
                            <p className="text-xs text-[#4B5468]">{t("superadmin.jobPostings.dismissConfirmText")}</p>
                            <div className="flex gap-[8px]">
                              <button
                                type="button"
                                disabled={busyId === group.postingId}
                                onClick={() => dismissReports(group.postingId)}
                                className="flex h-[36px] items-center justify-center rounded-full border border-black/[0.1] px-[16px] text-sm text-[#141B2E] hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {t("superadmin.jobPostings.confirmDismiss")}
                              </button>
                              <button
                                type="button"
                                onClick={() => setDismissingId(null)}
                                className="flex h-[36px] items-center justify-center rounded-full border border-black/[0.1] px-[16px] text-sm text-[#141B2E] hover:bg-black/[0.03]"
                              >
                                {t("superadmin.cancel")}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-[12px] flex gap-[8px] border-t border-black/[0.06] pt-[12px]">
                            {group.postingStatus === "active" && (
                              <button
                                type="button"
                                disabled={busyId === group.postingId}
                                onClick={() => setFlaggingId(group.postingId)}
                                className="flex h-[36px] items-center justify-center rounded-full border border-black/[0.1] px-[16px] text-sm text-orange-600 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {t("superadmin.jobPostings.flagPosting")}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busyId === group.postingId}
                              onClick={() => setDismissingId(group.postingId)}
                              className="flex h-[36px] items-center justify-center rounded-full border border-black/[0.1] px-[16px] text-sm text-[#4B5468] hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {t("superadmin.jobPostings.dismissReports")}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : visibleRows.length === 0 ? (
                <p className="mt-[14px] rounded-[14px] bg-[#F8FAFB] p-[16px] text-xs text-[#9AA3B2]">
                  {t(`superadmin.jobPostings.empty.${tab}`)}
                </p>
              ) : (
                <div className="mt-[14px] flex flex-col gap-[12px]">
                  {visibleRows.map((row) => {
                    const { posting, companyName } = row;
                    return (
                      <div key={posting.id} className="rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[16px]">
                        <div className="flex flex-wrap items-start justify-between gap-[8px]">
                          <div>
                            <p className="text-sm text-[#141B2E]">{posting.title}</p>
                            <p className="mt-[2px] text-xs text-[#4B5468]">{companyName}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-[8px]">
                            <span className="rounded-full bg-[#F1F4F8] px-[10px] py-[3px] text-xs text-[#4B5468]">
                              {posting.industry ?? t("superadmin.jobPostings.noIndustry")}
                            </span>
                            <button
                              type="button"
                              onClick={() => setViewingRow(row)}
                              className="flex h-[28px] items-center rounded-full border border-brand-teal-dark/30 px-[12px] text-xs text-brand-teal-dark hover:bg-brand-teal-soft"
                            >
                              {t("superadmin.jobPostings.viewAsJobseeker")}
                            </button>
                          </div>
                        </div>

                        <div className="mt-[8px] flex flex-wrap items-center gap-x-[8px] gap-y-[2px] text-xs text-[#4B5468]">
                          <span>{posting.location || t("dashboard.locationNotSet")}</span>
                          <span className="text-[#C7CDD7]">·</span>
                          <span>
                            {formatSalary(t, posting.salaryMin, posting.salaryMax, posting.salaryPeriod) ??
                              t("dashboard.salaryNotDisclosed")}
                            {!posting.showSalary && t("superadmin.jobPostings.salaryHidden")}
                          </span>
                          <span className="text-[#C7CDD7]">·</span>
                          <span>{t("superadmin.jobPostings.openings", { count: posting.openings })}</span>
                        </div>

                        {posting.description && (
                          <RichTextContent html={posting.description} className="mt-[10px] text-xs text-[#4B5468]" />
                        )}

                        {posting.skills.length > 0 && (
                          <div className="mt-[10px] flex flex-wrap gap-[6px]">
                            {posting.skills.map((skill) => (
                              <span key={skill} className="rounded-full bg-brand-teal-soft px-[10px] py-[4px] text-xs text-brand-teal-dark">
                                {skill}
                              </span>
                            ))}
                          </div>
                        )}

                        {tab === "flagged" && posting.flagReason && (
                          <div className="mt-[10px] rounded-[12px] border border-[#FBDBBE] bg-[#FFF7F0] p-[12px]">
                            <p className="mb-[4px] text-xs text-[#C2600A]">{t("superadmin.jobPostings.flaggedAwaitingFix")}</p>
                            <p className="text-xs text-[#9A5209]">{posting.flagReason}</p>
                          </div>
                        )}

                        {tab === "pending" &&
                          (rejectingId === posting.id ? (
                            <div className="mt-[12px] flex flex-col gap-[8px] border-t border-black/[0.06] pt-[12px]">
                              <input
                                type="text"
                                autoFocus
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder={t("superadmin.jobPostings.rejectReasonPlaceholder")}
                                className="h-[38px] w-full rounded-[12px] border border-black/[0.1] px-[14px] text-sm text-[#141B2E] outline-none placeholder:text-[#9AA3B2] focus:border-brand-teal-dark"
                              />
                              <div className="flex gap-[8px]">
                                <button
                                  type="button"
                                  disabled={!rejectReason.trim() || busyId === posting.id}
                                  onClick={() => reject(posting.id)}
                                  className="flex h-[36px] items-center justify-center rounded-full bg-red-500 px-[16px] text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {t("superadmin.jobPostings.confirmRejection")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRejectingId(null);
                                    setRejectReason("");
                                  }}
                                  className="flex h-[36px] items-center justify-center rounded-full border border-black/[0.1] px-[16px] text-sm text-[#141B2E] hover:bg-black/[0.03]"
                                >
                                  {t("superadmin.cancel")}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-[12px] flex gap-[8px] border-t border-black/[0.06] pt-[12px]">
                              <button
                                type="button"
                                disabled={busyId === posting.id}
                                onClick={() => approve(posting.id)}
                                className="flex h-[36px] items-center justify-center rounded-full bg-brand-teal-dark px-[16px] text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {t("superadmin.jobPostings.approve")}
                              </button>
                              <button
                                type="button"
                                disabled={busyId === posting.id}
                                onClick={() => setRejectingId(posting.id)}
                                className="flex h-[36px] items-center justify-center rounded-full border border-black/[0.1] px-[16px] text-sm text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {t("superadmin.jobPostings.reject")}
                              </button>
                            </div>
                          ))}

                        {tab === "active" &&
                          (flaggingId === posting.id ? (
                            <div className="mt-[12px] flex flex-col gap-[8px] border-t border-black/[0.06] pt-[12px]">
                              <input
                                type="text"
                                autoFocus
                                value={flagReason}
                                onChange={(e) => setFlagReason(e.target.value)}
                                placeholder={t("superadmin.jobPostings.flagReasonPlaceholder")}
                                className="h-[38px] w-full rounded-[12px] border border-black/[0.1] px-[14px] text-sm text-[#141B2E] outline-none placeholder:text-[#9AA3B2] focus:border-brand-teal-dark"
                              />
                              <div className="flex gap-[8px]">
                                <button
                                  type="button"
                                  disabled={!flagReason.trim() || busyId === posting.id}
                                  onClick={() => flag(posting.id)}
                                  className="flex h-[36px] items-center justify-center rounded-full bg-orange-500 px-[16px] text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {t("superadmin.jobPostings.confirmFlag")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFlaggingId(null);
                                    setFlagReason("");
                                  }}
                                  className="flex h-[36px] items-center justify-center rounded-full border border-black/[0.1] px-[16px] text-sm text-[#141B2E] hover:bg-black/[0.03]"
                                >
                                  {t("superadmin.cancel")}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-[12px] flex gap-[8px] border-t border-black/[0.06] pt-[12px]">
                              <button
                                type="button"
                                disabled={busyId === posting.id}
                                onClick={() => setFlaggingId(posting.id)}
                                className="flex h-[36px] items-center justify-center rounded-full border border-black/[0.1] px-[16px] text-sm text-orange-600 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {t("superadmin.jobPostings.flagPosting")}
                              </button>
                            </div>
                          ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {viewingRow && (
        <JobseekerViewModal
          posting={jobseekerPosting(viewingRow)}
          subtitle={t("superadmin.jobPostings.jobseekerViewSubtitle", { company: viewingRow.companyName })}
          onClose={() => setViewingRow(null)}
          footer={
            tab === "pending" ? (
              <>
                <button
                  type="button"
                  disabled={busyId === viewingRow.posting.id}
                  onClick={async () => {
                    await approve(viewingRow.posting.id);
                    setViewingRow(null);
                  }}
                  className="flex h-[38px] items-center justify-center rounded-full bg-brand-teal-dark px-[22px] text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-1"
                >
                  {t("superadmin.jobPostings.approve")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Rejecting needs a reason — typed back on the list.
                    setRejectingId(viewingRow.posting.id);
                    setViewingRow(null);
                  }}
                  className="flex h-[38px] items-center justify-center rounded-full border border-black/[0.1] px-[22px] text-sm text-red-500 hover:bg-red-50"
                >
                  {t("superadmin.jobPostings.reject")}
                </button>
              </>
            ) : undefined
          }
        />
      )}
    </SuperadminDashboardShell>
  );
}
