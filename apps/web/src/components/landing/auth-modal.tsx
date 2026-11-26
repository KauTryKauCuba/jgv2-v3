import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { authClient } from "@/lib/auth-client";
import { showComingSoon } from "@/lib/coming-soon";
import { postAuthRedirect } from "@/lib/route-guards";
import { orpc } from "@/utils/orpc";
import { Field } from "./field";
import { Modal } from "./modal";

export type AuthMode = "sign-in" | "get-started";
export type AuthRole = "employer" | "jobseeker";

const OTP_LENGTH = 6;

// From the redesign's AuthModal: email + 6-digit code, no password, with
// Google as an alternative. Trimmed for this first step — the role toggle,
// the "both accounts exist" role-choice step, and the Google-callback error
// handling are left out; the page already knows which side (`role`) the
// visitor is on, same as the redesign's `lockRole` case, and Google itself
// isn't wired up yet (shows "Coming soon").
function GoogleIcon({ className = "" }: { className?: string }) {
	return (
		<svg viewBox="0 0 20 20" className={className} aria-hidden>
			<path
				d="M19.6 10.23c0-.68-.06-1.33-.17-1.96H10v3.71h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.99-4.3 2.99-7.27Z"
				fill="#4285F4"
			/>
			<path
				d="M10 20c2.7 0 4.96-.9 6.61-2.43l-3.23-2.5c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H1.08v2.59A10 10 0 0 0 10 20Z"
				fill="#34A853"
			/>
			<path
				d="M4.41 11.9a6.02 6.02 0 0 1 0-3.8V5.51H1.08a10 10 0 0 0 0 8.98l3.33-2.59Z"
				fill="#FBBC05"
			/>
			<path
				d="M10 3.98c1.47 0 2.79.5 3.83 1.49l2.87-2.87A9.6 9.6 0 0 0 10 0a10 10 0 0 0-8.92 5.51l3.33 2.59C5.2 5.74 7.4 3.98 10 3.98Z"
				fill="#EA4335"
			/>
		</svg>
	);
}

export function AuthModal({
	mode,
	role,
	onClose,
	onAuthenticated,
	onSwitchToGetStarted,
}: {
	mode: AuthMode;
	role: AuthRole;
	onClose: () => void;
	onAuthenticated: () => void;
	// Sign-in's "no account found" case means the visitor is in the wrong
	// flow, not that they mistyped something — offered as a direct "Get
	// started" button instead, same as the redesign's AuthModal.
	onSwitchToGetStarted?: () => void;
}) {
	const { t } = useTranslation("common");
	const navigate = useNavigate();
	const accountExistsMutation = useMutation(orpc.auth.accountExists.mutationOptions());
	const isSignIn = mode === "sign-in";
	const [step, setStep] = useState<"email" | "otp">("email");
	const [email, setEmail] = useState("");
	const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
	const [sending, setSending] = useState(false);
	const [verifying, setVerifying] = useState(false);
	const [resending, setResending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [accountNotFound, setAccountNotFound] = useState(false);
	const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
	const verifyRequestId = useRef(0);

	useEffect(() => {
		if (step === "otp") otpRefs.current[0]?.focus();
	}, [step]);

	// The parent switches `mode` in place (no remount) when the visitor clicks
	// "Get started" off the account-not-found error above — clear that error
	// once the mode actually changes. Adjusted during render (not a useEffect)
	// so it happens before the "Create your account" title paints, not after.
	const [prevMode, setPrevMode] = useState(mode);
	if (mode !== prevMode) {
		setPrevMode(mode);
		setError(null);
		setAccountNotFound(false);
	}

	async function requestOtp(targetEmail: string) {
		const { error: otpError } = await authClient.emailOtp.sendVerificationOtp({
			email: targetEmail,
			type: "sign-in",
		});
		if (otpError) throw new Error(otpError.message ?? t("auth.sendCodeError"));
	}

	async function handleEmailSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setAccountNotFound(false);
		const targetEmail = email.trim();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
			setError(t("auth.invalidEmail"));
			return;
		}
		setSending(true);
		try {
			// Sign-in only works for an account that already exists — v1
			// requires a prior sign-up, and the redesign 404s the same way
			// (see otp/request's role-omitted branch). Without this check,
			// Better-Auth's emailOTP plugin would happily create a brand new
			// account the moment anyone verifies a code, even from "Sign in".
			if (isSignIn) {
				const { exists } = await accountExistsMutation.mutateAsync({ email: targetEmail });
				if (!exists) {
					setAccountNotFound(true);
					setError(t("auth.accountNotFound"));
					return;
				}
			}
			await requestOtp(targetEmail);
			setOtp(Array(OTP_LENGTH).fill(""));
			setStep("otp");
		} catch (err) {
			setError(err instanceof Error ? err.message : t("auth.sendCodeError"));
		} finally {
			setSending(false);
		}
	}

	async function handleResend() {
		setError(null);
		setResending(true);
		try {
			await requestOtp(email);
		} catch (err) {
			setError(err instanceof Error ? err.message : t("auth.resendError"));
		} finally {
			setResending(false);
		}
	}

	function handleOtpChange(index: number, value: string) {
		const digit = value.replace(/\D/g, "").slice(-1);
		setOtp((prev) => {
			const next = [...prev];
			next[index] = digit;
			return next;
		});
		if (digit && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
	}

	function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === "Backspace" && !otp[index] && index > 0) {
			otpRefs.current[index - 1]?.focus();
		}
	}

	function handleOtpPaste(e: React.ClipboardEvent<HTMLInputElement>) {
		const digits = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
		if (!digits) return;
		e.preventDefault();
		setOtp((prev) => {
			const next = [...prev];
			for (let i = 0; i < OTP_LENGTH; i++) next[i] = digits[i] ?? next[i];
			return next;
		});
		otpRefs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus();
	}

	async function handleOtpSubmit(e: React.FormEvent) {
		e.preventDefault();
		const requestId = ++verifyRequestId.current;
		setError(null);
		setVerifying(true);
		try {
			const { error: verifyError } = await authClient.signIn.emailOtp({
				email,
				otp: otp.join(""),
			});
			if (requestId !== verifyRequestId.current) return;
			if (verifyError) throw new Error(verifyError.message ?? t("auth.verifyCodeError"));
			onAuthenticated();
			// The redesign's getPostAuthRedirect: onboarding first if it's not
			// done yet, otherwise that role's dashboard. Doesn't yet cover the
			// invited-teammate "/employer/welcome" case (team invites aren't built).
			try {
				navigate({ to: await postAuthRedirect(role) });
			} catch {
				// Non-fatal — the visitor is still signed in either way.
			}
		} catch (err) {
			if (requestId !== verifyRequestId.current) return;
			setError(err instanceof Error ? err.message : t("auth.verifyCodeError"));
		} finally {
			if (requestId === verifyRequestId.current) setVerifying(false);
		}
	}

	const otpComplete = otp.every((d) => d !== "");

	return (
		<Modal onClose={onClose} ariaLabel={isSignIn ? t("auth.signIn") : t("auth.getStarted")}>
			<div className="flex items-start justify-between">
				<img src="/jg-logo.svg" alt="JobGiga" width={111} height={28} />
				<button
					type="button"
					onClick={onClose}
					aria-label={t("common.close")}
					className="flex h-[28px] w-[28px] items-center justify-center rounded-full text-[#9AA3B2] transition-colors hover:bg-black/[0.05] hover:text-[#141B2E]"
				>
					×
				</button>
			</div>

			{step === "email" ? (
				<>
					<h2 className="mt-[16px] text-lg font-semibold text-[#141B2E]">
						{isSignIn ? t("auth.welcomeBack") : t("auth.createAccountTitle")}
					</h2>
					<p className="mt-[6px] text-sm leading-[20px] text-[#4B5468]">
						{isSignIn
							? t("auth.enterEmailToContinue")
							: t("auth.createAccountSubtitle", { role: t(`landing.roles.${role}`) })}
					</p>

					<form onSubmit={handleEmailSubmit} noValidate className="mt-[24px] flex flex-col gap-[12px]">
						<button
							type="button"
							onClick={showComingSoon}
							className="flex h-[38px] items-center justify-center gap-[10px] rounded-full border border-black/[0.1] text-sm text-[#141B2E] transition-colors hover:bg-black/[0.03]"
						>
							<GoogleIcon className="h-[18px] w-[18px]" />
							{t("auth.continueWithGoogle")}
						</button>

						<div className="flex items-center gap-[10px] text-xs text-[#9AA3B2]">
							<div className="h-px flex-1 bg-black/[0.08]" />
							{t("auth.or")}
							<div className="h-px flex-1 bg-black/[0.08]" />
						</div>

						<Field label={t("auth.emailAddress")} htmlFor="auth-email">
							<input
								id="auth-email"
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder={t("auth.emailPlaceholder")}
								required
								data-db={isSignIn ? "action.signIn" : "action.signUp"}
								className="h-[38px] rounded-[12px] border border-black/[0.1] px-[14px] text-sm text-[#141B2E] outline-none placeholder:text-[#9AA3B2] focus:border-brand-teal-dark"
							/>
						</Field>

						{error && <p className="text-xs text-red-500">{error}</p>}

						{accountNotFound && onSwitchToGetStarted ? (
							// Distinct `key` forces a remount rather than reusing the same
							// DOM node — without it, this button's type="button" mutates
							// in place to the other branch's type="submit" as part of the
							// same click's synchronous re-render, and the browser submits
							// the form (a real OTP request) against the new type.
							<button
								key="get-started-cta"
								type="button"
								onClick={onSwitchToGetStarted}
								className={`mt-[4px] flex h-[38px] items-center justify-center rounded-full text-sm transition-opacity hover:opacity-90 ${
									role === "jobseeker" ? "bg-brand-gold text-[#141B2E]" : "bg-brand-teal-dark text-white"
								}`}
							>
								{t("auth.getStarted")}
							</button>
						) : (
							<button
								key="send-code-cta"
								type="submit"
								disabled={sending}
								data-db={isSignIn ? "action.signIn" : "action.signUp"}
								className={`mt-[4px] flex h-[38px] items-center justify-center rounded-full text-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 ${
									isSignIn
										? "bg-[linear-gradient(45deg,var(--color-brand-teal-dark),var(--color-brand-gold))] text-white"
										: role === "jobseeker"
											? "bg-brand-gold text-[#141B2E]"
											: "bg-brand-teal-dark text-white"
								}`}
							>
								{sending ? t("auth.sending") : t("auth.sendCode")}
							</button>
						)}
					</form>
				</>
			) : (
				<>
					<h2 className="mt-[16px] text-lg font-semibold text-[#141B2E]">{t("auth.enterYourCode")}</h2>
					<p className="mt-[6px] text-sm leading-[20px] text-[#4B5468]">
						{t("auth.codeSentToPrefix")} <span className="text-[#141B2E]">{email}</span>.
					</p>

					<form onSubmit={handleOtpSubmit} className="mt-[24px] flex flex-col gap-[16px]">
						<div className="flex justify-between gap-[8px]">
							{otp.map((digit, i) => (
								<input
									key={i}
									ref={(el) => {
										otpRefs.current[i] = el;
									}}
									value={digit}
									onChange={(e) => handleOtpChange(i, e.target.value)}
									onKeyDown={(e) => handleOtpKeyDown(i, e)}
									onPaste={handleOtpPaste}
									inputMode="numeric"
									maxLength={1}
									aria-label={t("auth.digitLabel", { n: i + 1 })}
									className="h-[52px] w-[44px] rounded-[12px] border border-black/[0.1] text-center text-lg text-[#141B2E] outline-none focus:border-brand-teal-dark"
								/>
							))}
						</div>

						{error && <p className="text-xs text-red-500">{error}</p>}

						<button
							type="submit"
							disabled={!otpComplete || verifying}
							data-db={isSignIn ? "action.signIn" : "action.signUp"}
							className="flex h-[38px] items-center justify-center rounded-full bg-brand-teal-dark text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
						>
							{verifying ? t("auth.verifying") : isSignIn ? t("auth.signIn") : t("auth.createAccountCta")}
						</button>

						<div className="flex items-center justify-between text-sm">
							<button
								type="button"
								onClick={() => {
									verifyRequestId.current++;
									setVerifying(false);
									setError(null);
									setStep("email");
								}}
								className="text-[#4B5468] hover:text-[#141B2E]"
							>
								{t("auth.useDifferentEmail")}
							</button>
							<button
								type="button"
								onClick={handleResend}
								disabled={resending}
								className="text-brand-teal-dark hover:opacity-80 disabled:opacity-60"
							>
								{resending ? t("auth.resending") : t("auth.resendCode")}
							</button>
						</div>
					</form>
				</>
			)}
		</Modal>
	);
}
