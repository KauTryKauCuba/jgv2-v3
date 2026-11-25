import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

// Drizzle connected to the Worker's D1 binding, like v1.
export const db = drizzle(env.DB, { schema });
