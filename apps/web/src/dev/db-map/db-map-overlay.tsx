import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FieldKind } from "./field-data";
import { type DbMapEntry, lookupDbKey } from "./registry";

// Development-only "DB map": a switch at the bottom of the screen that outlines
// every element marked with data-db="…" in the colour of how it maps to v1,
// and shows the details on hover. Mounted from routes/__root.tsx in dev only.
//
// To remove it: delete src/dev/db-map/, the DbMapOverlay lines in
// src/routes/__root.tsx and public/locales/{en,ms}/dev-db-map.json.
// The data-db attributes left on elements do nothing on their own; to strip
// them too, run from apps/web:
//   grep -rl 'data-db=' src | xargs sed -i '' -E 's/ data-db=("[^"]*"|\{[^}]*\})//g'
// then remove the `db` props by hand from Chip (landing/jobseeker/job-posting-details.tsx)
// and Row (landing/employer/hiring-stats.tsx). Full guide: jobgiga-v2/DB-MAP.md.

const COLOURS: Record<FieldKind | "unknown", string> = {
  both: "#1F8A4C",
  shape: "#A36A00",
  v2: "#6B4BB8",
  v1: "#B4383B",
  skip: "#8C95A6",
  unknown: "#8C95A6",
};
const KINDS: FieldKind[] = ["both", "shape", "v2", "v1"];
const STORAGE_KEY = "jg-db-map";

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

/**
 * Colours every data-db element by its kind. Text and images get the outline
 * inside their edge, so a clipping parent can't hide it; buttons and text
 * boxes get it just outside, so it still shows on a filled button.
 */
function paint(on: boolean) {
  for (const el of document.querySelectorAll<HTMLElement>("[data-db]")) {
    if (!on) {
      el.style.removeProperty("outline");
      el.style.removeProperty("outline-offset");
      continue;
    }
    const entry = lookupDbKey(el.dataset.db ?? "");
    const colour = COLOURS[entry?.kind ?? "unknown"];
    el.style.setProperty("outline", `2px ${entry?.kind === "v2" || !entry ? "dashed" : "solid"} ${colour}`, "important");
    const control = el.matches("button, input, select, textarea, a");
    el.style.setProperty("outline-offset", control ? "2px" : "-2px", "important");
  }
}

export function DbMapOverlay() {
  const { t } = useTranslation("dev-db-map");
  const [on, setOn] = useState(readStored);
  const [hover, setHover] = useState<{ dbKey: string; entry?: DbMapEntry; x: number; y: number } | null>(null);
  const [count, setCount] = useState(0);

  // Keep outlines on elements as pages re-render (filters, carousels, routes).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    } catch {
      // Private mode: the switch just won't be remembered.
    }
    const update = () => {
      paint(on);
      setCount(document.querySelectorAll("[data-db]").length);
    };
    update();
    if (!on) return;
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      paint(false);
    };
  }, [on]);

  useEffect(() => {
    if (!on) {
      setHover(null);
      return;
    }
    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>("[data-db]");
      if (!el) return setHover(null);
      const dbKey = el.dataset.db ?? "";
      setHover({ dbKey, entry: lookupDbKey(dbKey), x: e.clientX, y: e.clientY });
    };
    document.addEventListener("pointermove", onMove);
    return () => document.removeEventListener("pointermove", onMove);
  }, [on]);

  return (
    <>
      <div className="fixed bottom-3 left-1/2 z-[9999] flex -translate-x-1/2 flex-col items-center gap-2 font-sans">
        {on && (
          <div className="flex max-w-[calc(100vw-24px)] flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-xl border border-[#DFE7E3] bg-white/95 px-3 py-2 text-[11.5px] text-[#4B5468] shadow-lg">
            {KINDS.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <span
                  className="size-3 rounded-[3px]"
                  style={{ outline: `2px ${k === "v2" ? "dashed" : "solid"} ${COLOURS[k]}`, outlineOffset: -2 }}
                />
                {t(`kinds.${k}`)}
              </span>
            ))}
            <span className="text-[#8C95A6]">{t("hint")}</span>
          </div>
        )}
        <button
          type="button"
          aria-pressed={on}
          onClick={() => setOn((v) => !v)}
          className={`rounded-full px-4 py-2 text-xs font-semibold shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-teal-dark ${
            on ? "bg-brand-ink text-white" : "border border-[#DFE7E3] bg-white text-brand-ink"
          }`}
        >
          {on ? t("hide", { count }) : t("show")}
        </button>
      </div>

      {on && hover && <HoverCard {...hover} />}
    </>
  );
}

function HoverCard({ dbKey, entry, x, y }: { dbKey: string; entry?: DbMapEntry; x: number; y: number }) {
  const { t } = useTranslation("dev-db-map");
  const width = 320;
  // Keep the card on screen: flip left/up near the right and bottom edges.
  const left = Math.max(8, Math.min(x + 14, window.innerWidth - width - 8));
  const top = y + 220 > window.innerHeight ? Math.max(8, y - 200) : y + 16;
  const colour = COLOURS[entry?.kind ?? "unknown"];

  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[10000] flex flex-col gap-1.5 rounded-xl border bg-white p-3 text-xs text-[#141B2E] shadow-xl"
      style={{ left, top, width, borderColor: colour }}
    >
      <span className="text-[11.5px] font-semibold" style={{ color: colour }}>
        {entry ? t(entry.page ? `pageKinds.${entry.kind}` : `kinds.${entry.kind}`) : t("unknown")}
      </span>
      <Line label={entry?.page ? t("v1Page") : entry?.v3 ? t("v1Only") : t("v1")} value={entry?.v1 ?? dbKey} plain={entry?.page} />
      <Line label={entry?.page ? t("v3Page") : t("v2")} value={entry?.v2 ?? "—"} plain={entry?.page} />
      {entry?.v3 && <Line label={t("v3")} value={entry.v3} />}
      {entry?.api && <Line label={t("api")} value={entry.api} />}
      {entry?.v3Api && <Line label={t("v3Api")} value={entry.v3Api} />}
      {entry?.note && <p className="text-[#4B5468]">{entry.note}</p>}
    </div>
  );
}

/** One label + value line. Field names are monospace; page descriptions (`plain`) are normal text. */
function Line({ label, value, plain = false }: { label: string; value: string; plain?: boolean }) {
  return (
    <p className="flex gap-2">
      <span className="w-[72px] shrink-0 text-[#8C95A6]">{label}</span>
      <span className={`min-w-0 break-words ${plain ? "" : "font-mono text-[11.5px]"}`}>{value}</span>
    </p>
  );
}
