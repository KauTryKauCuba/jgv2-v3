import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { MOCKUP_CARD_CLASS as cardClass } from "@/lib/landing/form-styles";
import { CalendarIcon, CheckIcon, UserIcon } from "../icons";
import { useMockupStep } from "./mockup-animation";

const K = "landing.employer.mockups.interview";

// Same response-status colours as the real Interviews page.
const STATUS = {
  pending: { bg: "bg-brand-gold-soft", text: "text-brand-gold-dark" },
  accepted: { bg: "bg-[#E7F6EC]", text: "text-[#2F9E56]" },
  attended: { bg: "bg-brand-teal-soft", text: "text-brand-teal-dark" },
  reschedule: { bg: "bg-[#FFEFE3]", text: "text-[#C2600A]" },
};
type Status = keyof typeof STATUS;

const VIEWS = ["list", "kanban", "calendar"] as const;

// Mon-first month grid, like the real Interview Calendar.
const CALENDAR_LEADING_BLANKS = 4;
const CALENDAR_DAYS_IN_MONTH = 30;
const CALENDAR_TODAY = 12;
const CALENDAR_MARKED_DAYS = [3, 12, 18, 24];
const NEW_BOOKING_DAY = 19;

// Timeline (delay before each step):
//   0 List · 1 Priya accepts her invite · 2 Kanban · 3 Nur Aisyah moves to
//   Interviewed · 4 Calendar · 5 a new interview is booked · then a hold.
const DURATIONS = [1500, 1900, 1300, 2300, 1300, 2600];

/**
 * Animated recreation of the Interviews page: the List / Kanban / Calendar
 * toggle switches views, and each view shows something happening — an invite
 * accepted, a card moving across the board, a new booking on the calendar.
 */
export function InterviewMockup() {
  const { t } = useTranslation("common");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const step = useMockupStep(rootRef, DURATIONS);

  const view = step >= 4 ? 2 : step >= 2 ? 1 : 0;
  const priyaAccepted = step >= 1;
  const nurInterviewed = step >= 3;
  const newBooking = step >= 5;

  const weekdays = t(`${K}.weekdays`).split(",");

  const tiles: { status: Status; count: number; live: boolean }[] = [
    { status: "pending", count: priyaAccepted ? 1 : 2, live: false },
    { status: "accepted", count: (priyaAccepted ? 5 : 4) + (newBooking ? 1 : 0), live: true },
    { status: "attended", count: nurInterviewed ? 4 : 3, live: false },
  ];

  const listRows: { name: string; detail: string; status: Status }[] = [
    { name: "Nur Aisyah", detail: t(`${K}.rows.nur`), status: nurInterviewed ? "attended" : "accepted" },
    { name: "Priya Kumar", detail: t(`${K}.rows.priya`), status: priyaAccepted ? "accepted" : "pending" },
    { name: "Daniel Wong", detail: t(`${K}.rows.daniel`), status: "attended" },
    { name: "Aiman Hafiz", detail: t(`${K}.rows.aiman`), status: "reschedule" },
  ];

  const awaiting = (round: number) => t(`${K}.awaitingEvaluation`, { round });
  const nurCard = { name: "Nur Aisyah", detail: nurInterviewed ? awaiting(1) : t(`${K}.cards.nur`) };
  const scheduled = [
    ...(nurInterviewed ? [] : [nurCard]),
    { name: "Priya Kumar", detail: t(`${K}.cards.priya`) },
    { name: "Aiman Hafiz", detail: t(`${K}.cards.aiman`) },
  ];
  const interviewed = [
    ...(nurInterviewed ? [nurCard] : []),
    { name: "Daniel Wong", detail: awaiting(1) },
    { name: "Farah Aisyah", detail: awaiting(2) },
  ];
  const columns = [
    { id: "scheduled", bg: "bg-[#F1ECFB]", text: "text-[#7C5CD1]", cards: scheduled },
    { id: "interviewed", bg: "bg-[#E8F1FF]", text: "text-[#2B6CB0]", cards: interviewed },
  ];

  const panel = (index: number) =>
    `absolute inset-0 transition-all duration-500 ${
      view === index ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-[6px] opacity-0"
    }`;

  return (
    <div ref={rootRef} className="flex h-full w-full items-center justify-center p-[20px]">
      <div className="grid w-full max-w-[840px] grid-cols-1 gap-[12px] md:grid-cols-[1fr_3fr]">
        {/* The narrow side card is hidden below md — it doesn't fit a phone-width card. */}
        <div className={`${cardClass} hidden flex-col gap-[10px] self-start md:flex`}>
          <div>
            <h3 className="text-xs font-semibold text-[#141B2E]">{t(`${K}.interviews`)}</h3>
            <p className="mt-[2px] text-xs leading-[13px] text-[#4B5468]">{t(`${K}.thisWeek`)}</p>
          </div>

          <div className="flex flex-col gap-[6px]">
            {tiles.map((tile) => (
              <div
                key={tile.status}
                className={`flex items-center justify-between rounded-[8px] px-[8px] py-[6px] ${STATUS[tile.status].bg} ${
                  tile.live ? "ai-fill-pulse" : ""
                }`}
              >
                <span className={`flex items-center gap-[5px] text-xs ${STATUS[tile.status].text}`}>
                  {tile.live && <span aria-hidden className="h-[5px] w-[5px] shrink-0 rounded-full bg-current" />}
                  {t(`${K}.status.${tile.status}`)}
                </span>
                <span key={tile.count} className={`mock-bump inline-block text-xs tabular-nums ${STATUS[tile.status].text}`}>
                  {tile.count}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className={`${cardClass} flex flex-col gap-[10px]`}>
          <div>
            <h3 className="text-xs font-semibold text-[#141B2E]">{t(`${K}.seeItYourWay`)}</h3>
            <p className="mt-[2px] text-xs leading-[13px] text-[#4B5468]">{t(`${K}.seeItYourWayHint`)}</p>
          </div>

          {/* Segmented pill; the highlight slides to the active tab. */}
          <div aria-hidden className="relative flex h-[26px] items-center rounded-full border border-black/[0.1] p-[2px]">
            <span
              className="absolute inset-y-[2px] left-[2px] rounded-full bg-brand-teal-dark transition-transform duration-500 ease-out"
              style={{ width: "calc((100% - 4px) / 3)", transform: `translateX(${view * 100}%)` }}
            />
            {VIEWS.map((id, i) => (
              <span
                key={id}
                className={`relative flex h-full flex-1 items-center justify-center text-[10px] transition-colors duration-500 ${
                  view === i ? "text-white" : "text-[#4B5468]"
                }`}
              >
                {t(`${K}.views.${id}`)}
              </span>
            ))}
          </div>

          <div className="relative h-[228px]">
            {/* List */}
            <div className={`${panel(0)} flex flex-col gap-[8px]`}>
              {listRows.map((row) => (
                <div key={row.name} className="flex items-center gap-[8px] rounded-[8px] border border-black/[0.06] px-[10px] py-[9px]">
                  <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#F1F4F8]">
                    <UserIcon className="h-[9px] w-[9px] text-[#9AA3B2]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-[#141B2E]">{row.name}</p>
                    <p className="truncate text-[10px] text-[#9AA3B2]">{row.detail}</p>
                  </div>
                  <span
                    key={row.status}
                    className={`mock-bump flex shrink-0 items-center gap-[3px] rounded-full px-[6px] py-[1.5px] text-[10px] ${STATUS[row.status].bg} ${STATUS[row.status].text}`}
                  >
                    {row.name === "Priya Kumar" && priyaAccepted && <CheckIcon className="h-[7px] w-[7px]" />}
                    {t(`${K}.status.${row.status}`)}
                  </span>
                </div>
              ))}
            </div>

            {/* Kanban */}
            <div className={`${panel(1)} grid grid-cols-2 gap-[8px]`}>
              {columns.map((col) => (
                <div key={col.id} className="flex flex-col gap-[6px] rounded-[8px] bg-[#F8FAFB] p-[8px]">
                  <span className={`flex w-fit items-center gap-[4px] rounded-full px-[7px] py-[2px] text-[10px] ${col.bg} ${col.text}`}>
                    {t(`${K}.columns.${col.id}`)}
                    <span key={col.cards.length} className="mock-bump inline-block opacity-70">
                      {col.cards.length}
                    </span>
                  </span>
                  <div className="flex flex-col gap-[5px]">
                    {col.cards.map((card) => {
                      const moved = card.name === "Nur Aisyah" && nurInterviewed;
                      return (
                        <div
                          key={card.name}
                          className={`rounded-[6px] border bg-white px-[8px] py-[6px] ${
                            moved ? "mock-slide-in border-[#2B6CB0]/40" : "border-black/[0.06]"
                          }`}
                        >
                          <p className="truncate text-xs text-[#141B2E]">{card.name}</p>
                          <p className="truncate text-[10px] text-[#9AA3B2]">{card.detail}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Calendar — a Mon-first month grid; leading cells are spacers. */}
            <div className={`${panel(2)} flex flex-col gap-[6px]`}>
              <p className="flex items-center gap-[5px] text-xs text-[#141B2E]">
                <CalendarIcon className="h-[11px] w-[11px] text-[#9AA3B2]" />
                {t(`${K}.thisMonth`)}
              </p>
              <div className="grid grid-cols-7 gap-[3px]">
                {weekdays.map((label, i) => (
                  <div key={i} className="text-center text-[9px] text-[#C7CDD7]">
                    {label}
                  </div>
                ))}
                {Array.from({ length: CALENDAR_LEADING_BLANKS }).map((_, i) => (
                  <div key={`blank-${i}`} />
                ))}
                {Array.from({ length: CALENDAR_DAYS_IN_MONTH }).map((_, i) => {
                  const day = i + 1;
                  const isNew = day === NEW_BOOKING_DAY && newBooking;
                  const marked = CALENDAR_MARKED_DAYS.includes(day) || isNew;
                  const today = day === CALENDAR_TODAY;
                  return (
                    <div
                      key={day}
                      className={`flex flex-col items-center justify-center gap-[2px] rounded-[5px] py-[2px] text-[9px] transition-colors duration-500 ${
                        isNew
                          ? "mock-bump bg-[#E7F6EC] text-[#2F9E56]"
                          : marked
                            ? "bg-[#F1ECFB] text-[#7C5CD1]"
                            : "text-[#9AA3B2]"
                      } ${today ? "ring-1 ring-inset ring-brand-teal-dark" : ""}`}
                    >
                      {day}
                      {/* Always reserves the dot's space so rows stay the same height. */}
                      <span aria-hidden className={`h-[2px] w-[2px] rounded-full bg-current ${marked ? "" : "opacity-0"}`} />
                    </div>
                  );
                })}
              </div>
              <div
                key={newBooking ? "new" : "next"}
                className={`mock-slide-in flex items-center gap-[6px] rounded-[8px] border px-[8px] py-[6px] ${
                  newBooking ? "border-[#2F9E56]/40 bg-brand-teal-page" : "border-black/[0.06]"
                }`}
              >
                <span
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${
                    newBooking ? "bg-[#E7F6EC]" : "bg-[#F1ECFB]"
                  }`}
                >
                  <UserIcon className={`h-[9px] w-[9px] ${newBooking ? "text-[#2F9E56]" : "text-[#7C5CD1]"}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-[#141B2E]">{newBooking ? "Aiman Hafiz" : "Nur Aisyah"}</p>
                  <p className="truncate text-[10px] text-[#9AA3B2]">
                    {newBooking ? t(`${K}.calendar.newBooking`) : t(`${K}.calendar.next`)}
                  </p>
                </div>
                {newBooking && (
                  <span className="shrink-0 rounded-full bg-[#E7F6EC] px-[6px] py-[1.5px] text-[10px] text-[#2F9E56]">
                    {t(`${K}.justBooked`)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
