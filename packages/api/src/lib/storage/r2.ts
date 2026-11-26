import type { Storage } from "./types";

// Cloudflare storage: an R2 bucket, swapped in for createLocalStorage with
// no change to any caller (same Storage interface). Never imported from
// shared app code — only the Worker entrypoint picks this.
export function createR2Storage(bucket: R2Bucket): Storage {
	return {
		async save(key, data, contentType) {
			await bucket.put(key, data, contentType ? { httpMetadata: { contentType } } : undefined);
		},
		async read(key) {
			const obj = await bucket.get(key);
			if (!obj) return null;
			return new Uint8Array(await obj.arrayBuffer());
		},
		async delete(key) {
			await bucket.delete(key);
		},
		privateLink(key) {
			return `/files/${key}`;
		},
	};
}
