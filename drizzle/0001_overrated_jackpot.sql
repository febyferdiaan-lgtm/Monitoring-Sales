CREATE TABLE `sales_document_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_id` integer NOT NULL,
	`spare_part_id` integer,
	`part_number` text DEFAULT '' NOT NULL,
	`description` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit` text DEFAULT 'Pcs' NOT NULL,
	`unit_price` real DEFAULT 0 NOT NULL,
	`line_total` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sales_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_type` text NOT NULL,
	`document_number` text NOT NULL,
	`customer` text NOT NULL,
	`customer_address` text DEFAULT '' NOT NULL,
	`customer_pic` text DEFAULT '' NOT NULL,
	`project` text DEFAULT '' NOT NULL,
	`reference_no` text DEFAULT '' NOT NULL,
	`document_date` text NOT NULL,
	`due_date` text DEFAULT '' NOT NULL,
	`subtotal` real DEFAULT 0 NOT NULL,
	`tax_percent` real DEFAULT 11 NOT NULL,
	`tax_amount` real DEFAULT 0 NOT NULL,
	`grand_total` real DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_documents_document_number_unique` ON `sales_documents` (`document_number`);--> statement-breakpoint
CREATE TABLE `spare_parts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`part_number` text NOT NULL,
	`name` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`brand` text DEFAULT '' NOT NULL,
	`unit` text DEFAULT 'Pcs' NOT NULL,
	`selling_price` real DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spare_parts_part_number_unique` ON `spare_parts` (`part_number`);