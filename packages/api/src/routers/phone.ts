import { user } from "@jobgiga-app/db/schema/auth";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { checkVerificationCode, sendVerificationCode } from "../lib/phone/verify";
import { toMalaysianMobileE164 } from "../shared/phone";

// biome-ignore lint: db is driver-specific, loosely typed here too.
type AnyDb = any;

// The redesign's /api/phone/{status,send,check} routes, as oRPC procedures
// with the same response shapes, so the ported PhoneVerifyControl works
// unchanged. A number counts as verified for this user when it's the one
// saved on their account and marked verified.
async function isVerifiedForUser(db: AnyDb, userId: string, e164: string) {
	const [row] = await db
		.select({ phoneNumber: user.phoneNumber, phoneVerified: user.phoneVerified })
		.from(user)
		.where(eq(user.id, userId))
		.limit(1);
	return !!row && row.phoneVerified && row.phoneNumber === e164;
}

export const phoneRouter = {
	status: protectedProcedure.input(z.object({ phone: z.string() })).handler(async ({ input, context }) => {
		const e164 = toMalaysianMobileE164(input.phone);
		return {
			// Real Twilio keys, or the local dev stand-in — always available here.
			canVerify: true,
			isMobile: e164 !== null,
			verified: e164 ? await isVerifiedForUser(context.db, context.session.user.id, e164) : false,
		};
	}),

	send: protectedProcedure
		.input(z.object({ phone: z.string(), channel: z.enum(["sms", "call"]).default("sms") }))
		.handler(async ({ input, context }) => {
			const e164 = toMalaysianMobileE164(input.phone);
			if (!e164) throw new ORPCError("BAD_REQUEST", { message: "Only mobile numbers can be verified." });
			if (await isVerifiedForUser(context.db, context.session.user.id, e164)) return { alreadyVerified: true };
			const result = await sendVerificationCode(context.phone, e164, input.channel);
			if (!result.ok) throw new ORPCError("BAD_REQUEST", { message: result.error });
			return { alreadyVerified: false };
		}),

	check: protectedProcedure
		.input(z.object({ phone: z.string(), code: z.string() }))
		.handler(async ({ input, context }) => {
			const e164 = toMalaysianMobileE164(input.phone);
			if (!e164) throw new ORPCError("BAD_REQUEST", { message: "Only mobile numbers can be verified." });
			const result = await checkVerificationCode(context.phone, e164, input.code);
			if (!result.ok) throw new ORPCError("BAD_REQUEST", { message: result.error });
			const db = context.db as AnyDb;
			await db.update(user).set({ phoneNumber: e164, phoneVerified: true }).where(eq(user.id, context.session.user.id));
			return { verified: true };
		}),
};
