// The redesign's Field component (src/components/Field.tsx), ported as-is.
export function Field({
	label,
	htmlFor,
	children,
	className = "",
	hint,
	required = false,
	db,
}: {
	label: string;
	htmlFor: string;
	children: React.ReactNode;
	className?: string;
	// Optional small badge next to the label — used e.g. on the "Post a job"
	// form to show which jobseeker-profile field each parameter matches
	// against. Omit for the normal, unannotated Field used everywhere else.
	hint?: React.ReactNode;
	// Marks the field as compulsory with a red asterisk next to the label.
	required?: boolean;
	// Development-only DB map key (see src/dev/db-map): what this field saves to.
	db?: string;
}) {
	return (
		<div data-db={db} className={`flex flex-col gap-[6px] ${className}`}>
			<div className="flex flex-wrap items-center gap-[8px]">
				<label htmlFor={htmlFor} className="text-xs text-[#4B5468]">
					{label}
					{required && <span className="text-red-500"> *</span>}
				</label>
				{hint}
			</div>
			{children}
		</div>
	);
}
