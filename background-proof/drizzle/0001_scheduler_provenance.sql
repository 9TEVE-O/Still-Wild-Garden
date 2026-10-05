ALTER TABLE `background_runs` ADD COLUMN `scheduler_task_id` text;
--> statement-breakpoint
ALTER TABLE `background_runs` ADD COLUMN `scheduler_execution_id` text;
--> statement-breakpoint
ALTER TABLE `background_runs` ADD COLUMN `scheduler_triggered_at` integer;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_runs_scheduler_execution_id` ON `background_runs` (`scheduler_execution_id`) WHERE `scheduler_execution_id` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `garden_events` ADD COLUMN `run_id` text REFERENCES `background_runs`(`id`);
--> statement-breakpoint
UPDATE `garden_events`
SET `run_id` = (
  SELECT `applied_ticks`.`run_id`
  FROM `applied_ticks`
  WHERE `applied_ticks`.`garden_id` = `garden_events`.`garden_id`
    AND `applied_ticks`.`rules_version` = `garden_events`.`rules_version`
    AND `applied_ticks`.`tick_id` = `garden_events`.`tick_id`
)
WHERE `run_id` IS NULL;
--> statement-breakpoint
CREATE INDEX `idx_events_run_id` ON `garden_events` (`run_id`);
