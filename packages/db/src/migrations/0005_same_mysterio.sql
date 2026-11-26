CREATE TABLE `jobseeker_certification` (
	`id` text PRIMARY KEY NOT NULL,
	`jobseeker_profile_id` text NOT NULL,
	`name` text NOT NULL,
	`issuer` text,
	`year` integer,
	`file_key` text,
	`file_name` text,
	`file_size` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`jobseeker_profile_id`) REFERENCES `jobseeker_profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobseekerCert_profileId_idx` ON `jobseeker_certification` (`jobseeker_profile_id`);--> statement-breakpoint
CREATE TABLE `jobseeker_education` (
	`id` text PRIMARY KEY NOT NULL,
	`jobseeker_profile_id` text NOT NULL,
	`school_name` text NOT NULL,
	`field_of_study` text,
	`education_level` text NOT NULL,
	`cgpa` text,
	`graduation_year` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`jobseeker_profile_id`) REFERENCES `jobseeker_profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobseekerEdu_profileId_idx` ON `jobseeker_education` (`jobseeker_profile_id`);--> statement-breakpoint
CREATE TABLE `jobseeker_profile_language` (
	`id` text PRIMARY KEY NOT NULL,
	`jobseeker_profile_id` text NOT NULL,
	`language` text NOT NULL,
	`dialects` text DEFAULT '[]' NOT NULL,
	`spoken_level` text NOT NULL,
	`written_level` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`jobseeker_profile_id`) REFERENCES `jobseeker_profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobseekerLang_profileId_idx` ON `jobseeker_profile_language` (`jobseeker_profile_id`);--> statement-breakpoint
CREATE TABLE `jobseeker_reference` (
	`id` text PRIMARY KEY NOT NULL,
	`jobseeker_profile_id` text NOT NULL,
	`full_name` text DEFAULT '' NOT NULL,
	`job_title` text,
	`company` text,
	`phone` text,
	`email` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`jobseeker_profile_id`) REFERENCES `jobseeker_profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobseekerRef_profileId_idx` ON `jobseeker_reference` (`jobseeker_profile_id`);--> statement-breakpoint
CREATE TABLE `jobseeker_working_experience` (
	`id` text PRIMARY KEY NOT NULL,
	`jobseeker_profile_id` text NOT NULL,
	`company` text NOT NULL,
	`job_title` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text,
	`is_current` integer DEFAULT false NOT NULL,
	`job_description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`jobseeker_profile_id`) REFERENCES `jobseeker_profile`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobseekerWorkExp_profileId_idx` ON `jobseeker_working_experience` (`jobseeker_profile_id`);--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `avatar_key` text;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `full_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `birth_year` integer;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `gender` text;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `marital_status` text;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `nationality` text;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `mobile_number` text;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `driving_license` text;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `resume_url` text;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `resume_file_name` text;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `resume_file_size` integer;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `location` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `city` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `state` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `country` text DEFAULT 'Malaysia' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `area` text;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `latitude` real;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `longitude` real;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `preferred_industry` text;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `years_experience` integer;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `professional_skills` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `soft_skills` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `other_skills` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `desired_job_type` text;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `expected_salary_from` integer;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `expected_salary_to` integer;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `linkedin_url` text;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `portfolio_url` text;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `github_url` text;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `notice_period` text;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `work_arrangement` text;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `preferred_work_places` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobseeker_profile` ADD `work_eligibility` text;