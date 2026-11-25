// Better-Auth setup goes here, as in v1's packages/auth.
//
// It needs the login tables (user, session, account, verification, plus
// organization and member for the organization plugin) in packages/db first.
// Once they exist, export the configured instance, for example:
//
//   import { betterAuth } from "better-auth";
//   import { drizzleAdapter } from "better-auth/adapters/drizzle";
//   import { admin, organization, bearer } from "better-auth/plugins";
//   import { db } from "@jobgiga-app/db";
//   import * as schema from "@jobgiga-app/db/schema/auth";
//
//   export const auth = betterAuth({
//     database: drizzleAdapter(db, { provider: "sqlite", schema }),
//     emailAndPassword: { enabled: true },
//     plugins: [admin(), organization(), bearer()],
//   });
//
// then mount it in apps/server at /api/auth/*.
export {};
