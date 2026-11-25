import { useTranslation } from "react-i18next";
import { AnimatedRibbon } from "@/components/landing/animated-ribbon";
import { Footer } from "@/components/landing/footer";
import { Navbar } from "@/components/landing/navbar";
import { RELEASE_NOTES, type ReleaseNoteRole } from "@/content/release-notes";
import { gradientFrameClass } from "@/lib/landing/form-styles";

/** "2026-11" → "November 2026", in the reader's language. */
function formatMonth(month: string, language: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(language, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year ?? 1970, (monthNumber ?? 1) - 1, 1)),
  );
}

/**
 * Release notes, one page per side like the About pages: /employer/release-notes
 * in teal on mint, /jobseeker/release-notes in gold on cream. The list of
 * releases is in src/content/release-notes.ts; the text is in the translation
 * files under landing.releaseNotes.{role}.
 */
export function ReleaseNotesView({ role }: { role: ReleaseNoteRole }) {
  const { t, i18n } = useTranslation("common");
  const k = `landing.releaseNotes.${role}`;
  const gold = role === "jobseeker";
  const accent = gold ? "gold" : "teal";
  const dateText = gold ? "text-brand-gold-dark" : "text-brand-teal-dark";
  const bullet = gold ? "bg-brand-gold-dark" : "bg-brand-teal-dark";
  const language = i18n.resolvedLanguage ?? "en";

  return (
    <main
      className={`flex min-h-[100svh] flex-col overflow-x-clip pb-[92px] ${gold ? "bg-brand-gold-page" : "bg-brand-teal-page"}`}
    >
      <Navbar pageRole={role} />

      {/* Same distance from the navbar as the About page's heading. */}
      <div className="shell pt-[clamp(2px,calc(9vh-46px),50px)]">
        <div className="mx-auto max-w-[720px] text-center">
          <span className="inline-flex items-center rounded-full bg-[#F1F4F8] px-[14px] py-[7px] text-xs text-[#4B5468]">
            {t(`${k}.eyebrow`)}
          </span>
          <h1
            className="mt-[16px] font-sans font-semibold text-[#141B2E]"
            style={{ fontSize: "clamp(30px, 3.6vw, 48px)", lineHeight: 1.1, letterSpacing: "-0.02em" }}
          >
            {t(`${k}.headline`)}
          </h1>
          <p className="mx-auto mt-[16px] max-w-[560px] text-sm leading-[24px] text-[#4B5468]">{t(`${k}.intro`)}</p>
        </div>

        <div className="mx-auto mt-[48px] flex max-w-[760px] flex-col gap-[16px]">
          {RELEASE_NOTES[role].map((release, i) => {
            const rk = `${k}.releases.${release.id}`;
            return (
              <article
                key={release.id}
                className={`animate-fade-in-up ${gradientFrameClass(accent)}`}
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div className="rounded-[19px] bg-white p-[20px] sm:p-[28px]">
                  <p className={`text-xs tracking-[0.04em] uppercase ${dateText}`}>
                    <time dateTime={release.month}>{formatMonth(release.month, language)}</time>
                  </p>
                  <h2 className="mt-[4px] text-base font-semibold text-[#141B2E]">{t(`${rk}.title`)}</h2>
                  <ul className="mt-[12px] flex flex-col gap-[8px]">
                    {Array.from({ length: release.itemCount }, (_, n) => (
                      <li key={n} className="flex gap-[8px] text-sm leading-[21px] text-[#4B5468]">
                        <span aria-hidden className={`mt-[8px] h-[4px] w-[4px] shrink-0 rounded-full ${bullet}`} />
                        {t(`${rk}.item${n + 1}`)}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
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
