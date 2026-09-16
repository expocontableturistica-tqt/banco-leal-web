PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_prestamos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`empresa_id` integer,
	`socio_id` integer,
	`cuenta_id` integer,
	`monto` real NOT NULL,
	`saldo_pendiente` real NOT NULL,
	`cuotas` integer DEFAULT 1 NOT NULL,
	`cuotas_pagadas` integer DEFAULT 0 NOT NULL,
	`monto_cuota` real,
	`concepto` text DEFAULT 'Préstamo inicial',
	`estado` text DEFAULT 'vigente' NOT NULL,
	`entrega` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`socio_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_prestamos`("id", "empresa_id", "cuenta_id", "monto", "saldo_pendiente", "cuotas", "cuotas_pagadas", "monto_cuota", "concepto", "estado", "created_at") SELECT "id", "empresa_id", "cuenta_id", "monto", "saldo_pendiente", "cuotas", "cuotas_pagadas", "monto_cuota", "concepto", "estado", "created_at" FROM `prestamos`;--> statement-breakpoint
DROP TABLE `prestamos`;--> statement-breakpoint
ALTER TABLE `__new_prestamos` RENAME TO `prestamos`;--> statement-breakpoint
PRAGMA foreign_keys=ON;