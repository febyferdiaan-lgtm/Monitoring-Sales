CREATE TABLE `payment_confirmations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sale_id` integer NOT NULL,
	`invoice_no` text NOT NULL,
	`customer` text NOT NULL,
	`amount` real NOT NULL,
	`payment_date` text NOT NULL,
	`reference_no` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`requested_by_email` text NOT NULL,
	`requested_by_name` text DEFAULT '' NOT NULL,
	`requested_at` text NOT NULL,
	`reviewed_by_email` text DEFAULT '' NOT NULL,
	`reviewed_by_name` text DEFAULT '' NOT NULL,
	`reviewed_at` text DEFAULT '' NOT NULL,
	`review_notes` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_payment_confirmations_status_requested` ON `payment_confirmations` (`status`,`requested_at`);--> statement-breakpoint
CREATE INDEX `idx_payment_confirmations_sale_id` ON `payment_confirmations` (`sale_id`);