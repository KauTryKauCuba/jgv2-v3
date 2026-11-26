import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "@/components/landing/dropdown";

// The redesign's MonthYearPicker, ported. The stored value stays the
// redesign's English "Jan 2022" format (it's data, read back by the parser
// below and by AI resume parsing); only the labels shown are translated.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const CURRENT_YEAR = new Date().getFullYear();
// A full working career span, most recent first.
const YEAR_OPTIONS = Array.from({ length: 61 }, (_, i) => {
	const year = CURRENT_YEAR - i;
	return { value: String(year), label: String(year) };
});

// Lenient — accepts what this field stores ("Jan 2022") and what AI resume
// parsing may hand back (a bare year like "2022"), leaving month blank in
// the latter case so the picker prompts for it.
export function parseMonthYearValue(value: string): { month: string; year: string } {
	const trimmed = value.trim();
	const withMonth = /^([A-Za-z]+)\s+(\d{4})$/.exec(trimmed);
	if (withMonth?.[1] && withMonth[2]) {
		const prefix = withMonth[1].slice(0, 3).toLowerCase();
		const idx = MONTHS.findIndex((m) => m.toLowerCase() === prefix);
		if (idx !== -1) return { month: String(idx + 1).padStart(2, "0"), year: withMonth[2] };
	}
	const yearOnly = /^(\d{4})$/.exec(trimmed);
	if (yearOnly?.[1]) return { month: "", year: yearOnly[1] };
	return { month: "", year: "" };
}

export function MonthYearPicker({
	value,
	onChange,
	disabled,
	disabledLabel,
	accent = "teal",
}: {
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	/** Defaults to "Present" in the reader's language. */
	disabledLabel?: string;
	accent?: "teal" | "gold";
}) {
	const { t } = useTranslation("common");
	const [month, setMonth] = useState(() => parseMonthYearValue(value).month);
	const [year, setYear] = useState(() => parseMonthYearValue(value).year);
	// Re-syncs local state only when the parent actually changes `value`
	// (draft restore, resume parsing, "I currently work here"), not on every
	// re-render while a half-picked month is still waiting for its year.
	const [syncedValue, setSyncedValue] = useState(value);
	if (value !== syncedValue) {
		setSyncedValue(value);
		const parsed = parseMonthYearValue(value);
		setMonth(parsed.month);
		setYear(parsed.year);
	}

	const monthOptions = MONTHS.map((m, i) => ({
		value: String(i + 1).padStart(2, "0"),
		label: t(`form.months.${m.toLowerCase()}`),
	}));

	function commit(nextMonth: string, nextYear: string) {
		setMonth(nextMonth);
		setYear(nextYear);
		if (nextMonth && nextYear) onChange(`${MONTHS[Number(nextMonth) - 1]} ${nextYear}`);
	}

	if (disabled) {
		return (
			<div className="flex h-[38px] flex-1 items-center rounded-[12px] border border-black/[0.1] bg-black/[0.04] px-[14px] text-sm text-[#9AA3B2]">
				{disabledLabel ?? t("form.present")}
			</div>
		);
	}

	return (
		<div className="flex flex-1 gap-[6px]">
			<div className="flex-1">
				<Dropdown
					label={t("form.month")}
					value={month}
					options={[{ value: "", label: t("form.month") }, ...monthOptions]}
					onChange={(v) => commit(v, year)}
					accent={accent}
				/>
			</div>
			<div className="flex-1">
				<Dropdown
					label={t("form.year")}
					value={year}
					options={[{ value: "", label: t("form.year") }, ...YEAR_OPTIONS]}
					onChange={(v) => commit(month, v)}
					accent={accent}
				/>
			</div>
		</div>
	);
}
