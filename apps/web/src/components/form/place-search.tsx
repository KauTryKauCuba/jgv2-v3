import { formatPlace, type Place } from "@jobgiga-app/api/shared/work-locations";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon, SearchIcon } from "@/components/landing/icons";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { orpc } from "@/utils/orpc";

/**
 * The redesign's PlaceSearch, ported. Pick a town or area in Malaysia ("Kota
 * Damansara", "Petaling Jaya") — looks like the app's Dropdown, but searches
 * as you type. Every result is tied to an official town and state.
 */
export function PlaceSearch({
	id,
	label,
	value,
	onChange,
	placeholder,
	accent = "gold",
	exclude = [],
}: {
	id: string;
	label: string;
	value: Place | null;
	onChange: (place: Place) => void;
	/** Defaults to "Search a town or area" in the reader's language. */
	placeholder?: string;
	accent?: "teal" | "gold";
	// formatPlace() of places that shouldn't be offered (e.g. already picked).
	exclude?: string[];
}) {
	const { t } = useTranslation("common");
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [highlight, setHighlight] = useState(0);
	// Searches a moment after typing stops; a newer search wins.
	const trimmedQuery = query.trim();
	const debouncedQuery = useDebouncedValue(trimmedQuery, 300);
	const placesQuery = useQuery({
		...orpc.geo.places.queryOptions({ input: { q: debouncedQuery } }),
		enabled: open && debouncedQuery.length >= 2,
		placeholderData: keepPreviousData,
		meta: { suppressErrorToast: true },
	});
	const searching = trimmedQuery.length >= 2;
	const results: Place[] = searching ? (placesQuery.data?.places ?? []) : [];
	const loading = searching && (placesQuery.isFetching || debouncedQuery !== trimmedQuery);
	const unavailable = searching && (placesQuery.isError || placesQuery.data?.unavailable === true);
	useEffect(() => {
		setHighlight(0);
	}, [placesQuery.data]);
	const ref = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		function handleClick(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, []);

	useEffect(() => {
		if (open) inputRef.current?.focus();
	}, [open]);


	// Closing clears the search, so the next open starts fresh.
	const [prevOpen, setPrevOpen] = useState(open);
	if (open !== prevOpen) {
		setPrevOpen(open);
		if (!open) {
			setQuery("");
		}
	}

	const shown = query.trim().length >= 2 ? results.filter((p) => !exclude.includes(formatPlace(p))) : [];

	function pick(place: Place) {
		onChange(place);
		setOpen(false);
	}

	function onKeyDown(e: React.KeyboardEvent) {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setHighlight((h) => Math.min(h + 1, shown.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setHighlight((h) => Math.max(h - 1, 0));
		} else if (e.key === "Enter") {
			e.preventDefault();
			const place = shown[highlight];
			if (place) pick(place);
		} else if (e.key === "Escape") {
			setOpen(false);
		}
	}

	const focusBorder = accent === "gold" ? "focus:border-brand-gold-dark" : "focus:border-brand-teal-dark";

	return (
		<div ref={ref} className="relative">
			<button
				id={id}
				type="button"
				onClick={() => setOpen((o) => !o)}
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label={label}
				className={`flex h-[38px] w-full items-center justify-between gap-[8px] rounded-[12px] border border-black/[0.1] px-[14px] text-sm outline-none ${focusBorder}`}
			>
				<span className={`min-w-0 truncate ${value ? "text-[#141B2E]" : "text-[#9AA3B2]"}`}>
					{value ? formatPlace(value) : (placeholder ?? t("form.place.placeholder"))}
				</span>
				<ChevronDownIcon
					className={`h-[11px] w-[11px] shrink-0 text-[#9AA3B2] transition-transform ${open ? "rotate-180" : ""}`}
				/>
			</button>

			{open && (
				<div className="absolute z-10 mt-[6px] w-full rounded-[12px] border border-black/[0.1] bg-white p-[6px] shadow-[0_8px_24px_-8px_rgba(20,27,46,0.2)]">
					<div className="mb-[4px] flex items-center gap-[8px] rounded-[8px] border border-black/[0.08] px-[10px]">
						<SearchIcon className="h-[13px] w-[13px] shrink-0 text-[#9AA3B2]" />
						<input
							ref={inputRef}
							type="text"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							onKeyDown={onKeyDown}
							placeholder={t("form.place.searchPlaceholder")}
							aria-label={t("form.place.searchLabel", { label: label.toLowerCase() })}
							className="h-[32px] w-full text-sm text-[#141B2E] outline-none placeholder:text-[#9AA3B2]"
						/>
					</div>
					<ul
						role="listbox"
						aria-label={label}
						className={`flex max-h-[260px] flex-col gap-[2px] overflow-y-auto ${accent === "gold" ? "scrollbar-thin-gold" : "scrollbar-thin-teal"}`}
					>
						{query.trim().length < 2 ? (
							<li className="px-[10px] py-[10px] text-sm text-[#9AA3B2]">{t("form.place.typeHint")}</li>
						) : loading && shown.length === 0 ? (
							<li className="px-[10px] py-[10px] text-sm text-[#9AA3B2]">{t("form.place.searching")}</li>
						) : shown.length === 0 ? (
							<li className="px-[10px] py-[10px] text-sm text-[#9AA3B2]">{t("form.place.noMatches")}</li>
						) : (
							shown.map((place, i) => {
								const town =
									place.city.toLowerCase() === place.state.toLowerCase() ? place.city : `${place.city}, ${place.state}`;
								return (
									<li key={formatPlace(place)} role="option" aria-selected={i === highlight}>
										<button
											type="button"
											onClick={() => pick(place)}
											onMouseEnter={() => setHighlight(i)}
											className={`flex w-full min-w-0 flex-col items-start rounded-[8px] px-[10px] py-[7px] text-left transition-colors ${
												i === highlight ? "bg-[#F1F4F8]" : ""
											}`}
										>
											<span className="w-full truncate text-sm text-[#141B2E]">{place.area ?? place.city}</span>
											<span className="w-full truncate text-xs text-[#9AA3B2]">{place.area ? town : place.state}</span>
										</button>
									</li>
								);
							})
						)}
					</ul>
					{unavailable && <p className="px-[10px] pt-[6px] text-xs text-[#9AA3B2]">{t("form.place.busy")}</p>}
				</div>
			)}
		</div>
	);
}
