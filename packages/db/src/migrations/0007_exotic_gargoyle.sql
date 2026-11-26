CREATE TABLE `benefits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`organization_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `benefits_organizationId_idx` ON `benefits` (`organization_id`);--> statement-breakpoint
CREATE TABLE `cities` (
	`id` integer PRIMARY KEY NOT NULL,
	`state_id` integer NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`state_id`) REFERENCES `states`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `countries` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now', '+8 hours')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now', '+8 hours')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `currency_types` (
	`id` integer PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `education_types` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `experience_types` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `industry_categories` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `industries` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category_id` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `industry_categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `states` (
	`id` integer PRIMARY KEY NOT NULL,
	`country_id` integer NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `postcodes` (
	`id` integer PRIMARY KEY NOT NULL,
	`city_id` integer NOT NULL,
	`postcode` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `salary_types` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now', '+8 hours')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now', '+8 hours')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `languages` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`iso6393` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `languages_name_unique` ON `languages` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `languages_iso6393_unique` ON `languages` (`iso6393`);--> statement-breakpoint
CREATE UNIQUE INDEX `languages_iso6393_idx` ON `languages` (`iso6393`);--> statement-breakpoint
CREATE TABLE `language_varieties` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`language_id` integer NOT NULL,
	`name` text NOT NULL,
	`iso6393` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`language_id`) REFERENCES `languages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `language_varieties_language_name_idx` ON `language_varieties` (`language_id`,`name`);--> statement-breakpoint
CREATE TABLE `skills` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `application` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`match_score` integer,
	`match_breakdown` text,
	`resume_file_name` text,
	`resume_file_url` text,
	`cover_letter` text,
	`application_form_data` text,
	`well_being_score` integer,
	`well_being_test_data` text,
	`source` text DEFAULT 'desktop' NOT NULL,
	`jobseeker_view_result` integer DEFAULT false NOT NULL,
	`rejection_type` text,
	`rejection_remarks` text,
	`rejected_by` text,
	`rejected_at` text,
	`date_applied` text DEFAULT (datetime('now')) NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `job`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `application_userId_idx` ON `application` (`user_id`);--> statement-breakpoint
CREATE INDEX `application_jobId_idx` ON `application` (`job_id`);--> statement-breakpoint
CREATE INDEX `application_status_idx` ON `application` (`status`);--> statement-breakpoint
CREATE INDEX `application_matchScore_idx` ON `application` (`match_score`);--> statement-breakpoint
CREATE INDEX `application_source_idx` ON `application` (`source`);--> statement-breakpoint
CREATE TABLE `application_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`panelist_id` text NOT NULL,
	`rating` integer NOT NULL,
	`comment` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `application`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`panelist_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `applicationFeedback_applicationId_idx` ON `application_feedback` (`application_id`);--> statement-breakpoint
CREATE INDEX `applicationFeedback_panelistId_idx` ON `application_feedback` (`panelist_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `applicationFeedback_unique` ON `application_feedback` (`application_id`,`panelist_id`);--> statement-breakpoint
CREATE TABLE `application_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`stage_id` integer,
	`stage_name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `application`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `applicationStages_applicationId_idx` ON `application_stages` (`application_id`);--> statement-breakpoint
CREATE INDEX `applicationStages_stageId_idx` ON `application_stages` (`stage_id`);--> statement-breakpoint
CREATE TABLE `job` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`department_id` integer,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`requirements` text,
	`qualifications` text,
	`experience` text,
	`responsibilities` text,
	`industry_id` integer,
	`address` text,
	`country_id` integer,
	`state_id` integer,
	`city_id` integer,
	`postcode_id` integer,
	`location_type` text DEFAULT 'onsite' NOT NULL,
	`employment_type` text DEFAULT 'full_time' NOT NULL,
	`work_arrangement` text DEFAULT 'onsite' NOT NULL,
	`work_eligibility` text DEFAULT 'local' NOT NULL,
	`salary_min` integer,
	`salary_max` integer,
	`salary_type_id` integer,
	`currency_type_id` integer,
	`salary_currency` text DEFAULT 'USD',
	`show_salary` integer DEFAULT true NOT NULL,
	`education_type_id` integer,
	`experience_type_id` integer,
	`language_id` integer,
	`job_open_to_country_id` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`closing_date` text,
	`validity` text,
	`views` integer DEFAULT 0 NOT NULL,
	`clicked_amount` integer DEFAULT 0,
	`is_urgent` integer DEFAULT false NOT NULL,
	`is_bonanza` integer DEFAULT false NOT NULL,
	`boosted_at` text,
	`boosted_until` text,
	`created_by_id` text,
	`published_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	`app_started_count` integer DEFAULT 0,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`industry_id`) REFERENCES `industries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`state_id`) REFERENCES `states`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`city_id`) REFERENCES `cities`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`postcode_id`) REFERENCES `postcodes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`salary_type_id`) REFERENCES `salary_types`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`currency_type_id`) REFERENCES `currency_types`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`education_type_id`) REFERENCES `education_types`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`experience_type_id`) REFERENCES `experience_types`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`language_id`) REFERENCES `languages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`job_open_to_country_id`) REFERENCES `countries`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `job_organizationId_idx` ON `job` (`organization_id`);--> statement-breakpoint
CREATE INDEX `job_status_idx` ON `job` (`status`);--> statement-breakpoint
CREATE INDEX `job_createdById_idx` ON `job` (`created_by_id`);--> statement-breakpoint
CREATE TABLE `job_benefits` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`benefit_id` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `job`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`benefit_id`) REFERENCES `benefits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobBenefits_jobId_idx` ON `job_benefits` (`job_id`);--> statement-breakpoint
CREATE INDEX `jobBenefits_benefitId_idx` ON `job_benefits` (`benefit_id`);--> statement-breakpoint
CREATE TABLE `job_event_log` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`event_type` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `job`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_event_log_jobId_idx` ON `job_event_log` (`job_id`);--> statement-breakpoint
CREATE INDEX `job_event_log_eventType_idx` ON `job_event_log` (`event_type`);--> statement-breakpoint
CREATE INDEX `job_event_log_createdAt_idx` ON `job_event_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `job_languages` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`language_id` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `job`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`language_id`) REFERENCES `languages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobLanguages_jobId_idx` ON `job_languages` (`job_id`);--> statement-breakpoint
CREATE INDEX `jobLanguages_languageId_idx` ON `job_languages` (`language_id`);--> statement-breakpoint
CREATE TABLE `job_open_to_countries` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`country_id` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `job`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobOpenToCountries_jobId_idx` ON `job_open_to_countries` (`job_id`);--> statement-breakpoint
CREATE INDEX `jobOpenToCountries_countryId_idx` ON `job_open_to_countries` (`country_id`);--> statement-breakpoint
CREATE TABLE `job_skills` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`skill_id` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `job`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobSkills_jobId_idx` ON `job_skills` (`job_id`);--> statement-breakpoint
CREATE INDEX `jobSkills_skillId_idx` ON `job_skills` (`skill_id`);--> statement-breakpoint
CREATE TABLE `liked_job` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`liked_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `job`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `likedJob_jobId_idx` ON `liked_job` (`job_id`);--> statement-breakpoint
CREATE INDEX `likedJob_userId_idx` ON `liked_job` (`user_id`);--> statement-breakpoint
CREATE INDEX `likedJob_likedAt_idx` ON `liked_job` (`liked_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `likedJob_unique` ON `liked_job` (`job_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `saved_job` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`saved_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `job`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `savedJob_jobId_idx` ON `saved_job` (`job_id`);--> statement-breakpoint
CREATE INDEX `savedJob_userId_idx` ON `saved_job` (`user_id`);--> statement-breakpoint
CREATE INDEX `savedJob_savedAt_idx` ON `saved_job` (`saved_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `savedJob_unique` ON `saved_job` (`job_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `stages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stages_name_unique` ON `stages` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `stages_slug_unique` ON `stages` (`slug`);--> statement-breakpoint
CREATE TABLE `interview_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`interview_id` text NOT NULL,
	`email` text NOT NULL,
	`invited_by` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`jobseeker_id` text,
	`role` text DEFAULT 'panel' NOT NULL,
	`accepted_at` text,
	`declined_at` text,
	`created_at` text DEFAULT (datetime('now', '+8 hours')) NOT NULL,
	FOREIGN KEY (`interview_id`) REFERENCES `interviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`jobseeker_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `interviewInvitations_interviewId_idx` ON `interview_invitations` (`interview_id`);--> statement-breakpoint
CREATE INDEX `interviewInvitations_invitedBy_idx` ON `interview_invitations` (`invited_by`);--> statement-breakpoint
CREATE TABLE `interview_panel` (
	`id` text PRIMARY KEY NOT NULL,
	`interview_id` text NOT NULL,
	`interviewer_id` text,
	`member_id` text,
	`role` text DEFAULT 'panel' NOT NULL,
	`created_at` text DEFAULT (datetime('now', '+8 hours')) NOT NULL,
	FOREIGN KEY (`interview_id`) REFERENCES `interviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`interviewer_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `interviewPanel_interviewId_idx` ON `interview_panel` (`interview_id`);--> statement-breakpoint
CREATE INDEX `interviewPanel_interviewerId_idx` ON `interview_panel` (`interviewer_id`);--> statement-breakpoint
CREATE INDEX `interviewPanel_memberId_idx` ON `interview_panel` (`member_id`);--> statement-breakpoint
CREATE TABLE `interviews` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_id` text NOT NULL,
	`job_id` text NOT NULL,
	`application_id` text,
	`scheduled_at` text NOT NULL,
	`scheduled_by` text,
	`interview_duration` integer,
	`meeting_link` text,
	`location` text,
	`map_url` text,
	`interview_type` text DEFAULT 'online' NOT NULL,
	`panel` text,
	`remarks` text,
	`application_form_url` text,
	`result` text DEFAULT 'pending' NOT NULL,
	`candidate_response` text DEFAULT 'pending' NOT NULL,
	`overall_score` integer,
	`created_at` text DEFAULT (datetime('now', '+8 hours')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now', '+8 hours')) NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `job`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `application`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scheduled_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `interviews_candidateId_idx` ON `interviews` (`candidate_id`);--> statement-breakpoint
CREATE INDEX `interviews_jobId_idx` ON `interviews` (`job_id`);--> statement-breakpoint
CREATE INDEX `interviews_scheduledAt_idx` ON `interviews` (`scheduled_at`);--> statement-breakpoint
CREATE INDEX `interviews_result_idx` ON `interviews` (`result`);--> statement-breakpoint
ALTER TABLE `organization` ADD `smart_match_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `smart_match_criteria` text;