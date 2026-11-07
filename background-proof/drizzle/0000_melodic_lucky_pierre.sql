CREATE TABLE `applied_ticks` (
	`garden_id` text NOT NULL,
	`rules_version` integer NOT NULL,
	`tick_id` integer NOT NULL,
	`input_id` text NOT NULL,
	`run_id` text NOT NULL,
	`revision` integer NOT NULL,
	`committed_at` integer NOT NULL,
	PRIMARY KEY(`garden_id`, `rules_version`, `tick_id`),
	FOREIGN KEY (`garden_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`input_id`) REFERENCES `environment_samples`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_id`) REFERENCES `background_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `background_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text NOT NULL,
	`slot` integer NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text NOT NULL,
	`committed_ticks` integer DEFAULT 0 NOT NULL,
	`weather_status` text,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `idx_runs_started_at` ON `background_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `environment_samples` (
	`id` text PRIMARY KEY NOT NULL,
	`city` text NOT NULL,
	`provider` text NOT NULL,
	`valid_start` integer NOT NULL,
	`valid_end` integer NOT NULL,
	`fetched_at` integer NOT NULL,
	`source_status` text NOT NULL,
	`values_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_environment_city_end_fetch` ON `environment_samples` (`city`,`valid_end`,`fetched_at`);--> statement-breakpoint
CREATE TABLE `garden_events` (
	`id` text PRIMARY KEY NOT NULL,
	`garden_id` text NOT NULL,
	`tick_id` integer NOT NULL,
	`rules_version` integer NOT NULL,
	`revision` integer NOT NULL,
	`type` text NOT NULL,
	`keeper` text NOT NULL,
	`payload` text NOT NULL,
	`committed_at` integer NOT NULL,
	FOREIGN KEY (`garden_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_events_garden_revision` ON `garden_events` (`garden_id`,`revision`);--> statement-breakpoint
CREATE TABLE `proof_baseline` (
	`id` text PRIMARY KEY NOT NULL,
	`garden_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`revision` integer NOT NULL,
	`state` text NOT NULL,
	FOREIGN KEY (`garden_id`) REFERENCES `worlds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `worlds` (
	`id` text PRIMARY KEY NOT NULL,
	`seed` integer NOT NULL,
	`born_at` integer NOT NULL,
	`rules_version` integer NOT NULL,
	`climate` text NOT NULL,
	`state` text NOT NULL,
	`revision` integer NOT NULL,
	`last_tick` integer NOT NULL,
	`updated_at` integer NOT NULL
);
