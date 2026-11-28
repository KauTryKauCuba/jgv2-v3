// One file per area, as in v1. Add more here (companies.ts, …) and
// re-export each one from this file.
export * from "./auth";
export * from "./ai-usage";
export * from "./onboarding";
// v1's lookup tables (filled from packages/db/src/seeds — see seed-local.ts).
export * from "./industryCategories";
export * from "./industries";
export * from "./countries";
export * from "./states";
export * from "./cities";
export * from "./postcodes";
export * from "./salaryTypes";
export * from "./currencyTypes";
export * from "./educationTypes";
export * from "./experienceTypes";
export * from "./languages";
export * from "./languageVarieties";
export * from "./skills";
export * from "./benefits";
export * from "./departments";
// v1's jobs, applications and interviews.
export * from "./jobs";
export * from "./interviews";
// v1's ad tables, with the redesign's booking rules (see ads.ts).
export * from "./ads";
