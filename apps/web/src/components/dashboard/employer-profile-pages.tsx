import type { BadgeKey } from "@/lib/companies/badges";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { EmployerOnboardingForm } from "@/components/onboarding/employer-onboarding-form";
import { EmployerMemberProfileForm } from "@/components/team/employer-member-profile-form";
import { showComingSoon } from "@/lib/coming-soon";
import { orpc } from "@/utils/orpc";
import { AiUsageCard } from "./ai-usage-card";
import { DeleteAccountCard } from "./delete-account-card";
import { EmployerDashboardShell } from "./employer-dashboard-shell";

function useEmployerProfile() {
  return useQuery({ ...orpc.employer.getProfile.queryOptions(), meta: { suppressErrorToast: true } });
}

function PageMessage({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return error ? (
    <div className="rounded-[14px] border border-[#EAD9D6] bg-[#FBF3F1] p-[16px] text-center text-sm text-[#A66A61]">{children}</div>
  ) : (
    <p className="rounded-[14px] bg-white/70 p-[16px] text-center text-xs text-[#9AA3B2]">{children}</p>
  );
}

/**
 * The redesign's /employer/company: the onboarding form in edit mode, just
 * the company sections, with its badges. Owners and admins only.
 *
 * Not in v3 yet: "+ Add a company" (comes with the company switcher) and
 * "View profile ↗" (the public company page still shows sample companies).
 */
export function EmployerCompanyProfilePage() {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const query = useEmployerProfile();
  const canManage = query.data?.canManage ?? true;
  useEffect(() => {
    // The redesign sends teammates without full access back to their dashboard.
    if (query.data && !query.data.canManage) navigate({ to: "/employer/dashboard" });
  }, [query.data, navigate]);

  return (
    <EmployerDashboardShell
      active="company"
      canManage={canManage}
      heading={t("dashboard.company.heading")}
      subheading={t("dashboard.company.subheading")}
      headerAction={
        <div className="flex flex-wrap items-center gap-[8px]">
          {/* TODO(route): /employer/companies/new ("Add a company"). */}
          <button
            type="button"
            onClick={showComingSoon}
            className="flex h-[38px] items-center justify-center rounded-full border border-brand-teal-dark px-[18px] text-sm text-brand-teal-dark transition-colors hover:bg-brand-teal-soft"
          >
            {t("dashboard.company.addCompany")}
          </button>
          {/* TODO(api): /companies/<id> in a new tab, once that page reads real companies. */}
          <button
            type="button"
            onClick={showComingSoon}
            className="flex h-[38px] items-center justify-center rounded-full bg-brand-teal-dark px-[22px] text-sm text-white transition-opacity hover:opacity-90"
          >
            {t("dashboard.company.viewProfile")}
          </button>
        </div>
      }
    >
      {query.isPending ? (
        <PageMessage>{t("nav.loading")}</PageMessage>
      ) : query.isError || !query.data ? (
        <PageMessage error>{t("dashboard.company.loadError")}</PageMessage>
      ) : (
        <EmployerOnboardingForm
          key={query.data.profile.id}
          mode="edit"
          initialProfile={query.data.profile}
          initialAddresses={query.data.addresses}
          only="company"
          earnedBadges={
            Object.fromEntries(
              Object.entries(query.data.earnedBadges).map(([key, at]) => [key, new Date(at)]),
            ) as Record<BadgeKey, Date | undefined>
          }
        />
      )}
    </EmployerDashboardShell>
  );
}

/**
 * The redesign's /employer/profile: "About you" from the onboarding form in
 * edit mode, with the AI usage card beside it.
 *
 * The "Danger zone" card follows v1's account deletion, not the redesign's
 * permanent delete (see delete-account-card.tsx).
 *
 * Not in v3 yet: the "Sample data" card (it fills Manage Job, Team and
 * Interviews, which come next). An invited teammate gets their own About you
 * (EmployerMemberProfileForm), as in the redesign.
 */
export function EmployerMyProfilePage() {
  const { t } = useTranslation("common");
  const query = useEmployerProfile();
  const meQuery = useQuery({ ...orpc.auth.me.queryOptions(), meta: { suppressErrorToast: true } });
  const membershipQuery = useQuery({ ...orpc.team.myMembership.queryOptions(), meta: { suppressErrorToast: true } });
  const membership = membershipQuery.data;
  const sidebar = (
    <div className="flex flex-col gap-[20px]">
      <AiUsageCard />
      {meQuery.data?.email && <DeleteAccountCard email={meQuery.data.email} />}
    </div>
  );

  return (
    <EmployerDashboardShell
      active="profile"
      canManage={query.data?.canManage ?? true}
      heading={t("dashboard.myProfile.heading")}
      subheading={t("dashboard.myProfile.subheading")}
    >
      {query.isPending || membershipQuery.isPending ? (
        <PageMessage>{t("nav.loading")}</PageMessage>
      ) : query.isError || !query.data ? (
        <PageMessage error>{t("dashboard.company.loadError")}</PageMessage>
      ) : membership && !membership.isRegistrant ? (
        // The company's contact details belong to whoever registered it. An
        // invited teammate gets their own details instead — never a form that
        // would show, or overwrite, the registrant's.
        <EmployerMemberProfileForm
          key={query.data.profile.id}
          initialName={membership.profile.name}
          initialAvatarUrl={membership.profile.avatarUrl}
          initialPosition={membership.profile.position}
          initialHiringRole={membership.profile.hiringRole}
          initialPhone={membership.profile.phone}
          email={membership.profile.email}
          companyName={membership.company.name}
          teamRole={membership.role}
          sidebarSlot={sidebar}
        />
      ) : (
        <EmployerOnboardingForm
          key={query.data.profile.id}
          mode="edit"
          initialProfile={query.data.profile}
          initialAddresses={query.data.addresses}
          only="contact"
          sidebarSlot={sidebar}
          initialPhoneStatus={query.data.phoneStatus}
        />
      )}
    </EmployerDashboardShell>
  );
}
