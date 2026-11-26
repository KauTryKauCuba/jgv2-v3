import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ResponsivenessBadge } from "@/components/companies/responsiveness-badge";
import { authClient } from "@/lib/auth-client";
import { showComingSoon } from "@/lib/coming-soon";
import {
  APPLICATION_STATUS_COLOR,
  formatSalary,
  relativeTimeAgo,
  statusLabel,
} from "@/lib/dashboard/pipeline";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { orpc } from "@/utils/orpc";
import { ApplicationSteps } from "./application-steps";
import { JobseekerDashboardShell } from "./jobseeker-dashboard-shell";
import { SaveJobButton } from "./save-job-button";

export const DASHBOARD_APPLICATION_PREVIEW_COUNT = 3;

/**
 * The redesign's JobseekerDashboard: "My applications" (the latest three,
 * each with its progress steps) and "Jobs hiring now" (every live job, with
 * the company's usual reply time and a save heart).
 *
 * Data: application.myApplications, job.list, job.bookmark.listSavedJobs and
 * jobseeker.myResume (v1's application, job and saved_job tables).
 * Not in v3 yet: My Applications (View all) and the job pages the cards
 * open — those show "coming soon".
 */
export function JobseekerDashboard() {
  const { t } = useTranslation("common");
  const { data: session } = authClient.useSession();
  const me = useQuery({ ...orpc.auth.me.queryOptions(), meta: { suppressErrorToast: true } });
  const applicationsQuery = useQuery(orpc.application.myApplications.queryOptions());
  const jobsQuery = useQuery(orpc.job.list.queryOptions({ input: {} }));
  const savedQuery = useQuery(orpc.job.bookmark.listSavedJobs.queryOptions());
  const resumeQuery = useQuery(orpc.jobseeker.myResume.queryOptions());

  const applications = applicationsQuery.data ?? [];
  const activePostings = jobsQuery.data ?? [];
  const savedIds = new Set((savedQuery.data ?? []).map((s) => s.jobId));
  const name = me.data?.name || session?.user.name;
  const firstName = name?.split(" ")[0] || t("dashboard.there");
  const loading = applicationsQuery.isPending || jobsQuery.isPending || savedQuery.isPending;

  return (
    <JobseekerDashboardShell
      active="overview"
      heading={t("dashboard.welcomeBack", { name: firstName })}
      subheading={t("dashboard.jobseeker.subheading")}
      resume={resumeQuery.data ?? null}
    >
      {loading ? (
        <p className="rounded-[14px] bg-white/70 p-[16px] text-center text-xs text-[#9AA3B2]">{t("nav.loading")}</p>
      ) : (
        <div className="flex flex-col gap-[20px]">
          <div className={`${gradientFrameClass("gold")} animate-fade-in-up`}>
            <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
              <div className="flex items-center justify-between gap-[8px]">
                <div className="flex items-center gap-[8px]">
                  <p className="text-sm text-[#141B2E]">{t("dashboard.jobseeker.myApplications")}</p>
                  <span className="rounded-full bg-brand-gold-soft px-[10px] py-[3px] text-xs text-brand-gold-dark">
                    {applications.length}
                  </span>
                </div>
                {applications.length > 0 && (
                  // TODO(route): /jobseeker/applications (My Applications page).
                  <button type="button" onClick={showComingSoon} className="text-sm text-brand-gold-dark hover:underline">
                    {t("dashboard.viewAll")}
                  </button>
                )}
              </div>

              {applications.length === 0 ? (
                <p className="mt-[14px] rounded-[14px] bg-[#F8FAFB] p-[16px] text-xs text-[#9AA3B2]">
                  {t("dashboard.jobseeker.noApplications")}
                </p>
              ) : (
                <div className="mt-[14px] flex flex-col gap-[10px]">
                  {applications
                    .slice(0, DASHBOARD_APPLICATION_PREVIEW_COUNT)
                    .map(({ application, posting, companyName, events }) => {
                      const color = APPLICATION_STATUS_COLOR[application.status] ?? APPLICATION_STATUS_COLOR.applied!;
                      return (
                        <div
                          key={application.id}
                          className="flex flex-col gap-[14px] rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[14px] md:flex-row md:items-center md:justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-[8px] text-sm text-[#141B2E]">
                              <span className="truncate">{posting.title}</span>
                              <span className={`shrink-0 rounded-full px-[10px] py-[2px] text-xs ${color.bg} ${color.text}`}>
                                {statusLabel(t, application.status)}
                              </span>
                            </p>
                            <p className="mt-[2px] text-xs text-[#4B5468]">
                              {companyName} · {posting.location || t("dashboard.locationNotSet")}
                            </p>
                            <p className="mt-[2px] text-xs text-[#9AA3B2]">
                              {t("dashboard.jobseeker.applied", { when: relativeTimeAgo(t, application.appliedAt) })}
                            </p>
                          </div>
                          <div className="w-full shrink-0 md:w-[340px]">
                            <ApplicationSteps status={application.status} appliedAt={application.appliedAt} events={events} compact />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>

          <div className={`${gradientFrameClass("gold")} animate-fade-in-up`} style={{ animationDelay: "60ms" }}>
            <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
              <div className="flex items-center gap-[8px]">
                <p className="text-sm text-[#141B2E]">{t("dashboard.jobseeker.jobsHiringNow")}</p>
                <span className="rounded-full bg-brand-gold-soft px-[10px] py-[3px] text-xs text-brand-gold-dark">
                  {activePostings.length}
                </span>
              </div>

              {activePostings.length === 0 ? (
                <p className="mt-[14px] rounded-[14px] bg-[#F8FAFB] p-[16px] text-xs text-[#9AA3B2]">
                  {t("dashboard.jobseeker.noPostings")}
                </p>
              ) : (
                <div className="mt-[14px] flex flex-col gap-[10px]">
                  {activePostings.map((posting) => (
                    // TODO(route): /jobseeker/jobs/<id> (the job's own page).
                    <a
                      key={posting.id}
                      href={`/jobseeker/jobs/${posting.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        showComingSoon();
                      }}
                      className="flex flex-col gap-[8px] rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[14px] transition-colors hover:bg-[#F1F4F8] sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-[#141B2E]">{posting.title}</p>
                        <p className="mt-[2px] text-xs text-[#4B5468]">{posting.companyName}</p>
                        <ResponsivenessBadge responsiveness={posting.responsiveness} className="mt-[6px]" />
                        <div className="mt-[6px] flex flex-wrap items-center gap-x-[8px] gap-y-[2px] text-xs text-[#4B5468]">
                          <span>{posting.location || t("dashboard.locationNotSet")}</span>
                          <span className="text-[#C7CDD7]">·</span>
                          <span>{t(`dashboard.employmentTypes.${posting.employmentType}`, { defaultValue: posting.employmentType })}</span>
                          <span className="text-[#C7CDD7]">·</span>
                          <span>{t(`dashboard.workArrangements.${posting.workArrangement}`, { defaultValue: posting.workArrangement })}</span>
                          <span className="text-[#C7CDD7]">·</span>
                          <span>
                            {formatSalary(t, posting.salaryMin, posting.salaryMax, posting.salaryPeriod) ??
                              t("dashboard.salaryNotDisclosed")}
                          </span>
                        </div>
                        {posting.skills.length > 0 && (
                          <div className="mt-[8px] flex flex-wrap gap-[6px]">
                            {posting.skills.slice(0, 5).map((skill: string) => (
                              <span key={skill} className="rounded-full bg-brand-gold-soft px-[10px] py-[3px] text-xs text-brand-gold-dark">
                                {skill}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <SaveJobButton jobId={posting.id} initialSaved={savedIds.has(posting.id)} className="self-start sm:self-center" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </JobseekerDashboardShell>
  );
}
