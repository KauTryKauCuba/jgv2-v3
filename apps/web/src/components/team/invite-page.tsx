// The redesign's src/app/invite/[token]/page.tsx (and its accept/decline
// routes), ported: the invite's company, role and inviter, and the one
// button that fits — accept, accept and sign in, switch account, or go to
// the dashboard — plus Decline. Signing in opens the usual sign-in window
// pre-filled with the invited email; the invite is remembered for this tab
// and finished right after signing in (see postAuthRedirect).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AuthModal, type AuthMode } from "@/components/landing/auth-modal";
import { Hero } from "@/components/landing/hero";
import { Navbar } from "@/components/landing/navbar";
import Loader from "@/components/loader";
import { EmployerOnboardingBadges } from "@/components/onboarding/employer-onboarding-badges";
import { authClient } from "@/lib/auth-client";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { postAuthRedirect, rememberPendingInvite } from "@/lib/route-guards";
import { orpc } from "@/utils/orpc";

// INVITE_TTL_DAYS on the server.
const INVITE_TTL_DAYS = 7;

const primaryButton =
  "flex h-[44px] w-full items-center justify-center rounded-full bg-brand-teal-dark text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-60";
const secondaryButton =
  "flex h-[44px] w-full items-center justify-center rounded-full border border-black/[0.1] text-sm text-[#141B2E] hover:bg-black/[0.03] disabled:opacity-60";

function Message({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`}>
      <div className="rounded-[19px] bg-white p-[22px] text-center sm:p-[28px]">
        <p className="text-sm leading-[20px] text-[#4B5468]">{text}</p>
        <div className="mt-[20px]">{children}</div>
      </div>
    </div>
  );
}

export function InvitePage({ token, declined: declinedFromUrl }: { token: string; declined: boolean }) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const inviteQuery = useQuery({ ...orpc.team.lookupInvite.queryOptions({ input: { token } }), meta: { suppressErrorToast: true } });
  const acceptMutation = useMutation(orpc.team.acceptInvite.mutationOptions());
  const declineMutation = useMutation(orpc.team.declineInvite.mutationOptions());
  const [declined, setDeclined] = useState(declinedFromUrl);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (inviteQuery.isPending || sessionPending) return <Loader />;
  const invite = inviteQuery.data ?? { state: "invalid" as const };
  const signedInEmail = session?.user.email ?? null;
  const inviteEmail = ("email" in invite && invite.email) || "";
  const companyName = ("companyName" in invite && invite.companyName) || "";
  const goHome = (
    <Link to="/employer" className={secondaryButton}>
      {t("invite.goToJobGiga")}
    </Link>
  );

  /** Signed out (or as someone else): open Sign in with the invited email. */
  async function signInAsInvitee(email: string, companyName: string) {
    if (signedInEmail) {
      await authClient.signOut();
      queryClient.clear();
    }
    rememberPendingInvite({ token, email, companyName });
    setAuthMode("sign-in");
  }

  async function handleMain() {
    if (invite.state !== "pending" && invite.state !== "accepted") return;
    setBusy(true);
    setError(null);
    try {
      const isInvitee = signedInEmail?.toLowerCase() === inviteEmail.toLowerCase();
      if (!isInvitee) {
        await signInAsInvitee(inviteEmail, companyName);
        return;
      }
      const result = await acceptMutation.mutateAsync({ token });
      if (result.result === "unavailable") {
        await inviteQuery.refetch();
        return;
      }
      if (result.result === "wrong_account") {
        await signInAsInvitee(result.email ?? inviteEmail, companyName);
        return;
      }
      await queryClient.invalidateQueries();
      // A first-timer gets the "About you" welcome step from here.
      navigate({ to: await postAuthRedirect("employer") });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("invite.error"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDecline() {
    setBusy(true);
    setError(null);
    try {
      await declineMutation.mutateAsync({ token });
      setDeclined(true);
      navigate({ to: "/invite/$token", params: { token }, search: { declined: true }, replace: true });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("invite.error"));
    } finally {
      setBusy(false);
    }
  }

  let heading: React.ReactNode;
  let body: React.ReactNode;
  if (declined) {
    heading = t("invite.declinedHeading");
    body = <Message text={t("invite.declinedBody")}>{goHome}</Message>;
  } else if (invite.state === "invalid") {
    heading = (
      <>
        {t("invite.invalidHeading1")}
        <br />
        {t("invite.invalidHeading2")}
      </>
    );
    body = <Message text={t("invite.invalidBody")}>{goHome}</Message>;
  } else if (invite.state === "expired") {
    heading = (
      <>
        {t("invite.expiredHeading1")}
        <br />
        {t("invite.expiredHeading2")}
      </>
    );
    body = <Message text={t("invite.expiredBody", { days: INVITE_TTL_DAYS, company: companyName })}>{goHome}</Message>;
  } else {
    const isInvitee = signedInEmail?.toLowerCase() === inviteEmail.toLowerCase();
    const accepted = invite.state === "accepted";
    heading = (
      <>
        {accepted ? t("invite.joinedHeading") : t("invite.invitedHeading")}
        <br />
        {companyName}.
      </>
    );
    const description = t(`team.roleDescriptions.${invite.role}`);
    body = (
      <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`}>
        <div className="rounded-[19px] bg-white p-[22px] text-center sm:p-[28px]">
          {invite.companyLogoUrl ? (
            <img
              src={invite.companyLogoUrl}
              alt=""
              className="mx-auto h-[64px] w-[64px] rounded-[14px] border border-black/[0.06] bg-white object-contain"
            />
          ) : (
            <span className="mx-auto flex h-[64px] w-[64px] items-center justify-center rounded-[14px] bg-brand-teal-soft text-2xl text-brand-teal-dark">
              {companyName.charAt(0).toUpperCase()}
            </span>
          )}

          <p className="mt-[14px] text-sm leading-[20px] text-[#4B5468]">
            {accepted ? (
              t("invite.alreadyAccepted")
            ) : (
              <>
                {invite.inviterName ? t("invite.invitedBy", { name: invite.inviterName }) : t("invite.youveBeenInvited")}{" "}
                {t("invite.toJoinAs")} <span className="font-semibold text-[#141B2E]">{t(`team.roles.${invite.role}`)}</span> —{" "}
                {description.charAt(0).toLowerCase() + description.slice(1)}
              </>
            )}
          </p>
          <p className="mt-[10px] text-xs text-[#9AA3B2]">{t("invite.inviteFor", { email: inviteEmail })}</p>

          {signedInEmail && !isInvitee && (
            <p className="mt-[16px] rounded-[12px] border border-[#FBE7B3] bg-brand-gold-soft p-[12px] text-left text-xs leading-[18px] text-[#141B2E]">
              {t("invite.wrongAccountBefore")} <span className="font-semibold">{signedInEmail}</span>
              {t("invite.wrongAccountMiddle")} <span className="font-semibold">{inviteEmail}</span>
              {t("invite.wrongAccountAfter", { email: signedInEmail })}
            </p>
          )}

          {error && <p className="mt-[12px] text-xs text-red-500">{error}</p>}

          <div className="mt-[20px] flex flex-col gap-[8px]">
            <button type="button" disabled={busy} onClick={handleMain} className={primaryButton}>
              {accepted
                ? isInvitee
                  ? t("invite.goToDashboard")
                  : t("invite.signInToContinue")
                : signedInEmail && !isInvitee
                  ? t("invite.switchAccount", { email: inviteEmail })
                  : isInvitee
                    ? t("invite.accept")
                    : t("invite.acceptAndSignIn")}
            </button>
            {!accepted && (
              <button type="button" disabled={busy} onClick={handleDecline} className={secondaryButton}>
                {t("invite.decline")}
              </button>
            )}
          </div>
          {!accepted && !isInvitee && (
            <p className="mt-[12px] text-xs text-[#9AA3B2]">
              {signedInEmail ? t("invite.signInHintSwitch", { email: inviteEmail }) : t("invite.signInHint", { email: inviteEmail })}
            </p>
          )}
        </div>
      </div>
    );
  }

  const pending = invite.state === "pending" || invite.state === "accepted" ? invite : null;

  // Same look as onboarding and the Welcome step: big headline, floating
  // badges down the sides, the card underneath.
  return (
    <main className="flex min-h-[100svh] flex-col overflow-x-clip bg-brand-teal-page pb-[92px]">
      <Navbar pageRole="employer" onboarding />
      <div className="relative">
        <EmployerOnboardingBadges />
        <Hero
          showRoleToggle={false}
          heading={heading}
          subheadingClassName="mb-[40px]"
          subheading={t("invite.subheading")}
          belowNav={<div className="mx-auto w-full max-w-[460px] text-left">{body}</div>}
        />
      </div>

      {authMode && pending && (
        <AuthModal
          mode={authMode}
          role="employer"
          initialEmail={pending.email}
          notice={t("invite.signInNotice", { email: pending.email, company: pending.companyName })}
          onClose={() => setAuthMode(null)}
          onAuthenticated={() => setAuthMode(null)}
          onSwitchToGetStarted={() => setAuthMode("get-started")}
        />
      )}
    </main>
  );
}
