CREATE TABLE IF NOT EXISTS `auth_requests` (
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
CREATE INDEX IF NOT EXISTS `idx_auth_requests_user_id` ON `auth_requests` (`user_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `webauthn_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`public_key` text NOT NULL,
	`credential_id` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`type` text DEFAULT 'public-key' NOT NULL,
	`aa_guid` text,
	`supports_prf` integer DEFAULT false NOT NULL,
	`encrypted_user_key` text,
	`encrypted_private_key` text,
	`encrypted_public_key` text,
	`creation_date` text NOT NULL,
	`revision_date` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_webauthn_credentials_user_id` ON `webauthn_credentials` (`user_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_webauthn_credentials_credential_id` ON `webauthn_credentials` (`credential_id`);
