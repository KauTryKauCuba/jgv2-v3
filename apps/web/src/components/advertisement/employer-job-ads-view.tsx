// The redesign's src/components/EmployerJobAdsView.tsx — the Advertisement
// page's "Job posting advertisement" tab: book a featured spot above the
// jobseeker page's job search for one live job posting, with the
// employer's own square artwork. Same booking flow as the company tab
// (employer-advertisement-view.tsx), with its own slots and rules.
// Images become a WebP ≤1200px in the browser before upload.
import { checkStartFromCounts, formatAdRun, nextFreeStartFromCounts } from "@jobgiga-app/api/shared/ad-slots";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "@/components/landing/dropdown";
import { BriefcaseIcon, CalendarIcon, ImageIcon } from "@/components/landing/icons";
import { JobAdCard, type JobAdCardData } from "@/components/landing/jobseeker/job-ad-card";
import { Modal } from "@/components/landing/modal";
import { bookAdWithProgress } from "@/lib/ads/upload";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { orpc, queryClient } from "@/utils/orpc";
import {
  type AdBooking,
  type AdsPageData,
  bookingNote,
  checkAdFile,
  ConfirmRemoveModal,
  errorMessage,
  HowItWorksCard,
  PHASE_CLASS,
  prepareAdMedia,
  removeCopy,
  SlotsCard,
  StartDateStep,
  StepNumber,
  sharedSteps,
  UploadProgress,
  useAdLocale,
} from "./ad-shared";

type FormMode = { kind: "new" } | { kind: "edit"; booking: AdBooking } | { kind: "again"; booking: AdBooking };

const EMPLOYMENT_TYPES = new Set(["full_time", "part_time", "contract", "internship", "freelance", "temporary"]);

export function EmployerJobAdsView({ data }: { data: AdsPageData }) {
  const { t } = useTranslation("common");
  const locale = useAdLocale();
  const { today, company } = data;
  const { rules, counts, ownBookings, active, past, jobs } = data.jobAds;
  const canBookNew = ownBookings.length < rules.maxActivePerCompany;
  const [mode, setMode] = useState<FormMode | null>(canBookNew && jobs.length > 0 ? { kind: "new" } : null);
  const [jobId, setJobId] = useState(jobs.length === 1 ? (jobs[0]?.id ?? "") : "");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [startChoice, setStartChoice] = useState<"asap" | "date">("asap");
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<AdBooking | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [cardPreview, setCardPreview] = useState<JobAdCardData | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const bookMutation = useMutation({
    ...orpc.ads.book.mutationOptions(),
    mutationFn: (input) => bookAdWithProgress(input, setProgress),
  });
  const cancelMutation = useMutation(orpc.ads.cancel.mutationOptions());

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const editingId = mode?.kind === "edit" ? mode.booking.id : undefined;
  const asapDate = nextFreeStartFromCounts(today, counts, ownBookings, rules, editingId);
  const startDate = startChoice === "asap" ? asapDate : pickedDate;
  const usedToday = counts[today] ?? 0;
  const nextFreeToday = nextFreeStartFromCounts(today, counts, [], rules);
  const selectedJob = jobs.find((j) => j.id === jobId) ?? null;

  const jobTypeLabel = (type: string) => (EMPLOYMENT_TYPES.has(type) ? t(`landing.jobs.employmentType.${type}`) : type);

  function openForm(next: FormMode) {
    setMode(next);
    setError(null);
    setSavedMessage(null);
    setFile(null);
    setPreviewUrl(null);
    if (next.kind === "new") {
      setJobId(jobs.length === 1 ? (jobs[0]?.id ?? "") : "");
      setStartChoice("asap");
      setPickedDate(null);
    } else {
      // The booking's job, if it's still live; otherwise pick again.
      const bookedJob = next.booking.jobPostingId;
      setJobId(bookedJob && jobs.some((j) => j.id === bookedJob) ? bookedJob : "");
      // Editing keeps its date when it's still bookable; otherwise ASAP.
      const keep =
        next.kind === "edit" &&
        checkStartFromCounts(next.booking.startDate, today, counts, ownBookings, rules, next.booking.id).ok;
      setStartChoice(keep ? "date" : "asap");
      setPickedDate(keep ? next.booking.startDate : null);
    }
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function pickFile(files: FileList | null) {
    const picked = files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!picked) return;
    setError(null);
    const checked = await checkAdFile(picked, t);
    if ("error" in checked) return setError(checked.error);
    setFile(picked);
    setPreviewUrl(checked.url);
  }

  const existingMedia = mode && mode.kind !== "new" ? mode.booking : null;
  const hasMedia = !!file || !!existingMedia;
  const canSubmit = progress === null && !!mode && !!selectedJob && hasMedia && !!startDate;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: orpc.ads.key() });
  }

  async function submit() {
    if (!canSubmit || !mode || !startDate || !selectedJob) return;
    setError(null);
    setProgress(0);
    let media: File | undefined;
    try {
      media = file ? await prepareAdMedia(file, "job") : undefined;
    } catch {
      setProgress(null);
      return setError(t("advertisement.errors.imageRead"));
    }
    try {
      const booked = await bookMutation.mutateAsync({
        kind: "job",
        jobId: selectedJob.id,
        startDate: startChoice === "asap" ? "asap" : startDate,
        media,
        bookingId: mode.kind === "edit" ? mode.booking.id : undefined,
        reuseFromId: mode.kind === "again" && !file ? mode.booking.id : undefined,
      });
      setSavedMessage(t("advertisement.job.saved", { run: formatAdRun(booked.startDate, booked.endDate, locale) }));
      setMode(null);
      setFile(null);
      setPreviewUrl(null);
    } catch (err) {
      setError(err instanceof TypeError ? t("advertisement.errors.uploadFailed") : errorMessage(err, t("advertisement.job.errors.book")));
    } finally {
      setProgress(null);
      // Slots (or the job's status) may have changed since the page loaded.
      await refresh();
    }
  }

  async function remove(booking: AdBooking) {
    setConfirmRemove(null);
    try {
      await cancelMutation.mutateAsync({ kind: "job", id: booking.id });
    } catch {
      return setError(t("advertisement.errors.remove"));
    }
    if (mode && mode.kind !== "new" && mode.booking.id === booking.id) setMode(null);
    await refresh();
  }

  const previewMedia =
    file && previewUrl
      ? { mediaType: file.type.startsWith("video/") ? ("video" as const) : ("image" as const), mediaUrl: previewUrl }
      : existingMedia
        ? { mediaType: existingMedia.mediaType, mediaUrl: existingMedia.mediaUrl }
        : null;
  const uploading = progress !== null;
  const bookings = [...active, ...past];

  const cardFor = (
    media: { mediaType: "image" | "video"; mediaUrl: string },
    job: { title: string; location: string; employmentType: string } | null,
  ): JobAdCardData => ({
    ...media,
    jobTitle: job?.title ?? t("advertisement.job.titleFallback"),
    companyName: company.name,
    companyLogoUrl: company.logoUrl,
    companyVerified: company.verified,
    location: job ? job.location || t("jobDetails.notSpecified") : t("advertisement.job.locationFallback"),
    jobType: job ? jobTypeLabel(job.employmentType) : t("advertisement.job.typeFallback"),
  });

  return (
    <div className="flex flex-col gap-[20px]">
      <HowItWorksCard
        title={t("advertisement.job.howItWorks.title")}
        steps={[
          { title: t("advertisement.job.howItWorks.s1Title"), detail: t("advertisement.job.howItWorks.s1Detail", { seconds: 30 }) },
          ...sharedSteps(t, "job", rules),
        ]}
      />

      <div className="flex flex-col gap-[20px] xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-col gap-[20px] xl:flex-[3]">
          <SlotsCard label={t("advertisement.job.slotsLabel")} rules={rules} usedToday={usedToday} nextFreeToday={nextFreeToday} />

          {savedMessage && (
            <p className="animate-fade-in-up rounded-[14px] border border-[#BFEDEF] bg-brand-teal-soft p-[14px] text-sm leading-[20px] text-[#0B5F63]">
              {savedMessage}
            </p>
          )}

          {/* Your bookings */}
          {bookings.length > 0 && (
            <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`} style={{ animationDelay: "60ms" }}>
              <div className="rounded-[19px] bg-white p-[16px] text-left sm:p-[22px]">
                <div className="flex flex-wrap items-center justify-between gap-[8px]">
                  <h2 className="text-xl font-semibold text-[#141B2E]">{t("advertisement.job.bookingsTitle")}</h2>
                  <span className="text-xs text-[#9AA3B2]">
                    {t("advertisement.activeCount", { used: ownBookings.length, max: rules.maxActivePerCompany })}
                  </span>
                </div>
                <div className="mt-[14px] flex flex-col gap-[10px]">
                  {bookings.map((b) => (
                    <div
                      key={b.id}
                      data-booking={b.id}
                      className="flex flex-col gap-[12px] rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[12px] sm:flex-row sm:items-center"
                    >
                      <div className="relative aspect-square w-[96px] shrink-0 overflow-hidden rounded-[10px] bg-[#E9EEF2]">
                        {b.mediaType === "video" ? (
                          <video src={b.mediaUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                        ) : (
                          <img src={b.mediaUrl} alt="" className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-[8px]">
                          <span className={`rounded-full px-[9px] py-[3px] text-xs ${PHASE_CLASS[b.phase]}`}>
                            {t(`advertisement.phase.${b.phase}`)}
                          </span>
                          <span className="flex items-center gap-[5px] text-xs text-[#4B5468]">
                            <CalendarIcon className="h-[11px] w-[11px] text-[#9AA3B2]" />
                            {formatAdRun(b.startDate, b.endDate, locale)}
                          </span>
                        </div>
                        <p className="mt-[6px] flex items-center gap-[6px] text-sm font-medium text-[#141B2E]">
                          <BriefcaseIcon className="h-[13px] w-[13px] shrink-0 text-[#9AA3B2]" />
                          <span className="truncate">{b.jobTitle ?? b.headline}</span>
                        </p>
                        <p className={`mt-[2px] text-xs leading-[17px] ${b.phase === "rejected" ? "text-[#C0362C]" : "text-[#4B5468]"}`}>
                          {bookingNote(t, "job", b, today, locale)}
                        </p>
                        {!b.jobOpen && (b.phase === "pending" || b.phase === "scheduled" || b.phase === "live") && (
                          <p className="mt-[4px] text-xs leading-[17px] text-brand-gold-dark">{t("advertisement.job.jobClosed")}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-[6px] sm:flex-col sm:items-stretch">
                        {(b.phase === "pending" || b.phase === "scheduled" || b.phase === "rejected") && (
                          <button
                            type="button"
                            onClick={() => openForm({ kind: "edit", booking: b })}
                            className="rounded-full bg-brand-teal-dark px-[14px] py-[6px] text-xs text-white hover:opacity-90"
                          >
                            {b.phase === "rejected" ? t("advertisement.actions.editResubmit") : t("advertisement.actions.edit")}
                          </button>
                        )}
                        {b.phase === "ended" && canBookNew && jobs.length > 0 && (
                          <button
                            type="button"
                            onClick={() => openForm({ kind: "again", booking: b })}
                            className="rounded-full bg-brand-teal-dark px-[14px] py-[6px] text-xs text-white hover:opacity-90"
                          >
                            {t("advertisement.actions.bookAgain")}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setCardPreview(
                              cardFor(b, {
                                title: b.jobTitle ?? b.headline,
                                location: b.jobLocation,
                                employmentType: b.jobEmploymentType,
                              }),
                            )
                          }
                          className="rounded-full border border-brand-teal-dark/40 bg-white px-[14px] py-[6px] text-xs text-brand-teal-dark hover:bg-brand-teal-soft"
                        >
                          {t("advertisement.actions.preview")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRemove(b)}
                          className="rounded-full border border-black/[0.1] bg-white px-[14px] py-[6px] text-xs text-[#4B5468] hover:text-[#141B2E]"
                        >
                          {removeCopy(t, "job", b, locale).action}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Book / edit */}
          <div
            ref={formRef}
            className={`animate-fade-in-up scroll-mt-[100px] ${gradientFrameClass("teal")}`}
            style={{ animationDelay: "120ms" }}
          >
            <div className="rounded-[19px] bg-white p-[16px] text-left sm:p-[22px]">
              {!mode ? (
                <div className="flex flex-col items-start gap-[10px]">
                  <h2 className="text-xl font-semibold text-[#141B2E]">{t("advertisement.job.bookTitle")}</h2>
                  {jobs.length === 0 ? (
                    <>
                      <p className="text-sm leading-[20px] text-[#4B5468]">{t("advertisement.job.noJobs")}</p>
                      <Link
                        to="/employer/jobs/postajob"
                        className="flex h-[40px] items-center justify-center rounded-full bg-brand-teal-dark px-[20px] text-sm text-white hover:opacity-90"
                      >
                        {t("advertisement.job.postJob")}
                      </Link>
                    </>
                  ) : canBookNew ? (
                    <>
                      <p className="text-sm leading-[20px] text-[#4B5468]">{t("advertisement.job.bookIntro")}</p>
                      <button
                        type="button"
                        onClick={() => openForm({ kind: "new" })}
                        className="flex h-[40px] items-center justify-center rounded-full bg-brand-teal-dark px-[20px] text-sm text-white hover:opacity-90"
                      >
                        {t("advertisement.job.bookNew")}
                      </button>
                    </>
                  ) : (
                    <p className="text-sm leading-[20px] text-[#4B5468]">
                      {t("advertisement.job.limit", { count: rules.maxActivePerCompany })}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-[8px]">
                    <h2 className="text-xl font-semibold text-[#141B2E]">
                      {mode.kind === "edit"
                        ? t("advertisement.form.editTitle")
                        : mode.kind === "again"
                          ? t("advertisement.form.againTitle")
                          : t("advertisement.job.bookTitle")}
                    </h2>
                    {(mode.kind !== "new" || bookings.length > 0) && !uploading && (
                      <button type="button" onClick={() => setMode(null)} className="text-sm text-[#9AA3B2] hover:text-[#141B2E]">
                        {t("advertisement.form.cancel")}
                      </button>
                    )}
                  </div>
                  <p className="mt-[6px] text-sm leading-[20px] text-[#4B5468]">
                    {mode.kind === "edit" ? t("advertisement.form.editHint") : t("advertisement.job.form.newHint")}
                  </p>

                  {/* 1. Job */}
                  <div className="mt-[18px] flex gap-[12px]">
                    <StepNumber n={1} />
                    <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
                      <p className="text-sm text-[#141B2E]">
                        {t("advertisement.job.jobLabel")} <span className="text-[#E5484D]">*</span>
                      </p>
                      {jobs.length === 0 ? (
                        <p className="rounded-[12px] bg-brand-gold-soft px-[12px] py-[10px] text-xs leading-[17px] text-brand-gold-dark">
                          {t("advertisement.job.noLiveJobs")}
                        </p>
                      ) : (
                        <Dropdown
                          id="adJob"
                          label={t("advertisement.job.jobLabel")}
                          value={jobId}
                          disabled={uploading}
                          options={[
                            { value: "", label: t("advertisement.job.chooseJob") },
                            ...jobs.map((j) => ({ value: j.id, label: j.title })),
                          ]}
                          onChange={setJobId}
                        />
                      )}
                      {mode.kind !== "new" && !jobs.some((j) => j.id === mode.booking.jobPostingId) && jobs.length > 0 && (
                        <p className="text-xs text-brand-gold-dark">
                          {t("advertisement.job.jobNotOpen", { title: mode.booking.jobTitle ?? mode.booking.headline })}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 2. Artwork */}
                  <div className="mt-[16px] flex gap-[12px]">
                    <StepNumber n={2} />
                    <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
                      <p className="text-sm text-[#141B2E]">
                        {t("advertisement.job.artworkLabel")} <span className="text-[#E5484D]">*</span>
                      </p>
                      <input
                        ref={inputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                        className="hidden"
                        onChange={(e) => pickFile(e.target.files)}
                      />
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => inputRef.current?.click()}
                        className="flex min-h-[84px] w-full flex-col items-center justify-center gap-[6px] rounded-[14px] border border-dashed border-black/[0.15] px-[16px] py-[12px] text-sm text-[#4B5468] hover:border-brand-teal-dark hover:text-brand-teal-dark disabled:opacity-60"
                      >
                        <ImageIcon className="h-[20px] w-[20px]" />
                        {file
                          ? t("advertisement.form.selected", { name: file.name })
                          : existingMedia
                            ? t("advertisement.job.artworkCurrent")
                            : t("advertisement.form.uploadMedia")}
                      </button>
                      <p className="text-xs text-[#9AA3B2]">{t("advertisement.job.artworkHint", { seconds: 30 })}</p>
                    </div>
                  </div>

                  {/* 3. Start date */}
                  <StartDateStep
                    n={3}
                    className="mt-[16px]"
                    today={today}
                    rules={rules}
                    counts={counts}
                    ownBookings={ownBookings}
                    editingId={editingId}
                    startChoice={startChoice}
                    onStartChoice={setStartChoice}
                    pickedDate={pickedDate}
                    onPickDate={setPickedDate}
                    asapDate={asapDate}
                    startDate={startDate}
                    disabled={uploading}
                  />

                  {error && <p className="mt-[12px] text-sm text-red-500">{error}</p>}

                  {uploading && <UploadProgress progress={progress} />}

                  <div className="mt-[16px] flex flex-wrap items-center gap-[8px]">
                    <button
                      type="button"
                      onClick={submit}
                      disabled={!canSubmit}
                      className="flex h-[40px] items-center justify-center rounded-full bg-brand-teal-dark px-[20px] text-sm text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {mode.kind === "edit" ? t("advertisement.submit.save") : t("advertisement.submit.book")}
                    </button>
                    {!canSubmit && !uploading && (
                      <p className="text-xs text-[#9AA3B2]">
                        {!selectedJob
                          ? t("advertisement.job.missingJob")
                          : !hasMedia
                            ? t("advertisement.job.missingMedia")
                            : !startDate
                              ? t("advertisement.missingStart")
                              : ""}
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="flex min-w-0 flex-col gap-[20px] xl:sticky xl:top-[22px] xl:flex-[2]">
          <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`} style={{ animationDelay: "60ms" }}>
            <div className="rounded-[19px] bg-white p-[16px] text-left sm:p-[22px]">
              <p className="text-sm text-[#141B2E]">{t("advertisement.previewTitle")}</p>
              <p className="mt-[2px] text-xs text-[#9AA3B2]">{t("advertisement.job.previewHint")}</p>
              <div className="mt-[14px] rounded-[16px] bg-brand-gold-page p-[16px]">
                <div className="mx-auto w-full max-w-[260px]">
                  {previewMedia ? (
                    <JobAdCard ad={cardFor(previewMedia, selectedJob)} />
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-[20px] border border-dashed border-black/[0.12] bg-white px-[20px] text-center text-xs text-[#9AA3B2]">
                      {t("advertisement.job.previewEmpty")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {cardPreview && (
        <Modal onClose={() => setCardPreview(null)} ariaLabel={t("advertisement.job.cardPreviewLabel")}>
          <p className="text-sm font-semibold text-[#141B2E]">{t("advertisement.job.cardPreviewTitle")}</p>
          <p className="mt-[2px] text-xs text-[#9AA3B2]">{t("advertisement.job.cardPreviewHint")}</p>
          <div className="mt-[14px] rounded-[16px] bg-brand-gold-page p-[16px]">
            <div className="mx-auto w-full max-w-[260px]">
              <JobAdCard ad={cardPreview} />
            </div>
          </div>
        </Modal>
      )}

      {confirmRemove && (
        <ConfirmRemoveModal
          copy={removeCopy(t, "job", confirmRemove, locale)}
          busy={cancelMutation.isPending}
          onKeep={() => setConfirmRemove(null)}
          onConfirm={() => remove(confirmRemove)}
        />
      )}
    </div>
  );
}
