CREATE TABLE IF NOT EXISTS `organization_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
	`report_data` text NOT NULL DEFAULT '',
	`content_encryption_key` text NOT NULL DEFAULT '',
	`summary_data` text,
	`application_data` text,
	`application_count` integer,
	`application_at_risk_count` integer,
	`critical_application_count` integer,
	`critical_application_at_risk_count` integer,
	`member_count` integer,
	`member_at_risk_count` integer,
	`critical_member_count` integer,
	`critical_member_at_risk_count` integer,
	`password_count` integer,
	`password_at_risk_count` integer,
	`critical_password_count` integer,
	`critical_password_at_risk_count` integer,
	`creation_date` text NOT NULL,
	`revision_date` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_org_reports_org_id` ON `organization_reports` (`organization_id`);
