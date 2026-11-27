import { useEffect, useState, type CSSProperties } from "react";

// The redesign's globals.css rules for this illustration (v3's stylesheets
// don't carry them), scoped by their own `job-*` class names.
const ILLUSTRATION_CSS = `
@keyframes job-typing-dot {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30% { transform: translateY(-3px); opacity: 1; }
}
.job-typing-dot { transform-box: fill-box; transform-origin: center; animation: job-typing-dot 1.2s ease-in-out infinite; }
@keyframes job-hand-type {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(4px); }
}
.job-hand-left, .job-hand-right { animation: job-hand-type 0.28s ease-in-out infinite; }
.job-hand-right { animation-delay: 0.175s; }
.job-lamp-shade { transition: fill 0.4s ease; }
.job-lamp-glow { opacity: var(--job-lit-glow, 0); transition: opacity 0.4s ease; }
@media (prefers-reduced-motion: reduce) {
  .job-typing-dot, .job-hand-left, .job-hand-right { animation: none; }
}
`;

/**
 * The redesign's JobTitleIllustration: inlines
 * public/illustrations/job-title-telecommuting.svg into the DOM (rather than
 * an <img src>) so its "..." speech-bubble dots and desk lamp can be
 * animated by the `.job-*` rules — an <img>'s internal markup isn't
 * reachable from CSS. Fetched once on mount; nothing renders until it lands.
 */
export function JobTitleIllustration({ className = "", lit = false }: { className?: string; lit?: boolean }) {
  const [markup, setMarkup] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/illustrations/job-title-telecommuting.svg")
      .then((res) => res.text())
      .then((svg) => {
        if (!cancelled) setMarkup(svg);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!markup) return null;

  return (
    <>
      <style>{ILLUSTRATION_CSS}</style>
      <div
        className={className}
        style={
          {
            "--job-lamp-color": lit ? "#FFE9A6" : "url(#jt-teal)",
            "--job-lit-glow": lit ? 1 : 0,
          } as CSSProperties
        }
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    </>
  );
}
