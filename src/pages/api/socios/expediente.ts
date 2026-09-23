// =============================================================================
// PATCH /api/socios/expediente
// Guarda por partes el expediente del socio autenticado.
//
// El front envía solo los campos del paso que se está completando. Aquí se
// filtran contra una lista blanca: aunque el cliente mandara `score_interno` o
// `numero_socio`, no llegarían a la base (y si llegaran, el trigger
// `proteger_campos_socio` los revertiría).
// =============================================================================

import type { APIRoute } from 'astro'
import { clienteServidor } from '../../../lib/supabase/server'
import type { Socio } from '../../../lib/supabase/database.types'
import {
	validarCurp,
	validarRfc,
	validarClabe,
	validarTelefono,
	validarCodigoPostal,
	rfcCoincideConCurp,
	primerError
} from '../../../lib/validaciones'

export const prerender = false

/** Campos que el socio puede editar desde el portal. */
const CAMPOS_PERMITIDOS = [
	'nombre',
	'apellido_paterno',
	'apellido_materno',
	'rfc',
	'genero',
	'estado_civil',
	'nacionalidad',
	'entidad_nacimiento',
	'clave_elector',
	'numero_ine',
	'vigencia_ine',
	'correo',
	'telefono',
	'telefono_alterno',
	'calle',
	'numero_exterior',
	'numero_interior',
	'colonia',
	'municipio',
	'entidad',
	'codigo_postal',
	'referencia_domicilio',
	'antiguedad_domicilio_meses',
	'tipo_vivienda',
	'ocupacion',
	'escolaridad',
	'nombre_empresa',
	'antiguedad_laboral_meses',
	'ingreso_mensual',
	'egresos_mensuales',
	'otros_ingresos',
	'fuente_otros_ingresos',
	'dependientes_economicos',
	'banco',
	'clabe',
	'sucursal_id',
	'acepta_aviso_privacidad',
	'acepta_consulta_buro'
] as const

export const PATCH: APIRoute = async ({ request, cookies }) => {
	const supabase = clienteServidor(cookies)

	const {
		data: { user }
	} = await supabase.auth.getUser()

	if (!user) return json({ error: 'Necesitas iniciar sesión.' }, 401)

	let cuerpo: Record<string, unknown>
	try {
		cuerpo = await request.json()
	} catch {
		return json({ error: 'El cuerpo de la petición no es JSON válido.' }, 400)
	}

	const { data: socio, error: errorSocio } = await supabase
		.from('socios')
		.select('id, curp, estado')
		.eq('perfil_id', user.id)
		.maybeSingle()

	if (errorSocio || !socio) {
		return json({ error: 'No encontramos tu expediente.' }, 404)
	}

	if (!['prospecto', 'en_revision'].includes(socio.estado)) {
		return json(
			{
				error:
					'Tu expediente ya fue dictaminado y no se puede editar desde el portal. Acude a tu sucursal para actualizar tus datos.'
			},
			409
		)
	}

	// --- Lista blanca ---------------------------------------------------------
	// `cambios` se declara como Partial<Socio> para que el update de PostgREST
	// acepte solo columnas reales. La escritura se hace a través de `bolsa`
	// porque las claves salen de un arreglo y TypeScript no puede probar que
	// cada valor entrante corresponde al tipo de su columna; eso lo garantizan
	// las validaciones de más abajo y las restricciones de la base.
	const cambios: Partial<Socio> = {}
	const bolsa = cambios as Record<string, unknown>

	for (const campo of CAMPOS_PERMITIDOS) {
		if (campo in cuerpo) {
			const valor = cuerpo[campo]
			bolsa[campo] = valor === '' ? null : valor
		}
	}

	if (Object.keys(cambios).length === 0) {
		return json({ error: 'No enviaste ningún campo que se pueda actualizar.' }, 400)
	}

	// --- Validación de los campos sensibles ----------------------------------
	const validaciones: [string, ReturnType<typeof validarCurp>][] = []

	if (typeof cambios.rfc === 'string' && cambios.rfc) {
		validaciones.push(['rfc', validarRfc(cambios.rfc)])
	}
	if (typeof cambios.clabe === 'string' && cambios.clabe) {
		validaciones.push(['clabe', validarClabe(cambios.clabe)])
	}
	if (typeof cambios.telefono === 'string' && cambios.telefono) {
		validaciones.push(['telefono', validarTelefono(cambios.telefono)])
	}
	if (typeof cambios.codigo_postal === 'string' && cambios.codigo_postal) {
		validaciones.push(['codigo_postal', validarCodigoPostal(cambios.codigo_postal)])
	}

	const fallo = primerError(...validaciones)
	if (fallo) return json({ error: fallo.mensaje, campo: fallo.campo }, 422)

	// El RFC debe describir a la misma persona que la CURP: comparten las
	// primeras 10 posiciones (iniciales del nombre y fecha de nacimiento).
	if (typeof cambios.rfc === 'string' && cambios.rfc && !rfcCoincideConCurp(cambios.rfc, socio.curp)) {
		return json(
			{
				error: 'El RFC no corresponde con tu CURP. Revisa las primeras 10 posiciones de ambos.',
				campo: 'rfc'
			},
			422
		)
	}

	// Los importes se normalizan a número: un campo de texto vacío llega como
	// null y Postgres lo acepta, pero "12,000" reventaría el tipo numeric.
	for (const campo of [
		'ingreso_mensual',
		'egresos_mensuales',
		'otros_ingresos',
		'antiguedad_laboral_meses',
		'antiguedad_domicilio_meses',
		'dependientes_economicos'
	]) {
		if (campo in bolsa && bolsa[campo] !== null) {
			const n = Number(String(bolsa[campo]).replace(/[^\d.-]/g, ''))
			if (!Number.isFinite(n) || n < 0) {
				return json({ error: `El valor de ${campo.replace(/_/g, ' ')} no es válido.`, campo }, 422)
			}
			bolsa[campo] = n
		}
	}

	const { error } = await supabase.from('socios').update(cambios).eq('id', socio.id)

	if (error) {
		console.error('[expediente] error al guardar:', error.message)
		// Un choque de UNIQUE en RFC es el caso previsible y merece mensaje propio.
		if (error.code === '23505') {
			return json({ error: 'Ese RFC ya está registrado con otro socio.', campo: 'rfc' }, 409)
		}
		return json({ error: 'No pudimos guardar tus datos. Inténtalo de nuevo.' }, 500)
	}

	return json({ ok: true, guardado: Object.keys(cambios) })
}

function json(cuerpo: unknown, estado = 200) {
	return new Response(JSON.stringify(cuerpo), {
		status: estado,
		headers: { 'content-type': 'application/json; charset=utf-8' }
	})
}
