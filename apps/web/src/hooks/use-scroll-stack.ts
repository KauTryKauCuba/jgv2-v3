import { useEffect, useRef, useState } from "react";

/**
 * How far an element has scrolled past the top of the viewport, as 0–1 over
 * `distance` px. Drives the hero badges' converge-behind-the-ribbon effect.
 */
export function useScrollStack(distance = 420) {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let ticking = false;
    function measure() {
      ticking = false;
      const top = el!.getBoundingClientRect().top;
      setProgress(Math.min(1, Math.max(0, -top / distance)));
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(measure);
    }

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [distance]);

  return { ref, progress };
}
