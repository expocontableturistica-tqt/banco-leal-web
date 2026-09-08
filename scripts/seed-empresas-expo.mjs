// node scripts/seed-empresas-expo.mjs
import { createClient } from '@libsql/client'

const EMPRESAS_EXPO = [
  { razonSocial: 'Ferretería El Clavo', actividad: 'Ferretería y materiales de construcción' },
  { razonSocial: 'Librería y Papelería Saber', actividad: 'Librería y útiles escolares' },
  { razonSocial: 'Farmacia Vida Sana', actividad: 'Farmacia y perfumería' },
  { razonSocial: 'Supermercado La Familia', actividad: 'Supermercado y almacén' },
  { razonSocial: 'Pizzería El Horno', actividad: 'Gastronomía y servicios de comida' },
  { razonSocial: 'Taller Mecánico Rueda', actividad: 'Mecánica automotriz y lubricentro' },
  { razonSocial: 'Verdulería La Huerta', actividad: 'Verdulería y frutería' },
  { razonSocial: 'Ropa y Moda Estilo', actividad: 'Indumentaria y ropa' },
  { razonSocial: 'Heladería Polar', actividad: 'Heladería y postres' },
  { razonSocial: 'Zapatería El Paso', actividad: 'Calzado y accesorios' },
  { razonSocial: 'Peluquería Estilo Libre', actividad: 'Peluquería y estética' },
  { razonSocial: 'Fiambrería El Colono', actividad: 'Fiambrería y delicatessen' },
  { razonSocial: 'Mueblería El Hogar', actividad: 'Muebles y decoración' },
  { razonSocial: 'Florería Las Rosas', actividad: 'Florería y jardinería' },
  { razonSocial: 'Pinturería Colores', actividad: 'Pinturería y revestimientos' },
  { razonSocial: 'Electrónica Digital', actividad: 'Electrónica y tecnología' },
  { razonSocial: 'Carnicería El Gaucho', actividad: 'Carnicería y chacinados' },
  { razonSocial: 'Óptica Visión Clara', actividad: 'Óptica y lentes de contacto' },
  { razonSocial: 'Gimnasio Fuerza Total', actividad: 'Fitness y deportes' },
  { razonSocial: 'Kiosco El Recreo', actividad: 'Kiosco y cigarrería' },
  { razonSocial: 'Rotisería La Abuela', actividad: 'Rotisería y comida casera' },
  { razonSocial: 'Veterinaria Animal Care', actividad: 'Veterinaria y mascotas' },
  { razonSocial: 'Joyería El Diamante', actividad: 'Joyería y relojería' },
  { razonSocial: 'Constructora El Ladrillo', actividad: 'Construcción y refacciones' },
]

function generarNumero(prefix, usados) {
  let n
  do { n = prefix + String(Math.floor(10000 + Math.random() * 90000)) } while (usados.has(n))
  return n
}

function generarCBU() {
  // CBU de 22 dígitos, banco ficticio 030 + aleatorio
  return '0300' + String(Date.now()).slice(-8) + String(Math.floor(Math.random() * 10000000000)).padStart(10, '0')
}

async function main() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })

  // Obtener empresas existentes
  const { rows: existingEmpresas } = await client.execute('SELECT numero_empresa FROM empresas')
  const usados = new Set(existingEmpresas.map(r => r.numero_empresa))

  // Obtener max id de cuentas
  const { rows: maxIdRows } = await client.execute('SELECT MAX(id) as maxId FROM cuentas')
  let nextCuentaId = Number(maxIdRows[0]?.maxId ?? 0) + 1

  let creadas = 0
  for (const e of EMPRESAS_EXPO) {
    const ne = generarNumero('EMP-', usados)
    usados.add(ne)

    // Insertar empresa
    const { lastInsertRowid } = await client.execute({
      sql: `INSERT INTO empresas (numero_empresa, razon_social, nombre_fantasia, cuit, actividad)
            VALUES (?, ?, '', '', ?)`,
      args: [ne, e.razonSocial, e.actividad],
    })
    const empresaId = Number(lastInsertRowid)

    // Crear cuenta CA
    const cbu = generarCBU()
    const alias = `BANCO.LEAL.EMP${String(empresaId).padStart(5, '0')}`
    await client.execute({
      sql: `INSERT INTO cuentas (empresa_id, tipo, cbu, alias, saldo, estado) VALUES (?, 'CA', ?, ?, 0, 'activa')`,
      args: [empresaId, cbu, alias],
    })
    nextCuentaId++

    console.log(`✓ [${ne}] ${e.razonSocial}`)
    creadas++
  }

  console.log(`\n✅ ${creadas} empresas creadas con cuenta bancaria`)
  client.close()
}

main().catch(e => { console.error(e); process.exit(1) })
