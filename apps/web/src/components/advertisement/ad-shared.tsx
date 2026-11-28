// Pieces the redesign's EmployerAdvertisementView (company ads) and
// EmployerJobAdsView (job ads) each had their own identical copy of — the
// "How … works" card, the slots-at-a-glance card, the start date step, the
// upload progress bar and the remove confirm — shared here so the two tabs
// can't drift apart. Same markup and classes as the redesign.
import {
  AD_IMAGE_MAX_BYTES,
  AD_VIDEO_MAX_BYTES,
  AD_VIDEO_MAX_SECONDS,
  type AdPhase,
  type AdRules,
  addDays,
  daysBetween,
  formatAdDate,
  formatAdRun,
  runEndDate,
  type SlotBooking,
} from "@jobgiga-app/api/shared/ad-slots";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatedRibbon } from "@/components/landing/animated-ribbon";
import { CalendarIcon, ChevronDownIcon } from "@/components/landing/icons";
import { Modal } from "@/components/landing/modal";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { resizeImageFile } from "@/lib/resize-image";
import type { orpc } from "@/utils/orpc";
import { AdSlotCalendar } from "./ad-slot-calendar";

export type AdsPageData = Awaited<ReturnType<typeof orpc.ads.page.call>>;
export type AdBooking = AdsPageData["companyAds"]["active"][number];
export type AdKind = "company" | "job";

/** formatAdDate / formatAdRun's locale: "ms" or "en". */
export function useAdLocale() {
  const { i18n } = useTranslation("common");
  return i18n.resolvedLanguage === "ms" ? "ms" : "en";
}

export const PHASE_CLASS: Record<AdPhase, string> = {
  pending: "bg-brand-gold-soft text-brand-gold-dark",
  scheduled: "bg-[#F1ECFB] text-[#7C5CD1]",
  live: "bg-brand-teal-soft text-brand-teal-dark",
  ended: "bg-[#F1F4F8] text-[#9AA3B2]",
  rejected: "bg-[#FDE8E8] text-[#C0362C]",
};

export function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

function videoDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => resolve(null);
    video.src = url;
  });
}

/**
 * The redesign's pickFile checks, in the browser: JPG/PNG/WebP up to 10 MB,
 * or an MP4/WebM video up to 100 MB and 30 seconds (v3 stores videos as
 * uploaded — no conversion — so only formats every browser plays).
 * Returns the file's preview URL, or an error.
 */
export async function checkAdFile(picked: File, t: TFunction): Promise<{ url: string } | { error: string }> {
  const isImage = /^image\/(jpeg|png|webp)$/.test(picked.type);
  const isVideo = /^video\/(mp4|webm)$/.test(picked.type);
  if (!isImage && !isVideo) {
    return { error: t(picked.type.startsWith("video/") ? "advertisement.errors.videoFormat" : "advertisement.errors.fileType") };
  }
  if (isImage && picked.size > AD_IMAGE_MAX_BYTES) return { error: t("advertisement.errors.imageTooLarge") };
  if (isVideo && picked.size > AD_VIDEO_MAX_BYTES) return { error: t("advertisement.errors.videoTooLarge") };
  const url = URL.createObjectURL(picked);
  if (isVideo) {
    const seconds = await videoDuration(url);
    if (seconds !== null && seconds > AD_VIDEO_MAX_SECONDS + 1) {
      URL.revokeObjectURL(url);
      return { error: t("advertisement.errors.videoTooLong", { max: AD_VIDEO_MAX_SECONDS, seconds: Math.round(seconds) }) };
    }
  }
  return { url };
}

/**
 * What the redesign's server did with sharp: an image becomes a WebP no
 * bigger than 1600px (company ads) or 1200px (job ads); here in the browser.
 * Videos go as they are.
 */
export async function prepareAdMedia(file: File, kind: AdKind): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const size = kind === "company" ? 1600 : 1200;
  return resizeImageFile(file, { width: size, height: size, fit: "inside", quality: 0.85 });
}

/** The booking's status line under its title (the redesign's bookingNote). */
export function bookingNote(t: TFunction, kind: AdKind, b: AdBooking, today: string, locale: string) {
  const run = formatAdRun(b.startDate, b.endDate, locale);
  const end = formatAdDate(addDays(b.endDate, -1), true, locale);
  switch (b.phase) {
    case "pending":
      return t("advertisement.note.pending", { run });
    case "scheduled":
      return t(`advertisement.${kind}.note.scheduled`, { start: formatAdDate(b.startDate, true, locale), end });
    case "live":
      return t(`advertisement.${kind}.note.live`, { end, count: daysBetween(today, b.endDate) });
    case "ended":
      return t("advertisement.note.ended", { run });
    case "rejected":
      return b.rejectionReason
        ? t("advertisement.note.rejectedWithReason", { reason: b.rejectionReason })
        : t("advertisement.note.rejected");
  }
}

/** Title, body and button of the remove confirm — it depends on where the booking is. */
export function removeCopy(t: TFunction, kind: AdKind, b: AdBooking, locale: string) {
  if (b.phase === "live") {
    return {
      title: t(`advertisement.${kind}.remove.takeDownTitle`),
      body: t(`advertisement.${kind}.remove.takeDownBody`),
      action: t("advertisement.remove.takeDown"),
    };
  }
  if (b.phase === "ended" || b.phase === "rejected") {
    return { title: t("advertisement.remove.listTitle"), body: t("advertisement.remove.listBody"), action: t("advertisement.remove.remove") };
  }
  return {
    title: t("advertisement.remove.cancelTitle"),
    body: t("advertisement.remove.cancelBody", { run: formatAdRun(b.startDate, b.endDate, locale) }),
    action: t("advertisement.remove.cancelBooking"),
  };
}

/** The collapsible explainer (same as the Interviews page's "How scheduling interviews works"). */
export function HowItWorksCard({ title, steps }: { title: string; steps: { title: string; detail: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`}>
      <div className="relative overflow-hidden rounded-[19px] bg-white p-[16px] sm:p-[22px]">
        {!open && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[70px] overflow-hidden rounded-b-[19px] sm:h-[95px] lg:h-[130px]"
          >
            {/* Shifted up so the visible slice lands on the ribbon's colour pools. */}
            <div className="-mt-[67px] sm:-mt-[92px] lg:-mt-[125px]">
              <AnimatedRibbon />
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="relative flex w-full items-center gap-[8px] text-left"
        >
          <p className="text-sm text-[#141B2E]">{title}</p>
          <ChevronDownIcon className={`ml-auto h-[10px] w-[10px] text-[#9AA3B2] transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
        <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="overflow-hidden">
            <div className="mt-[12px] grid grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s, i) => (
                <div key={s.title} className="flex flex-col gap-[4px] rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[14px]">
                  <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brand-teal-dark text-xs text-white">
                    {i + 1}
                  </span>
                  <p className="mt-[4px] text-xs text-[#141B2E]">{s.title}</p>
                  <p className="text-xs text-[#4B5468]">{s.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Steps 2–4 of the explainer read the same on both tabs, from the placement's rules. */
export function sharedSteps(t: TFunction, kind: AdKind, rules: AdRules) {
  return [
    {
      title: t("advertisement.howItWorks.s2Title"),
      detail: t("advertisement.howItWorks.s2Detail", { count: rules.bookAheadMonths, slots: rules.slots }),
    },
    { title: t("advertisement.howItWorks.s3Title"), detail: t("advertisement.howItWorks.s3Detail") },
    {
      title: t(`advertisement.${kind}.howItWorks.s4Title`, { count: rules.runDays }),
      detail: t(`advertisement.${kind}.howItWorks.s4Detail`, { count: rules.maxActivePerCompany }),
    },
  ];
}

/** "Slots at a glance": today's use, the next free start, and the rules. */
export function SlotsCard({
  label,
  rules,
  usedToday,
  nextFreeToday,
}: {
  label: string;
  rules: AdRules;
  usedToday: number;
  nextFreeToday: string | null;
}) {
  const { t } = useTranslation("common");
  const locale = useAdLocale();
  return (
    <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`}>
      <div className="rounded-[19px] bg-white p-[16px] text-left sm:p-[22px]">
        <div className="flex flex-wrap items-end justify-between gap-[12px]">
          <div>
            <p className="text-xs text-[#9AA3B2]">{label}</p>
            <p className="mt-[2px] text-xl font-semibold text-[#141B2E]">
              {t("advertisement.slots.inUse", { used: usedToday, total: rules.slots })}
            </p>
          </div>
          <p className="text-sm text-[#4B5468]">
            {usedToday < rules.slots ? (
              t("advertisement.slots.freeNow")
            ) : nextFreeToday ? (
              <>
                {t("advertisement.slots.nextFree")}{" "}
                <span className="font-medium text-brand-teal-dark">{formatAdDate(nextFreeToday, true, locale)}</span>
              </>
            ) : (
              t("advertisement.slots.noneFree", { count: rules.bookAheadMonths })
            )}
          </p>
        </div>
        <div className="mt-[12px] grid gap-[4px]" style={{ gridTemplateColumns: `repeat(${rules.slots}, minmax(0, 1fr))` }} aria-hidden>
          {Array.from({ length: rules.slots }, (_, i) => (
            <span key={i} className={`h-[8px] rounded-full ${i < usedToday ? "bg-brand-teal-dark" : "bg-brand-teal-soft"}`} />
          ))}
        </div>
        <div className="mt-[14px] flex flex-wrap gap-[6px] text-xs text-[#4B5468]">
          <span className="rounded-full bg-[#F1F4F8] px-[10px] py-[4px]">{t("advertisement.chips.runs", { count: rules.runDays })}</span>
          <span className="rounded-full bg-[#F1F4F8] px-[10px] py-[4px]">{t("advertisement.chips.bookAhead", { count: rules.bookAheadMonths })}</span>
          <span className="rounded-full bg-[#F1F4F8] px-[10px] py-[4px]">{t("advertisement.chips.reviewed")}</span>
          <span className="rounded-full bg-[#F1F4F8] px-[10px] py-[4px]">{t("advertisement.chips.free")}</span>
        </div>
      </div>
    </div>
  );
}

export function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-brand-teal-soft text-xs font-semibold text-brand-teal-dark">
      {n}
    </span>
  );
}

/** Step 3: "As soon as possible" or a date from the booking calendar, and the run it gives. */
export function StartDateStep({
  n,
  className,
  today,
  rules,
  counts,
  ownBookings,
  editingId,
  startChoice,
  onStartChoice,
  pickedDate,
  onPickDate,
  asapDate,
  startDate,
  disabled,
}: {
  n: number;
  className: string;
  today: string;
  rules: AdRules;
  counts: Record<string, number>;
  ownBookings: SlotBooking[];
  editingId?: string;
  startChoice: "asap" | "date";
  onStartChoice: (choice: "asap" | "date") => void;
  pickedDate: string | null;
  onPickDate: (date: string) => void;
  asapDate: string | null;
  startDate: string | null;
  disabled: boolean;
}) {
  const { t } = useTranslation("common");
  const locale = useAdLocale();
  const options = [
    {
      key: "asap" as const,
      title: t("advertisement.start.asap"),
      detail: asapDate
        ? t("advertisement.start.startsOn", { date: formatAdDate(asapDate, true, locale) })
        : t("advertisement.start.noneFree", { count: rules.bookAheadMonths }),
    },
    {
      key: "date" as const,
      title: t("advertisement.start.pick"),
      detail: pickedDate
        ? t("advertisement.start.startsOn", { date: formatAdDate(pickedDate, true, locale) })
        : t("advertisement.start.upTo", { count: rules.bookAheadMonths }),
    },
  ];
  return (
    <div className={`${className} flex gap-[12px]`}>
      <StepNumber n={n} />
      <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
        <p className="text-sm text-[#141B2E]">{t("advertisement.start.title")}</p>
        <div className="grid gap-[8px] sm:grid-cols-2" role="radiogroup">
          {options.map((opt) => (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={startChoice === opt.key}
              disabled={disabled}
              onClick={() => onStartChoice(opt.key)}
              className={`flex items-start gap-[10px] rounded-[14px] border p-[12px] text-left transition-colors ${
                startChoice === opt.key ? "border-brand-teal-dark bg-[#F2FBFB]" : "border-[#EAEDF2] bg-white hover:border-black/[0.15]"
              }`}
            >
              <span
                className={`mt-[2px] flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full border ${
                  startChoice === opt.key ? "border-brand-teal-dark" : "border-black/[0.2]"
                }`}
              >
                {startChoice === opt.key && <span className="h-[8px] w-[8px] rounded-full bg-brand-teal-dark" />}
              </span>
              <span>
                <span className="block text-sm text-[#141B2E]">{opt.title}</span>
                <span className="block text-xs text-[#4B5468]">{opt.detail}</span>
              </span>
            </button>
          ))}
        </div>

        {startChoice === "date" && (
          <AdSlotCalendar
            today={today}
            rules={rules}
            value={pickedDate}
            onChange={onPickDate}
            counts={counts}
            ownBookings={ownBookings}
            excludeId={editingId}
          />
        )}

        {startDate && (
          <div className="flex items-start gap-[10px] rounded-[14px] bg-[#F8FAFB] p-[12px]">
            <CalendarIcon className="mt-[2px] h-[14px] w-[14px] shrink-0 text-brand-teal-dark" />
            <p className="text-sm leading-[20px] text-[#4B5468]">
              {t("advertisement.start.runs")}{" "}
              <span className="font-medium text-[#141B2E]">{formatAdRun(startDate, runEndDate(startDate, rules), locale)}</span> ·{" "}
              {t("advertisement.start.runsDetail", { count: rules.runDays })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** The upload bar while a booking is sent. v3 doesn't convert videos, so 100% is just "Saving…". */
export function UploadProgress({ progress }: { progress: number }) {
  const { t } = useTranslation("common");
  return (
    <div className="mt-[12px]">
      <div className="h-[6px] w-full overflow-hidden rounded-full bg-[#EAEDF2]">
        <div className="h-full bg-brand-teal-dark transition-[width]" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-[6px] text-xs text-[#4B5468]">
        {progress < 100 ? t("advertisement.upload.uploading", { percent: progress }) : t("advertisement.upload.saving")}
      </p>
    </div>
  );
}

export function ConfirmRemoveModal({
  copy,
  busy,
  onKeep,
  onConfirm,
}: {
  copy: { title: string; body: string; action: string };
  busy: boolean;
  onKeep: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation("common");
  return (
    <Modal onClose={onKeep} ariaLabel={copy.title}>
      <p className="text-sm font-semibold text-[#141B2E]">{copy.title}</p>
      <p className="mt-[6px] text-sm leading-[20px] text-[#4B5468]">{copy.body}</p>
      <div className="mt-[18px] flex gap-[8px]">
        <button
          type="button"
          onClick={onKeep}
          className="flex h-[40px] flex-1 items-center justify-center rounded-full border border-black/[0.1] text-sm text-[#141B2E] hover:bg-black/[0.03]"
        >
          {t("advertisement.remove.keep")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="flex h-[40px] flex-1 items-center justify-center rounded-full bg-[#E5484D] text-sm text-white hover:opacity-90 disabled:opacity-60"
        >
          {copy.action}
        </button>
      </div>
    </Modal>
  );
}
