CREATE TABLE `banco` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fondo_total` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `caja` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`saldo_efectivo` real DEFAULT 0 NOT NULL,
	`estado` text DEFAULT 'cerrada' NOT NULL,
	`fecha_apertura` text,
	`fecha_cierre` text
);
--> statement-breakpoint
CREATE TABLE `codigos_externos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`codigo` text NOT NULL,
	`tipo` text NOT NULL,
	`monto` real NOT NULL,
	`cuenta_id` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `codigos_externos_codigo_unique` ON `codigos_externos` (`codigo`);--> statement-breakpoint
CREATE TABLE `config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cuentas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`socio_id` integer,
	`empresa_id` integer,
	`tipo` text DEFAULT 'CA' NOT NULL,
	`cbu` text NOT NULL,
	`alias` text NOT NULL,
	`saldo` real DEFAULT 0 NOT NULL,
	`estado` text DEFAULT 'activa' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`socio_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cuentas_cbu_unique` ON `cuentas` (`cbu`);--> statement-breakpoint
CREATE UNIQUE INDEX `cuentas_alias_unique` ON `cuentas` (`alias`);--> statement-breakpoint
CREATE TABLE `empresas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`numero_empresa` text NOT NULL,
	`razon_social` text NOT NULL,
	`nombre_fantasia` text DEFAULT '',
	`cuit` text DEFAULT '',
	`actividad` text DEFAULT '',
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `empresas_numero_empresa_unique` ON `empresas` (`numero_empresa`);--> statement-breakpoint
CREATE TABLE `movimientos_caja` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tipo` text NOT NULL,
	`monto` real NOT NULL,
	`concepto` text DEFAULT '',
	`saldo_posterior` real NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `movimientos_cuenta` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cuenta_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`monto` real NOT NULL,
	`concepto` text DEFAULT '',
	`saldo_posterior` real NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`cuenta_id`) REFERENCES `cuentas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `operaciones_cambio` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`socio_id` integer,
	`operacion` text NOT NULL,
	`divisa` text NOT NULL,
	`monto` real NOT NULL,
	`tasa_cambio` real NOT NULL,
	`monto_ars` real NOT NULL,
	`tid` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`socio_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `operaciones_cambio_tid_unique` ON `operaciones_cambio` (`tid`);--> statement-breakpoint
CREATE TABLE `pagos_servicios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`servicio` text NOT NULL,
	`monto` real NOT NULL,
	`nro_comprobante` text DEFAULT '',
	`socio_id` integer,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`socio_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `prestaciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`socio_id` integer,
	`tipo` text NOT NULL,
	`descripcion` text DEFAULT '',
	`datos` text DEFAULT '{}',
	`tid` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`socio_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prestaciones_tid_unique` ON `prestaciones` (`tid`);--> statement-breakpoint
CREATE TABLE `reservas_divisas` (
	`divisa` text PRIMARY KEY NOT NULL,
	`monto` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `socios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`numero_socio` text NOT NULL,
	`nombre` text NOT NULL,
	`apellido` text NOT NULL,
	`dni` text DEFAULT '',
	`monto_asignado` real DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `socios_numero_socio_unique` ON `socios` (`numero_socio`);--> statement-breakpoint
CREATE TABLE `transacciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`socio_id` integer,
	`tid` text NOT NULL,
	`monto` real NOT NULL,
	`descripcion` text DEFAULT '',
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`socio_id`) REFERENCES `socios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transacciones_tid_unique` ON `transacciones` (`tid`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`entity_id` integer,
	`activo` integer DEFAULT true,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);