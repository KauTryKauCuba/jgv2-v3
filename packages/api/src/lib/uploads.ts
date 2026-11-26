import type { Storage } from "./storage/types";

// The redesign's src/lib/uploads.ts, rewritten to go through the storage
// module (portability rule #6): files are saved under a key like
// "avatars/<uuid>.png", the database stores only that key, and the browser
// gets `<api origin>/files/<key>`, served by the signed-in-only /files route
// in apps/server/src/app.ts.

export type UploadCategory =
	| "logos"
	| "avatars"
	| "office-photos"
	| "resumes"
	| "certificates"
	| "posters"
	| "banners"
	| "gallery"
	| "leaders"
	| "ssm-documents";

const EXTENSION_BY_MIME: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/jpg": "jpg",
	"image/webp": "webp",
	"image/gif": "gif",
	"image/svg+xml": "svg",
	"application/pdf": "pdf",
	"application/msword": "doc",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = Object.fromEntries(
	Object.entries(EXTENSION_BY_MIME)
		.filter(([mime]) => mime !== "image/jpg")
		.map(([mime, ext]) => [ext, mime]),
);

export function isBase64DataUrl(value: unknown): boolean {
	return typeof value === "string" && /^data:[^;]+;base64,/.test(value);
}

export async function saveBufferUpload(
	storage: Storage,
	bytes: Uint8Array,
	mimeType: string,
	category: UploadCategory,
): Promise<string> {
	const extension = EXTENSION_BY_MIME[mimeType.toLowerCase()] ?? "bin";
	const key = `${category}/${crypto.randomUUID()}.${extension}`;
	await storage.save(key, bytes, mimeType);
	return key;
}

/** Decodes a `data:<mime>;base64,<data>` string once and saves the bytes — the base64 itself is never stored. */
export async function saveBase64Upload(storage: Storage, dataUrl: string, category: UploadCategory): Promise<string> {
	const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
	if (!match?.[1] || !match[2]) throw new Error("Not a base64 data URL.");
	const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
	return saveBufferUpload(storage, bytes, match[1], category);
}

/** The browser-facing URL for a stored file key. External URLs (e.g. a Google photo) pass through. */
export function fileUrl(origin: string, keyOrUrl: string | null | undefined): string | null {
	if (!keyOrUrl) return null;
	if (/^https?:\/\//i.test(keyOrUrl)) return keyOrUrl;
	return `${origin}/files/${keyOrUrl}`;
}

/** Back from a URL the browser sent (one this API handed out) to its storage key; anything else as-is. */
export function keyFromFileUrl(value: string): string {
	const at = value.indexOf("/files/");
	return at === -1 ? value : value.slice(at + "/files/".length);
}

/**
 * Whatever the browser sent for a file field: a fresh data URL → saved, its
 * key returned; a URL we handed out earlier → its key; an external URL →
 * unchanged; empty → null.
 */
export async function resolveUpload(
	storage: Storage | undefined,
	value: unknown,
	category: UploadCategory,
): Promise<string | null> {
	if (typeof value !== "string" || !value.trim()) return null;
	const text: string = value;
	if (isBase64DataUrl(text)) {
		if (!storage) throw new Error("File storage isn't configured.");
		return saveBase64Upload(storage, text, category);
	}
	return keyFromFileUrl(text.trim());
}
