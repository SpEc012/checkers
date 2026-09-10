CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`host` text NOT NULL,
	`guest` text,
	`host_name` text NOT NULL,
	`guest_name` text,
	`host_side` text NOT NULL,
	`pin` text,
	`state` text NOT NULL,
	`score` text NOT NULL,
	`messages` text NOT NULL,
	`rematch` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`host_seen` integer NOT NULL,
	`guest_seen` integer DEFAULT 0 NOT NULL,
	`updated` integer NOT NULL,
	`closed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rooms_active` ON `rooms` (`closed`,`updated`);