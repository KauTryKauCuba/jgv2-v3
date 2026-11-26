import { createAuthClient } from "better-auth/react";
import { adminClient, emailOTPClient } from "better-auth/client/plugins";

// Matches packages/auth: admin + email-OTP sign-in (redesign's flow — email
// + 6-digit code, no password). organizationClient isn't added yet since
// the server-side organization plugin is still disabled (see
// packages/auth/src/index.ts) — add it back alongside that.
export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_SERVER_URL,
	plugins: [adminClient(), emailOTPClient()],
});
