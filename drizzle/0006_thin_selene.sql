CREATE TABLE `cobros_qr` (
	`tid` text PRIMARY KEY NOT NULL,
	`comercio_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`retirado_at` text
);
