import type { AddressSuggestion } from "@jobgiga-app/api/lib/geo/address-search";
import { useQuery } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { orpc } from "@/utils/orpc";

/**
 * The redesign's AddressSearchInput, ported. The street address field, with
 * suggestions as you type (a road or a building — "Jalan Kerinchi", "Mid
 * Valley"). Picking one hands the whole address to `onPick`; anything can
 * still be typed in by hand.
 */
export function AddressSearchInput({
	id,
	value,
	onChange,
	onPick,
	onLeave,
	placeholder,
	className,
}: {
	id: string;
	value: string;
	onChange: (value: string) => void;
	onPick: (suggestion: AddressSuggestion, typed: string) => void;
	// Leaving the field without picking a suggestion.
	onLeave?: () => void;
	placeholder?: string;
	className: string;
}) {
	const { t } = useTranslation("common");
	const listId = useId();
	const [focused, setFocused] = useState(false);
	const [highlight, setHighlight] = useState(-1);
	// Escape closes the list until the text changes.
	const [dismissedFor, setDismissedFor] = useState<string | null>(null);
	// Only searches what the employer typed — not a value set by picking one.
	const typedRef = useRef(false);
	const query = value.trim();
	const debouncedQuery = useDebouncedValue(query, 350);
	// Offline or signed out — nothing to show.
	const searchQuery = useQuery({
		...orpc.geo.addressSearch.queryOptions({ input: { q: debouncedQuery } }),
		enabled: focused && typedRef.current && debouncedQuery.length >= 3,
		meta: { suppressErrorToast: true },
	});
	const searchedFor = searchQuery.isSuccess ? debouncedQuery : "";
	const suggestions: AddressSuggestion[] = searchQuery.data?.suggestions ?? [];
	const [prevData, setPrevData] = useState(searchQuery.data);
	if (searchQuery.data !== prevData) {
		setPrevData(searchQuery.data);
		setHighlight(-1);
	}

	const open =
		focused && query.length >= 3 && searchedFor === query && dismissedFor !== query && suggestions.length > 0;

	function pick(suggestion: AddressSuggestion) {
		typedRef.current = false;
		onPick(suggestion, value);
		setHighlight(-1);
	}

	return (
		<div className="relative">
			<input
				id={id}
				type="text"
				role="combobox"
				aria-expanded={open}
				aria-controls={listId}
				aria-autocomplete="list"
				aria-activedescendant={open && highlight >= 0 ? `${listId}-${highlight}` : undefined}
				autoComplete="off"
				value={value}
				placeholder={placeholder}
				onChange={(e) => {
					typedRef.current = true;
					onChange(e.target.value);
				}}
				onFocus={() => setFocused(true)}
				onBlur={() => {
					setFocused(false);
					setHighlight(-1);
					onLeave?.();
				}}
				onKeyDown={(e) => {
					if (!open) return;
					if (e.key === "ArrowDown") {
						e.preventDefault();
						setHighlight((h) => (h + 1) % suggestions.length);
					} else if (e.key === "ArrowUp") {
						e.preventDefault();
						setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
					} else if (e.key === "Enter" && highlight >= 0) {
						e.preventDefault();
						const s = suggestions[highlight];
						if (s) pick(s);
					} else if (e.key === "Escape") {
						e.preventDefault();
						setDismissedFor(query);
					}
				}}
				className={className}
			/>
			{open && (
				<div className="absolute inset-x-0 top-full z-30 mt-[4px] overflow-hidden rounded-[12px] border border-black/[0.08] bg-white shadow-[0_8px_24px_-8px_rgba(20,27,46,0.25)]">
					<ul id={listId} role="listbox" className="max-h-[280px] overflow-y-auto p-[4px]">
						{suggestions.map((s, i) => (
							<li
								key={`${s.addressLine1}|${s.postcode}`}
								id={`${listId}-${i}`}
								role="option"
								aria-selected={i === highlight}
								// Picked on mousedown, before the input's blur closes the list.
								onMouseDown={(e) => {
									e.preventDefault();
									pick(s);
								}}
								onMouseEnter={() => setHighlight(i)}
								className={`cursor-pointer rounded-[8px] px-[10px] py-[8px] ${i === highlight ? "bg-brand-teal-soft" : ""}`}
							>
								<p className="truncate text-sm text-[#141B2E]">{s.addressLine1}</p>
								<p className="truncate text-xs text-[#9AA3B2]">
									{[s.area, `${s.postcode} ${s.city}`, s.state !== s.city ? s.state : null].filter(Boolean).join(", ")}
								</p>
							</li>
						))}
					</ul>
					{/* Required by OpenStreetMap's licence (ODbL). */}
					<p className="border-t border-black/[0.06] px-[12px] py-[6px] text-[10px] text-[#9AA3B2]">
						{t("form.address.osmCredit")}
					</p>
				</div>
			)}
		</div>
	);
}
