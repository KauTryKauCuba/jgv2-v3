CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`feature` text NOT NULL,
	`provider` text,
	`model` text,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`total_tokens` integer,
	`cached_tokens` integer,
	`call_count` integer,
	`duration_ms` integer,
	`actual_cost_usd` real,
	`user_id` text,
	`organization_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_usage_created_at_idx` ON `ai_usage` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_usage_feature_idx` ON `ai_usage` (`feature`);