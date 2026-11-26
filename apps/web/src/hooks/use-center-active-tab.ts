import { useEffect, useRef } from "react";

// The redesign's useCenterActiveTab. On narrow screens the dashboard sidebar
// becomes a sideways-scrolling tab bar; this scrolls the current page's tab
// into the middle so it doesn't start off-screen.
export function useCenterActiveTab<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const bar = ref.current;
    if (!bar || bar.scrollWidth <= bar.clientWidth) return;
    const active = bar.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) return;
    const b = bar.getBoundingClientRect();
    const a = active.getBoundingClientRect();
    bar.scrollLeft += a.left + a.width / 2 - (b.left + b.width / 2);
  }, []);
  return ref;
}
