import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { MOCKUP_CARD_CLASS as cardClass } from "@/lib/landing/form-styles";
import { CheckIcon, EyeIcon, TrendUpIcon, UsersIcon } from "../icons";
import { useMockupStep } from "./mockup-animation";

const K = "landing.employer.mockups.manageJob";

// Same status colours as the real Manage Job page.
const TONE = {
  active: { bg: "bg-brand-teal-soft", text: "text-brand-teal-dark" },
  pending: { bg: "bg-brand-gold-soft", text: "text-brand-gold-dark" },
  draft: { bg: "bg-[#F1ECFB]", text: "text-[#7C5CD1]" },
};

// Timeline: TICKS live updates (views/applicants ticking up), the pending
// posting approved at APPROVE_AT, then a hold before looping.
const TICKS = 12;
const APPROVE_AT = 6;
const DURATIONS = [900, ...Array.from({ length: TICKS - 1 }, () => 650), 2800];

type Tone = keyof typeof TONE;

/** A number that briefly "bumps" (highlight + pop) whenever it changes. */
function Live({ value }: { value: number | string }) {
  return (
    <span key={value} className="mock-bump inline-block tabular-nums">
      {value}
    </span>
  );
}

/**
 * Animated recreation of Manage Job: views and applicants tick up live, the
 * top posting's "+N today" climbs, and the pending posting is approved
 * mid-loop. Loops while on screen; reduced motion shows the final state.
 */
export function ManageJobMockup() {
  const { t } = useTranslation("common");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const step = useMockupStep(rootRef, DURATIONS);
  const tick = Math.min(step, TICKS);
  const approved = tick >= APPROVE_AT;
  const sinceApproval = Math.max(0, tick - APPROVE_AT);

  const postings: {
    title: string;
    meta: string;
    salary: string;
    tone: Tone;
    views: number;
    applicants: number | null;
    trend: string | null;
    justApproved?: boolean;
  }[] = [
    {
      title: "Sales Executive",
      meta: `Petaling Jaya, Selangor · ${t(`${K}.postedDaysAgo`, { count: 4 })}`,
      salary: "RM3,000–4,500",
      tone: "active",
      views: 214 + tick * 4,
      applicants: 18 + Math.floor(tick / 3),
      trend: t(`${K}.today`, { count: 12 + Math.floor(tick / 3) }),
    },
    {
      title: "Frontend Engineer",
      meta: `Cyberjaya · ${t(`${K}.postedWeeksAgo`, { count: 1 })}`,
      salary: "RM5,500–8,000",
      tone: "active",
      views: 356 + tick * 2,
      applicants: 27 + (tick >= 9 ? 1 : 0),
      trend: null,
    },
    {
      title: "Warehouse Associate",
      meta: `Shah Alam, Selangor · ${approved ? t(`${K}.approvedJustNow`) : t(`${K}.postedToday`)}`,
      salary: "RM2,200–2,800",
      tone: approved ? "active" : "pending",
      views: 42 + sinceApproval * 6,
      // Under review it can't take applicants yet — shown as a shimmer.
      applicants: approved ? Math.floor(sinceApproval / 2) : null,
      trend: null,
      justApproved: approved,
    },
    {
      title: "HR Manager",
      meta: `Kuala Lumpur · ${t(`${K}.savedAsDraft`)}`,
      salary: "RM4,500–6,000",
      tone: "draft",
      views: 0,
      applicants: 0,
      trend: null,
    },
  ];

  const pipeline: { tone: Tone; count: number; live: boolean }[] = [
    { tone: "active", count: approved ? 4 : 3, live: true },
    { tone: "pending", count: approved ? 0 : 1, live: false },
    { tone: "draft", count: 1, live: false },
  ];

  return (
    <div ref={rootRef} className="flex h-full w-full items-center justify-center bg-brand-teal-page p-[20px]">
      <div className="grid w-full max-w-[840px] grid-cols-1 gap-[12px] md:grid-cols-[1fr_3fr]">
        {/* The narrow side card is hidden below md — it doesn't fit a phone-width card. */}
        <div className={`${cardClass} hidden flex-col gap-[10px] self-start md:flex`}>
          <div>
            <h3 className="text-xs font-semibold text-[#141B2E]">{t(`${K}.pipeline`)}</h3>
            <p className="mt-[2px] text-xs leading-[13px] text-[#4B5468]">{t(`${K}.atAGlance`)}</p>
          </div>

          <div className="flex flex-col gap-[6px]">
            {pipeline.map((tile) => (
              <div
                key={tile.tone}
                className={`flex items-center justify-between rounded-[8px] px-[8px] py-[6px] transition-opacity duration-500 ${TONE[tile.tone].bg} ${
                  tile.live ? "ai-fill-pulse" : ""
                } ${tile.count === 0 ? "opacity-50" : "opacity-100"}`}
              >
                <span className={`flex items-center gap-[5px] text-xs ${TONE[tile.tone].text}`}>
                  {tile.live && <span aria-hidden className="h-[5px] w-[5px] shrink-0 rounded-full bg-current" />}
                  {t(`${K}.status.${tile.tone}`)}
                </span>
                <span className={`text-xs ${TONE[tile.tone].text}`}>
                  <Live value={tile.count} />
                </span>
              </div>
            ))}
          </div>

          <p className="flex items-center gap-[5px] text-[11px] text-[#9AA3B2]">
            <span aria-hidden className="ai-fill-caret h-[5px] w-[5px] rounded-full bg-[#2F9E56]" />
            {t(`${K}.updatingLive`)}
          </p>
        </div>

        <div className={`${cardClass} flex flex-col gap-[8px]`}>
          <div>
            <h3 className="text-xs font-semibold text-[#141B2E]">{t(`${K}.yourPostings`)}</h3>
            <p className="mt-[2px] text-xs leading-[13px] text-[#4B5468]">{t(`${K}.yourPostingsHint`)}</p>
          </div>

          <div className="flex flex-col gap-[6px]">
            {postings.map((p) => (
              <div
                key={p.title}
                className={`flex flex-col gap-[4px] rounded-[8px] border px-[8px] py-[6px] transition-colors duration-700 ${
                  p.justApproved && sinceApproval < 3 ? "border-brand-teal-dark/40 bg-brand-teal-page" : "border-black/[0.06] bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-[6px]">
                  <span className="truncate text-xs text-[#141B2E]">{p.title}</span>
                  <span
                    key={p.tone}
                    className={`mock-bump flex shrink-0 items-center gap-[3px] rounded-full px-[6px] py-[1.5px] text-xs ${TONE[p.tone].bg} ${TONE[p.tone].text}`}
                  >
                    {p.justApproved && <CheckIcon className="h-[8px] w-[8px]" />}
                    {t(`${K}.status.${p.tone}`)}
                  </span>
                </div>
                <p className="truncate text-xs text-[#9AA3B2]">{p.meta}</p>
                <p className="text-xs text-[#4B5468]">{p.salary}</p>
                <div className="flex items-center gap-[10px] text-xs text-[#9AA3B2]">
                  <span className="flex items-center gap-[3px]">
                    <EyeIcon className="h-[10px] w-[10px]" />
                    <Live value={p.views} />
                  </span>
                  <span className="flex items-center gap-[3px]">
                    <UsersIcon className="h-[10px] w-[10px]" />
                    {p.applicants === null ? (
                      <span className="ai-fill-shimmer inline-block h-[10px] w-[16px] rounded-full align-middle" />
                    ) : (
                      <Live value={p.applicants} />
                    )}
                  </span>
                  {p.trend && (
                    <span className="ml-auto flex items-center gap-[3px] rounded-full bg-[#E7F6EC] px-[6px] py-[1.5px] text-xs text-[#2F9E56]">
                      <TrendUpIcon className="h-[9px] w-[9px]" />
                      <Live value={p.trend} />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
