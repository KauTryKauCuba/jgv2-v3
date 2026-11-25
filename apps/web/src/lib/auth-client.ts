import { createAuthClient } from "better-auth/react";
import { adminClient, organizationClient } from "better-auth/client/plugins";

// Same Better-Auth client and plugins as v1. Once the auth package exists,
// add `inferAdditionalFields<typeof auth>()` so custom user fields are typed.
export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_SERVER_URL,
	plugins: [adminClient(), organizationClient()],
});
