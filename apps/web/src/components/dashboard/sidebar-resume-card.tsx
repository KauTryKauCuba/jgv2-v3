import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileIcon, UploadIcon, XIcon } from "@/components/landing/icons";
import { SiriOrb } from "@/components/landing/siri-orb";
import { showComingSoon } from "@/lib/coming-soon";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { orpc, queryClient } from "@/utils/orpc";

const MAX_BYTES = 10 * 1024 * 1024;

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The redesign's SidebarResumeCard: under the jobseeker dashboard's sidebar.
 * Uploading reads the resume and fills in whatever the profile is still
 * missing (jobseeker.uploadResume); Reset forgets the saved file.
 */
export function SidebarResumeCard({ initialResume }: { initialResume: { fileName: string; fileSize: number | null } | null }) {
  const { t } = useTranslation("common");
  const inputRef = useRef<HTMLInputElement>(null);
  const [resume, setResume] = useState(initialResume);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const upload = useMutation(orpc.jobseeker.uploadResume.mutationOptions());
  const remove = useMutation(orpc.jobseeker.removeResume.mutationOptions());
  const parsing = upload.isPending;

  useEffect(() => setResume(initialResume), [initialResume]);

  useEffect(() => {
    if (!parsing) return;
    const startedAt = Date.now();
    const interval = setInterval(() => setElapsedMs(Date.now() - startedAt), 100);
    return () => clearInterval(interval);
  }, [parsing]);

  async function uploadAndParse(file: File) {
    if (file.size > MAX_BYTES) {
      setError(t("dashboard.resume.tooLarge"));
      return;
    }
    setError(null);
    setStatus(null);
    setElapsedMs(0);
    try {
      const data = await upload.mutateAsync({ resume: file });
      setResume({ fileName: data.fileName, fileSize: data.fileSize });
      setStatus(data.filledCount > 0 ? t("dashboard.resume.updated") : t("dashboard.resume.nothingNew"));
      queryClient.invalidateQueries({ queryKey: orpc.jobseeker.myResume.key() });
      queryClient.invalidateQueries({ queryKey: orpc.auth.me.key() });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dashboard.resume.couldntRead"));
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleFiles(files: FileList | null) {
    const picked = files?.[0];
    if (picked) uploadAndParse(picked);
  }

  async function handleReset() {
    setError(null);
    setStatus(null);
    try {
      await remove.mutateAsync({});
      setResume(null);
      queryClient.invalidateQueries({ queryKey: orpc.jobseeker.myResume.key() });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dashboard.resume.couldntRemove"));
    }
  }

  const reading = t("dashboard.resume.reading", { seconds: (elapsedMs / 1000).toFixed(1) });

  return (
    <div className={`w-full ${gradientFrameClass("gold")}`}>
      <div className="rounded-[19px] bg-white p-[16px] text-left">
        <h2 className="text-xs font-semibold text-[#141B2E]">{t("dashboard.resume.title")}</h2>
        <p className="mt-[3px] text-xs leading-[16px] text-[#4B5468]">{t("dashboard.resume.subtitle")}</p>

        <input ref={inputRef} type="file" accept=".pdf,.docx" className="hidden" onChange={(e) => handleFiles(e.target.files)} />

        {resume ? (
          <div className="mt-[12px] flex items-center gap-[8px] rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB] p-[8px]">
            <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-white text-brand-gold-dark shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
              <FileIcon className="h-[14px] w-[14px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-[#141B2E]">{resume.fileName}</p>
              <p className="text-xs text-[#9AA3B2]">
                {parsing ? reading : resume.fileSize != null ? formatSize(resume.fileSize) : null}
              </p>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              handleFiles(e.dataTransfer.files);
            }}
            disabled={parsing}
            className={`mt-[12px] flex w-full flex-col items-center justify-center gap-[4px] rounded-[12px] border border-dashed px-[12px] py-[16px] text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              dragActive ? "border-brand-gold-dark bg-brand-gold-soft" : "border-[#D7DCE4] hover:border-brand-gold-dark hover:bg-[#F8FAFB]"
            }`}
          >
            {parsing ? (
              <>
                <SiriOrb className="h-[16px] w-[16px]" active />
                <span className="text-xs text-[#141B2E]">{reading}</span>
              </>
            ) : (
              <>
                <UploadIcon className="h-[16px] w-[16px] text-brand-gold-dark" />
                <span className="text-xs text-[#141B2E]">{t("dashboard.resume.dropHere")}</span>
                <span className="text-xs text-[#9AA3B2]">{t("dashboard.resume.fileTypes")}</span>
              </>
            )}
          </button>
        )}

        {resume && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={parsing}
            className={`mt-[8px] flex min-h-[34px] w-full items-center justify-center gap-[6px] rounded-[10px] bg-[linear-gradient(45deg,var(--color-brand-teal-dark),var(--color-brand-gold))] px-[10px] py-[7px] text-center text-sm leading-[14px] text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${
              parsing ? "ai-fill-pulse" : ""
            }`}
          >
            <SiriOrb className="h-[12px] w-[12px] shrink-0" active={parsing} />
            {t("dashboard.resume.reupload")}
          </button>
        )}

        {resume && (
          <button
            type="button"
            onClick={handleReset}
            disabled={parsing}
            aria-label={t("dashboard.resume.removeLabel")}
            className="mt-[8px] flex h-[34px] w-full items-center justify-center gap-[4px] whitespace-nowrap rounded-[10px] bg-[#F1F4F8] px-[10px] text-sm text-[#4B5468] hover:bg-black/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <XIcon className="h-[10px] w-[10px]" />
            {t("dashboard.resume.reset")}
          </button>
        )}

        {resume && (
          // TODO(route): /jobseeker/resume-review (Resume Review page).
          <button
            type="button"
            onClick={showComingSoon}
            className="mt-[8px] flex h-[34px] w-full items-center justify-center rounded-[10px] border border-brand-gold-dark/30 px-[10px] text-sm text-brand-gold-dark hover:bg-brand-gold-soft"
          >
            {t("dashboard.resume.getFeedback")}
          </button>
        )}

        {error && <p className="mt-[8px] text-xs text-red-500">{error}</p>}
        {status && !error && <p className="mt-[8px] text-xs text-brand-gold-dark">{status}</p>}
      </div>
    </div>
  );
}
