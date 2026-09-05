ALTER TABLE `caja` ADD `user_id` text;--> statement-breakpoint
ALTER TABLE `caja` ADD `numero_caja` integer;--> statement-breakpoint
ALTER TABLE `movimientos_caja` ADD `caja_id` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `numero_caja` integer;