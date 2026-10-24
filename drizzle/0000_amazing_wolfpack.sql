CREATE TABLE `cases` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`mode` text NOT NULL,
	`document` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	`lock_token` text,
	`locked_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cases_owner_updated` ON `cases` (`owner`,`updated_at`);--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`owner` text NOT NULL,
	`provider` text NOT NULL,
	`phase` text NOT NULL,
	`request` text NOT NULL,
	`response` text,
	`status` integer,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `receipts_owner_date` ON `receipts` (`owner`,`created_at`);