// The one interface every platform's storage implementation satisfies, per
// the backend portability plan's rule #6: "All files go through the storage
// module, and the database stores file keys only, never disk paths or
// URLs." Callers never touch `fs` or an R2 bucket directly.
export type Storage = {
	save(key: string, data: Uint8Array, contentType?: string): Promise<void>;
	read(key: string): Promise<Uint8Array | null>;
	delete(key: string): Promise<void>;
	// A key for a private-files API route to resolve (once that route
	// exists) — never a direct disk path or a public URL.
	privateLink(key: string): string;
};
