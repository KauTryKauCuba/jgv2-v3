import { useTranslation } from "react-i18next";
import { AnimatedRibbon } from "@/components/landing/animated-ribbon";
import { Footer } from "@/components/landing/footer";
import { Navbar } from "@/components/landing/navbar";
import { LEGAL_DOCS, type LegalDocId } from "@/content/legal";
import { gradientFrameClass } from "@/lib/landing/form-styles";

type Role = "employer" | "jobseeker";

/** "2026-10" → "October 2026", in the reader's language. */
function formatMonth(month: string, language: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(language, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year ?? 1970, (monthNumber ?? 1) - 1, 1)),
  );
}

/**
 * Privacy, Security and Terms & Conditions, one page per side like the About
 * and Release notes pages: /employer/... in teal on mint, /jobseeker/... in
 * gold on cream. The document is the same for both sides; only the colour
 * changes. Structure is in src/content/legal.ts, text under landing.legal.
 */
export function LegalPageView({ role, doc }: { role: Role; doc: LegalDocId }) {
  const { t, i18n } = useTranslation("common");
  const k = `landing.legal.${doc}`;
  const gold = role === "jobseeker";
  const accent = gold ? "gold" : "teal";
  const dateText = gold ? "text-brand-gold-dark" : "text-brand-teal-dark";
  const bullet = gold ? "bg-brand-gold-dark" : "bg-brand-teal-dark";
  const { lastUpdated, sections } = LEGAL_DOCS[doc];

  return (
    <main
      className={`flex min-h-[100svh] flex-col overflow-x-clip pb-[92px] ${gold ? "bg-brand-gold-page" : "bg-brand-teal-page"}`}
    >
      <Navbar pageRole={role} />

      {/* Same distance from the navbar as the About page's heading. */}
      <div className="shell pt-[clamp(2px,calc(9vh-46px),50px)]">
        <div className="mx-auto max-w-[720px] text-center">
          <span className="inline-flex items-center rounded-full bg-[#F1F4F8] px-[14px] py-[7px] text-xs text-[#4B5468]">
            {t(`landing.legal.eyebrow.${role}`)}
          </span>
          <h1
            className="mt-[16px] font-sans font-semibold text-[#141B2E]"
            style={{ fontSize: "clamp(30px, 3.6vw, 48px)", lineHeight: 1.1, letterSpacing: "-0.02em" }}
          >
            {t(`${k}.title`)}
          </h1>
          <p className={`mt-[10px] text-xs tracking-[0.04em] uppercase ${dateText}`}>
            {t("landing.legal.lastUpdated", { date: formatMonth(lastUpdated, i18n.resolvedLanguage ?? "en") })}
          </p>
          <p className="mx-auto mt-[16px] max-w-[560px] text-sm leading-[24px] text-[#4B5468]">{t(`${k}.intro`)}</p>
        </div>

        <div className={`mx-auto mt-[48px] max-w-[760px] animate-fade-in-up ${gradientFrameClass(accent)}`}>
          <div className="flex flex-col gap-[28px] rounded-[19px] bg-white p-[20px] sm:p-[32px]">
            {sections.map((section) => {
              const sk = `${k}.sections.${section.id}`;
              return (
                <section key={section.id}>
                  <h2 className="text-base font-semibold text-[#141B2E]">{t(`${sk}.heading`)}</h2>
                  {Array.from({ length: section.paragraphs }, (_, n) => (
                    <p key={`p${n}`} className="mt-[8px] text-sm leading-[22px] text-[#4B5468]">
                      {t(`${sk}.p${n + 1}`)}
                    </p>
                  ))}
                  {section.bullets > 0 && (
                    <ul className="mt-[8px] flex flex-col gap-[7px]">
                      {Array.from({ length: section.bullets }, (_, n) => (
                        <li key={`b${n}`} className="flex gap-[8px] text-sm leading-[21px] text-[#4B5468]">
                          <span aria-hidden className={`mt-[8px] h-[4px] w-[4px] shrink-0 rounded-full ${bullet}`} />
                          {t(`${sk}.b${n + 1}`)}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1" />
      <div className="mt-[64px]">
        <Footer accent={accent} />
      </div>
      <div className="-mb-[92px] h-[80px] overflow-hidden sm:h-[110px] lg:h-[150px]">
        <AnimatedRibbon accent={accent} />
      </div>
    </main>
  );
}
