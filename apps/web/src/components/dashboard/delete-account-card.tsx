import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Modal } from "@/components/landing/modal";
import { authClient } from "@/lib/auth-client";
import { gradientFrameClass, inputClass as formInputClass, textareaClass } from "@/lib/landing/form-styles";
import { orpc } from "@/utils/orpc";

const inputClass = formInputClass("teal");

/**
 * The redesign's DeleteAccountCard ("Danger zone"), on v1's account
 * deletion (auth.requestAccountDeletion and friends):
 * - It's a soft delete, not the redesign's permanent one: the account is
 *   closed and can't sign in again, but the company, its postings and
 *   applicants stay.
 * - A company member's deletion needs approval first (whoever registered
 *   the company → a JobGiga admin; HR staff → the HR manager; panelists →
 *   HR staff), so the card shows the request and lets them cancel it.
 * - v1's optional reason is asked in the dialog.
 */
export function DeleteAccountCard({ email }: { email: string }) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const statusQuery = useQuery({ ...orpc.auth.getAccountDeletionStatus.queryOptions(), meta: { suppressErrorToast: true } });
  const requestMutation = useMutation({ ...orpc.auth.requestAccountDeletion.mutationOptions(), meta: { suppressErrorToast: true } });
  const cancelMutation = useMutation({ ...orpc.auth.cancelAccountDeletion.mutationOptions(), meta: { suppressErrorToast: true } });

  const [open, setOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const emailMatches = confirmEmail.trim().toLowerCase() === email.toLowerCase();
  const deleting = requestMutation.isPending;
  const status = statusQuery.data?.status;
  const request = statusQuery.data?.request ?? null;
  const pending = status === "pending" && request;

  function closeModal() {
    if (deleting) return;
    setOpen(false);
    setConfirmEmail("");
    setReason("");
    setError(null);
  }

  async function handleDelete() {
    if (!emailMatches) return;
    setError(null);
    try {
      const result = await requestMutation.mutateAsync({ confirm: true, reason: reason.trim() || undefined });
      if (result.status === "completed") {
        // Deleted straight away (no company): the session is already gone.
        await authClient.signOut().catch(() => {});
        queryClient.clear();
        toast.success(t("dashboard.deleteAccount.deletedToast"));
        navigate({ to: "/employer" });
        return;
      }
      setOpen(false);
      setConfirmEmail("");
      setReason("");
      toast.success(t("dashboard.deleteAccount.requestedToast"));
      void queryClient.invalidateQueries({ queryKey: orpc.auth.getAccountDeletionStatus.key() });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("dashboard.deleteAccount.error"));
    }
  }

  async function handleCancelRequest() {
    try {
      await cancelMutation.mutateAsync({});
      toast.success(t("dashboard.deleteAccount.canceledToast"));
      void queryClient.invalidateQueries({ queryKey: orpc.auth.getAccountDeletionStatus.key() });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("dashboard.deleteAccount.error"));
    }
  }

  const approver = (role: string) => t(`dashboard.deleteAccount.approver.${role === "superadmin" ? "admin" : role === "hr manager" ? "hrManager" : "hrStaff"}`);

  return (
    <>
      <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`} style={{ animationDelay: "120ms" }}>
        <div className="flex flex-col gap-[10px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
          <p className="text-sm text-[#141B2E]">{t("dashboard.deleteAccount.title")}</p>
          {pending ? (
            <>
              <p className="text-xs text-[#4B5468]">
                {t("dashboard.deleteAccount.pendingBody", {
                  date: new Date(/[zZ]$/.test(request.createdAt) ? request.createdAt : `${request.createdAt.replace(" ", "T")}Z`).toLocaleDateString(
                    "en-GB",
                    { day: "numeric", month: "short", year: "numeric" },
                  ),
                  approver: approver(request.requiredApproverRole),
                })}
              </p>
              <button
                type="button"
                onClick={handleCancelRequest}
                disabled={cancelMutation.isPending}
                className="mt-[4px] flex h-[36px] items-center justify-center rounded-full border border-black/[0.1] text-sm text-[#141B2E] hover:bg-black/[0.03] disabled:opacity-60"
              >
                {t("dashboard.deleteAccount.cancelRequest")}
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-[#4B5468]">{t("dashboard.deleteAccount.body")}</p>
              {status === "rejected" && request && (
                <p className="rounded-[10px] bg-[#FBF3F1] px-[10px] py-[8px] text-xs text-[#A66A61]">
                  {request.rejectionReason
                    ? t("dashboard.deleteAccount.rejectedWithReason", { reason: request.rejectionReason })
                    : t("dashboard.deleteAccount.rejected")}
                </p>
              )}
              <button
                type="button"
                onClick={() => setOpen(true)}
                disabled={statusQuery.isPending}
                className="mt-[4px] flex h-[36px] items-center justify-center rounded-full border border-red-200 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                {t("dashboard.deleteAccount.button")}
              </button>
            </>
          )}
        </div>
      </div>

      {open && (
        <Modal onClose={closeModal} ariaLabel={t("dashboard.deleteAccount.modalLabel")}>
          <p className="text-lg font-semibold text-[#141B2E]">{t("dashboard.deleteAccount.modalTitle")}</p>
          <p className="mt-[8px] text-sm text-[#4B5468]">{t("dashboard.deleteAccount.modalBody")}</p>
          <label htmlFor="deleteAccountReason" className="mt-[14px] block text-xs text-[#4B5468]">
            {t("dashboard.deleteAccount.reasonLabel")}
          </label>
          <textarea
            id="deleteAccountReason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={2}
            className={`mt-[6px] ${textareaClass("teal")}`}
          />
          <p className="mt-[14px] text-xs text-[#4B5468]">
            {t("dashboard.deleteAccount.typeToConfirmBefore")}
            <span className="text-[#141B2E]">{email}</span>
            {t("dashboard.deleteAccount.typeToConfirmAfter")}
          </p>
          <input
            type="email"
            value={confirmEmail}
            onChange={(e) => setConfirmEmail(e.target.value)}
            placeholder={email}
            aria-label={t("dashboard.deleteAccount.confirmLabel")}
            className={`mt-[6px] ${inputClass}`}
            // biome-ignore lint/a11y/noAutofocus: same as the redesign's dialog.
            autoFocus
          />
          {error && <p className="mt-[8px] text-xs text-red-500">{error}</p>}
          <div className="mt-[16px] flex justify-end gap-[8px]">
            <button
              type="button"
              onClick={closeModal}
              disabled={deleting}
              className="flex h-[38px] items-center justify-center rounded-full border border-black/[0.1] px-[16px] text-sm text-[#141B2E] hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("dashboard.deleteAccount.cancel")}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!emailMatches || deleting}
              className="flex h-[38px] items-center justify-center rounded-full bg-red-600 px-[16px] text-sm text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deleting ? t("dashboard.deleteAccount.deleting") : t("dashboard.deleteAccount.button")}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
