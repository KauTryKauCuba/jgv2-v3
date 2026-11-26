import { toMalaysianMobileE164 } from "@jobgiga-app/api/shared/phone";
import { useEffect, useState } from "react";
import { Field } from "@/components/landing/field";
import { inputClass as formInputClass } from "@/lib/landing/form-styles";
import { PhoneVerifyControl } from "./phone-verify-control";

/** Brings a phone field into the middle of the screen and puts the cursor in it. */
export function focusPhoneField(id: string) {
	const input = document.getElementById(id);
	if (!input) return;
	input.scrollIntoView({ block: "center", behavior: "smooth" });
	input.focus({ preventScroll: true });
}

// The redesign's PhoneInput, ported.
export function PhoneInput({
	id,
	label,
	value,
	onChange,
	accent = "teal",
	className = "",
	required = false,
	verifiable = false,
	onVerifiedChange,
	initialStatus,
	db = "user.phoneNumber",
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	accent?: "teal" | "gold";
	className?: string;
	required?: boolean;
	// Offers "Verify this number" (a text-message code) under the field.
	verifiable?: boolean;
	// Tells the form whether the number now in the field is verified.
	onVerifiedChange?: (verified: boolean) => void;
	// For the number the page loaded with — makes the first frame correct.
	initialStatus?: { canVerify: boolean; verified: boolean };
	// Development-only DB map key (see src/dev/db-map): where this number is saved.
	db?: string;
}) {
	// The server's status applies only to the number the page loaded with,
	// and only until the field first changes.
	const [initialValue] = useState(value);
	const [initialStillValid, setInitialStillValid] = useState(true);
	if (initialStillValid && value !== initialValue) setInitialStillValid(false);
	// While the field shows exactly the verified number, it's locked —
	// "Change number" unlocks it.
	const [verifiedValue, setVerifiedValue] = useState<string | null>(initialStatus?.verified ? value : null);
	const [unlocked, setUnlocked] = useState(false);
	const locked = verifiable && verifiedValue === value && !unlocked;

	// Arriving from the "Verify your phone number" bar (…/profile#phone).
	useEffect(() => {
		if (!verifiable || window.location.hash !== `#${id}`) return;
		const timer = setTimeout(() => focusPhoneField(id), 150);
		return () => clearTimeout(timer);
	}, [verifiable, id]);

	// The static "+60" and the <input> share one bordered box.
	const wrapperClass = formInputClass(accent).replace("focus:border", "focus-within:border");

	return (
		<Field required={required} label={label} htmlFor={id} className={className}>
			<div
				className={`flex items-center gap-[8px] ${wrapperClass} ${locked ? "cursor-not-allowed bg-[#F8FAFB]" : "bg-white"}`}
			>
				<span className="shrink-0 border-r border-black/[0.1] pr-[8px] text-sm text-[#4B5468]">+60</span>
				<input
					id={id}
					type="tel"
					value={value}
					disabled={locked}
					onChange={(e) => onChange(e.target.value)}
					placeholder="12-345 6789"
					data-db={db}
					className={`w-full bg-transparent text-sm outline-none placeholder:text-[#9AA3B2] ${
						locked ? "cursor-not-allowed text-[#9AA3B2]" : "text-[#141B2E]"
					}`}
				/>
			</div>
			{verifiable && (
				<PhoneVerifyControl
					key={toMalaysianMobileE164(value) ?? "none"}
					phone={value}
					accent={accent}
					locked={locked}
					initialStatus={
						initialStatus && initialStillValid
							? {
									canVerify: initialStatus.canVerify,
									isMobile: toMalaysianMobileE164(value) !== null,
									verified: initialStatus.verified,
								}
							: undefined
					}
					onUnlock={() => setUnlocked(true)}
					onVerified={(verified) => {
						setVerifiedValue(verified ? value : null);
						if (verified) setUnlocked(false);
						onVerifiedChange?.(verified);
					}}
				/>
			)}
		</Field>
	);
}
