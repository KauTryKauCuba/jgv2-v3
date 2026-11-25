// Cloudflare entrypoint. Reads config from the Worker's bindings/vars,
// picks the D1 driver (the only place this entrypoint decides that), and
// builds the shared app from app.ts. All actual logic lives there.
import { createD1Db } from "@jobgiga-app/db/d1";
import { env } from "cloudflare:workers";
import { createApp } from "./app";

const db = createD1Db(env.DB);

export default createApp({ ...env, db });
