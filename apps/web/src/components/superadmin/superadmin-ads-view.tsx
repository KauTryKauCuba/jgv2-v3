// The redesign's src/components/SuperadminCompanyAdsView.tsx and
// SuperadminJobAdsView.tsx — two near-identical files, one component here
// (`kind`), with each one's differences kept: the slot board, the bookings
// by tab, approve, and reject / cancel / take down with a reason. On
// ads.adminList / ads.review; the slot count and run length come from the
// placement's rules.
//
// Not ported: the redesign's "Company page" link on each card — v3's
// /companies/<id> page still reads sample companies, so a real company's
// link would land on "not found". TODO(route): add it back once it reads
// real companies.
import { addDays, daysBetween, formatAdDate, formatAdRun, type AdPhase } from "@jobgiga-app/api/shared/ad-slots";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarIcon } from "@/components/landing/icons";
import { CompanyAdCard } from "@/components/landing/employer/company-ad-card";
import { JobAdCard } from "@/components/landing/jobseeker/job-ad-card";
import { Modal } from "@/components/landing/modal";
import { orpc } from "@/utils/orpc";
import { SuperadminDashboardShell, SuperadminPageMessage } from "./superadmin-dashboard-shell";

type AdminList = Awaited<ReturnType<typeof orpc.ads.adminList.call>>;
type AdRow = AdminList["ads"][number];
type Kind = "company" | "job";
type Tab = "pending" | "upcoming" | "live" | "past";

const TABS: Tab[] = ["pending", "upcoming", "live", "past"];

const PHASE_CLASS: Record<AdPhase, string> = {
  pending: "bg-[#FFF3D6] text-[#A67C00]",
  scheduled: "bg-[#F1ECFB] text-[#7C5CD1]",
  live: "bg-brand-teal-soft text-brand-teal-dark",
  ended: "bg-[#F1F4F8] text-[#9AA3B2]",
  rejected: "bg-[#FDE8E8] text-[#C0362C]",
};

const EMPLOYMENT_TYPES = new Set(["full_time", "part_time", "contract", "internship", "freelance", "temporary"]);

function inTab(ad: AdRow, tab: Tab) {
  if (tab === "pending") return ad.phase === "pending";
  if (tab === "upcoming") return ad.phase === "scheduled";
  if (tab === "live") return ad.phase === "live";
  return ad.phase === "ended" || ad.phase === "rejected";
}

const FRAME =
  "rounded-[20px] bg-gradient-to-br from-brand-teal via-white to-brand-teal p-px shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_40px_-24px_rgba(20,27,46,0.2)]";

export function SuperadminAdsView({ kind }: { kind: Kind }) {
  const { t } = useTranslation("common");
  const listQuery = useQuery({ ...orpc.ads.adminList.queryOptions({ input: { kind } }), meta: { suppressErrorToast: true } });
  const rules = listQuery.data?.rules;
  return (
    <SuperadminDashboardShell
      active={kind === "company" ? "company-ads" : "job-ads"}
      heading={t(`superadmin.nav.${kind === "company" ? "company-ads" : "job-ads"}`)}
      subheading={rules ? t(`superadmin.ads.${kind}.subheading`, { slots: rules.slots, count: rules.runDays }) : ""}
    >
      {listQuery.isPending ? (
        <SuperadminPageMessage>{t("nav.loading")}</SuperadminPageMessage>
      ) : listQuery.isError ? (
        <SuperadminPageMessage error>{t("superadmin.loadError")}</SuperadminPageMessage>
      ) : (
        // key: a fresh tab choice for the other kind of ads.
        <AdsContent key={kind} kind={kind} data={listQuery.data} />
      )}
    </SuperadminDashboardShell>
  );
}

function AdsContent({ kind, data }: { kind: Kind; data: AdminList }) {
  const { t, i18n } = useTranslation("common");
  const locale = i18n.resolvedLanguage === "ms" ? "ms" : "en";
  const queryClient = useQueryClient();
  const { ads, today, rules } = data;
  const [tab, setTab] = useState<Tab>(ads.some((a) => a.phase === "pending") ? "pending" : "live");
  const [rejecting, setRejecting] = useState<AdRow | null>(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reviewMutation = useMutation(orpc.ads.review.mutationOptions());
  const K = `superadmin.ads.${kind}`;

  async function review(id: string, action: "approve" | "reject", rejectReason?: string) {
    setBusyId(id);
    setError(null);
    try {
      await reviewMutation.mutateAsync({ kind, id, action, reason: rejectReason });
      setRejecting(null);
      setReason("");
      // The landing pages' live ads change too.
      await queryClient.invalidateQueries({ queryKey: orpc.ads.key() });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t(`${K}.errors.update`));
    } finally {
      setBusyId(null);
    }
  }

  const live = ads.filter((a) => a.phase === "live").sort((a, b) => a.endDate.localeCompare(b.endDate));
  // Pending ads hold their slot too — the board shows them as reserved.
  const holdingToday = ads.filter((a) => a.phase === "pending" && a.startDate <= today);
  const visible = ads.filter((a) => inTab(a, tab));
  const count = (x: Tab) => ads.filter((a) => inTab(a, x)).length;
  const nextOpening = live.length >= rules.slots ? live[0]?.endDate : null;
  const jobTitle = (ad: AdRow) => ad.jobTitle ?? ad.headline;
  const emptyKey = (x: Tab) => (x === "upcoming" || x === "live" ? `${K}.empty.${x}` : `superadmin.ads.empty.${x}`);

  const rejectWord = (phase: AdPhase) => (phase === "live" ? "takeDown" : phase === "scheduled" ? "cancel" : "reject");

  return (
    <div className="flex flex-col gap-[20px]">
      {/* Slot board */}
      <div className={FRAME}>
        <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
          <div className="flex flex-wrap items-end justify-between gap-[10px]">
            <div>
              <p className="text-xs text-[#9AA3B2]">{t("superadmin.ads.slotsToday")}</p>
              <p className="mt-[2px] text-xl font-semibold text-[#141B2E]">
                {t("superadmin.ads.liveCount", { live: live.length, total: rules.slots })}
              </p>
            </div>
            <p className="text-sm text-[#4B5468]">
              {nextOpening ? (
                <>
                  {t("superadmin.ads.nextOpening")}{" "}
                  <span className="font-medium text-brand-teal-dark">{formatAdDate(nextOpening, true, locale)}</span>
                </>
              ) : (
                t("superadmin.ads.slotsOpen", { count: rules.slots - live.length })
              )}
            </p>
          </div>
          <div className="mt-[14px] grid grid-cols-2 gap-[8px] sm:grid-cols-5">
            {Array.from({ length: rules.slots }, (_, i) => {
              const slotLabel = <p className="text-[10px] text-[#9AA3B2]">{t("superadmin.ads.slot", { n: i + 1 })}</p>;
              const ad = live[i];
              if (ad) {
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: slots are numbered positions.
                  <div key={i} className="rounded-[12px] border border-[#BFEDEF] bg-[#F2FBFB] p-[10px]">
                    {slotLabel}
                    <p className="mt-[2px] truncate text-sm text-[#141B2E]">{kind === "job" ? jobTitle(ad) : ad.companyName}</p>
                    {kind === "job" && <p className="truncate text-xs text-[#4B5468]">{ad.companyName}</p>}
                    <p className="mt-[2px] text-xs text-brand-teal-dark">
                      {t("superadmin.ads.ends", {
                        date: formatAdDate(addDays(ad.endDate, -1), false, locale),
                        days: daysBetween(today, ad.endDate),
                      })}
                    </p>
                  </div>
                );
              }
              const held = holdingToday[i - live.length];
              return held ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: slots are numbered positions.
                <div key={i} className="rounded-[12px] border border-[#FBE7B3] bg-[#FFFBEF] p-[10px]">
                  {slotLabel}
                  <p className="mt-[2px] truncate text-sm text-[#141B2E]">{kind === "job" ? jobTitle(held) : held.companyName}</p>
                  {kind === "job" && <p className="truncate text-xs text-[#4B5468]">{held.companyName}</p>}
                  <p className="mt-[2px] text-xs text-[#A67C00]">{t("superadmin.ads.held")}</p>
                </div>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: slots are numbered positions.
                <div key={i} className="rounded-[12px] border border-dashed border-black/[0.12] p-[10px]">
                  {slotLabel}
                  <p className="mt-[2px] text-sm text-[#9AA3B2]">{t("superadmin.ads.free")}</p>
                  <p className="mt-[2px] text-xs text-[#C0C6D0]">{t("superadmin.ads.sampleShows")}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bookings */}
      <div className={FRAME}>
        <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
          <div className="flex flex-wrap gap-[6px]">
            {TABS.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setTab(x)}
                className={`rounded-full px-[12px] py-[6px] text-xs ${
                  tab === x ? "bg-brand-teal-dark text-white" : "bg-[#F1F4F8] text-[#4B5468] hover:bg-[#E6EAF0]"
                }`}
              >
                {t(`superadmin.ads.tabs.${x}`)} ({count(x)})
              </button>
            ))}
          </div>

          {error && !rejecting && <p className="mt-[10px] text-xs text-red-500">{error}</p>}

          {visible.length === 0 ? (
            <p className="mt-[14px] rounded-[14px] bg-[#F8FAFB] p-[16px] text-xs text-[#9AA3B2]">{t(emptyKey(tab))}</p>
          ) : (
            <div
              className={`mt-[14px] grid gap-[16px] ${
                kind === "job" ? "sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-3"
              }`}
            >
              {visible.map((ad) => (
                <div
                  key={ad.id}
                  data-ad={ad.id}
                  className="flex flex-col gap-[10px] rounded-[16px] border border-[#EAEDF2] bg-[#F8FAFB] p-[12px]"
                >
                  {kind === "company" ? (
                    <CompanyAdCard ad={ad} />
                  ) : (
                    <JobAdCard
                      ad={{
                        mediaType: ad.mediaType,
                        mediaUrl: ad.mediaUrl,
                        jobTitle: jobTitle(ad),
                        companyName: ad.companyName,
                        companyLogoUrl: ad.companyLogoUrl,
                        companyVerified: ad.companyVerified,
                        location: ad.jobLocation || t("jobDetails.notSpecified"),
                        jobType: EMPLOYMENT_TYPES.has(ad.jobEmploymentType)
                          ? t(`landing.jobs.employmentType.${ad.jobEmploymentType}`)
                          : ad.jobEmploymentType,
                      }}
                    />
                  )}
                  <div className="flex flex-wrap items-center gap-[6px] text-xs">
                    <span className={`rounded-full px-[9px] py-[3px] ${PHASE_CLASS[ad.phase]}`}>{t(`superadmin.ads.phase.${ad.phase}`)}</span>
                    <span className="flex items-center gap-[4px] text-[#4B5468]">
                      <CalendarIcon className="h-[11px] w-[11px] text-[#9AA3B2]" />
                      {formatAdRun(ad.startDate, ad.endDate, locale)}
                    </span>
                  </div>
                  {ad.phase === "pending" && (
                    <p className="text-xs leading-[17px] text-[#A67C00]">
                      {ad.startDate <= today
                        ? t("superadmin.ads.startsToday")
                        : t("superadmin.ads.startsIn", { count: daysBetween(today, ad.startDate) })}
                    </p>
                  )}
                  {ad.phase === "rejected" && ad.rejectionReason && (
                    <p className="text-xs leading-[17px] text-[#4B5468]">{t("superadmin.ads.reason", { reason: ad.rejectionReason })}</p>
                  )}
                  {kind === "job" && !ad.jobOpen && ad.phase !== "ended" && ad.phase !== "rejected" && (
                    <p className="text-xs leading-[17px] text-[#A67C00]">{t("superadmin.ads.job.jobClosed")}</p>
                  )}
                  {(ad.phase === "pending" || ad.phase === "scheduled" || ad.phase === "live") && (
                    <div className="flex gap-[8px]">
                      {ad.phase === "pending" && (
                        <button
                          type="button"
                          disabled={busyId === ad.id}
                          onClick={() => review(ad.id, "approve")}
                          className="flex h-[36px] flex-1 items-center justify-center rounded-full bg-brand-teal-dark text-sm text-white hover:opacity-90 disabled:opacity-60"
                        >
                          {t("superadmin.ads.approve")}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === ad.id}
                        onClick={() => {
                          setError(null);
                          setReason("");
                          setRejecting(ad);
                        }}
                        className="flex h-[36px] flex-1 items-center justify-center rounded-full border border-[#E5484D] text-sm text-[#E5484D] hover:bg-[#FDE8E8] disabled:opacity-60"
                      >
                        {t(`superadmin.ads.actions.${rejectWord(ad.phase)}`)}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {rejecting && (
        <Modal onClose={() => (busyId ? undefined : setRejecting(null))} ariaLabel={t(`${K}.dialogLabel`)}>
          <p className="text-sm font-semibold text-[#141B2E]">
            {t(`${K}.confirm.${rejectWord(rejecting.phase)}`, { company: rejecting.companyName, job: jobTitle(rejecting) })}
          </p>
          <p className="mt-[4px] text-xs text-[#9AA3B2]">{t(`${K}.confirmHint`, { company: rejecting.companyName })}</p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder={t(`${K}.reasonPlaceholder`)}
            className="mt-[12px] w-full resize-none rounded-[12px] border border-black/[0.1] p-[10px] text-sm text-[#141B2E] outline-none focus:border-brand-teal-dark"
          />
          {error && <p className="mt-[6px] text-xs text-red-500">{error}</p>}
          <div className="mt-[14px] flex gap-[8px]">
            <button
              type="button"
              onClick={() => setRejecting(null)}
              className="flex h-[40px] flex-1 items-center justify-center rounded-full border border-black/[0.1] text-sm text-[#141B2E] hover:bg-black/[0.03]"
            >
              {t("superadmin.ads.keep")}
            </button>
            <button
              type="button"
              disabled={!reason.trim() || busyId === rejecting.id}
              onClick={() => review(rejecting.id, "reject", reason.trim())}
              className="flex h-[40px] flex-1 items-center justify-center rounded-full bg-[#E5484D] text-sm text-white hover:opacity-90 disabled:opacity-50"
            >
              {t(`superadmin.ads.actions.${rejectWord(rejecting.phase)}`)}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
