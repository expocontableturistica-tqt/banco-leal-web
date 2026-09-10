CREATE TABLE `inversiones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cuenta_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`activo` text NOT NULL,
	`nombre` text DEFAULT '',
	`cantidad` real NOT NULL,
	`precio_unitario` real NOT NULL,
	`monto_invertido` real NOT NULL,
	`tna` real,
	`fecha_vencimiento` text,
	`monto_final` real,
	`estado` text DEFAULT 'abierta' NOT NULL,
	`resultado` real,
	`monto_rescatado` real,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`closed_at` text,
	FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas`(`id`) ON UPDATE no action ON DELETE no action
);
