import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Centered dialog rendered into <body>, so `fixed` is relative to the screen
 * even when opened from inside an animated or transformed card.
 */
export function Modal({
  onClose,
  ariaLabel,
  wide = false,
  large = false,
  children,
}: {
  /** Omit to disable backdrop-click and Escape-to-close. */
  onClose?: () => void;
  ariaLabel?: string;
  /** Wider, no padding — for content that runs edge to edge (e.g. an image). */
  wide?: boolean;
  /** Roomy, scrolls inside itself — for forms. */
  large?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const close = onClose;
    if (!close) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
        className={`w-full rounded-[24px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-16px_rgba(0,0,0,0.24)] ${
          // Capped by the screen height too, so a square image always fits.
          wide
            ? "max-w-[min(554px,calc(100svh-64px))] overflow-hidden"
            : large
              ? "max-h-[calc(100svh-48px)] max-w-[680px] overflow-y-auto p-[22px]"
              : "max-w-[380px] p-[22px]"
        }`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
