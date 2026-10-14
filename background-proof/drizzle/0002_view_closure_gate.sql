CREATE TABLE `proof_view_gate` (
	`checkpoint_id` text PRIMARY KEY NOT NULL,
	`owner_attested_at` integer NOT NULL,
	`active_sessions_at_start` integer NOT NULL,
	`protocol_version` text NOT NULL,
	FOREIGN KEY (`checkpoint_id`) REFERENCES `proof_baseline`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `view_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`event_type` text NOT NULL,
	`occurred_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_view_events_time_type` ON `view_events` (`occurred_at`,`event_type`);--> statement-breakpoint
CREATE INDEX `idx_view_events_session` ON `view_events` (`session_id`);--> statement-breakpoint
CREATE TABLE `view_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`opened_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`closed_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_view_sessions_opened_at` ON `view_sessions` (`opened_at`);--> statement-breakpoint
CREATE INDEX `idx_view_sessions_closed_at` ON `view_sessions` (`closed_at`);