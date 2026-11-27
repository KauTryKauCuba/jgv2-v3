CREATE TABLE `account_deletion_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text,
	`requester_member_role` text,
	`required_approver_role` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reason` text,
	`reviewed_by_user_id` text,
	`reviewed_at` text,
	`rejection_reason` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `account_deletion_requests_userId_status_idx` ON `account_deletion_requests` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `account_deletion_requests_org_status_idx` ON `account_deletion_requests` (`organization_id`,`status`);