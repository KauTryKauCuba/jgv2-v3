// A company's saved profile and addresses, in the shape the redesign's
// EmployerOnboardingForm (in edit mode) reads — the redesign's
// employerProfiles row and getEmployerAddresses() rows, written out here so
// the web app can use them without importing server code. The API maps v3's
// columns (v1's organization/member names, e.g. legal_name, company_logo,
// phone_number, and the member's contact fields) into these names. Files are
// browser-facing URLs.
import type { Award, Leader } from "./company-workplace";

export type EmployerProfile = {
	id: string;
	avatarUrl: string | null;
	contactName: string;
	contactRole: string;
	contactPosition: string;
	contactPhone: string;
	contactEmail: string;
	companyName: string;
	ssmNumber: string;
	ssmDocumentUrl: string | null;
	ssmVerificationStatus: "unverified" | "pending" | "verified" | "rejected";
	ssmRejectionReason: string | null;
	industry: string;
	industryCategory: string;
	companySize: string;
	companyDescription: string | null;
	logoUrl: string | null;
	benefits: string[];
	websiteUrl: string | null;
	companyEmail: string | null;
	companyPhone: string | null;
	companyLinkedin: string | null;
	companyFacebook: string | null;
	companyInstagram: string | null;
	foundedYear: number | null;
	companyType: string | null;
	officePhotoUrl: string | null;
	bannerUrl: string | null;
	recentNews: { title: string; url: string }[];
	galleryPhotos: string[];
	facilities: string[];
	dressCode: string | null;
	awards: Award[];
	leaders: Leader[];
};

export type EmployerAddress = {
	id: string;
	label: string;
	addressLine1: string;
	addressLine2: string | null;
	area: string | null;
	city: string;
	state: string;
	postcode: string;
	isJobDefault: boolean;
};
