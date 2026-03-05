CREATE TABLE `auth_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` integer DEFAULT 0 NOT NULL,
	`request_device_identifier` text NOT NULL,
	`request_device_type` integer NOT NULL,
	`request_ip_address` text,
	`response_device_id` text,
	`access_code` text NOT NULL,
	`public_key` text NOT NULL,
	`key` text,
	`master_password_hash` text,
	`approved` integer,
	`creation_date` text NOT NULL,
	`response_date` text,
	`authentication_date` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`response_device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_auth_requests_user_id` ON `auth_requests` (`user_id`);
