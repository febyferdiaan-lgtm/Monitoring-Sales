CREATE TABLE `sales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_key` text NOT NULL,
	`customer` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`transaction_type` text DEFAULT '' NOT NULL,
	`project` text DEFAULT '' NOT NULL,
	`rfq_no` text DEFAULT '' NOT NULL,
	`quotation_no` text DEFAULT '' NOT NULL,
	`po_no` text DEFAULT '' NOT NULL,
	`delivery_no` text DEFAULT '' NOT NULL,
	`invoice_no` text DEFAULT '' NOT NULL,
	`invoice_amount` real DEFAULT 0 NOT NULL,
	`amount_paid` real DEFAULT 0 NOT NULL,
	`due_date` text DEFAULT '' NOT NULL,
	`payment_date` text DEFAULT '' NOT NULL,
	`payment_status` text DEFAULT 'OPEN' NOT NULL,
	`transaction_status` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_source_key_unique` ON `sales` (`source_key`);