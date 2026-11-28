import { PARCELTRACKER_LOGO_SVG, WHALE_LOGO_SVG } from "./logos";

// The redesign's src/lib/dummy-companies.ts — the two real-branded demo
// companies (ParcelTracker and WHALE) the "Sample data" card gives the
// current user access to — ported as-is. In v3 each is an `organization`
// registered by a sample owner account (so it never counts against the
// user's own company limit, which counts companies they registered), with
// the user on its team: Owner on ParcelTracker, Admin on WHALE, as in the
// redesign. Each also gets the same 10-person sample roster (team.ts).

export const DUMMY_SEED_EMAIL_DOMAIN = "seed.jobgiga.test";
export const PARCELTRACKER_OWNER_EMAIL = `parceltracker-owner@${DUMMY_SEED_EMAIL_DOMAIN}`;
export const WHALE_OWNER_EMAIL = `whale-owner@${DUMMY_SEED_EMAIL_DOMAIN}`;

export type DummyCompanyDef = {
	targetRole: "owner" | "admin";
	ownerEmail: string;
	ownerName: string;
	ownerContactRole: string;
	ownerContactPosition: string;
	ownerContactPhone: string;
	company: {
		companyName: string;
		ssmNumber: string;
		industry: string;
		industryCategory: string;
		companySize: string;
		companyDescription: string;
		logoSvg: string;
		benefits: string[];
		websiteUrl: string;
		companyEmail: string;
		companyPhone: string;
		foundedYear: number;
		companyType: string;
	};
	address: {
		label: string;
		addressLine1: string;
		addressLine2?: string;
		city: string;
		state: string;
		postcode: string;
	};
	// Email prefix for this company's 10-person team roster — e.g.
	// "parceltracker" gives "parceltracker-aisyah.rahman@seed.jobgiga.test".
	teammateEmailPrefix: string;
};

export const DUMMY_COMPANIES: DummyCompanyDef[] = [
	{
		targetRole: "owner",
		ownerEmail: PARCELTRACKER_OWNER_EMAIL,
		ownerName: "Rui Hao Chan",
		ownerContactRole: "Founder",
		ownerContactPosition: "Founder",
		ownerContactPhone: "+60 12-345 6789",
		company: {
			companyName: "ParcelTracker",
			ssmNumber: "202301012345",
			industry: "Business software for logistics",
			industryCategory: "Information Technology & Software",
			companySize: "51-200",
			companyDescription:
				"ParcelTracker builds the scanning, sorting, and tracking software that couriers and warehouse teams rely on to move parcels reliably. We work with logistics operators across Southeast Asia to replace paper-based tracking with real-time visibility.",
			logoSvg: PARCELTRACKER_LOGO_SVG,
			benefits: ["Remote-friendly", "Health insurance", "Annual learning budget", "Flexible hours"],
			websiteUrl: "https://parceltracker.com",
			companyEmail: `hello@parceltracker.${DUMMY_SEED_EMAIL_DOMAIN}`,
			companyPhone: "+60 3-2345 6789",
			foundedYear: 2018,
			companyType: "Startup",
		},
		address: {
			label: "Headquarters",
			addressLine1: "Level 12, Menara Prestige",
			addressLine2: "1 Jalan Pinang",
			city: "Kuala Lumpur",
			state: "Kuala Lumpur",
			postcode: "50450",
		},
		teammateEmailPrefix: "parceltracker",
	},
	{
		targetRole: "admin",
		ownerEmail: WHALE_OWNER_EMAIL,
		ownerName: "Mei Lin Tan",
		ownerContactRole: "Operations Director",
		ownerContactPosition: "Operations Director",
		ownerContactPhone: "+60 16-789 0123",
		company: {
			companyName: "WHALE",
			ssmNumber: "201901054321",
			industry: "Process documentation software",
			industryCategory: "Information Technology & Software",
			companySize: "11-50",
			companyDescription:
				"WHALE helps operations teams turn messy, tribal-knowledge processes into clear, easy-to-follow SOPs — used by manufacturing and F&B teams to document how work actually gets done.",
			logoSvg: WHALE_LOGO_SVG,
			benefits: ["Hybrid work", "Health insurance", "Team offsites"],
			websiteUrl: "https://usewhale.io",
			companyEmail: `hello@usewhale.${DUMMY_SEED_EMAIL_DOMAIN}`,
			companyPhone: "+60 3-7890 1234",
			foundedYear: 2021,
			companyType: "SME",
		},
		address: {
			label: "Headquarters",
			addressLine1: "Suite 8-2, Wisma Tech",
			city: "Petaling Jaya",
			state: "Selangor",
			postcode: "46200",
		},
		teammateEmailPrefix: "whale",
	},
];

/**
 * The accounts' login emails carry the target user's id, so several employers
 * can each have their own copy of the demo companies at once (user.email is
 * unique); the team rows keep the clean display email.
 */
export function seedLoginEmail(displayEmail: string, targetUserId: string) {
	const [local, domain] = displayEmail.split("@");
	return `${local}.${targetUserId}@${domain}`;
}
