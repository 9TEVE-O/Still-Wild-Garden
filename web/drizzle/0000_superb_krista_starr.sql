CREATE TABLE `gardens` (
	`id` text PRIMARY KEY NOT NULL,
	`seed` integer NOT NULL,
	`born_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
