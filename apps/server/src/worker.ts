// Cloudflare entrypoint. Reads config from the Worker's bindings/vars,
// picks the D1 driver and R2 storage (the only place this entrypoint
// decides those), and builds the shared app from app.ts. All actual logic
// lives there.
import { createR2Storage } from "@jobgiga-app/api/lib/storage/r2";
import { createD1Db } from "@jobgiga-app/db/d1";
import { env } from "cloudflare:workers";
import { createApp } from "./app";

const db = createD1Db(env.DB);
const storage = createR2Storage(env.STORAGE);

export default createApp({ ...env, db, storage });
