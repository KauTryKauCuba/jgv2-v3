ALTER TABLE `job` ADD `slug` text;--> statement-breakpoint
ALTER TABLE `job` ADD `posting_name` text;--> statement-breakpoint
ALTER TABLE `job` ADD `industry` text;--> statement-breakpoint
ALTER TABLE `job` ADD `location` text;--> statement-breakpoint
ALTER TABLE `job` ADD `address_line2` text;--> statement-breakpoint
ALTER TABLE `job` ADD `area` text;--> statement-breakpoint
ALTER TABLE `job` ADD `city` text;--> statement-breakpoint
ALTER TABLE `job` ADD `state` text;--> statement-breakpoint
ALTER TABLE `job` ADD `postcode` text;--> statement-breakpoint
ALTER TABLE `job` ADD `office_days_per_week` integer;--> statement-breakpoint
ALTER TABLE `job` ADD `salary_period` text DEFAULT 'month' NOT NULL;--> statement-breakpoint
ALTER TABLE `job` ADD `openings` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `job` ADD `soft_skills` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `job` ADD `nice_to_have_skills` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `job` ADD `min_years_experience` integer;--> statement-breakpoint
ALTER TABLE `job` ADD `min_qualification_tier` text;--> statement-breakpoint
ALTER TABLE `job` ADD `languages` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `job` ADD `work_authorizations` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `job` ADD `driving_license` text;--> statement-breakpoint
ALTER TABLE `job` ADD `screening_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `job` ADD `ask_min_years_experience` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `job` ADD `ask_min_qualification_tier` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `job` ADD `ask_driving_license` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `job` ADD `ask_languages` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `job` ADD `ask_work_authorizations` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `job` ADD `custom_screening_questions` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `job` ADD `screening_preferred` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `job` ADD `skill_suggestions` text;--> statement-breakpoint
ALTER TABLE `job` ADD `start_availability` text;--> statement-breakpoint
ALTER TABLE `job` ADD `working_hours` text;--> statement-breakpoint
ALTER TABLE `job` ADD `contact_user_id` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `job` ADD `rejection_reason` text;--> statement-breakpoint
ALTER TABLE `job` ADD `flag_reason` text;--> statement-breakpoint
ALTER TABLE `job` ADD `flagged_at` text;--> statement-breakpoint
CREATE UNIQUE INDEX `job_slug_unique` ON `job` (`slug`);