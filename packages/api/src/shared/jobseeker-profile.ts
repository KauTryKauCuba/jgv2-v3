// A jobseeker's saved profile, in the shape the redesign's profile form
// (OnboardingForm, in edit mode) reads — the redesign's getJobseekerProfile()
// return type, written out here so the web app can use it without importing
// server code. The API maps v3's columns (v1 names such as job_title,
// mobile_number, expected_salary_from) into these names.
import type { Place } from "./work-locations";

export type JobseekerProfile = {
	id: string;
	avatarUrl: string | null;
	fullName: string;
	birthYear: number | null;
	gender: string | null;
	maritalStatus: string | null;
	nationality: string | null;
	phone: string | null;
	drivingLicense: string | null;
	resumeFileName: string | null;
	resumeFileSize: number | null;
	location: string;
	city: string;
	country: string;
	area: string | null;
	latitude: number | null;
	longitude: number | null;
	preferredWorkPlaces: Place[];
	state: string;
	targetRole: string;
	preferredIndustry: string;
	yearsExperience: number;
	professionalSkills: string[];
	softSkills: string[];
	otherSkills: string[];
	employmentType: string;
	expectedSalaryMin: number;
	expectedSalaryMax: number;
	bio: string | null;
	linkedinUrl: string | null;
	portfolioUrl: string | null;
	githubUrl: string | null;
	noticePeriod: string;
	workArrangement: string;
	workAuthorization: string;
	workExperiences: {
		id: string;
		company: string;
		title: string;
		startDate: string;
		endDate: string | null;
		isCurrent: boolean;
		achievements: string | null;
	}[];
	education: {
		id: string;
		institution: string;
		fieldOfStudy: string | null;
		qualificationTier: string;
		cgpa: string | null;
		graduationYear: number | null;
	}[];
	certifications: {
		id: string;
		name: string;
		issuer: string | null;
		year: number | null;
		fileUrl: string | null;
		fileName: string | null;
		fileSize: number | null;
	}[];
	languages: { id: string; language: string; dialects: string[]; spokenLevel: string; writtenLevel: string }[];
	references: {
		id: string;
		fullName: string;
		jobTitle: string | null;
		company: string | null;
		phone: string | null;
		email: string | null;
	}[];
};
