import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { TEAM_ROLE_PILL, type TeamRole } from "@jobgiga-app/api/shared/team-roles";
import { useUnsavedChangesGuard } from "@/components/form/unsaved-changes-guard";
import { BuildingIcon, ChevronDownIcon, PlusIcon } from "@/components/landing/icons";
import { orpc } from "@/utils/orpc";

/**
 * The redesign's CompanySwitcher: which company the employer is acting for,
 * when they belong to more than one (their own, plus invites). Switching
 * sets the session's company (employer.switchCompany → v1's
 * session.active_organization_id); everything cached for the previous
 * company is dropped and the page's guards run again (the redesign's
 * router.refresh()). Renders nothing for one company.
 */

const ROLE_PILL = Object.fromEntries(
	Object.entries(TEAM_ROLE_PILL).map(([role, pill]) => [role, `${pill.bg} ${pill.text}`]),
) as Record<TeamRole, string>;

function CompanyLogo({ url }: { url: string | null }) {
	if (!url) {
		return (
			<span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F1F4F8] text-[#9AA3B2]">
				<BuildingIcon className="h-[13px] w-[13px]" />
			</span>
		);
	}
	return (
		<img
			src={url}
			alt=""
			className="h-[26px] w-[26px] shrink-0 rounded-[7px] border border-[#EAEDF2] bg-white object-contain p-[2px]"
		/>
	);
}

export function CompanySwitcher({ collapsed = false }: { collapsed?: boolean }) {
	const { t, i18n } = useTranslation("common");
	const queryClient = useQueryClient();
	const router = useRouter();
	const navigate = useNavigate();
	const guardNavigation = useUnsavedChangesGuard();
	// Kept across the sidebar's remounts by the query cache (the redesign's
	// module-level cache), so the switcher never flashes in on navigation.
	const companiesQuery = useQuery({
		...orpc.employer.companies.queryOptions(),
		staleTime: 60_000,
		meta: { suppressErrorToast: true },
	});
	const [open, setOpen] = useState(false);
	const [switching, setSwitching] = useState(false);
	const [detailsOpen, setDetailsOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		function onClickOutside(e: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
		}
		document.addEventListener("mousedown", onClickOutside);
		return () => document.removeEventListener("mousedown", onClickOutside);
	}, [open]);

	const companies = companiesQuery.data?.companies;
	const currentId = companiesQuery.data?.currentId ?? null;
	const companyLimit = companiesQuery.data?.companyLimit ?? null;

	async function switchTo(id: string) {
		if (id === currentId) {
			setOpen(false);
			return;
		}
		setSwitching(true);
		try {
			await orpc.employer.switchCompany.call({ organizationId: id });
			setOpen(false);
			// Every page's data came from the previous company: drop it all,
			// then re-run the route guards (a Panel member's home is Interviews).
			await router.invalidate();
			await queryClient.resetQueries();
		} catch {
			// Stays on the current company; the menu stays open to try again.
		} finally {
			setSwitching(false);
		}
	}

	// Covers both "still loading" and "just one company".
	if (!companies || companies.length < 2) return null;
	const current = companies.find((c) => c.id === currentId) ?? companies[0];
	if (!current) return null;
	const joined = new Date(current.joinedAt).toLocaleDateString(i18n.resolvedLanguage === "ms" ? "ms-MY" : "en-MY", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});

	return (
		<div
			ref={menuRef}
			className={`emp-company-switcher relative shrink-0 rounded-[14px] border border-[#EAEDF2] bg-white py-[22px] ${
				collapsed ? "xl:h-[150px] xl:px-[6px]" : "px-[22px]"
			}`}
		>
			{/* Full card — always shown below xl (where collapse doesn't apply); at
			    xl+ only when expanded. */}
			<div className={`emp-switcher-full ${collapsed ? "xl:hidden" : ""}`}>
				<div className="flex items-center justify-between gap-[8px]">
					<p className="text-xs text-[#4B5468]">{t("companySwitcher.company")}</p>
					<div className="flex shrink-0 items-center gap-[6px]">
						<span className={`rounded-full px-[9px] py-[3px] text-xs ${ROLE_PILL[current.role]}`}>
							{t(`team.roles.${current.role}`)}
						</span>
						<button
							type="button"
							onClick={() => setDetailsOpen((v) => !v)}
							aria-expanded={detailsOpen}
							aria-label={detailsOpen ? t("companySwitcher.hideDetails") : t("companySwitcher.showDetails")}
							className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[#9AA3B2] hover:bg-black/[0.05]"
						>
							<ChevronDownIcon className={`h-[9px] w-[9px] transition-transform ${detailsOpen ? "rotate-180" : ""}`} />
						</button>
					</div>
				</div>
				<div className="mt-[14px] flex items-center gap-[10px]">
					<CompanyLogo url={current.logoUrl} />
					<span className="min-w-0 flex-1 truncate text-sm text-[#141B2E]">{current.companyName}</span>
				</div>

				<div
					className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
						detailsOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
					}`}
				>
					<div className="overflow-hidden">
						<div className="mt-[12px] flex flex-col gap-[4px] text-xs text-[#4B5468]">
							<p>
								<span className="text-[#9AA3B2]">{t("companySwitcher.owner")}</span> {current.ownerName}
							</p>
							<p>
								<span className="text-[#9AA3B2]">{t("companySwitcher.joined")}</span> {joined}
							</p>
							<p>
								<span className="text-[#9AA3B2]">{t("companySwitcher.industry")}</span> {current.industry}
							</p>
							<p>
								<span className="text-[#9AA3B2]">{t("companySwitcher.size")}</span>{" "}
								{t("companySwitcher.employees", { size: current.companySize })}
							</p>
						</div>
					</div>
				</div>

				<button
					type="button"
					onClick={() => setOpen((v) => !v)}
					aria-expanded={open}
					aria-haspopup="menu"
					disabled={switching}
					className="mt-[14px] flex w-full items-center justify-center gap-[4px] rounded-full border border-[#EAEDF2] px-[10px] py-[5px] text-xs text-[#4B5468] hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
				>
					{t("companySwitcher.change")}
					<ChevronDownIcon className="h-[8px] w-[8px] shrink-0 text-[#9AA3B2]" />
				</button>
			</div>

			{/* Collapsed — xl+ only, same outer height as the full card above,
			    just the current company's logo, still opening the same menu. */}
			{collapsed && (
				<button
					type="button"
					onClick={() => setOpen((v) => !v)}
					aria-expanded={open}
					aria-haspopup="menu"
					aria-label={t("companySwitcher.switchLabel", { company: current.companyName })}
					title={current.companyName}
					disabled={switching}
					className="emp-switcher-collapsed hidden h-full w-full flex-col items-center justify-center gap-[6px] rounded-[10px] hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-60 xl:flex"
				>
					<CompanyLogo url={current.logoUrl} />
					<ChevronDownIcon className="h-[8px] w-[8px] shrink-0 text-[#9AA3B2]" />
				</button>
			)}

			{open && (
				<div
					role="menu"
					className="absolute top-[calc(100%+8px)] left-0 z-30 w-full min-w-[220px] rounded-[14px] border border-black/[0.06] bg-white py-[6px] shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
				>
					{companies.map((company) => (
						<button
							key={company.id}
							type="button"
							role="menuitem"
							onClick={() => switchTo(company.id)}
							className={`flex w-full items-center gap-[10px] px-[14px] py-[9px] text-left text-sm hover:bg-black/[0.03] ${
								company.id === current.id ? "text-[#141B2E]" : "text-[#4B5468]"
							}`}
						>
							<CompanyLogo url={company.logoUrl} />
							<span className="min-w-0 flex-1 truncate">{company.companyName}</span>
							<span className="shrink-0 text-xs text-[#9AA3B2]">{t(`team.roles.${company.role}`)}</span>
						</button>
					))}
					{companyLimit && (
						<div className="mt-[6px] border-t border-black/[0.06] pt-[6px]">
							{companyLimit.canAdd ? (
								<button
									type="button"
									role="menuitem"
									onClick={() => {
										setOpen(false);
										guardNavigation(() => navigate({ to: "/employer/companies/new" }));
									}}
									className="flex w-full items-center gap-[10px] px-[14px] py-[9px] text-left text-sm text-brand-teal-dark hover:bg-black/[0.03]"
								>
									<span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-brand-teal-soft">
										<PlusIcon className="h-[10px] w-[10px]" />
									</span>
									{t("companySwitcher.addCompany")}
								</button>
							) : (
								<p className="px-[14px] py-[9px] text-xs leading-[17px] text-[#9AA3B2]">
									{t("companySwitcher.atLimit", { limit: companyLimit.limit })}
								</p>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

/**
 * The redesign's AddCompanyButton (Company Profile's "+ Add a company"):
 * through the same unsaved-changes guard as the sidebar, greyed out with a
 * reason once the account has reached its company limit.
 */
export function AddCompanyButton() {
	const { t } = useTranslation("common");
	const navigate = useNavigate();
	const guardNavigation = useUnsavedChangesGuard();
	const companiesQuery = useQuery({
		...orpc.employer.companies.queryOptions(),
		staleTime: 60_000,
		meta: { suppressErrorToast: true },
	});
	const limit = companiesQuery.data?.companyLimit;
	const canAdd = limit?.canAdd ?? true;
	return (
		<button
			type="button"
			disabled={!canAdd}
			title={canAdd ? undefined : t("companySwitcher.atLimit", { limit: limit?.limit ?? 0 })}
			onClick={() => guardNavigation(() => navigate({ to: "/employer/companies/new" }))}
			className="flex h-[38px] items-center justify-center rounded-full border border-brand-teal-dark px-[18px] text-sm text-brand-teal-dark transition-colors hover:bg-brand-teal-soft disabled:cursor-not-allowed disabled:border-black/[0.1] disabled:text-[#9AA3B2] disabled:hover:bg-transparent"
		>
			{t("dashboard.company.addCompany")}
		</button>
	);
}
