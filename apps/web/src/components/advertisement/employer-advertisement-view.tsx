// The redesign's src/components/EmployerAdvertisementView.tsx — the
// Advertisement page's "Company advertisement" tab: book a slot in the
// employer landing page's Company spotlight, edit or cancel a booking, book
// again. On ads.page / ads.book / ads.cancel; the rules (slots, run length,
// how far ahead, bookings per company) come from the API with the page.
// Images are made a WebP ≤1600px in the browser before upload (the
// redesign's server used sharp); videos go as uploaded (MP4/WebM only).
import {
  AD_HEADLINE_MAX,
  checkStartFromCounts,
  formatAdRun,
  nextFreeStartFromCounts,
} from "@jobgiga-app/api/shared/ad-slots";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarIcon, ImageIcon } from "@/components/landing/icons";
import { CompanyAdCard, type CompanyAdCardData } from "@/components/landing/employer/company-ad-card";
import { bookAdWithProgress } from "@/lib/ads/upload";
import { gradientFrameClass, inputClass as formInputClass } from "@/lib/landing/form-styles";
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
import { EmployerPageAdPreviewModal } from "./employer-page-ad-preview-modal";

// Edit = change a waiting/scheduled/rejected booking (back to review);
// again = a new booking reusing a past one's media and headline.
type FormMode = { kind: "new" } | { kind: "edit"; booking: AdBooking } | { kind: "again"; booking: AdBooking };

export function EmployerAdvertisementView({ data }: { data: AdsPageData }) {
  const { t } = useTranslation("common");
  const locale = useAdLocale();
  const { today, company } = data;
  const { rules, counts, ownBookings, active, past, otherLiveAds } = data.companyAds;
  const canBookNew = ownBookings.length < rules.maxActivePerCompany;
  const [mode, setMode] = useState<FormMode | null>(canBookNew ? { kind: "new" } : null);
  const [headline, setHeadline] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [startChoice, setStartChoice] = useState<"asap" | "date">("asap");
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<AdBooking | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [pagePreview, setPagePreview] = useState<CompanyAdCardData | null>(null);
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

  function openForm(next: FormMode) {
    setMode(next);
    setError(null);
    setSavedMessage(null);
    setFile(null);
    setPreviewUrl(null);
    if (next.kind === "new") {
      setHeadline("");
      setStartChoice("asap");
      setPickedDate(null);
    } else {
      setHeadline(next.booking.headline);
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
  const trimmed = headline.trim();
  const hasMedia = !!file || !!existingMedia;
  const canSubmit = progress === null && !!mode && hasMedia && !!trimmed && !!startDate;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: orpc.ads.key() });
  }

  async function submit() {
    if (!canSubmit || !mode || !startDate) return;
    setError(null);
    setProgress(0);
    let media: File | undefined;
    try {
      media = file ? await prepareAdMedia(file, "company") : undefined;
    } catch {
      setProgress(null);
      return setError(t("advertisement.errors.imageRead"));
    }
    try {
      const booked = await bookMutation.mutateAsync({
        kind: "company",
        headline: trimmed,
        startDate: startChoice === "asap" ? "asap" : startDate,
        media,
        bookingId: mode.kind === "edit" ? mode.booking.id : undefined,
        reuseFromId: mode.kind === "again" && !file ? mode.booking.id : undefined,
      });
      setSavedMessage(t("advertisement.company.saved", { run: formatAdRun(booked.startDate, booked.endDate, locale) }));
      setMode(null);
      setFile(null);
      setPreviewUrl(null);
    } catch (err) {
      setError(
        err instanceof TypeError ? t("advertisement.errors.uploadFailed") : errorMessage(err, t("advertisement.company.errors.book")),
      );
    } finally {
      setProgress(null);
      // Slots may have changed since the page loaded.
      await refresh();
    }
  }

  async function remove(booking: AdBooking) {
    setConfirmRemove(null);
    try {
      await cancelMutation.mutateAsync({ kind: "company", id: booking.id });
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
  const companyCard = {
    companyName: company.name,
    companyLogoUrl: company.logoUrl,
    companyIndustry: company.industry,
    companyVerified: company.verified,
  };

  return (
    <div className="flex flex-col gap-[20px]">
      <HowItWorksCard
        title={t("advertisement.company.howItWorks.title")}
        steps={[
          {
            title: t("advertisement.company.howItWorks.s1Title"),
            detail: t("advertisement.company.howItWorks.s1Detail", { seconds: 30 }),
          },
          ...sharedSteps(t, "company", rules),
        ]}
      />

      <div className="flex flex-col gap-[20px] xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-col gap-[20px] xl:flex-[3]">
          <SlotsCard label={t("advertisement.company.slotsLabel")} rules={rules} usedToday={usedToday} nextFreeToday={nextFreeToday} />

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
                  <h2 className="text-xl font-semibold text-[#141B2E]">{t("advertisement.company.bookingsTitle")}</h2>
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
                      <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden rounded-[10px] bg-[#E9EEF2] sm:w-[132px]">
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
                        <p className="mt-[6px] truncate text-sm font-medium text-[#141B2E]">{b.headline}</p>
                        <p className={`mt-[2px] text-xs leading-[17px] ${b.phase === "rejected" ? "text-[#C0362C]" : "text-[#4B5468]"}`}>
                          {bookingNote(t, "company", b, today, locale)}
                        </p>
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
                        {b.phase === "ended" && canBookNew && (
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
                            setPagePreview({ mediaType: b.mediaType, mediaUrl: b.mediaUrl, headline: b.headline, ...companyCard })
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
                          {removeCopy(t, "company", b, locale).action}
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
                  <h2 className="text-xl font-semibold text-[#141B2E]">{t("advertisement.company.bookTitle")}</h2>
                  {canBookNew ? (
                    <>
                      <p className="text-sm leading-[20px] text-[#4B5468]">{t("advertisement.company.bookIntro")}</p>
                      <button
                        type="button"
                        onClick={() => openForm({ kind: "new" })}
                        className="flex h-[40px] items-center justify-center rounded-full bg-brand-teal-dark px-[20px] text-sm text-white hover:opacity-90"
                      >
                        {t("advertisement.company.bookNew")}
                      </button>
                    </>
                  ) : (
                    <p className="text-sm leading-[20px] text-[#4B5468]">
                      {t("advertisement.company.limit", { count: rules.maxActivePerCompany })}
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
                          : t("advertisement.company.bookTitle")}
                    </h2>
                    {(mode.kind !== "new" || bookings.length > 0) && !uploading && (
                      <button type="button" onClick={() => setMode(null)} className="text-sm text-[#9AA3B2] hover:text-[#141B2E]">
                        {t("advertisement.form.cancel")}
                      </button>
                    )}
                  </div>
                  <p className="mt-[6px] text-sm leading-[20px] text-[#4B5468]">
                    {mode.kind === "edit" ? t("advertisement.form.editHint") : t("advertisement.company.form.newHint")}
                  </p>

                  {/* 1. Media */}
                  <div className="mt-[18px] flex gap-[12px]">
                    <StepNumber n={1} />
                    <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
                      <p className="text-sm text-[#141B2E]">
                        {t("advertisement.company.mediaLabel")} <span className="text-[#E5484D]">*</span>
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
                            ? t("advertisement.company.mediaCurrent")
                            : t("advertisement.form.uploadMedia")}
                      </button>
                      <p className="text-xs text-[#9AA3B2]">{t("advertisement.company.mediaHint", { seconds: 30 })}</p>
                    </div>
                  </div>

                  {/* 2. Headline */}
                  <div className="mt-[16px] flex gap-[12px]">
                    <StepNumber n={2} />
                    <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
                      <label htmlFor="adHeadline" className="text-sm text-[#141B2E]">
                        {t("advertisement.company.headlineLabel")} <span className="text-[#E5484D]">*</span>
                      </label>
                      <input
                        id="adHeadline"
                        type="text"
                        value={headline}
                        maxLength={AD_HEADLINE_MAX}
                        disabled={uploading}
                        onChange={(e) => setHeadline(e.target.value)}
                        placeholder={t("advertisement.company.headlinePlaceholder")}
                        className={formInputClass("teal")}
                      />
                      <p className="text-right text-xs text-[#9AA3B2]">
                        {headline.length}/{AD_HEADLINE_MAX}
                      </p>
                    </div>
                  </div>

                  {/* 3. Start date */}
                  <StartDateStep
                    n={3}
                    className="mt-[8px]"
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
                        {!hasMedia
                          ? t("advertisement.company.missingMedia")
                          : !trimmed
                            ? t("advertisement.company.missingHeadline")
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
              <p className="mt-[2px] text-xs text-[#9AA3B2]">{t("advertisement.company.previewHint")}</p>
              <div className="mt-[14px]">
                {previewMedia ? (
                  <CompanyAdCard
                    ad={{ ...previewMedia, headline: trimmed || t("advertisement.company.headlineFallback"), ...companyCard }}
                  />
                ) : (
                  <div className="flex aspect-[16/9] items-center justify-center rounded-[20px] border border-dashed border-black/[0.12] bg-[#F8FAFB] px-[20px] text-center text-xs text-[#9AA3B2]">
                    {t("advertisement.company.previewEmpty")}
                  </div>
                )}
              </div>
              <button
                type="button"
                disabled={!previewMedia}
                onClick={() =>
                  previewMedia &&
                  setPagePreview({ ...previewMedia, headline: trimmed || t("advertisement.company.headlineFallback"), ...companyCard })
                }
                className="mt-[12px] flex h-[38px] w-full items-center justify-center rounded-full border border-brand-teal-dark text-sm text-brand-teal-dark transition-colors hover:bg-brand-teal-soft disabled:cursor-not-allowed disabled:border-black/[0.1] disabled:text-[#9AA3B2] disabled:hover:bg-transparent"
              >
                {t("advertisement.company.previewOnPage")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {pagePreview && (
        <EmployerPageAdPreviewModal
          ad={pagePreview}
          otherAds={otherLiveAds.map((a) => ({
            id: a.id,
            mediaType: a.mediaType,
            mediaUrl: a.mediaUrl,
            headline: a.headline,
            companyName: a.companyName,
            companyLogoUrl: a.companyLogoUrl,
            companyIndustry: a.companyIndustry,
            companyVerified: a.companyVerified,
          }))}
          onClose={() => setPagePreview(null)}
        />
      )}

      {confirmRemove && (
        <ConfirmRemoveModal
          copy={removeCopy(t, "company", confirmRemove, locale)}
          busy={cancelMutation.isPending}
          onKeep={() => setConfirmRemove(null)}
          onConfirm={() => remove(confirmRemove)}
        />
      )}
    </div>
  );
}
