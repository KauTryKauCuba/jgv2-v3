import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon } from "@/components/landing/icons";
import { orpc } from "@/utils/orpc";

type Status = { canVerify: boolean; isMobile: boolean; verified: boolean };

const RESEND_SECONDS = 30;

function errorMessage(err: unknown, fallback: string) {
	return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * The redesign's PhoneVerifyControl, ported. Under a phone field: "Verify this
 * number" → we text (or call) a 6-digit code → type it in → "Phone verified".
 * Remounted (via `key`) whenever the number changes, so a half-finished
 * attempt never carries over to a different number.
 */
export function PhoneVerifyControl({
	phone,
	accent,
	locked = false,
	onUnlock,
	onVerified,
	initialStatus,
}: {
	phone: string;
	accent: "teal" | "gold";
	// The field is greyed out while its number is verified; this offers to unlock it.
	locked?: boolean;
	onUnlock?: () => void;
	// Tells the field whether this exact number is verified.
	onVerified?: (verified: boolean) => void;
	// For the number the page loaded with, so the first frame is already right.
	initialStatus?: Status;
}) {
	const { t } = useTranslation("common");
	const queryClient = useQueryClient();
	const sendMutation = useMutation(orpc.phone.send.mutationOptions());
	const checkMutation = useMutation(orpc.phone.check.mutationOptions());
	// Asks the server a moment after typing stops (the control is remounted per number).
	const [debouncedPhone, setDebouncedPhone] = useState(initialStatus ? phone : "");
	useEffect(() => {
		const timer = setTimeout(() => setDebouncedPhone(phone), 400);
		return () => clearTimeout(timer);
	}, [phone]);
	// Can this number be verified, and is it already? No status, no control —
	// the field still works without it.
	const statusQuery = useQuery({
		...orpc.phone.status.queryOptions({ input: { phone: debouncedPhone } }),
		enabled: debouncedPhone !== "" && debouncedPhone === phone,
		initialData: initialStatus,
		meta: { suppressErrorToast: true },
	});
	const [verifiedHere, setVerifiedHere] = useState(false);
	const status: Status | null = statusQuery.data
		? { ...statusQuery.data, verified: statusQuery.data.verified || verifiedHere }
		: null;
	const [step, setStep] = useState<"idle" | "sending" | "code" | "checking" | "calling">("idle");
	const [sentBy, setSentBy] = useState<"sms" | "call">("sms");
	const [pending, setPending] = useState<"sms" | "call" | null>(null);
	const [code, setCode] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [cooldown, setCooldown] = useState(0);

	const text = accent === "gold" ? "text-brand-gold-dark" : "text-brand-teal-dark";
	const soft = accent === "gold" ? "bg-brand-gold-soft" : "bg-brand-teal-soft";
	const ring = accent === "gold" ? "focus:border-brand-gold-dark" : "focus:border-brand-teal-dark";

	const isVerified = !!status && status.canVerify && status.isMobile && status.verified;
	const hasStatus = status !== null;
	useEffect(() => {
		if (hasStatus) onVerified?.(isVerified);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [hasStatus, isVerified]);

	useEffect(() => {
		if (cooldown <= 0) return;
		const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
		return () => clearTimeout(timer);
	}, [cooldown]);

	async function sendCode(channel: "sms" | "call" = "sms") {
		setError(null);
		setPending(channel);
		setStep(step === "code" ? "calling" : "sending");
		try {
			const data = await sendMutation.mutateAsync({ phone, channel });
			if (data.alreadyVerified) {
				setVerifiedHere(true);
				setStep("idle");
				return;
			}
			setCode("");
			setSentBy(channel);
			setCooldown(RESEND_SECONDS);
			setStep("code");
		} catch (err) {
			setError(errorMessage(err, t("form.phone.sendError")));
			setStep(step === "code" || step === "calling" ? "code" : "idle");
		}
	}

	async function confirm() {
		setError(null);
		setStep("checking");
		try {
			await checkMutation.mutateAsync({ phone, code });
			setVerifiedHere(true);
			setStep("idle");
			// So the navbar's avatar (and anything else showing it) picks up its seal.
			void queryClient.invalidateQueries({ queryKey: orpc.phone.key() });
			void queryClient.invalidateQueries({ queryKey: orpc.auth.me.key() });
		} catch (err) {
			setError(errorMessage(err, t("form.phone.checkError")));
			setStep("code");
		}
	}

	if (!status || !status.canVerify) return null;

	const local = phone.replace(/^\+?60|^0/, "").trim();

	if (!status.isMobile) {
		return phone.trim() ? <p className="mt-[6px] text-xs text-[#9AA3B2]">{t("form.phone.mobileOnly")}</p> : null;
	}

	if (status.verified) {
		return (
			<p className="mt-[6px] flex items-center gap-[6px] text-xs text-[#2F9E56]">
				<span className="flex h-[16px] w-[16px] items-center justify-center rounded-full bg-[#E8F7EE]">
					<CheckIcon className="h-[8px] w-[8px]" />
				</span>
				{t("form.phone.verified")}
				{locked && onUnlock && (
					<button
						type="button"
						onClick={onUnlock}
						className="ml-[6px] text-[#4B5468] underline-offset-2 hover:text-[#141B2E] hover:underline"
					>
						{t("form.phone.changeNumber")}
					</button>
				)}
			</p>
		);
	}

	if (step === "idle" || step === "sending") {
		return (
			<div className="mt-[6px] flex flex-col gap-[6px]">
				<span className="text-xs text-[#4B5468]">{t("form.phone.verifyPrompt")}</span>
				<div className="flex gap-[8px]">
					{(["sms", "call"] as const).map((channel) => (
						<button
							key={channel}
							type="button"
							disabled={step === "sending"}
							onClick={() => sendCode(channel)}
							className={`h-[28px] whitespace-nowrap rounded-full ${soft} px-[12px] text-xs ${text} transition-opacity hover:opacity-80 disabled:opacity-60`}
						>
							{step === "sending" && pending === channel
								? channel === "call"
									? t("form.phone.calling")
									: t("form.phone.sending")
								: channel === "call"
									? t("form.phone.callMe")
									: t("form.phone.textMe")}
						</button>
					))}
				</div>
				{error && <span className="text-xs text-red-500">{error}</span>}
			</div>
		);
	}

	return (
		<div className="mt-[8px] flex flex-col gap-[6px]">
			<p className="text-xs text-[#4B5468]">
				{sentBy === "call" ? t("form.phone.callingHint", { phone: local }) : t("form.phone.textedHint", { phone: local })}
			</p>
			<div className="flex flex-wrap items-center gap-[8px]">
				<input
					type="text"
					inputMode="numeric"
					autoComplete="one-time-code"
					aria-label={t("form.phone.codeLabel")}
					maxLength={6}
					value={code}
					onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
					onKeyDown={(e) => {
						if (e.key === "Enter" && code.length === 6 && step === "code") {
							e.preventDefault();
							void confirm();
						}
					}}
					placeholder="123456"
					className={`h-[34px] w-[130px] rounded-[10px] border border-black/[0.1] px-[12px] text-sm tracking-[3px] text-[#141B2E] outline-none placeholder:tracking-normal placeholder:text-[#9AA3B2] ${ring}`}
				/>
				<button
					type="button"
					disabled={code.length !== 6 || step === "checking"}
					onClick={confirm}
					className={`h-[34px] rounded-full ${soft} px-[16px] text-xs ${text} transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50`}
				>
					{step === "checking" ? t("form.phone.checking") : t("form.phone.confirm")}
				</button>
				<button
					type="button"
					disabled={cooldown > 0 || step === "checking" || step === "calling"}
					onClick={() => sendCode(sentBy)}
					className="text-xs text-[#4B5468] hover:text-[#141B2E] disabled:cursor-not-allowed disabled:opacity-50"
				>
					{cooldown > 0
						? t("form.phone.resendIn", { seconds: cooldown })
						: sentBy === "call"
							? t("form.phone.callAgain")
							: t("form.phone.resendText")}
				</button>
			</div>
			<button
				type="button"
				disabled={cooldown > 0 || step === "checking" || step === "calling"}
				onClick={() => sendCode(sentBy === "call" ? "sms" : "call")}
				className={`w-fit text-xs ${text} hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50`}
			>
				{step === "calling"
					? pending === "call"
						? t("form.phone.calling")
						: t("form.phone.sending")
					: sentBy === "call"
						? t("form.phone.textInstead")
						: t("form.phone.callInstead")}
			</button>
			{error && <p className="text-xs text-red-500">{error}</p>}
		</div>
	);
}
