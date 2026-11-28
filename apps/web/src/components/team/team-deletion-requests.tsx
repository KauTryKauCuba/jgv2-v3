import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Modal } from "@/components/landing/modal";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { orpc } from "@/utils/orpc";

type DeletionRequest = Awaited<ReturnType<typeof orpc.team.listDeletionRequests.call>>["requests"][number];

/**
 * v1's company-side account deletion review (team.listDeletionRequests /
 * team.reviewDeletion): teammates asking to close their account, for the
 * person who may approve them (an Owner approves Admins and Hiring managers,
 * an Admin approves Panel members). The redesign deletes accounts on the
 * spot, so it has no screen for this — it's shown in the redesign's card
 * style on the Team page, and only when there are requests (the same pattern
 * as the superadmin's Employers page).
 */
export function TeamDeletionRequests() {
  const { t, i18n } = useTranslation("common");
  const queryClient = useQueryClient();
  const listQuery = useQuery({ ...orpc.team.listDeletionRequests.queryOptions(), meta: { suppressErrorToast: true } });
  const reviewMutation = useMutation({ ...orpc.team.reviewDeletion.mutationOptions(), meta: { suppressErrorToast: true } });
  const [reviewing, setReviewing] = useState<{ request: DeletionRequest; action: "approve" | "reject" } | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const locale = i18n.resolvedLanguage === "ms" ? "ms-MY" : "en-GB";

  const requests = listQuery.data?.requests ?? [];
  if (requests.length === 0) return null;

  function close() {
    if (reviewMutation.isPending) return;
    setReviewing(null);
    setReason("");
    setError(null);
  }

  async function submit() {
    if (!reviewing) return;
    setError(null);
    try {
      await reviewMutation.mutateAsync({
        requestId: reviewing.request.id,
        action: reviewing.action,
        rejectionReason: reviewing.action === "reject" ? reason.trim() || undefined : undefined,
      });
      toast.success(t(reviewing.action === "approve" ? "superadmin.deletions.approvedToast" : "superadmin.deletions.rejectedToast"));
      setReviewing(null);
      setReason("");
      void queryClient.invalidateQueries({ queryKey: orpc.team.key() });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("team.deletions.error"));
    }
  }

  return (
    <div id="deletion-requests" className={`animate-fade-in-up ${gradientFrameClass("teal")}`}>
      <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
        <div className="flex flex-wrap items-center gap-[8px]">
          <p className="text-sm text-[#141B2E]">{t("superadmin.deletions.title")}</p>
          <span className="rounded-full bg-[#FFF3D6] px-[10px] py-[3px] text-xs text-[#A67C00]">{requests.length}</span>
        </div>
        <p className="mt-[4px] text-xs text-[#9AA3B2]">{t("team.deletions.subtitle")}</p>
        <div className="mt-[14px] flex flex-col gap-[10px]">
          {requests.map((request) => (
            <div
              key={request.id}
              className="flex flex-col gap-[10px] rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[14px] sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-[#141B2E]">{request.name ?? request.email}</p>
                <p className="truncate text-xs text-[#4B5468]">
                  {[request.email, t(`team.roles.${request.role}`)].join(" · ")}
                </p>
                <p className="mt-[2px] text-xs text-[#9AA3B2]">
                  {t("superadmin.deletions.requestedOn", {
                    date: new Date(request.createdAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }),
                  })}
                </p>
                {request.reason && (
                  <p className="mt-[4px] text-xs text-[#4B5468]">{t("superadmin.deletions.reason", { reason: request.reason })}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-[8px]">
                <button
                  type="button"
                  onClick={() => setReviewing({ request, action: "approve" })}
                  className="flex h-[36px] items-center justify-center rounded-full bg-[#E5484D] px-[16px] text-sm text-white hover:opacity-90"
                >
                  {t("superadmin.deletions.approve")}
                </button>
                <button
                  type="button"
                  onClick={() => setReviewing({ request, action: "reject" })}
                  className="flex h-[36px] items-center justify-center rounded-full border border-black/[0.1] px-[16px] text-sm text-[#141B2E] hover:bg-black/[0.03]"
                >
                  {t("superadmin.deletions.reject")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {reviewing && (
        <Modal onClose={close} ariaLabel={t("superadmin.deletions.title")}>
          <p className="text-sm font-semibold text-[#141B2E]">
            {t(reviewing.action === "approve" ? "superadmin.deletions.approveTitle" : "superadmin.deletions.rejectTitle", {
              name: reviewing.request.name ?? reviewing.request.email,
            })}
          </p>
          <p className="mt-[6px] text-xs text-[#4B5468]">
            {t(reviewing.action === "approve" ? "team.deletions.approveBody" : "superadmin.deletions.rejectBody")}
          </p>
          {reviewing.action === "reject" && (
            <>
              <label className="mt-[14px] block text-xs text-[#4B5468]" htmlFor="teamDeletionRejectReason">
                {t("superadmin.deletions.rejectReasonLabel")}
              </label>
              <textarea
                id="teamDeletionRejectReason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={3}
                className="mt-[6px] w-full resize-none rounded-[12px] border border-black/[0.1] p-[10px] text-sm text-[#141B2E] outline-none focus:border-brand-teal-dark"
              />
            </>
          )}
          {error && <p className="mt-[8px] text-xs text-red-500">{error}</p>}
          <div className="mt-[16px] flex items-center gap-[8px]">
            <button
              type="button"
              disabled={reviewMutation.isPending}
              onClick={close}
              className="flex h-[40px] flex-1 items-center justify-center rounded-full border border-black/[0.1] text-sm text-[#141B2E] hover:bg-black/[0.03] disabled:opacity-60"
            >
              {t("applicants.cancel")}
            </button>
            <button
              type="button"
              disabled={reviewMutation.isPending}
              onClick={submit}
              className={`flex h-[40px] flex-1 items-center justify-center rounded-full text-sm text-white hover:opacity-90 disabled:opacity-60 ${
                reviewing.action === "approve" ? "bg-[#E5484D]" : "bg-brand-teal-dark"
              }`}
            >
              {t(reviewing.action === "approve" ? "superadmin.deletions.confirmApprove" : "superadmin.deletions.confirmReject")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
