// Ported from the redesign's src/lib/phone-verification.ts: the core
// Twilio Verify send/check calls and its dev-mode stand-in (no Twilio keys
// → no real text is sent and the fixed code below is accepted).
//
// Not ported yet: the redesign's multi-tier rate limits (per phone, per
// user, per IP, platform-wide daily budget + alert email) and its
// phone_verification_attempts table. Flagged as a gap to close before launch.

const REQUEST_TIMEOUT_MS = 15_000;
const NETWORK_RETRIES = 2;

/** With no Twilio keys, this code is accepted so the flow can be tried locally. */
export const DEV_VERIFICATION_CODE = "123456";

export type TwilioConfig = { keySid: string; keySecret: string; serviceSid: string };
export type VerificationChannel = "sms" | "call";
export type VerificationResult = { ok: true } | { ok: false; error: string; status: number };

type TwilioResponse = { status?: string; code?: number; message?: string };

async function twilioPost(
	cfg: TwilioConfig,
	path: string,
	form: Record<string, string>,
): Promise<{ httpStatus: number; data: TwilioResponse } | null> {
	const auth = btoa(`${cfg.keySid}:${cfg.keySecret}`);
	for (let attempt = 0; attempt <= NETWORK_RETRIES; attempt++) {
		try {
			const res = await fetch(`https://verify.twilio.com/v2/Services/${cfg.serviceSid}/${path}`, {
				method: "POST",
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams(form),
			});
			const data = (await res.json().catch(() => ({}))) as TwilioResponse;
			return { httpStatus: res.status, data };
		} catch (err) {
			console.error(`Twilio Verify request failed (attempt ${attempt + 1}/${NETWORK_RETRIES + 1}):`, err);
		}
	}
	return null;
}

function friendlyTwilioError(code: number | undefined, fallback: string): { error: string; status: number } {
	switch (code) {
		case 60203:
			return { error: "Too many codes have been sent to this number. Try again in a while.", status: 429 };
		case 60202:
			return { error: "Too many wrong tries. Request a new code in a while.", status: 429 };
		case 60200:
		case 60205:
		case 21211:
		case 21614:
			return { error: "We can't send a text to that number. Check it's a Malaysian mobile number.", status: 400 };
		case 60223:
			return { error: "Phone calls aren't available right now. Try the text again in a moment.", status: 503 };
		case 21608:
			return {
				error: "We can't text that number yet. Phone verification isn't fully open — try again later.",
				status: 403,
			};
		case 20404:
			return { error: "That code has expired. Request a new one.", status: 400 };
		default:
			return { error: fallback, status: 502 };
	}
}

/** Sends a 6-digit code to a Malaysian mobile, by text or by a phone call. */
export async function sendVerificationCode(
	cfg: TwilioConfig | null,
	e164: string,
	channel: VerificationChannel = "sms",
): Promise<VerificationResult> {
	if (!cfg) {
		console.log(`[dev] Phone verification code for ${e164} (by ${channel}) is ${DEV_VERIFICATION_CODE}`);
		return { ok: true };
	}
	const result = await twilioPost(cfg, "Verifications", { To: e164, Channel: channel });
	if (!result) return { ok: false, error: "Couldn't reach the text-message service. Try again.", status: 502 };
	if (result.httpStatus >= 400) {
		console.error("Twilio Verify send refused:", result.httpStatus, result.data.code, result.data.message);
		return { ok: false, ...friendlyTwilioError(result.data.code, "We couldn't send the code. Try again in a moment.") };
	}
	return { ok: true };
}

/** Checks the code the person typed. */
export async function checkVerificationCode(
	cfg: TwilioConfig | null,
	e164: string,
	code: string,
): Promise<VerificationResult> {
	if (!cfg) {
		return code === DEV_VERIFICATION_CODE ? { ok: true } : { ok: false, error: "That code isn't right.", status: 400 };
	}
	const result = await twilioPost(cfg, "VerificationCheck", { To: e164, Code: code });
	if (!result) return { ok: false, error: "Couldn't reach the text-message service. Try again.", status: 502 };
	if (result.httpStatus >= 400) {
		console.error("Twilio Verify check refused:", result.httpStatus, result.data.code, result.data.message);
		return { ok: false, ...friendlyTwilioError(result.data.code, "We couldn't check the code. Try again.") };
	}
	return result.data.status === "approved" ? { ok: true } : { ok: false, error: "That code isn't right.", status: 400 };
}
