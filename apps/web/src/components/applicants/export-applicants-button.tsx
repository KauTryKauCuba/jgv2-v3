import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DownloadIcon } from "@/components/landing/icons";
import { orpc } from "@/utils/orpc";

/** Saves a downloaded file in the browser. */
function saveFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name || "Applicants.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The redesign's ExportApplicantsButton: "Export to Excel" for the
 * applicants currently shown — exactly those rows, in that order
 * (application.exportApplicants). No AI involved.
 */
export function ExportApplicantsButton({
  applicationIds,
  title,
}: {
  applicationIds: string[];
  /** Goes into the file name, e.g. "Frontend Engineer". */
  title?: string;
}) {
  const { t } = useTranslation("common");
  const exportMutation = useMutation({
    ...orpc.application.exportApplicants.mutationOptions(),
    meta: { suppressErrorToast: true },
    onSuccess: (file) => saveFile(file),
  });
  const error = exportMutation.error
    ? exportMutation.error.message || t("applicants.export.failed")
    : null;

  return (
    <span className="flex items-center gap-[8px]">
      {error && <span className="text-xs text-red-500">{error}</span>}
      <button
        type="button"
        onClick={() => exportMutation.mutate({ applicationIds, title })}
        disabled={exportMutation.isPending || applicationIds.length === 0}
        title={t("applicants.export.hint", { count: applicationIds.length })}
        className="flex h-[30px] items-center gap-[6px] rounded-full border border-black/[0.1] bg-white px-[12px] text-xs text-[#141B2E] transition-colors hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <DownloadIcon className="h-[13px] w-[13px]" />
        {exportMutation.isPending ? t("applicants.export.busy") : t("applicants.export.button")}
      </button>
    </span>
  );
}
