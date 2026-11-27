import { sanitizeDescriptionHtml } from "@/lib/sanitize-html";

// The redesign's RichTextContent: renders HTML produced by RichTextEditor,
// shared so every place that displays a rich-text field styles
// bold/lists/links the same way. Sanitized again here (same allowlist as
// the editor) since the HTML comes from the server.
export function RichTextContent({ html, className = "" }: { html: string; className?: string }) {
  return (
    <div
      className={`[&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-black/[0.15] [&_blockquote]:pl-[12px] [&_code]:rounded [&_code]:bg-black/[0.06] [&_code]:px-[4px] [&_code]:py-[1px] [&_ol]:list-decimal [&_ol]:pl-[20px] [&_ul]:list-disc [&_ul]:pl-[20px] ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizeDescriptionHtml(html) }}
    />
  );
}
