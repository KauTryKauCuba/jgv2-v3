import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HeartIcon } from "@/components/landing/icons";
import { orpc, queryClient } from "@/utils/orpc";

/**
 * The redesign's SaveJobButton: the heart that saves / un-saves a job.
 * Flips at once, then flips back if saving fails. `variant="icon"` is the
 * circle for cards; `variant="pill"` adds a "Save" / "Saved" label. Safe
 * inside a clickable card: it never triggers the card.
 */
export function SaveJobButton({
  jobId,
  initialSaved,
  variant = "icon",
  onChange,
  className = "",
}: {
  jobId: string;
  initialSaved: boolean;
  variant?: "icon" | "pill";
  onChange?: (saved: boolean) => void;
  className?: string;
}) {
  const { t } = useTranslation("common");
  const [saved, setSaved] = useState(initialSaved);
  const save = useMutation({ ...orpc.job.bookmark.save.mutationOptions(), meta: { suppressErrorToast: true } });
  const unsave = useMutation({ ...orpc.job.bookmark.unsave.mutationOptions(), meta: { suppressErrorToast: true } });
  const busy = save.isPending || unsave.isPending;

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const next = !saved;
    setSaved(next);
    try {
      await (next ? save : unsave).mutateAsync({ jobId });
      queryClient.invalidateQueries({ queryKey: orpc.job.bookmark.listSavedJobs.key() });
      onChange?.(next);
    } catch {
      setSaved(!next);
    }
  }

  const label = saved ? t("dashboard.saveJob.remove") : t("dashboard.saveJob.save");
  const tone = saved ? "text-[#E5484D]" : "text-[#4B5468]";

  if (variant === "pill") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-pressed={saved}
        aria-label={label}
        className={`flex h-[42px] items-center gap-[8px] rounded-full border border-black/[0.1] bg-white px-[18px] text-sm text-[#141B2E] transition-colors hover:bg-black/[0.03] ${className}`}
      >
        <HeartIcon filled={saved} className={`h-[15px] w-[15px] ${tone}`} />
        {saved ? t("dashboard.saveJob.saved") : t("dashboard.saveJob.saveShort")}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={label}
      title={label}
      className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-black/[0.1] bg-white transition-colors hover:bg-black/[0.03] ${className}`}
    >
      <HeartIcon filled={saved} className={`h-[15px] w-[15px] ${tone}`} />
    </button>
  );
}
