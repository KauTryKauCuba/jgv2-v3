// Ported verbatim from the redesign's src/lib/richText.ts — client-safe.

// For fields that used to be plain text (real "\n" line breaks) before
// becoming RichTextEditor fields — a value that's already HTML is left
// untouched, so this only helps older plain-text values (or an AI-parsed
// plain-text result) being dropped into the editor.
export function plainTextToHtml(text: string): string {
	if (/<[a-z][\s\S]*>/i.test(text)) return text;
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}
