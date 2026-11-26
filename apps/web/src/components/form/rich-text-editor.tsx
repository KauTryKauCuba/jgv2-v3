import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { sanitizeDescriptionHtml } from "@/lib/sanitize-html";

function exec(command: string, value?: string) {
	document.execCommand(command, false, value);
}

// Keeps the toolbar's mousedown from stealing focus/selection away from the
// contentEditable body — without this, execCommand would do nothing.
function preventBlur(e: React.MouseEvent) {
	e.preventDefault();
}

const buttonClass =
	"flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[6px] text-[#4B5468] hover:bg-black/[0.06]";

// The redesign's RichTextEditor, ported.
export function RichTextEditor({
	id,
	value,
	onChange,
	placeholder,
	disabled = false,
	accent = "teal",
}: {
	id?: string;
	value: string;
	onChange: (html: string) => void;
	placeholder?: string;
	// A contentEditable div isn't a real form control, so an ancestor
	// `<fieldset disabled>` has no effect on it — wired through explicitly.
	disabled?: boolean;
	accent?: "teal" | "gold";
}) {
	const { t } = useTranslation("common");
	const editorRef = useRef<HTMLDivElement | null>(null);
	// Starts at `null`, not `value`, so the first sync below always injects
	// the initial content (restored draft, existing description) into the DOM.
	const lastEmitted = useRef<string | null>(null);
	const [isEmpty, setIsEmpty] = useState(!value);

	// Only pushes `value` into the DOM when it changed from outside (initial
	// load, AI-fill, draft restore) — never while the user is typing, or every
	// keystroke would reset the caret.
	useEffect(() => {
		if (!editorRef.current || value === lastEmitted.current) return;
		const clean = sanitizeDescriptionHtml(value);
		editorRef.current.innerHTML = clean;
		lastEmitted.current = clean;
		setIsEmpty(!editorRef.current.textContent?.trim());
	}, [value]);

	function emitChange() {
		const editor = editorRef.current;
		if (!editor) return;
		const html = sanitizeDescriptionHtml(editor.innerHTML);
		lastEmitted.current = html;
		setIsEmpty(!editor.textContent?.trim());
		onChange(html);
	}

	function run(command: string, commandValue?: string) {
		if (disabled) return;
		editorRef.current?.focus();
		exec(command, commandValue);
		emitChange();
	}

	return (
		<div
			className={`overflow-hidden rounded-[12px] border border-black/[0.1] ${disabled ? "bg-black/[0.03]" : "bg-white"} ${
				accent === "gold" ? "focus-within:border-brand-gold-dark" : "focus-within:border-brand-teal-dark"
			}`}
		>
			{/* Placeholder and editor share one grid cell, so a wrapping
			    placeholder grows the box instead of spilling over the toolbar. */}
			<div className="grid">
				{isEmpty && placeholder && (
					<p className="pointer-events-none px-[14px] py-[10px] text-sm text-[#9AA3B2] [grid-area:1/1]">{placeholder}</p>
				)}
				<div
					ref={editorRef}
					id={id}
					contentEditable={!disabled}
					suppressContentEditableWarning
					onInput={emitChange}
					onBlur={emitChange}
					className={`min-h-[76px] w-full px-[14px] py-[10px] [grid-area:1/1] text-sm text-[#141B2E] outline-none [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-black/[0.15] [&_blockquote]:pl-[12px] [&_blockquote]:text-[#4B5468] [&_code]:rounded [&_code]:bg-black/[0.06] [&_code]:px-[4px] [&_code]:py-[1px] [&_ol]:list-decimal [&_ol]:pl-[20px] [&_ul]:list-disc [&_ul]:pl-[20px] ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
				/>
			</div>

			<div className="flex items-center gap-[2px] border-t border-black/[0.1] bg-[#F8FAFB] px-[8px] py-[6px]">
				<button
					type="button"
					disabled={disabled}
					aria-label={t("form.richText.bold")}
					title={t("form.richText.bold")}
					className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-40`}
					onMouseDown={preventBlur}
					onClick={() => run("bold")}
				>
					B
				</button>
				<button
					type="button"
					disabled={disabled}
					aria-label={t("form.richText.italic")}
					title={t("form.richText.italic")}
					className={`${buttonClass} italic disabled:cursor-not-allowed disabled:opacity-40`}
					onMouseDown={preventBlur}
					onClick={() => run("italic")}
				>
					I
				</button>
				<button
					type="button"
					disabled={disabled}
					aria-label={t("form.richText.underline")}
					title={t("form.richText.underline")}
					className={`${buttonClass} underline disabled:cursor-not-allowed disabled:opacity-40`}
					onMouseDown={preventBlur}
					onClick={() => run("underline")}
				>
					U
				</button>

				<span className="mx-[4px] h-[16px] w-px bg-black/[0.1]" />

				<button
					type="button"
					disabled={disabled}
					aria-label={t("form.richText.bulletList")}
					title={t("form.richText.bulletList")}
					className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-40`}
					onMouseDown={preventBlur}
					onClick={() => run("insertUnorderedList")}
				>
					<svg viewBox="0 0 16 16" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
						<circle cx="2.2" cy="4" r="1" fill="currentColor" stroke="none" />
						<path d="M6 4h8" />
						<circle cx="2.2" cy="8" r="1" fill="currentColor" stroke="none" />
						<path d="M6 8h8" />
						<circle cx="2.2" cy="12" r="1" fill="currentColor" stroke="none" />
						<path d="M6 12h8" />
					</svg>
				</button>
				<button
					type="button"
					disabled={disabled}
					aria-label={t("form.richText.numberedList")}
					title={t("form.richText.numberedList")}
					className={`${buttonClass} disabled:cursor-not-allowed disabled:opacity-40`}
					onMouseDown={preventBlur}
					onClick={() => run("insertOrderedList")}
				>
					<svg viewBox="0 0 16 16" className="h-[15px] w-[15px]" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
						<text x="0.5" y="5" fontSize="4.5" fill="currentColor" stroke="none">
							1
						</text>
						<path d="M6 4h8" />
						<text x="0.5" y="9" fontSize="4.5" fill="currentColor" stroke="none">
							2
						</text>
						<path d="M6 8h8" />
						<text x="0.5" y="13" fontSize="4.5" fill="currentColor" stroke="none">
							3
						</text>
						<path d="M6 12h8" />
					</svg>
				</button>
			</div>
		</div>
	);
}
