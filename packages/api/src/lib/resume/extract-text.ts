// PDF and .docx text extraction, as in the redesign's resume-parser.ts
// (extractResumeText): told apart by file name. unpdf and mammoth are pure
// JS/WASM, so this runs on both Bun and Cloudflare Workers.
import { extractText as extractPdfText } from "unpdf";

export async function extractResumeText(bytes: Uint8Array, fileName: string): Promise<string> {
	const name = fileName.toLowerCase();

	if (name.endsWith(".pdf")) {
		const result = await extractPdfText(new Uint8Array(bytes), { mergePages: true });
		return Array.isArray(result.text) ? result.text.join("\n") : result.text;
	}

	if (name.endsWith(".docx")) {
		const mammoth = await import("mammoth");
		const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
		return result.value;
	}

	throw new Error("Unsupported file type.");
}
