CREATE TABLE `asientos_manuales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha` text NOT NULL,
	`concepto` text NOT NULL,
	`codigo_debe` text NOT NULL,
	`cuenta_debe` text NOT NULL,
	`monto_debe` real NOT NULL,
	`codigo_haber` text NOT NULL,
	`cuenta_haber` text NOT NULL,
	`monto_haber` real NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
