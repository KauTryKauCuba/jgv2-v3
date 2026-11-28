import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { showComingSoon } from "@/lib/coming-soon";
import { useDraftName } from "@/components/onboarding/draft-name-context";
import { authClient } from "@/lib/auth-client";
import { postAuthRedirect } from "@/lib/route-guards";
import { orpc } from "@/utils/orpc";
import { AuthModal, type AuthMode } from "./auth-modal";
import { ChevronDownIcon, SignOutIcon, UserIcon } from "./icons";
import { Modal } from "./modal";
import { VerifiedBadge } from "./verified-badge";

const plainLinkClass = "hidden whitespace-nowrap px-[6px] py-[6px] hover:opacity-60 sm:block";
// The current page's link is bold.
const navLinkClass = `${plainLinkClass} aria-[current=page]:font-semibold`;

/**
 * The redesign's Navbar: logo, page links, the Employer · Jobseeker switch,
 * language switch, then either Sign in / Get started (both open the auth
 * modal) or, once signed in, the avatar menu, Dashboard and Sign out.
 *
 * `onboarding`: mid-onboarding there's no profile yet, so Dashboard and the
 * page links would only bounce straight back — the signed-in side trims down
 * to the avatar, a "Switch to …" button, and Sign out. The avatar previews
 * the form's live name/photo/phone seal (DraftNameContext).
 *
 * v3 has no stored "active role" yet (the redesign keeps one per session):
 * the side you're on is the role. Not ported yet, since their pages don't
 * exist in v3: the notification bell and the employer's company-logo
 * avatar. The jobseeker's My Profile says "coming soon" until that page is
 * ported.
 *
 * `appShell`: inside the signed-in dashboards — the wider dashboard frame,
 * and no Find companies / About / Employer · Jobseeker links (the dashboard
 * sidebar has its own). The redesign's Tools menu (poster generator, refer
 * a company) also goes here; it comes with those pages.
 */
export function Navbar({
  pageRole,
  onboarding = false,
  appShell = false,
}: {
  pageRole: "employer" | "jobseeker";
  onboarding?: boolean;
  appShell?: boolean;
}) {
  const { t, i18n } = useTranslation("common");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useLocation({ select: (location) => location.pathname });
  const isMalay = i18n.resolvedLanguage === "ms";
  const aboutHref = pageRole === "jobseeker" ? "/jobseeker/about" : "/employer/about";
  const dashboardHref = pageRole === "jobseeker" ? "/jobseeker/dashboard" : "/employer/dashboard";
  const otherRole = pageRole === "employer" ? "jobseeker" : "employer";
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [switchConfirmStep, setSwitchConfirmStep] = useState<0 | 1 | 2>(0);
  const [switching, setSwitching] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const signedIn = !!session?.user;

  const meQuery = useQuery({
    ...orpc.auth.me.queryOptions(),
    enabled: signedIn,
    meta: { suppressErrorToast: true },
  });
  // Fetched on first open (not on mount) — an inline summary in the menu.
  const aiUsageQuery = useQuery({
    ...orpc.ai.usageSummary.queryOptions(),
    enabled: signedIn && menuOpen,
    meta: { suppressErrorToast: true },
  });

  const draftContext = useDraftName();
  const draftName = draftContext?.draftName.trim();
  const me = meQuery.data;
  // On the employer side: the current company's "About you" name and photo,
  // with that company's logo as the main circle (the redesign's
  // companyLogoUrl). Mid-onboarding there's no company yet, so it's the
  // draft's own name and avatar as usual.
  const employerMe = pageRole === "employer" && !draftContext ? (me?.employer ?? null) : null;
  const displayName = draftName || employerMe?.name || me?.name || session?.user.name || session?.user.email;
  const displayAvatarUrl =
    draftContext?.draftAvatarUrl || employerMe?.avatarUrl || me?.avatarUrl || session?.user.image || undefined;
  const companyLogoUrl = employerMe?.companyLogoUrl ?? null;
  const employerSubtitle = employerMe
    ? [employerMe.position, employerMe.teamRole ? t(`team.roles.${employerMe.teamRole}`) : null].filter(Boolean).join(" · ")
    : "";
  // During onboarding nothing is saved yet, so the form's live answer decides.
  const showPhoneSeal = draftContext?.draftPhoneVerified || !!me?.phoneVerified;

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  async function handleSignOut() {
    await authClient.signOut();
    queryClient.clear();
    toast.success(t("auth.signedOut"));
    navigate({ to: pageRole === "jobseeker" ? "/jobseeker" : "/employer" });
  }

  function handleSwitchRoleClick() {
    setMenuOpen(false);
    setSwitchConfirmStep(1);
  }

  // Onboarding first if that side isn't set up yet, otherwise its dashboard.
  async function confirmSwitchRole() {
    setSwitchConfirmStep(0);
    setSwitching(true);
    try {
      navigate({ to: await postAuthRedirect(otherRole) });
    } catch {
      toast.error(t("nav.switchError"));
    } finally {
      setSwitching(false);
    }
  }

  const switchLabel = switching
    ? t("nav.switching")
    : t("nav.switchTo", { role: t(otherRole === "employer" ? "landing.roles.employer" : "landing.roles.jobseeker") });
  const menuItemClass = "block w-full px-[16px] py-[9px] text-left text-sm text-[#141B2E] hover:bg-black/[0.03]";

  return (
    <header className="relative z-20 h-[65px] shrink-0">
      <nav className={`${appShell ? "app-shell" : "shell"} flex h-full items-center justify-between`}>
        {/* Left: logo, then Find job / Find companies and About. */}
        <div className="flex items-center gap-[18px] text-sm text-[#141B2E] sm:gap-[28px]">
          <Link to={pageRole === "jobseeker" ? "/jobseeker" : "/employer"} className="flex items-center">
            <img src="/jg-logo.svg" alt="JobGiga" width={111} height={28} />
          </Link>

          {pageRole === "jobseeker" && (
            // Current only at the job search itself; never bold, like the redesign.
            <Link
              to="/jobseeker"
              hash="job-search"
              data-db="action.findJobs"
              activeOptions={{ exact: true, includeHash: true }}
              onClick={(e) => {
                // Already on the page: the route doesn't change, so scroll ourselves.
                if (pathname !== "/jobseeker") return;
                e.preventDefault();
                document.getElementById("job-search")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={plainLinkClass}
            >
              {t("landing.nav.findJob")}
            </Link>
          )}
          {!appShell && pageRole === "employer" && (
            <Link to="/companies" data-db="action.findCompanies" className={navLinkClass}>
              {t("landing.nav.findCompanies")}
            </Link>
          )}
          {/* Each side has its own About page. */}
          {!appShell && !onboarding && (
            <Link to={aboutHref} data-db="about.page" activeOptions={{ exact: true }} className={navLinkClass}>
              {t("landing.nav.about")}
            </Link>
          )}
        </div>

        {/* Right: Employer · Jobseeker, language, then Sign in / Get started. */}
        <div className="flex items-center gap-[18px] text-sm text-[#141B2E]">
          {/* Exact match: "Employer" is current on /employer, not on /employer/about.
              TanStack Router sets aria-current="page" on the active link. */}
          {!appShell && !onboarding && (
            <>
              <Link to="/employer" activeOptions={{ exact: true }} className={navLinkClass}>
                {t("landing.roles.employer")}
              </Link>
              <Link to="/jobseeker" activeOptions={{ exact: true }} className={navLinkClass}>
                {t("landing.roles.jobseeker")}
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => i18n.changeLanguage(isMalay ? "en" : "ms")}
            aria-label={t("landing.nav.switchLanguage")}
            title={t("landing.nav.switchLanguage")}
            className="rounded-full border border-black/[0.1] px-[10px] py-[4px] text-xs hover:bg-black/[0.03]"
          >
            <span className={isMalay ? "text-[#9AA3B2]" : "font-semibold"}>EN</span>
            <span className="text-[#9AA3B2]"> / </span>
            <span className={isMalay ? "font-semibold" : "text-[#9AA3B2]"}>BM</span>
          </button>

          {sessionPending ? null : signedIn ? (
            <>
              <span className="relative flex" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  aria-label={t("nav.accountMenu")}
                  className="flex h-[38px] items-center gap-[8px] rounded-full px-[6px] text-sm text-[#4B5468] hover:bg-black/[0.03]"
                >
                  {/* Wrapped so the "phone verified" seal and the overlapping
                      company logo/avatar can sit on the circle's edges. With
                      a company logo, both circles are the same size, the
                      avatar overlapping the logo's corner by about a third. */}
                  <span className={`relative shrink-0 ${companyLogoUrl && displayAvatarUrl ? "h-[28px] w-[47px]" : ""}`}>
                    <span className="flex h-[28px] w-[28px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F1F4F8] text-[#9AA3B2]">
                      {companyLogoUrl || displayAvatarUrl ? (
                        <img
                          src={companyLogoUrl || displayAvatarUrl || undefined}
                          referrerPolicy="no-referrer"
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <UserIcon className="h-[13px] w-[13px]" />
                      )}
                    </span>
                    {/* Their own photo, same size as the logo, overlapping it by about a third
                        — its own relative wrapper so the phone seal below anchors to it, not the logo. */}
                    {companyLogoUrl && displayAvatarUrl ? (
                      <span className="absolute top-0 left-[19px] h-[28px] w-[28px] shrink-0">
                        <span className="relative block h-[28px] w-[28px]">
                          <span className="flex h-[28px] w-[28px] shrink-0 items-center justify-center overflow-hidden rounded-full border-[1.5px] border-white bg-[#F1F4F8]">
                            <img src={displayAvatarUrl} referrerPolicy="no-referrer" alt="" className="h-full w-full object-cover" />
                          </span>
                          {showPhoneSeal && <VerifiedBadge variant="phone" placement="avatar" size={13} tooltip={false} />}
                        </span>
                      </span>
                    ) : (
                      showPhoneSeal && <VerifiedBadge variant="phone" placement="avatar" size={13} tooltip={false} />
                    )}
                  </span>
                  <span className="hidden min-w-0 max-w-[200px] flex-col items-start leading-tight md:flex">
                    <span className="max-w-full truncate whitespace-nowrap">{displayName}</span>
                    {employerSubtitle && (
                      <span className="max-w-full truncate whitespace-nowrap text-xs text-[#9AA3B2]">{employerSubtitle}</span>
                    )}
                  </span>
                  <ChevronDownIcon className="h-[9px] w-[9px] text-[#9AA3B2]" />
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute top-[calc(100%+8px)] right-0 z-30 w-[220px] rounded-[14px] border border-black/[0.06] bg-white py-[6px] shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
                  >
                    {/* The navbar's own Dashboard / Find job / Switch buttons are
                        hidden below sm to fit a phone header, so they live in
                        this menu there instead. */}
                    <div className="sm:hidden">
                      {!onboarding && (
                        <Link to={dashboardHref} onClick={() => setMenuOpen(false)} className={menuItemClass}>
                          {t("nav.dashboard")}
                        </Link>
                      )}
                      {pageRole === "jobseeker" && (
                        <Link to="/jobseeker" hash="job-search" onClick={() => setMenuOpen(false)} className={menuItemClass}>
                          {t("landing.nav.findJob")}
                        </Link>
                      )}
                      {!appShell && pageRole !== "jobseeker" && (
                        <Link to="/companies" onClick={() => setMenuOpen(false)} className={menuItemClass}>
                          {t("landing.nav.findCompanies")}
                        </Link>
                      )}
                      {!appShell && !onboarding && (
                        <Link to={aboutHref} onClick={() => setMenuOpen(false)} className={menuItemClass}>
                          {t("landing.nav.about")}
                        </Link>
                      )}
                      {onboarding && (
                        <button
                          type="button"
                          onClick={handleSwitchRoleClick}
                          disabled={switching}
                          className={`${menuItemClass} disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                          {switchLabel}
                        </button>
                      )}
                    </div>
                    {/* Not inside the dashboards — their sidebar has these. */}
                    {!onboarding && !appShell && (
                      pageRole === "employer" ? (
                        <>
                          <Link to="/employer/profile" onClick={() => setMenuOpen(false)} className={menuItemClass}>
                            {t("nav.myProfile")}
                          </Link>
                          <Link to="/employer/company" onClick={() => setMenuOpen(false)} className={menuItemClass}>
                            {t("nav.companyProfile")}
                          </Link>
                        </>
                      ) : (
                        // TODO(route): /jobseeker/profile (the jobseeker's My Profile).
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            showComingSoon();
                          }}
                          className={menuItemClass}
                        >
                          {t("nav.myProfile")}
                        </button>
                      )
                    )}
                    {me?.isSuperadmin && (
                      <Link to="/superadmin/dashboard" onClick={() => setMenuOpen(false)} className={menuItemClass}>
                        {t("nav.superadminPanel")}
                      </Link>
                    )}
                    <div className="px-[16px] py-[9px]">
                      <p className="text-xs text-[#141B2E]">{t("nav.aiUsage")}</p>
                      <p className="mt-[2px] text-xs text-[#9AA3B2]">
                        {aiUsageQuery.data
                          ? t("nav.aiUsageSummary", {
                              calls: aiUsageQuery.data.totalCalls,
                              tokens: aiUsageQuery.data.totalTokens.toLocaleString(),
                            })
                          : t("nav.loading")}
                      </p>
                    </div>
                    {!onboarding && (
                      <>
                        <div className="my-[6px] h-px bg-black/[0.06]" />
                        <button
                          type="button"
                          onClick={handleSwitchRoleClick}
                          disabled={switching}
                          className={`${menuItemClass} disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                          {switchLabel}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </span>
              {onboarding ? (
                <button
                  type="button"
                  onClick={handleSwitchRoleClick}
                  disabled={switching}
                  className="hidden h-[38px] items-center rounded-full border border-black/[0.1] px-[18px] text-sm text-[#141B2E] hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-60 sm:flex"
                >
                  {switchLabel}
                </button>
              ) : (
                <Link
                  to={dashboardHref}
                  className={`hidden h-[38px] items-center rounded-full px-[18px] text-sm hover:opacity-90 sm:flex ${
                    pageRole === "jobseeker" ? "bg-brand-gold text-[#141B2E]" : "bg-brand-teal-dark text-white"
                  }`}
                >
                  {t("nav.dashboard")}
                </Link>
              )}
              <button
                type="button"
                onClick={handleSignOut}
                aria-label={t("auth.signOut")}
                title={t("auth.signOut")}
                className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-black/[0.1] text-[#141B2E] hover:bg-black/[0.03]"
              >
                <SignOutIcon className="h-[16px] w-[16px]" />
              </button>
            </>
          ) : (
            <>
              {/* These just open the auth modal — the real data-db markers
                  (action.signIn / action.signUp) are on the modal's own form,
                  since that's where the email/code actually get sent. */}
              <button
                type="button"
                onClick={() => setAuthMode("sign-in")}
                className="hidden px-[6px] py-[6px] hover:opacity-60 sm:block"
              >
                {t("landing.nav.signIn")}
              </button>

              <button
                type="button"
                onClick={() => setAuthMode("get-started")}
                className={`flex h-[38px] items-center rounded-full px-[18px] text-sm hover:opacity-90 ${
                  pageRole === "jobseeker" ? "bg-brand-gold text-[#141B2E]" : "bg-brand-teal-dark text-white"
                }`}
              >
                {t("landing.nav.getStarted")}
              </button>
            </>
          )}
        </div>
      </nav>

      {authMode && (
        <AuthModal
          mode={authMode}
          role={pageRole}
          onClose={() => setAuthMode(null)}
          onAuthenticated={() => {
            setAuthMode(null);
            toast.success(t("auth.signedIn"));
          }}
          onSwitchToGetStarted={() => setAuthMode("get-started")}
        />
      )}

      {switchConfirmStep > 0 && (
        <Modal onClose={() => setSwitchConfirmStep(0)}>
          {(() => {
            const nextRoleName = t(otherRole === "employer" ? "nav.roleEmployer" : "nav.roleJobseeker");
            const primaryClass = `flex h-[38px] items-center justify-center rounded-full text-sm transition-opacity hover:opacity-90 ${
              otherRole === "jobseeker" ? "bg-brand-gold text-[#141B2E]" : "bg-brand-teal-dark text-white"
            }`;
            const secondaryClass =
              "flex h-[38px] items-center justify-center rounded-full text-sm text-[#4B5468] hover:bg-black/[0.03]";
            return switchConfirmStep === 1 ? (
              <>
                <h2 className="text-lg font-semibold text-[#141B2E]">{t("nav.switchConfirm1Title", { role: nextRoleName })}</h2>
                <p className="mt-[10px] text-sm leading-[20px] text-[#4B5468]">
                  {t("nav.switchConfirm1Body", { role: nextRoleName })}
                </p>
                <div className="mt-[20px] flex flex-col gap-[8px]">
                  <button type="button" onClick={() => setSwitchConfirmStep(2)} className={primaryClass}>
                    {t("nav.switchConfirm1Yes")}
                  </button>
                  <button type="button" onClick={() => setSwitchConfirmStep(0)} className={secondaryClass}>
                    {t("nav.switchConfirm1No")}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-[#141B2E]">{t("nav.switchConfirm2Title")}</h2>
                <p className="mt-[10px] text-sm leading-[20px] text-[#4B5468]">
                  {t("nav.switchConfirm2Body", { role: nextRoleName })}
                </p>
                <div className="mt-[20px] flex flex-col gap-[8px]">
                  <button type="button" onClick={confirmSwitchRole} className={primaryClass}>
                    {t("nav.switchConfirm2Yes")}
                  </button>
                  <button type="button" onClick={() => setSwitchConfirmStep(1)} className={secondaryClass}>
                    {t("nav.switchConfirm2Back")}
                  </button>
                </div>
              </>
            );
          })()}
        </Modal>
      )}
    </header>
  );
}
