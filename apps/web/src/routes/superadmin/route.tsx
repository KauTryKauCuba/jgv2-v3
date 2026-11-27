import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/route-guards";

// The redesign's src/app/superadmin/layout.tsx. Employer is teal, jobseeker
// gold, superadmin blue: the superadmin pages are built from the employer
// (teal) styles, so swapping those colours for blue here turns the whole
// area — dialogs included — blue. Jobseeker gold stays, so jobseeker-related
// cards still read as jobseeker. (The redesign's themeCssVars("employer",
// SUPERADMIN_BLUE), worked out: main #1D5FD1, accent #3B82F6, soft #EAF1FD,
// page #F3F6FD, gradient #1747A6 → #1D5FD1 → #3B82F6 → #C99A1E.)
const SUPERADMIN_BLUE_CSS = `:root{${[
	"--color-brand-teal-dark:#1D5FD1",
	"--color-brand-teal:#3B82F6",
	"--color-brand-teal-soft:#EAF1FD",
	"--color-brand-teal-page:#F3F6FD",
	"--color-brand-teal-bar:color-mix(in srgb, #1D5FD1 90%, white)",
	"--brand-gradient-employer:linear-gradient(90deg, #1747A6 0%, #1D5FD1 35%, #3B82F6 60%, #C99A1E 100%)",
	"--ribbon-teal-light:color-mix(in srgb, #3B82F6 62%, white)",
	"--ribbon-teal-pale:color-mix(in srgb, #3B82F6 20%, white)",
	"--band-employer:color-mix(in srgb, #1D5FD1 12%, white)",
].join(";")}}`;

// Every /superadmin page: platform admins only (the redesign's
// isSuperadminEmail check, redirecting everyone else to "/").
export const Route = createFileRoute("/superadmin")({
	beforeLoad: async () => {
		await requireAdmin();
	},
	component: SuperadminLayout,
});

function SuperadminLayout() {
	return (
		<>
			{/* Fixed, checked hex colours only — safe to inline. */}
			<style>{SUPERADMIN_BLUE_CSS}</style>
			<Outlet />
		</>
	);
}
