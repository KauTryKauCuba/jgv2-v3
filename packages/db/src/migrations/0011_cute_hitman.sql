CREATE TABLE `team_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`actor_user_id` text,
	`actor_label` text NOT NULL,
	`action` text NOT NULL,
	`target_email` text NOT NULL,
	`from_role` text,
	`to_role` text,
	`detail` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `team_activity_organization_idx` ON `team_activity` (`organization_id`);--> statement-breakpoint
CREATE TABLE `job_hiring_managers` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`member_id` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `job`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `job_hiring_managers_member_idx` ON `job_hiring_managers` (`member_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `job_hiring_managers_job_member_unique` ON `job_hiring_managers` (`job_id`,`member_id`);--> statement-breakpoint
ALTER TABLE `invitation` ADD `token_hash` text;--> statement-breakpoint
ALTER TABLE `invitation` ADD `position` text;--> statement-breakpoint
ALTER TABLE `member` ADD `profile_completed_at` text;