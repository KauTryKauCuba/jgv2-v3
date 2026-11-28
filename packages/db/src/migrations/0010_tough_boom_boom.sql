ALTER TABLE `application_feedback` ADD `round` integer;--> statement-breakpoint
ALTER TABLE `application_feedback` ADD `scores` text;--> statement-breakpoint
ALTER TABLE `application_feedback` ADD `recommendation` text;--> statement-breakpoint
ALTER TABLE `interviews` ADD `jobseeker_confirmed_attendance` integer DEFAULT false NOT NULL;