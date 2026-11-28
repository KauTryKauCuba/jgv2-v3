import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "@/components/landing/dropdown";
import { BuildingIcon, ClockIcon, SearchIcon } from "@/components/landing/icons";
import { Modal } from "@/components/landing/modal";
import { VerifiedBadge, VerifiedBadgeIcon } from "@/components/landing/verified-badge";
import {
  type EmployerResponsiveness,
  RESPONSIVENESS_TONE_CLASS,
  responsivenessBadge,
} from "@/lib/companies/responsiveness";
import { orpc } from "@/utils/orpc";
import { SuperadminDashboardShell, SuperadminPageMessage } from "./superadmin-dashboard-shell";
import { SuperadminDeletionRequests } from "./superadmin-deletion-requests";

type EmployerRow = Awaited<ReturnType<typeof orpc.admin.listEmployers.call>>[number];

/** The redesign's DEFAULT_COMPANY_LIMIT (packages/api lib/employer/memberships.ts). */
const DEFAULT_COMPANY_LIMIT = 5;

type SsmStatus = "unverified" | "pending" | "verified" | "rejected";
const SSM_STATUSES: SsmStatus[] = ["unverified", "pending", "verified", "rejected"];

function ssmStatusOf(employer: EmployerRow): SsmStatus {
  const status = employer.ssmVerificationStatus as SsmStatus;
  return SSM_STATUSES.includes(status) ? status : "unverified";
}

type SortKey = "newest" | "waiting" | "slowest" | "applications" | "ssmPending";
const SORT_KEYS: SortKey[] = ["newest", "waiting", "slowest", "applications", "ssmPending"];

const SSM_STATUS_CLASS: Record<SsmStatus, string> = {
  unverified: "bg-[#F1F4F8] text-[#9AA3B2]",
  pending: "bg-[#FFF3D6] text-[#A67C00]",
  verified: "bg-brand-teal-soft text-brand-teal-dark",
  rejected: "bg-[#FDE8E8] text-[#C0362C]",
};

// v1's timestamps are SQLite text ("2026-11-27 08:00:00", UTC) — read as
// UTC, the way an ISO string would be.
function parseTimestamp(value: string) {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(" ", "T")}Z`);
}

function Logo({ url, verified }: { url: string | null; verified: boolean }) {
  return (
    <div className="relative shrink-0">
      {url ? (
        <img src={url} alt="" className="h-[38px] w-[38px] rounded-[10px] border border-[#EAEDF2] bg-white object-contain p-[3px]" />
      ) : (
        <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-brand-teal-soft text-brand-teal-dark">
          <BuildingIcon className="h-[16px] w-[16px]" />
        </div>
      )}
      {verified && <VerifiedBadge size={14} />}
    </div>
  );
}

// The redesign's ResponsivenessBadge with `showRate` ("· responds to 85% of
// applicants"). v3's shared ResponsivenessBadge doesn't take `showRate`, so
// this list builds the same pill from the same pieces.
function ResponsivenessBadgeWithRate({ responsiveness }: { responsiveness: EmployerResponsiveness }) {
  const { t } = useTranslation("common");
  const badge = responsivenessBadge(responsiveness);
  if (!badge) return null;
  return (
    <span
      className={`inline-flex w-fit items-center gap-[5px] rounded-full px-[9px] py-[3px] text-xs ${RESPONSIVENESS_TONE_CLASS[badge.tone]}`}
      title={t("companies.responsiveness.basedOn", { count: responsiveness.sampleSize })}
    >
      <ClockIcon className="h-[11px] w-[11px] shrink-0" />
      {t(`companies.responsiveness.${badge.labelKey}`)}
      <span className="opacity-75">
        {t("superadmin.employers.respondsTo", { percent: Math.round(responsiveness.responseRate * 100) })}
      </span>
    </span>
  );
}

/**
 * The redesign's SuperadminEmployersView: every company on the platform,
 * how quickly each replies to applicants, and their SSM documents to verify
 * or reject (admin.listEmployers / admin.updateEmployerSsm).
 * Also the owner's company limit ("Owner has 2 of 5 companies" and its
 * "Edit limit" dialog → admin.setCompanyLimit).
 */
export function SuperadminEmployersView() {
  const { t, i18n } = useTranslation("common");
  const queryClient = useQueryClient();
  const listQuery = useQuery({ ...orpc.admin.listEmployers.queryOptions(), meta: { suppressErrorToast: true } });
  const ssmMutation = useMutation(orpc.admin.updateEmployerSsm.mutationOptions());

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [reviewing, setReviewing] = useState<EmployerRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const limitMutation = useMutation(orpc.admin.setCompanyLimit.mutationOptions({ meta: { suppressErrorToast: true } }));
  const [editingLimit, setEditingLimit] = useState<EmployerRow | null>(null);
  const [limitInput, setLimitInput] = useState("");
  const [limitError, setLimitError] = useState<string | null>(null);
  const limitSaving = limitMutation.isPending;

  async function saveCompanyLimit(userId: string, limit: number | null) {
    setLimitError(null);
    try {
      const data = await limitMutation.mutateAsync({ userId, limit });
      // Every company this person registered shows the same count.
      queryClient.setQueryData<EmployerRow[]>(orpc.admin.listEmployers.queryKey(), (prev) =>
        prev?.map((e) => (e.userId === userId ? { ...e, ownerCompanyLimit: data.companyLimit } : e)),
      );
      setEditingLimit(null);
    } catch (err) {
      setLimitError(err instanceof Error ? err.message : t("superadmin.employers.limitError"));
    }
  }

  const rows = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const searchTerm = search.trim().toLowerCase();
  const dateLocale = i18n.resolvedLanguage === "ms" ? "ms-MY" : "en-GB";

  async function runSsmAction(id: string, action: "verify" | "reject", reason?: string) {
    setActionLoading(true);
    setActionError(null);
    try {
      await ssmMutation.mutateAsync({ id, action, reason });
      // Shows the new status straight away, then refetches everything admin.*.
      queryClient.setQueryData<EmployerRow[]>(orpc.admin.listEmployers.queryKey(), (prev) =>
        prev?.map((e) =>
          e.id === id
            ? {
                ...e,
                ssmVerificationStatus: action === "verify" ? "verified" : "rejected",
                ssmRejectionReason: action === "reject" ? (reason ?? null) : null,
              }
            : e,
        ),
      );
      void queryClient.invalidateQueries({ queryKey: orpc.admin.key() });
      setReviewing(null);
      setRejectReason("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("superadmin.employers.ssmActionError"));
    } finally {
      setActionLoading(false);
    }
  }

  const visible = useMemo(() => {
    const filtered = searchTerm
      ? rows.filter((e) =>
          [e.companyName, e.contactName, e.contactEmail, e.email, e.industry, e.location]
            .filter((v): v is string => !!v)
            .some((v) => v.toLowerCase().includes(searchTerm)),
        )
      : rows;
    const sorted = [...filtered];
    if (sort === "waiting") sorted.sort((a, b) => b.waitingLong - a.waitingLong);
    if (sort === "applications") sorted.sort((a, b) => b.applicationCount - a.applicationCount);
    // Employers without enough history to judge go last.
    if (sort === "slowest")
      sorted.sort((a, b) => (b.responsiveness?.medianHours ?? -1) - (a.responsiveness?.medianHours ?? -1));
    if (sort === "ssmPending")
      sorted.sort((a, b) => Number(ssmStatusOf(b) === "pending") - Number(ssmStatusOf(a) === "pending"));
    return sorted;
  }, [rows, searchTerm, sort]);

  const ghostingCount = rows.filter((e) => e.waitingLong > 0).length;
  const pendingSsmCount = rows.filter((e) => ssmStatusOf(e) === "pending").length;
  const sortOptions = SORT_KEYS.map((value) => ({ value, label: t(`superadmin.employers.sort.${value}`) }));

  return (
    <SuperadminDashboardShell
      active="employers"
      heading={t("superadmin.nav.employers")}
      subheading={t("superadmin.employers.subheading")}
    >
      <div className="flex flex-col gap-[20px]">
      <SuperadminDeletionRequests />
      {listQuery.isPending ? (
        <SuperadminPageMessage>{t("nav.loading")}</SuperadminPageMessage>
      ) : listQuery.isError || !listQuery.data ? (
        <SuperadminPageMessage error>{t("superadmin.loadError")}</SuperadminPageMessage>
      ) : (
        <div className="rounded-[20px] bg-gradient-to-br from-brand-teal via-white to-brand-teal p-px shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_40px_-24px_rgba(20,27,46,0.2)]">
          <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
            <div className="flex flex-wrap items-center gap-[8px]">
              <p className="text-sm text-[#141B2E]">{t("superadmin.employers.allEmployers")}</p>
              <span className="rounded-full bg-[#F1ECFB] px-[10px] py-[3px] text-xs text-[#7C5CD1]">{rows.length}</span>
              {ghostingCount > 0 && (
                <span className="rounded-full bg-[#FFF3D6] px-[10px] py-[3px] text-xs text-[#A67C00]">
                  {t("superadmin.employers.withApplicantsWaiting", { count: ghostingCount })}
                </span>
              )}
              {pendingSsmCount > 0 && (
                <button
                  type="button"
                  onClick={() => setSort("ssmPending")}
                  className="rounded-full bg-[#FFF3D6] px-[10px] py-[3px] text-xs text-[#A67C00] hover:opacity-90"
                >
                  {t("superadmin.employers.ssmAwaitingReview", { count: pendingSsmCount })}
                </button>
              )}
            </div>

            <div className="mt-[14px] flex flex-col gap-[8px] sm:flex-row">
              <div className="flex flex-1 items-center gap-[8px] rounded-[12px] border border-black/[0.1] px-[12px] focus-within:border-brand-teal-dark">
                <SearchIcon className="h-[13px] w-[13px] shrink-0 text-[#9AA3B2]" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("superadmin.employers.searchPlaceholder")}
                  aria-label={t("superadmin.employers.searchLabel")}
                  className="h-[38px] w-full bg-transparent text-sm text-[#141B2E] outline-none placeholder:text-[#9AA3B2]"
                />
              </div>
              <div className="sm:w-[230px]">
                <Dropdown label={t("superadmin.employers.sortBy")} value={sort} options={sortOptions} onChange={setSort} />
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="mt-[14px] rounded-[14px] bg-[#F8FAFB] p-[16px] text-xs text-[#9AA3B2]">
                {t("superadmin.employers.noEmployers")}
              </p>
            ) : visible.length === 0 ? (
              <p className="mt-[14px] text-sm text-[#9AA3B2]">{t("superadmin.employers.noMatches", { search: search.trim() })}</p>
            ) : (
              <div className="mt-[14px] flex flex-col gap-[10px]">
                {visible.map((employer) => {
                  const ssmStatus = ssmStatusOf(employer);
                  return (
                    <div
                      key={employer.id}
                      className="flex flex-col gap-[10px] rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB] p-[14px] sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-[10px]">
                        <Logo url={employer.logoUrl} verified={ssmStatus === "verified"} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-[#141B2E]">{employer.companyName}</p>
                          <p className="mt-[1px] truncate text-xs text-[#4B5468]">
                            {employer.industry || t("superadmin.employers.industryNotSet")} ·{" "}
                            {employer.location || t("dashboard.locationNotSet")}
                          </p>
                          <p className="mt-[1px] truncate text-xs text-[#9AA3B2]">
                            {employer.contactName} · {employer.contactEmail || employer.email}
                          </p>
                          <div className="mt-[6px] flex flex-wrap items-center gap-[6px]">
                            {employer.responsiveness ? (
                              <ResponsivenessBadgeWithRate responsiveness={employer.responsiveness} />
                            ) : (
                              employer.applicationCount > 0 && (
                                <span className="rounded-full bg-[#F1F4F8] px-[9px] py-[3px] text-xs text-[#9AA3B2]">
                                  {t("superadmin.employers.notEnoughHistory")}
                                </span>
                              )
                            )}
                            {employer.waitingLong > 0 && (
                              <span className="rounded-full bg-[#FFF3D6] px-[9px] py-[3px] text-xs text-[#A67C00]">
                                {t("superadmin.employers.applicantsWaiting", { count: employer.waitingLong })}
                              </span>
                            )}
                            <span
                              className={`inline-flex items-center gap-[4px] rounded-full px-[9px] py-[3px] text-xs ${SSM_STATUS_CLASS[ssmStatus]}`}
                            >
                              {ssmStatus === "verified" && <VerifiedBadgeIcon className="h-[10px] w-[10px]" />}
                              {t(`superadmin.employers.ssmStatus.${ssmStatus}`)}
                            </span>
                            {employer.ownerCompanyLimit && (
                              <span className="inline-flex items-center gap-[6px] rounded-full bg-[#F1F4F8] py-[3px] pl-[9px] pr-[4px] text-xs text-[#4B5468]">
                                {t("superadmin.employers.ownerHas", {
                                  used: employer.ownerCompanyLimit.used,
                                  limit: employer.ownerCompanyLimit.limit,
                                })}
                                {employer.ownerCompanyLimit.custom && (
                                  <span className="text-[#7C5CD1]">{t("superadmin.employers.customLimit")}</span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLimitError(null);
                                    setLimitInput(String(employer.ownerCompanyLimit?.limit ?? DEFAULT_COMPANY_LIMIT));
                                    setEditingLimit(employer);
                                  }}
                                  className="rounded-full bg-white px-[8px] py-[1px] text-brand-teal-dark hover:bg-brand-teal-soft"
                                >
                                  {t("superadmin.employers.editLimit")}
                                </button>
                              </span>
                            )}
                            {employer.ssmDocumentUrl && (ssmStatus === "pending" || ssmStatus === "rejected") && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActionError(null);
                                  setRejectReason("");
                                  setReviewing(employer);
                                }}
                                className="rounded-full bg-brand-teal-dark px-[9px] py-[3px] text-xs text-white hover:opacity-90"
                              >
                                {t("superadmin.employers.reviewDocument")}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-[6px] text-xs text-[#9AA3B2] sm:flex-col sm:items-end sm:gap-[4px]">
                        <span className="rounded-full bg-brand-teal-soft px-[10px] py-[3px] text-xs text-brand-teal-dark">
                          {t("superadmin.employers.postings", { count: employer.jobPostingCount })}
                        </span>
                        <span className="rounded-full bg-[#F1ECFB] px-[10px] py-[3px] text-xs text-[#7C5CD1]">
                          {t("superadmin.employers.applications", { count: employer.applicationCount })}
                        </span>
                        <span>
                          {t("superadmin.employers.joined", {
                            date: parseTimestamp(employer.createdAt).toLocaleDateString(dateLocale),
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {reviewing && (
        <Modal onClose={() => (actionLoading ? undefined : setReviewing(null))} ariaLabel={t("superadmin.employers.reviewSsmLabel")}>
          <p className="text-sm font-semibold text-[#141B2E]">
            {t("superadmin.employers.reviewTitle", { company: reviewing.companyName })}
          </p>
          <p className="mt-[4px] text-xs text-[#9AA3B2]">{t("superadmin.employers.ssmNumber", { number: reviewing.ssmNumber })}</p>
          {reviewing.ssmDocumentUrl && (
            <a
              href={reviewing.ssmDocumentUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-[14px] flex h-[40px] items-center justify-center rounded-full border border-black/[0.1] text-sm text-[#141B2E] hover:bg-black/[0.03]"
            >
              {t("superadmin.employers.openDocument")}
            </a>
          )}
          <label className="mt-[14px] block text-xs text-[#4B5468]" htmlFor="ssmRejectReason">
            {t("superadmin.employers.reasonLabel")}
          </label>
          <textarea
            id="ssmRejectReason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            placeholder={t("superadmin.employers.reasonPlaceholder")}
            className="mt-[6px] w-full resize-none rounded-[12px] border border-black/[0.1] p-[10px] text-sm text-[#141B2E] outline-none focus:border-brand-teal-dark"
          />
          {actionError && <p className="mt-[8px] text-xs text-red-500">{actionError}</p>}
          <div className="mt-[16px] flex items-center gap-[8px]">
            <button
              type="button"
              disabled={actionLoading}
              onClick={() => runSsmAction(reviewing.id, "verify")}
              className="flex h-[40px] flex-1 items-center justify-center rounded-full bg-brand-teal-dark text-sm text-white hover:opacity-90 disabled:opacity-60"
            >
              {t("superadmin.employers.verify")}
            </button>
            <button
              type="button"
              disabled={actionLoading || !rejectReason.trim()}
              onClick={() => runSsmAction(reviewing.id, "reject", rejectReason)}
              className="flex h-[40px] flex-1 items-center justify-center rounded-full border border-[#E5484D] text-sm text-[#E5484D] hover:bg-[#FDE8E8] disabled:opacity-60"
            >
              {t("superadmin.jobPostings.reject")}
            </button>
          </div>
          <button
            type="button"
            disabled={actionLoading}
            onClick={() => setReviewing(null)}
            className="mt-[8px] flex h-[36px] w-full items-center justify-center text-sm text-[#9AA3B2] hover:text-[#141B2E]"
          >
            {t("superadmin.cancel")}
          </button>
        </Modal>
      )}
      {editingLimit && (
        <Modal
          onClose={() => (limitSaving ? undefined : setEditingLimit(null))}
          ariaLabel={t("superadmin.employers.limitLabel")}
        >
          <p className="text-sm font-semibold text-[#141B2E]">{t("superadmin.employers.limitTitle")}</p>
          <p className="mt-[4px] text-xs leading-[17px] text-[#4B5468]">
            {t("superadmin.employers.limitBody", {
              name: editingLimit.contactName,
              email: editingLimit.email,
              used: editingLimit.ownerCompanyLimit?.used ?? 0,
              defaultLimit: DEFAULT_COMPANY_LIMIT,
            })}
          </p>
          <input
            type="number"
            min={1}
            max={100}
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
            aria-label={t("superadmin.employers.limitTitle")}
            className="mt-[12px] h-[38px] w-full rounded-[12px] border border-black/[0.1] px-[14px] text-sm text-[#141B2E] outline-none focus:border-brand-teal-dark"
          />
          {editingLimit.ownerCompanyLimit && Number(limitInput) < editingLimit.ownerCompanyLimit.used && (
            <p className="mt-[6px] text-xs text-[#A67C00]">{t("superadmin.employers.limitBelow")}</p>
          )}
          {limitError && <p className="mt-[6px] text-xs text-red-500">{limitError}</p>}
          <div className="mt-[14px] flex gap-[8px]">
            <button
              type="button"
              disabled={limitSaving}
              onClick={() => saveCompanyLimit(editingLimit.userId as string, null)}
              className="flex h-[40px] flex-1 items-center justify-center rounded-full border border-black/[0.1] text-sm text-[#141B2E] hover:bg-black/[0.03] disabled:opacity-60"
            >
              {t("superadmin.employers.limitReset", { defaultLimit: DEFAULT_COMPANY_LIMIT })}
            </button>
            <button
              type="button"
              disabled={limitSaving || !/^\d+$/.test(limitInput.trim())}
              onClick={() => saveCompanyLimit(editingLimit.userId as string, Number(limitInput))}
              className="flex h-[40px] flex-1 items-center justify-center rounded-full bg-brand-teal-dark text-sm text-white hover:opacity-90 disabled:opacity-50"
            >
              {t("superadmin.employers.limitSave")}
            </button>
          </div>
        </Modal>
      )}
    </SuperadminDashboardShell>
  );
}
