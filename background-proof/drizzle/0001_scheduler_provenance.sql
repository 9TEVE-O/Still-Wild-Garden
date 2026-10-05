ALTER TABLE `background_runs` ADD `scheduler_task_id` text;--> statement-breakpoint
ALTER TABLE `background_runs` ADD `scheduler_execution_id` text;--> statement-breakpoint
ALTER TABLE `background_runs` ADD `scheduler_triggered_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_runs_scheduler_execution_id` ON `background_runs` (`scheduler_execution_id`);--> statement-breakpoint
ALTER TABLE `garden_events` ADD `run_id` text REFERENCES background_runs(id);--> statement-breakpoint
CREATE INDEX `idx_events_run_id` ON `garden_events` (`run_id`);