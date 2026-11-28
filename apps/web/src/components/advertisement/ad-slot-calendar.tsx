// The redesign's src/components/AdSlotCalendar.tsx.
import {
  type AdRules,
  addDays,
  checkStartFromCounts,
  lastBookableStart,
  runEndDate,
  type SlotBooking,
} from "@jobgiga-app/api/shared/ad-slots";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon } from "@/components/landing/icons";

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function shiftMonth(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Inline booking calendar for an ad's start date — same look as DatePicker
 * (Monday-first grid, round day buttons, teal selection), plus what booking
 * needs: full dates and dates that clash with this company's other booking
 * are unavailable, and the chosen run is highlighted.
 */
export function AdSlotCalendar({
  today,
  rules,
  value,
  onChange,
  counts,
  ownBookings,
  excludeId,
}: {
  today: string;
  rules: AdRules;
  value: string | null;
  onChange: (start: string) => void;
  counts: Record<string, number>;
  ownBookings: SlotBooking[];
  excludeId?: string;
}) {
  const { t, i18n } = useTranslation("common");
  const firstMonth = monthKey(today);
  const lastMonth = monthKey(lastBookableStart(today, rules));
  const [view, setView] = useState(() => (value ? monthKey(value) : firstMonth));

  const [y, m] = view.split("-").map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const leading = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(i18n.resolvedLanguage === "ms" ? "ms-MY" : "en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const runEnd = value ? runEndDate(value, rules) : null;
  const weekdays = t("advertisement.calendar.weekdays").split(",");

  const cells: (string | null)[] = Array.from({ length: leading }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${view}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-[14px] border border-[#EAEDF2] bg-white p-[14px]">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#141B2E]">{monthLabel}</p>
        <div className="flex items-center gap-[4px]">
          <button
            type="button"
            onClick={() => setView(shiftMonth(view, -1))}
            disabled={view <= firstMonth}
            aria-label={t("advertisement.calendar.prev")}
            className="flex h-[28px] w-[28px] items-center justify-center rounded-full text-[#4B5468] hover:bg-[#F1F4F8] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronDownIcon className="h-[10px] w-[10px] rotate-90" />
          </button>
          <button
            type="button"
            onClick={() => setView(shiftMonth(view, 1))}
            disabled={view >= lastMonth}
            aria-label={t("advertisement.calendar.next")}
            className="flex h-[28px] w-[28px] items-center justify-center rounded-full text-[#4B5468] hover:bg-[#F1F4F8] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronDownIcon className="h-[10px] w-[10px] -rotate-90" />
          </button>
        </div>
      </div>

      <div className="mt-[10px] grid grid-cols-7 gap-y-[4px] text-center">
        {weekdays.map((label, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed seven-day header, letters repeat.
          <p key={i} className="pb-[2px] text-xs text-[#9AA3B2]">
            {label}
          </p>
        ))}
        {cells.map((day, i) => {
          // biome-ignore lint/suspicious/noArrayIndexKey: blank padding cells have no date.
          if (!day) return <span key={i} />;
          const check = checkStartFromCounts(day, today, counts, ownBookings, rules, excludeId);
          const isStart = day === value;
          const inRun = !!value && !!runEnd && day > value && day < runEnd;
          const isRunLast = !!runEnd && day === addDays(runEnd, -1);
          const outside = !check.ok && (check.reason === "past" || check.reason === "too_far");
          const full = !check.ok && check.reason === "full";
          const overlap = !check.ok && check.reason === "overlap";
          const title = full
            ? t("advertisement.calendar.full", { count: rules.slots })
            : overlap
              ? t("advertisement.calendar.overlap")
              : outside
                ? undefined
                : t("advertisement.calendar.available");
          return (
            <div
              key={day}
              className={`flex h-[34px] items-center justify-center ${inRun || isStart ? "bg-brand-teal-soft" : ""} ${
                isStart ? "rounded-l-full" : ""
              } ${isRunLast ? "rounded-r-full" : ""}`}
            >
              <button
                type="button"
                disabled={!check.ok}
                onClick={() => onChange(day)}
                title={title}
                aria-label={`${day}${title ? ` — ${title}` : ""}`}
                aria-pressed={isStart}
                className={`flex h-[32px] w-[32px] items-center justify-center rounded-full text-sm transition-colors ${
                  isStart
                    ? "bg-brand-teal-dark text-white"
                    : full
                      ? "cursor-not-allowed text-[#C0C6D0] line-through"
                      : overlap
                        ? "cursor-not-allowed text-[#C0C6D0]"
                        : outside
                          ? "cursor-not-allowed text-[#D5DAE1]"
                          : `text-[#141B2E] hover:bg-[#F1F4F8] ${day === today ? "font-semibold text-brand-teal-dark" : ""}`
                }`}
              >
                {Number(day.slice(8))}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-[12px] flex flex-wrap items-center gap-x-[14px] gap-y-[6px] border-t border-black/[0.06] pt-[10px] text-xs text-[#4B5468]">
        <span className="flex items-center gap-[6px]">
          <span className="h-[10px] w-[10px] rounded-full bg-brand-teal-dark" /> {t("advertisement.calendar.legendStart")}
        </span>
        <span className="flex items-center gap-[6px]">
          <span className="h-[10px] w-[18px] rounded-full bg-brand-teal-soft" />{" "}
          {t("advertisement.calendar.legendRun", { count: rules.runDays })}
        </span>
        <span className="flex items-center gap-[6px] text-[#9AA3B2]">
          <span className="line-through">12</span> {t("advertisement.calendar.legendFull")}
        </span>
      </div>
    </div>
  );
}
