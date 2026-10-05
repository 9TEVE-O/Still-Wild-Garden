CREATE TABLE `evolution_gardens` (
  `garden_id` text PRIMARY KEY NOT NULL,
  `seed` integer NOT NULL,
  `rules_version` integer NOT NULL,
  `revision` integer NOT NULL DEFAULT 0,
  `last_tick_id` integer,
  `state_json` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `environment_intervals` (
  `garden_id` text NOT NULL,
  `rules_version` integer NOT NULL,
  `tick_id` integer NOT NULL,
  `provider` text NOT NULL,
  `source_status` text NOT NULL,
  `precipitation_mm` real NOT NULL,
  `temperature_c` real,
  `payload_json` text NOT NULL,
  `fetched_at` integer NOT NULL,
  PRIMARY KEY (`garden_id`, `rules_version`, `tick_id`)
);
--> statement-breakpoint
CREATE TABLE `applied_ticks` (
  `garden_id` text NOT NULL,
  `rules_version` integer NOT NULL,
  `tick_id` integer NOT NULL,
  `state_revision` integer NOT NULL,
  `applied_at` integer NOT NULL,
  PRIMARY KEY (`garden_id`, `rules_version`, `tick_id`)
);
--> statement-breakpoint
CREATE TABLE `garden_events` (
  `event_id` text PRIMARY KEY NOT NULL,
  `garden_id` text NOT NULL,
  `rules_version` integer NOT NULL,
  `tick_id` integer NOT NULL,
  `event_type` text NOT NULL,
  `keeper` text,
  `plant_id` text,
  `payload_json` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `garden_events_garden_tick_idx` ON `garden_events` (`garden_id`, `tick_id`);
--> statement-breakpoint
CREATE TABLE `background_runs` (
  `run_id` text PRIMARY KEY NOT NULL,
  `garden_id` text NOT NULL,
  `rules_version` integer NOT NULL,
  `tick_id` integer NOT NULL,
  `status` text NOT NULL,
  `event_count` integer NOT NULL,
  `started_at` integer NOT NULL,
  `finished_at` integer NOT NULL
);
