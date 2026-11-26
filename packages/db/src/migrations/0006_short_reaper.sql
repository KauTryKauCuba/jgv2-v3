CREATE TABLE `organization_address` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`label` text NOT NULL,
	`address_line1` text NOT NULL,
	`address_line2` text,
	`area` text,
	`city` text NOT NULL,
	`state` text NOT NULL,
	`postcode` text NOT NULL,
	`is_job_default` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `organizationAddress_organizationId_idx` ON `organization_address` (`organization_id`);--> statement-breakpoint
CREATE TABLE `organization_badge` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`badge_key` text NOT NULL,
	`earned_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizationBadge_org_key_unique` ON `organization_badge` (`organization_id`,`badge_key`);--> statement-breakpoint
CREATE INDEX `organizationBadge_organizationId_idx` ON `organization_badge` (`organization_id`);--> statement-breakpoint
ALTER TABLE `member` ADD `contact_role` text;--> statement-breakpoint
ALTER TABLE `member` ADD `position_title` text;--> statement-breakpoint
ALTER TABLE `member` ADD `phone_number` text;--> statement-breakpoint
ALTER TABLE `member` ADD `avatar_key` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `industry` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `industry_category` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `founded_year` integer;--> statement-breakpoint
ALTER TABLE `organization` ADD `company_type` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `benefits` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `office_photo_key` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `banner_key` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `recent_news` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `gallery_photos` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `facilities` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `dress_code` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `awards` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `leaders` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `ssm_document_key` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `ssm_verification_status` text DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `ssm_verified_at` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `ssm_rejection_reason` text;--> statement-breakpoint
ALTER TABLE `organization` ADD `created_by_user_id` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `organization` ADD `updated_at` text;