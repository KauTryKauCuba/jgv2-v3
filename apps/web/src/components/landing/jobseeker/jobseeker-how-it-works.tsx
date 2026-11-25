import { useTranslation } from "react-i18next";
import { CheckCircleIcon, UploadIcon } from "../icons";
import { SiriOrb } from "../siri-orb";

const K = "landing.jobseeker.howItWorks";

function UploadVisual() {
  return (
    <div className="flex h-[96px] w-full flex-col items-center justify-center gap-[6px] rounded-[14px] border border-dashed border-[#D7DCE4] bg-[#FFFDF5]">
      <span className="float-bob flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white text-brand-gold-dark shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        <UploadIcon className="h-[14px] w-[14px]" />
      </span>
      <span className="text-xs text-[#9AA3B2]">Resume.pdf</span>
    </div>
  );
}

function FillVisual() {
  const { t } = useTranslation("common");
  return (
    <div className="flex h-[96px] w-full flex-col justify-center gap-[8px] rounded-[14px] border border-[#EAEDF2] bg-white p-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-[6px]">
        <SiriOrb className="h-[14px] w-[14px]" active />
        <span className="text-xs text-[#4B5468]">{t(`${K}.filling`)}</span>
      </div>
      <div className="flex flex-col gap-[5px]">
        <div className="ai-fill-shimmer h-[8px] rounded-full" style={{ width: "90%" }} />
        <div className="ai-fill-shimmer h-[8px] rounded-full" style={{ width: "70%", animationDelay: "0.15s" }} />
        <div className="ai-fill-shimmer h-[8px] rounded-full" style={{ width: "50%", animationDelay: "0.3s" }} />
      </div>
    </div>
  );
}

function ApplyVisual() {
  const { t } = useTranslation("common");
  return (
    <div className="flex h-[96px] w-full flex-col items-center justify-center gap-[8px] rounded-[14px] border border-[#EAEDF2] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <span className="ai-fill-pulse flex h-[34px] items-center justify-center gap-[6px] rounded-full bg-brand-gold px-[16px] text-xs text-[#141B2E]">
        <CheckCircleIcon className="h-[13px] w-[13px]" />
        {t(`${K}.applied`)}
      </span>
      <span className="text-xs text-[#9AA3B2]">{t(`${K}.sentInSeconds`)}</span>
    </div>
  );
}

const STEPS = [
  { id: "upload", Visual: UploadVisual },
  { id: "fill", Visual: FillVisual },
  { id: "apply", Visual: ApplyVisual },
] as const;

function ArrowConnector() {
  return (
    <span className="hidden shrink-0 items-center justify-center pt-[38px] text-[#D7DCE4] sm:flex" aria-hidden>
      <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
        <path d="M0 6h17M12 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** "Applying is this easy": upload → AI fills your profile → apply in one click. */
export function JobseekerHowItWorks() {
  const { t } = useTranslation("common");

  return (
    <div className="shell relative z-[1] pt-[clamp(32px,5vh,56px)] pb-[64px]">
      <div className="mx-auto max-w-[560px] text-center">
        {/* Block wrapper so the pill and the inline-block heading never share a line. */}
        <div>
          <span className="inline-flex items-center rounded-full bg-brand-gold-soft px-[14px] py-[7px] text-xs text-brand-gold-dark">
            {t(`${K}.eyebrow`)}
          </span>
        </div>
        <h2
          className="mt-[16px] font-sans font-semibold text-[#141B2E]"
          style={{
            fontSize: "clamp(34px, 4vw, 56px)",
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            backgroundImage: "var(--brand-gradient-jobseeker)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            display: "inline-block",
            paddingBottom: "0.08em",
          }}
        >
          {t(`${K}.title`)}
        </h2>
        <p className="mx-auto mt-[10px] max-w-[420px] text-sm leading-[22px] text-[#4B5468]">{t(`${K}.subtitle`)}</p>
      </div>

      <div className="mx-auto mt-[40px] flex max-w-[1040px] flex-col items-stretch gap-[20px] sm:flex-row sm:items-start">
        {STEPS.map(({ id, Visual }, i) => (
          <div key={id} className="flex flex-1 items-start gap-[20px]">
            <div className="flex flex-1 flex-col items-center text-center">
              <Visual />
              <span className="mt-[16px] flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brand-gold text-xs text-[#141B2E]">
                {i + 1}
              </span>
              <h3 className="mt-[8px] text-sm font-semibold text-[#141B2E]">{t(`${K}.steps.${id}.title`)}</h3>
              <p className="mt-[4px] text-xs leading-[18px] text-[#4B5468]">{t(`${K}.steps.${id}.detail`)}</p>
            </div>
            {i < STEPS.length - 1 && <ArrowConnector />}
          </div>
        ))}
      </div>
    </div>
  );
}
