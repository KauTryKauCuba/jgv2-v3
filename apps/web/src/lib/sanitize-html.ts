import DOMPurify from "dompurify";

// The redesign's src/lib/sanitizeHtml.ts, browser half. Same allowlist —
// only what the RichTextEditor can produce — so pasted or hand-crafted HTML
// can't smuggle in scripts or event handlers. The redesign used
// isomorphic-dompurify for both sides; its server half needs jsdom, which
// can't run on Cloudflare Workers, so the server sanitizes with its own
// pure-JS copy of this allowlist (packages/api/src/lib/sanitize-html.ts).
export const SANITIZE_CONFIG = {
	ALLOWED_TAGS: ["b", "strong", "i", "em", "u", "ul", "ol", "li", "blockquote", "code", "a", "br", "div"],
	ALLOWED_ATTR: ["href"],
};

export function sanitizeDescriptionHtml(html: string): string {
	return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}
