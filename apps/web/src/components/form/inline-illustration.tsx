import { useEffect, useState } from "react";

/**
 * The redesign's InlineIllustration: fetches a static SVG from `/public` and
 * inlines it into the DOM (rather than an <img src>) so CSS can target and
 * animate it. Fetched once on mount; nothing renders until it lands.
 */
export function InlineIllustration({ src, className = "" }: { src: string; className?: string }) {
	const [markup, setMarkup] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		fetch(src)
			.then((res) => res.text())
			.then((svg) => {
				if (!cancelled) setMarkup(svg);
			});
		return () => {
			cancelled = true;
		};
	}, [src]);

	if (!markup) return null;

	return <div className={className} dangerouslySetInnerHTML={{ __html: markup }} />;
}
