import sanitizeHtml from "sanitize-html";

// The redesign's src/lib/sanitizeHtml.ts, server half. Same allowlist as the
// browser's copy (apps/web/src/lib/sanitize-html.ts) — only what the
// RichTextEditor can produce. The redesign used isomorphic-dompurify, whose
// server side needs jsdom, which can't run on Cloudflare Workers;
// sanitize-html is pure JS and runs on both Bun and Workers.
const ALLOWED_TAGS = ["b", "strong", "i", "em", "u", "ul", "ol", "li", "blockquote", "code", "a", "br", "div"];

export function sanitizeDescriptionHtml(html: string): string {
	return sanitizeHtml(html, {
		allowedTags: ALLOWED_TAGS,
		allowedAttributes: { a: ["href"] },
	});
}
