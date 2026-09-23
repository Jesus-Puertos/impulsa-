// =============================================================================
// POST /api/socios/enviar
// Cierra la captura y manda el expediente a revisión.
//
// Antes de cambiar el estado se comprueba que estén los datos y documentos
// mínimos: un expediente incompleto en la cola del analista es trabajo perdido
// para todos.
// =============================================================================

import type { APIRoute } from 'astro'
import { clienteServidor } from '../../../lib/supabase/server'
import { ETIQUETAS_TIPO_DOCUMENTO } from '../../../lib/formato'
import type { TipoDocumento } from '../../../lib/supabase/database.types'

export const prerender = false

/** Documentos sin los cuales no se admite un expediente. */
const DOCUMENTOS_OBLIGATORIOS: TipoDocumento[] = [
	'ine_frente',
	'ine_reverso',
	'comprobante_domicilio'
]

/** Campos del expediente que deben venir llenos. */
const CAMPOS_OBLIGATORIOS: { campo: string; etiqueta: string }[] = [
	{ campo: 'telefono', etiqueta: 'teléfono' },
	{ campo: 'calle', etiqueta: 'calle' },
	{ campo: 'colonia', etiqueta: 'colonia' },
	{ campo: 'municipio', etiqueta: 'municipio' },
	{ campo: 'entidad', etiqueta: 'estado' },
	{ campo: 'codigo_postal', etiqueta: 'código postal' },
	{ campo: 'ocupacion', etiqueta: 'ocupación' },
	{ campo: 'ingreso_mensual', etiqueta: 'ingreso mensual' }
]

export const POST: APIRoute = async ({ cookies }) => {
	const supabase = clienteServidor(cookies)

	const {
		data: { user }
	} = await supabase.auth.getUser()
	if (!user) return json({ error: 'Necesitas iniciar sesión.' }, 401)

	const { data: socio } = await supabase
		.from('socios')
		.select('*')
		.eq('perfil_id', user.id)
		.maybeSingle()

	if (!socio) return json({ error: 'No encontramos tu expediente.' }, 404)

	if (socio.estado === 'en_revision') {
		return json({ error: 'Tu expediente ya está en revisión.', ya_enviado: true }, 409)
	}
	if (socio.estado !== 'prospecto') {
		return json({ error: 'Tu expediente ya fue dictaminado.' }, 409)
	}

	// --- Datos faltantes ------------------------------------------------------
	const faltantes = CAMPOS_OBLIGATORIOS.filter(({ campo }) => {
		const valor = socio[campo as keyof typeof socio]
		return valor === null || valor === undefined || valor === ''
	}).map(({ etiqueta }) => etiqueta)

	if (!socio.acepta_aviso_privacidad) {
		faltantes.push('aceptación del aviso de privacidad')
	}

	if (faltantes.length > 0) {
		return json(
			{
				error: `Antes de enviar te falta capturar: ${faltantes.join(', ')}.`,
				faltantes
			},
			422
		)
	}

	// --- Documentos faltantes -------------------------------------------------
	const { data: documentos } = await supabase
		.from('documentos_socio')
		.select('tipo')
		.eq('socio_id', socio.id)

	const cargados = new Set((documentos ?? []).map((d) => d.tipo))
	const documentosFaltantes = DOCUMENTOS_OBLIGATORIOS.filter((t) => !cargados.has(t)).map(
		(t) => ETIQUETAS_TIPO_DOCUMENTO[t]
	)

	if (documentosFaltantes.length > 0) {
		return json(
			{
				error: `Te faltan documentos por subir: ${documentosFaltantes.join(', ')}.`,
				faltantes: documentosFaltantes
			},
			422
		)
	}

	// --- Referencias ----------------------------------------------------------
	const { count: referencias } = await supabase
		.from('referencias_socio')
		.select('id', { count: 'exact', head: true })
		.eq('socio_id', socio.id)

	if (!referencias || referencias < 2) {
		return json(
			{ error: 'Necesitamos al menos dos referencias personales.', faltantes: ['referencias'] },
			422
		)
	}

	const { error } = await supabase
		.from('socios')
		.update({ estado: 'en_revision' })
		.eq('id', socio.id)

	if (error) {
		console.error('[enviar expediente] error:', error.message)
		return json({ error: 'No pudimos enviar tu expediente. Inténtalo de nuevo.' }, 500)
	}

	return json({ ok: true, estado: 'en_revision' })
}

function json(cuerpo: unknown, estado = 200) {
	return new Response(JSON.stringify(cuerpo), {
		status: estado,
		headers: { 'content-type': 'application/json; charset=utf-8' }
	})
}
