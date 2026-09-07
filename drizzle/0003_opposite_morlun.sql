CREATE TABLE `prestamos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`empresa_id` integer NOT NULL,
	`cuenta_id` integer NOT NULL,
	`monto` real NOT NULL,
	`saldo_pendiente` real NOT NULL,
	`concepto` text DEFAULT 'Préstamo inicial',
	`estado` text DEFAULT 'vigente' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas`(`id`) ON UPDATE no action ON DELETE no action
);
