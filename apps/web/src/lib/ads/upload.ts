import type { AppRouterClient } from "@jobgiga-app/api/routers/index";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

// ads.book with an upload progress bar. The redesign posted the form with
// XMLHttpRequest for `upload.onprogress` (fetch has no upload progress);
// here oRPC builds the request as usual (multipart for the file) and this
// link sends it with XMLHttpRequest instead of fetch, so the call, its
// errors (ORPCError) and its types stay oRPC's.

export type BookAdInput = Parameters<AppRouterClient["ads"]["book"]>[0];

// Headers a browser sets itself and won't let a page set.
const UNSAFE_HEADERS = new Set(["content-length", "host", "connection", "cookie", "origin", "referer"]);

function parseHeaders(raw: string) {
	const headers = new Headers();
	for (const line of raw.trim().split(/[\r\n]+/)) {
		const at = line.indexOf(":");
		if (at > 0) headers.append(line.slice(0, at).trim(), line.slice(at + 1).trim());
	}
	return headers;
}

async function xhrFetch(request: Request, onProgress: (percent: number) => void): Promise<Response> {
	const body = request.method === "GET" || request.method === "HEAD" ? null : await request.blob();
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open(request.method, request.url);
		xhr.withCredentials = true;
		xhr.responseType = "blob";
		request.headers.forEach((value, key) => {
			if (!UNSAFE_HEADERS.has(key.toLowerCase())) xhr.setRequestHeader(key, value);
		});
		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
		};
		xhr.onload = () => {
			const empty = xhr.status === 204 || xhr.status === 205 || xhr.status === 304;
			resolve(
				new Response(empty ? null : (xhr.response as Blob), {
					status: xhr.status,
					statusText: xhr.statusText,
					headers: parseHeaders(xhr.getAllResponseHeaders()),
				}),
			);
		};
		xhr.onerror = () => reject(new TypeError("Network request failed"));
		xhr.onabort = () => reject(new TypeError("Network request aborted"));
		xhr.send(body);
	});
}

/** Books (or edits) an ad, reporting the upload's progress as 0–100. */
export function bookAdWithProgress(input: BookAdInput, onProgress: (percent: number) => void) {
	const link = new RPCLink({
		url: `${import.meta.env.VITE_SERVER_URL}/rpc`,
		fetch: (request) => xhrFetch(request, onProgress),
	});
	const client: AppRouterClient = createORPCClient(link);
	return client.ads.book(input);
}
