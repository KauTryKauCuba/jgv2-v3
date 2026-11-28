CREATE TABLE `ad_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ad_request_id` integer NOT NULL,
	`amount` real,
	`currency` text,
	`payment_provider` text,
	`payment_reference` text,
	`status` text,
	`paid_at` text,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`ad_request_id`) REFERENCES `ad_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ad_placements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`max_slots` integer NOT NULL,
	`duration_days` integer NOT NULL,
	`book_ahead_months` integer DEFAULT 3 NOT NULL,
	`max_active_per_company` integer DEFAULT 2 NOT NULL,
	`created_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ad_placements_slug_unique` ON `ad_placements` (`slug`);--> statement-breakpoint
CREATE TABLE `ad_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`company_id` text NOT NULL,
	`job_id` text,
	`placement_id` integer NOT NULL,
	`ad_type` text NOT NULL,
	`ad_name` text NOT NULL,
	`ad_tagline` text,
	`ad_description` text,
	`image_media_id` integer,
	`media_key` text,
	`media_type` text DEFAULT 'image' NOT NULL,
	`status` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`rejection_reason` text,
	`submitted_by_user_id` text,
	`reviewed_by_admin_id` text,
	`reviewed_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`company_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `job`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`placement_id`) REFERENCES `ad_placements`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submitted_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by_admin_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ad_requests_company_id_idx` ON `ad_requests` (`company_id`);--> statement-breakpoint
CREATE INDEX `ad_requests_placement_id_idx` ON `ad_requests` (`placement_id`);--> statement-breakpoint
CREATE INDEX `ad_requests_status_idx` ON `ad_requests` (`status`);--> statement-breakpoint
CREATE INDEX `ad_requests_dates_idx` ON `ad_requests` (`start_date`,`end_date`);--> statement-breakpoint
CREATE TABLE `ads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ad_request_id` integer NOT NULL,
	`company_id` text NOT NULL,
	`job_id` text,
	`placement_id` integer NOT NULL,
	`slot_number` integer NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`ad_request_id`) REFERENCES `ad_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `job`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`placement_id`) REFERENCES `ad_placements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ads_placement_id_status_idx` ON `ads` (`placement_id`,`status`);--> statement-breakpoint
CREATE INDEX `ads_company_id_idx` ON `ads` (`company_id`);--> statement-breakpoint
CREATE INDEX `ads_job_id_idx` ON `ads` (`job_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `ad_placements` (`name`, `slug`, `max_slots`, `duration_days`, `book_ahead_months`, `max_active_per_company`) VALUES ('Job Homepage', 'job_homepage', 10, 30, 3, 2);--> statement-breakpoint
INSERT OR IGNORE INTO `ad_placements` (`name`, `slug`, `max_slots`, `duration_days`, `book_ahead_months`, `max_active_per_company`) VALUES ('Company Homepage', 'company_homepage', 10, 30, 3, 2);
