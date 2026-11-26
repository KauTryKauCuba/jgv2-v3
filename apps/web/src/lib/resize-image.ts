// Resizes a photo in the browser before it's uploaded — what the redesign's
// server did with `sharp` (which can't run on Cloudflare Workers): turn it the
// right way up, fit or crop it to a size, and save it as a light WebP.
// Browsers that can't encode WebP give PNG instead; the server accepts both.

export type ResizeOptions = {
	width: number;
	height: number;
	// "inside": keep the shape, no bigger than width×height, never enlarged.
	// "cover": crop from the centre to exactly width×height.
	fit: "inside" | "cover";
	quality?: number;
};

async function loadImage(file: Blob): Promise<ImageBitmap> {
	// `imageOrientation: "from-image"` applies a phone photo's EXIF rotation.
	return createImageBitmap(file, { imageOrientation: "from-image" });
}

export async function resizeImage(file: Blob, { width, height, fit, quality = 0.82 }: ResizeOptions): Promise<Blob> {
	const image = await loadImage(file);
	let targetWidth: number;
	let targetHeight: number;
	let sx = 0;
	let sy = 0;
	let sw = image.width;
	let sh = image.height;

	if (fit === "inside") {
		const scale = Math.min(1, width / image.width, height / image.height);
		targetWidth = Math.round(image.width * scale);
		targetHeight = Math.round(image.height * scale);
	} else {
		targetWidth = width;
		targetHeight = height;
		const scale = Math.max(width / image.width, height / image.height);
		sw = width / scale;
		sh = height / scale;
		sx = (image.width - sw) / 2;
		sy = (image.height - sh) / 2;
	}

	const canvas = document.createElement("canvas");
	canvas.width = targetWidth;
	canvas.height = targetHeight;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Couldn't read that photo.");
	ctx.imageSmoothingQuality = "high";
	ctx.drawImage(image, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
	image.close();

	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
	if (!blob) throw new Error("Couldn't read that photo.");
	return blob;
}

/** Same, as a File (keeps a sensible name and the real type). */
export async function resizeImageFile(file: File, options: ResizeOptions): Promise<File> {
	const blob = await resizeImage(file, options);
	const extension = blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : "png";
	return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.${extension}`, { type: blob.type });
}

/** Same, as a data URL (for fields the form keeps as data until the draft saves them). */
export async function resizeImageToDataUrl(file: File, options: ResizeOptions): Promise<string> {
	const blob = await resizeImage(file, options);
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Couldn't read that photo.")));
		reader.onerror = () => reject(new Error("Couldn't read that photo."));
		reader.readAsDataURL(blob);
	});
}
