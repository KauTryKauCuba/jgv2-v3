import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import type { Storage } from "./types";

// VPS/Bun storage: a folder on disk (a Docker volume once deployed). Never
// imported from shared app code — only the Bun entrypoint picks this, same
// as createSqliteDb.
export function createLocalStorage(baseDir: string): Storage {
	function resolvePath(key: string) {
		// A key is never a path a caller controls directly (it's generated
		// server-side — see resume.ts), but guard against traversal anyway:
		// reject anything that would resolve outside baseDir.
		const resolved = normalize(join(baseDir, key));
		if (!resolved.startsWith(normalize(baseDir) + sep) && resolved !== normalize(baseDir)) {
			throw new Error(`Invalid storage key: ${key}`);
		}
		return resolved;
	}

	return {
		async save(key, data) {
			const path = resolvePath(key);
			await mkdir(dirname(path), { recursive: true });
			await writeFile(path, data);
		},
		async read(key) {
			try {
				const buf = await readFile(resolvePath(key));
				return new Uint8Array(buf);
			} catch {
				return null;
			}
		},
		async delete(key) {
			await rm(resolvePath(key), { force: true });
		},
		privateLink(key) {
			return `/files/${key}`;
		},
	};
}
