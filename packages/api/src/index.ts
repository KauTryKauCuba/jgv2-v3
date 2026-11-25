import { os } from "@orpc/server";
import type { Context } from "./context";

export const o = os.$context<Context>();

// Anyone can call these. Add `protectedProcedure` (signed-in users only)
// here once packages/auth is set up, as in v1.
export const publicProcedure = o;
