import { sql } from 'drizzle-orm'
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// ── Usuarios / Auth ──────────────────────────────────────────────────────────
export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: ['admin', 'cajero', 'operador', 'empresa', 'socio'] }).notNull(),
  entityId: integer('entity_id'), // → socios.id o empresas.id
  numeroCaja: integer('numero_caja'),  // solo cajeros: número de ventanilla asignado
  activo: integer('activo', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ── Configuración del banco ──────────────────────────────────────────────────
export const config = sqliteTable('config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

// ── Socios ───────────────────────────────────────────────────────────────────
export const socios = sqliteTable('socios', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  numeroSocio: text('numero_socio').unique().notNull(),
  nombre: text('nombre').notNull(),
  apellido: text('apellido').notNull(),
  dni: text('dni').default(''),
  montoAsignado: real('monto_asignado').default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ── Empresas ─────────────────────────────────────────────────────────────────
export const empresas = sqliteTable('empresas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  numeroEmpresa: text('numero_empresa').unique().notNull(),
  razonSocial: text('razon_social').notNull(),
  nombreFantasia: text('nombre_fantasia').default(''),
  cuit: text('cuit').default(''), // solo dígitos
  actividad: text('actividad').default(''),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ── Cuentas bancarias ────────────────────────────────────────────────────────
export const cuentas = sqliteTable('cuentas', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  socioId: integer('socio_id').references(() => socios.id),
  empresaId: integer('empresa_id').references(() => empresas.id),
  tipo: text('tipo', { enum: ['CA', 'CC'] }).default('CA').notNull(),
  cbu: text('cbu').unique().notNull(),
  alias: text('alias').unique().notNull(),
  saldo: real('saldo').default(0).notNull(),
  estado: text('estado', { enum: ['activa', 'inactiva'] }).default('activa').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ── Movimientos de cuenta ────────────────────────────────────────────────────
export const movimientosCuenta = sqliteTable('movimientos_cuenta', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cuentaId: integer('cuenta_id').notNull().references(() => cuentas.id),
  tipo: text('tipo', { enum: ['credito', 'debito'] }).notNull(),
  monto: real('monto').notNull(),
  concepto: text('concepto').default(''),
  saldoPosterior: real('saldo_posterior').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ── Transacciones QR ─────────────────────────────────────────────────────────
export const transacciones = sqliteTable('transacciones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  socioId: integer('socio_id').references(() => socios.id),
  tid: text('tid').unique().notNull(),
  monto: real('monto').notNull(),
  descripcion: text('descripcion').default(''),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ── Prestaciones ─────────────────────────────────────────────────────────────
export const prestaciones = sqliteTable('prestaciones', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  socioId: integer('socio_id').references(() => socios.id),
  tipo: text('tipo').notNull(),
  descripcion: text('descripcion').default(''),
  datos: text('datos').default('{}'), // JSON string
  tid: text('tid').unique().notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ── Operaciones de cambio ────────────────────────────────────────────────────
export const operacionesCambio = sqliteTable('operaciones_cambio', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  socioId: integer('socio_id').references(() => socios.id),
  operacion: text('operacion', { enum: ['compra', 'venta'] }).notNull(),
  divisa: text('divisa').notNull(),
  monto: real('monto').notNull(),
  tasaCambio: real('tasa_cambio').notNull(),
  montoARS: real('monto_ars').notNull(),
  tid: text('tid').unique().notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ── Reservas de divisas (una fila por divisa) ────────────────────────────────
export const reservasDivisas = sqliteTable('reservas_divisas', {
  divisa: text('divisa').primaryKey(),
  monto: real('monto').default(0).notNull(),
})

// ── Caja ─────────────────────────────────────────────────────────────────────
// userId = null → bóveda del banco (administrada por admin)
// userId = user.id → ventanilla del cajero
export const caja = sqliteTable('caja', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id'),             // null = bóveda; text = cajero.id
  numeroCaja: integer('numero_caja'),  // número de ventanilla (null para bóveda)
  saldoEfectivo: real('saldo_efectivo').default(0).notNull(),
  estado: text('estado', { enum: ['abierta', 'cerrada'] }).default('cerrada').notNull(),
  fechaApertura: text('fecha_apertura'),
  fechaCierre: text('fecha_cierre'),
})

// ── Movimientos de caja ──────────────────────────────────────────────────────
export const movimientosCaja = sqliteTable('movimientos_caja', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cajaId: integer('caja_id'),  // FK a caja.id
  tipo: text('tipo', { enum: ['apertura', 'cierre', 'ingreso', 'egreso', 'transferencia_entrada', 'transferencia_salida'] }).notNull(),
  monto: real('monto').notNull(),
  concepto: text('concepto').default(''),
  saldoPosterior: real('saldo_posterior').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ── Pagos de servicios ───────────────────────────────────────────────────────
export const pagosServicios = sqliteTable('pagos_servicios', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  servicio: text('servicio').notNull(),
  monto: real('monto').notNull(),
  nroComprobante: text('nro_comprobante').default(''),
  socioId: integer('socio_id').references(() => socios.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ── Códigos de transferencia externos ────────────────────────────────────────
export const codigosExternos = sqliteTable('codigos_externos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  codigo: text('codigo').unique().notNull(),
  tipo: text('tipo', { enum: ['emitido', 'acreditado'] }).notNull(),
  monto: real('monto').notNull(),
  cuentaId: integer('cuenta_id').references(() => cuentas.id),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ── Asientos manuales (Libro Diario) ─────────────────────────────────────────
export const asientosManuales = sqliteTable('asientos_manuales', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fecha: text('fecha').notNull(),           // YYYY-MM-DD
  concepto: text('concepto').notNull(),
  codigoDebe: text('codigo_debe').notNull(),
  cuentaDebe: text('cuenta_debe').notNull(),
  montoDebe: real('monto_debe').notNull(),
  codigoHaber: text('codigo_haber').notNull(),
  cuentaHaber: text('cuenta_haber').notNull(),
  montoHaber: real('monto_haber').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

// ── Banco / fondo ─────────────────────────────────────────────────────────────
export const banco = sqliteTable('banco', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fondoTotal: real('fondo_total').default(0).notNull(),
})
