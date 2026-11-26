import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { AuthModal } from "../auth-modal";
import { FileIcon, UploadIcon, XIcon } from "../icons";

const ACCEPT = ".pdf,.doc,.docx";
const ACCEPTED_EXTENSIONS = ["pdf", "doc", "docx"];
const MAX_BYTES = 10 * 1024 * 1024;

// From the redesign: the picked file is handed to the onboarding form through
// sessionStorage (as a base64 data URL, which inflates size ~33% — so capped
// well under browser storage quotas), then parsed there after sign-up.
const HANDOFF_MAX_BYTES = 4 * 1024 * 1024;
export const PENDING_RESUME_KEY = "jobgiga:pendingResume";

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The jobseeker hero's resume upload: pick or drop a file, then Continue.
 * The file is checked here (type and size). Continue hands it to the
 * onboarding form (see PENDING_RESUME_KEY) and opens "Get started"; after
 * sign-up the visitor lands on onboarding, where it's parsed — the
 * redesign's flow.
 */
export function ResumeUpload() {
  const { t } = useTranslation("common");
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [showSignup, setShowSignup] = useState(false);

  function handleFiles(files: FileList | null) {
    const picked = files?.[0];
    if (!picked) return;

    // Drag and drop skips the input's `accept` filter, so check the type here too.
    const extension = picked.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setError(t("landing.jobseeker.upload.wrongType"));
      setFile(null);
      return;
    }
    if (picked.size > MAX_BYTES) {
      setError(t("landing.jobseeker.upload.tooLarge"));
      setFile(null);
      return;
    }

    setError(null);
    setFile(picked);
  }

  function handleContinue() {
    if (!file) return;
    if (file.size > HANDOFF_MAX_BYTES) {
      setShowSignup(true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        sessionStorage.setItem(
          PENDING_RESUME_KEY,
          JSON.stringify({ name: file.name, type: file.type, dataUrl: reader.result }),
        );
      } catch {
        // Storage full/unavailable — the onboarding page just starts blank.
      }
      setShowSignup(true);
    };
    reader.onerror = () => setShowSignup(true);
    reader.readAsDataURL(file);
  }

  function clear() {
    setFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={`mx-auto mt-[24px] w-full max-w-[440px] ${gradientFrameClass("gold")}`}>
      <div className="rounded-[19px] bg-white p-[16px] text-left sm:p-[22px]">
        <div>
          <h2 className="text-sm text-[#141B2E]">{t("landing.jobseeker.upload.title")}</h2>
          <p className="mt-[3px] text-xs leading-[19px] text-[#4B5468]">{t("landing.jobseeker.upload.subtitle")}</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {file ? (
          <div className="mt-[16px] flex items-center gap-[10px] rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[10px]">
            <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full bg-white text-brand-gold-dark shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
              <FileIcon className="h-[17px] w-[17px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-[#141B2E]">{file.name}</p>
              <p className="text-xs text-[#9AA3B2]">{formatSize(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={clear}
              aria-label={t("landing.jobseeker.upload.remove")}
              className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full text-[#9AA3B2] hover:bg-black/[0.05] hover:text-[#141B2E]"
            >
              <XIcon className="h-[12px] w-[12px]" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            data-db="action.uploadResume"
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
            className={`mt-[16px] flex w-full flex-col items-center justify-center gap-[6px] rounded-[14px] border border-dashed px-[16px] py-[22px] text-center transition-colors ${
              dragActive
                ? "border-brand-gold-dark bg-brand-gold-soft"
                : "border-[#D7DCE4] hover:border-brand-gold-dark hover:bg-[#F8FAFB]"
            }`}
          >
            <UploadIcon className="h-[18px] w-[18px] text-brand-gold-dark" />
            <span className="text-xs text-[#141B2E]">{t("landing.jobseeker.upload.dropzone")}</span>
            <span className="text-xs text-[#9AA3B2]">{t("landing.jobseeker.upload.formats")}</span>
          </button>
        )}

        {error && <p className="mt-[8px] text-xs text-red-500">{error}</p>}

        <button
          type="button"
          data-db="action.signUp"
          disabled={!file}
          onClick={handleContinue}
          className="mt-[16px] flex h-[38px] w-full items-center justify-center rounded-full bg-brand-gold text-sm text-[#141B2E] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("landing.jobseeker.upload.continue")}
        </button>

        {showSignup && (
          <AuthModal
            mode="get-started"
            role="jobseeker"
            onClose={() => setShowSignup(false)}
            onAuthenticated={() => setShowSignup(false)}
          />
        )}
      </div>
    </div>
  );
}
