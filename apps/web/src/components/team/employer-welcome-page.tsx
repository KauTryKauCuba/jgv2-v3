// The redesign's src/app/employer/welcome/page.tsx, ported: "Welcome to
// <company>." — the "Your invite" card (company, who invited them, their
// role, where it's based, the main contact) beside the teammate's own
// About you form and its checklist. Data from team.myMembership.
import { TEAM_ROLE_PILL } from "@jobgiga-app/api/shared/team-roles";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Hero } from "@/components/landing/hero";
import { Navbar } from "@/components/landing/navbar";
import Loader from "@/components/loader";
import { EmployerOnboardingBadges } from "@/components/onboarding/employer-onboarding-badges";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { orpc } from "@/utils/orpc";
import { EmployerMemberProfileForm } from "./employer-member-profile-form";

export function EmployerWelcomePage() {
  const { t } = useTranslation("common");
  const query = useQuery({ ...orpc.team.myMembership.queryOptions(), staleTime: 0, meta: { suppressErrorToast: true } });
  if (query.isPending) return <Loader />;
  const data = query.data;

  return (
    <main className="flex min-h-[100svh] flex-col overflow-x-clip bg-brand-teal-page pb-[92px]">
      <Navbar pageRole="employer" onboarding />
      <div className="relative">
        <EmployerOnboardingBadges />
        <Hero
          showRoleToggle={false}
          heading={
            <>
              {t("teamWelcome.heading")}
              <br />
              {data ? `${data.company.name}.` : ""}
            </>
          }
          subheadingClassName="mb-[40px]"
          subheading={t("teamWelcome.subheading")}
          belowNav={
            !data ? (
              <div className="mx-auto max-w-[460px] rounded-[14px] border border-[#EAD9D6] bg-[#FBF3F1] p-[16px] text-center text-sm text-[#A66A61]">
                {t("teamWelcome.loadError")}
              </div>
            ) : (
              <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-[20px] text-left xl:flex-row xl:items-start">
                {/* Which team they've just joined, and who invited them. */}
                <div className={`animate-fade-in-up ${gradientFrameClass("teal")} min-w-0 xl:sticky xl:top-[22px] xl:flex-[1]`}>
                  <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
                    <p className="text-xs text-[#9AA3B2]">{t("teamWelcome.yourInvite")}</p>
                    <div className="mt-[12px] flex items-center gap-[12px]">
                      {data.company.logoUrl ? (
                        <img
                          src={data.company.logoUrl}
                          alt=""
                          className="h-[52px] w-[52px] shrink-0 rounded-[12px] border border-black/[0.06] bg-white object-contain"
                        />
                      ) : (
                        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[12px] bg-brand-teal-soft text-xl text-brand-teal-dark">
                          {data.company.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-[#141B2E]">{data.company.name}</p>
                        <p className="text-xs leading-[16px] text-[#4B5468]">
                          {[
                            data.company.industry,
                            data.company.companySize ? t("teamWelcome.employees", { size: data.company.companySize }) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </div>

                    <dl className="mt-[16px] flex flex-col gap-[10px] border-t border-black/[0.06] pt-[14px] text-sm">
                      {data.inviterName && (
                        <div className="flex items-start justify-between gap-[12px]">
                          <dt className="text-[#9AA3B2]">{t("teamWelcome.invitedBy")}</dt>
                          <dd className="text-right text-[#141B2E]">{data.inviterName}</dd>
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-[12px]">
                        <dt className="text-[#9AA3B2]">{t("teamWelcome.yourRole")}</dt>
                        <dd>
                          <span className={`rounded-full px-[9px] py-[2px] text-xs ${TEAM_ROLE_PILL[data.role].bg} ${TEAM_ROLE_PILL[data.role].text}`}>
                            {t(`team.roles.${data.role}`)}
                          </span>
                        </dd>
                      </div>
                      {data.company.location && (
                        <div className="flex items-start justify-between gap-[12px]">
                          <dt className="text-[#9AA3B2]">{t("teamWelcome.basedIn")}</dt>
                          <dd className="text-right text-[#141B2E]">{data.company.location}</dd>
                        </div>
                      )}
                      {data.company.contactName && (
                        <div className="flex items-start justify-between gap-[12px]">
                          <dt className="text-[#9AA3B2]">{t("teamWelcome.mainContact")}</dt>
                          <dd className="text-right text-[#141B2E]">{data.company.contactName}</dd>
                        </div>
                      )}
                    </dl>

                    <p className="mt-[14px] rounded-[12px] bg-[#F8FAFB] p-[10px] text-xs leading-[18px] text-[#4B5468]">
                      {t(`teamWelcome.roleNote.${data.role}`)}
                    </p>
                  </div>
                </div>

                {/* Same 1 : 2 : 1 widths as company onboarding: invite, About you, checklist. */}
                <EmployerMemberProfileForm
                  mode="welcome"
                  initialName={data.profile.name}
                  initialAvatarUrl={data.profile.avatarUrl}
                  initialPosition={data.profile.position}
                  initialHiringRole={data.profile.hiringRole}
                  initialPhone={data.profile.phone}
                  email={data.profile.email}
                  companyName={data.company.name}
                  teamRole={data.role}
                />
              </div>
            )
          }
        />
      </div>
    </main>
  );
}
