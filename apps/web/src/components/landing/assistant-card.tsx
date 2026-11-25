import { ScrollWidthBackground } from "./scroll-width-background";

type Bullet = { title: string; detail?: string };

/**
 * A landing page feature section: numbered eyebrow, headline and bullet list
 * beside a product mockup. `reverse` puts the mockup on the left; `band`
 * paints a full-width colour band behind the section.
 */
export function AssistantCard({
  step,
  eyebrow,
  headline,
  bullets,
  visual,
  reverse = false,
  accent = "teal",
  band,
}: {
  /** Shown in a small circle before the eyebrow when sections read as a journey. */
  step?: number;
  eyebrow: string;
  headline: string;
  bullets: Bullet[];
  visual: React.ReactNode;
  reverse?: boolean;
  /** Employer = teal, Jobseeker = gold. */
  accent?: "teal" | "gold";
  band?: { color: string; gradient?: string; startWidth?: number; durationMs?: number; fadeEdges?: boolean };
}) {
  const copy = (
    <div>
      <span
        className={`inline-flex items-center gap-[8px] rounded-full bg-[#F1F4F8] py-[7px] pr-[14px] text-xs text-[#4B5468] ${
          step ? "pl-[7px]" : "pl-[14px]"
        }`}
      >
        {step && (
          <span
            className={`flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${
              accent === "gold" ? "bg-brand-gold-dark" : "bg-brand-teal-dark"
            }`}
          >
            {step}
          </span>
        )}
        {eyebrow}
      </span>

      <h2
        className="mt-[20px] font-sans font-semibold text-[#141B2E]"
        style={{ fontSize: "clamp(28px,3.4vw,40px)", lineHeight: 1.12, letterSpacing: "-0.02em" }}
      >
        {headline}
      </h2>

      <div className="mt-[28px] border-t border-black/[0.08]">
        {bullets.map((b) => (
          <div key={b.title} className="border-b border-black/[0.08] py-[20px]">
            <p className="text-sm text-[#141B2E]">{b.title}</p>
            {b.detail && <p className="mt-[6px] text-sm leading-[21px] text-[#4B5468]">{b.detail}</p>}
          </div>
        ))}
      </div>
    </div>
  );

  // The mockup stacks its cards on narrow screens and is taller than 4:3
  // there, so the fixed ratio only applies on wide screens.
  const visualBlock = (
    <div className="relative w-full overflow-hidden rounded-[28px] lg:aspect-[4/3]">
      <div className="lg:absolute lg:inset-0">{visual}</div>
    </div>
  );

  const section = (
    <div className="relative z-10 mx-auto w-[1300px] max-w-[calc(100%-40px)] py-[clamp(40px,7vh,80px)]">
      <div
        className={`grid items-center gap-[48px] lg:gap-[64px] ${
          reverse ? "lg:grid-cols-[3fr_1fr]" : "lg:grid-cols-[1fr_3fr]"
        }`}
      >
        {reverse ? (
          <>
            {visualBlock}
            {copy}
          </>
        ) : (
          <>
            {copy}
            {visualBlock}
          </>
        )}
      </div>
    </div>
  );

  return band ? (
    <ScrollWidthBackground
      color={band.color}
      gradient={band.gradient}
      fadeEdges={band.fadeEdges}
      startWidth={band.startWidth}
      durationMs={band.durationMs}
    >
      {section}
    </ScrollWidthBackground>
  ) : (
    section
  );
}
