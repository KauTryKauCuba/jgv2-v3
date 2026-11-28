import type { EvaluationCriterion, InterviewRecommendation } from "@jobgiga-app/api/shared/interview-evaluation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { authClient } from "@/lib/auth-client";
import type { ApplicantRow, EmployerTeamMember } from "@/lib/applicants/status";
import { orpc, queryClient } from "@/utils/orpc";
import type { InterviewDetailsInput } from "./applicant-detail-modal";

type PatchRow = (applicationId: string, patch: (row: ApplicantRow) => ApplicantRow) => void;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Everything that shows an applicant's stage: refreshed after any move. */
function invalidateApplicantViews() {
  for (const queryKey of [
    orpc.application.listForEmployer.key(),
    orpc.application.listInterviews.key(),
    orpc.application.postingPage.key(),
    orpc.application.getForEmployer.key(),
    orpc.employer.dashboard.key(),
    orpc.employer.topMatches.key(),
  ]) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

/**
 * The redesign's updateStatus / setAttendance / saveEvaluation /
 * completeEvaluation, shared by the Applicants page and a posting's own
 * page: each call patches the row on screen with what the server returns
 * (`patchRow`), then refreshes every other view of applicants.
 */
export function useApplicantActions(patchRow: PatchRow) {
  const { t } = useTranslation("common");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const updateStatusMutation = useMutation(orpc.application.updateStatus.mutationOptions());
  const submitEvaluationMutation = useMutation(orpc.application.submitEvaluation.mutationOptions());
  const completeEvaluationMutation = useMutation(orpc.application.completeEvaluation.mutationOptions());

  async function run(applicationId: string, fallback: string, action: () => Promise<void>) {
    setStatusError(null);
    setUpdatingId(applicationId);
    try {
      await action();
      invalidateApplicantViews();
    } catch (err) {
      setStatusError(errorMessage(err, fallback));
    } finally {
      setUpdatingId(null);
    }
  }

  function updateStatus(applicationId: string, status: string, interviewDetails?: InterviewDetailsInput) {
    return run(applicationId, t("applicants.errors.updateStatus"), async () => {
      const data = await updateStatusMutation.mutateAsync(
        interviewDetails !== undefined ? { id: applicationId, status, interviewDetails } : { id: applicationId, status },
      );
      patchRow(applicationId, (row) => ({ ...row, application: data.application }));
    });
  }

  function setAttendance(applicationId: string, interviewResponseStatus: "attended" | "no_show") {
    return run(applicationId, t("applicants.errors.updateStatus"), async () => {
      const data = await updateStatusMutation.mutateAsync({ id: applicationId, status: "interview", interviewResponseStatus });
      patchRow(applicationId, (row) => ({ ...row, application: data.application }));
    });
  }

  function applyEvaluation(applicationId: string, data: Pick<ApplicantRow, "evaluation" | "evaluations"> & { status: string }) {
    patchRow(applicationId, (row) => ({
      ...row,
      application: { ...row.application, status: data.status as ApplicantRow["application"]["status"] },
      evaluation: data.evaluation,
      evaluations: data.evaluations,
    }));
  }

  function saveEvaluation(
    applicationId: string,
    scores: Partial<Record<EvaluationCriterion, number>>,
    recommendation: InterviewRecommendation,
    notes: string,
  ) {
    return run(applicationId, t("applicants.errors.saveEvaluation"), async () => {
      const data = await submitEvaluationMutation.mutateAsync({
        id: applicationId,
        scores: scores as Record<string, number>,
        recommendation,
        notes,
      });
      applyEvaluation(applicationId, data);
    });
  }

  // Owner override — close out the evaluation before the whole panel has submitted.
  function completeEvaluation(applicationId: string) {
    return run(applicationId, t("applicants.errors.completeEvaluation"), async () => {
      applyEvaluation(applicationId, await completeEvaluationMutation.mutateAsync({ id: applicationId }));
    });
  }

  return { statusError, updatingId, updateStatus, setAttendance, saveEvaluation, completeEvaluation };
}

/**
 * The signed-in employer as the applicant window needs them (the
 * redesign's authUser): id, name and photo, their position, and whether
 * they're the company's Owner — read off the team list.
 */
export function useCurrentEmployer(teamMembers: EmployerTeamMember[]) {
  const { data: session } = authClient.useSession();
  const meQuery = useQuery({ ...orpc.auth.me.queryOptions(), meta: { suppressErrorToast: true } });
  const id = session?.user.id ?? null;
  const membership = id ? teamMembers.find((m) => m.userId === id) : undefined;
  return {
    id,
    name: meQuery.data?.name ?? session?.user.name ?? null,
    avatarUrl: meQuery.data?.avatarUrl ?? membership?.avatarUrl ?? null,
    role: membership?.position ?? null,
    isOwner: membership?.role === "owner",
  };
}

