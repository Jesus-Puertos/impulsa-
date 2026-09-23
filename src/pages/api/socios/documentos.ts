// =============================================================================
// POST   /api/socios/documentos  - sube un documento del expediente
// DELETE /api/socios/documentos  - retira un documento aún no verificado
//
// El archivo viaja al servidor y de ahí a Storage; el navegador nunca recibe
// credenciales de escritura. La ruta siempre empieza con el id del socio, que
// es lo que las políticas de Storage comprueban.
// =============================================================================

import type { APIRoute } from 'astro'
import { clienteServidor } from '../../../lib/supabase/server'
import type { TipoDocumento } from '../../../lib/supabase/database.types'

export const prerender = false

const BUCKET = 'documentos-kyc'
const TAMANO_MAXIMO = 10 * 1024 * 1024 // 10 MB, igual que el límite del bucket

const TIPOS_VALIDOS: TipoDocumento[] = [
	'ine_frente',
	'ine_reverso',
	'curp',
	'rfc',
	'comprobante_domicilio',
	'comprobante_ingresos',
	'acta_nacimiento',
	'estado_cuenta_bancario',
	'fotografia',
	'firma',
	'otro'
]

const MIMES_PERMITIDOS = [
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/heic',
	'application/pdf'
]

export const POST: APIRoute = async ({ request, cookies }) => {
	const supabase = clienteServidor(cookies)

	const {
		data: { user }
	} = await supabase.auth.getUser()
	if (!user) return json({ error: 'Necesitas iniciar sesión.' }, 401)

	const formulario = await request.formData()
	const archivo = formulario.get('archivo')
	const tipo = String(formulario.get('tipo') ?? '') as TipoDocumento

	if (!(archivo instanceof File)) {
		return json({ error: 'No recibimos ningún archivo.' }, 400)
	}
	if (!TIPOS_VALIDOS.includes(tipo)) {
		return json({ error: 'El tipo de documento no es válido.' }, 400)
	}
	if (archivo.size === 0) {
		return json({ error: 'El archivo está vacío.' }, 400)
	}
	if (archivo.size > TAMANO_MAXIMO) {
		return json(
			{ error: 'El archivo pesa más de 10 MB. Toma la foto con menor resolución o comprime el PDF.' },
			413
		)
	}
	if (!MIMES_PERMITIDOS.includes(archivo.type)) {
		return json(
			{ error: 'Solo aceptamos imágenes (JPG, PNG, WEBP, HEIC) o archivos PDF.' },
			415
		)
	}

	const { data: socio } = await supabase
		.from('socios')
		.select('id, estado')
		.eq('perfil_id', user.id)
		.maybeSingle()

	if (!socio) return json({ error: 'No encontramos tu expediente.' }, 404)

	// Si el documento anterior ya fue verificado, no se reemplaza desde el
	// portal: hacerlo dejaría un expediente aprobado con evidencia distinta.
	const { data: existente } = await supabase
		.from('documentos_socio')
		.select('id, estado, ruta_storage')
		.eq('socio_id', socio.id)
		.eq('tipo', tipo)
		.maybeSingle()

	if (existente?.estado === 'verificado') {
		return json(
			{ error: 'Ese documento ya fue validado. Para cambiarlo, acude a tu sucursal.' },
			409
		)
	}

	const extension = archivo.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
	const ruta = `${socio.id}/${tipo}-${Date.now()}.${extension}`

	const { error: errorSubida } = await supabase.storage
		.from(BUCKET)
		.upload(ruta, archivo, { contentType: archivo.type, upsert: false })

	if (errorSubida) {
		console.error('[documentos] fallo al subir:', errorSubida.message)
		return json({ error: 'No pudimos subir tu documento. Inténtalo de nuevo.' }, 500)
	}

	// El índice único (socio_id, tipo) obliga a actualizar en vez de insertar
	// cuando ya había un documento de ese tipo.
	const registro = {
		socio_id: socio.id,
		tipo,
		ruta_storage: ruta,
		nombre_archivo: archivo.name,
		mime: archivo.type,
		tamano_bytes: archivo.size,
		estado: 'pendiente' as const,
		motivo_rechazo: null
	}

	const { error: errorRegistro } = existente
		? await supabase.from('documentos_socio').update(registro).eq('id', existente.id)
		: await supabase.from('documentos_socio').insert(registro)

	if (errorRegistro) {
		// El archivo ya está arriba pero no quedó registrado: se retira para no
		// dejar basura huérfana en el bucket.
		await supabase.storage.from(BUCKET).remove([ruta])
		console.error('[documentos] fallo al registrar:', errorRegistro.message)
		return json({ error: 'No pudimos registrar tu documento. Inténtalo de nuevo.' }, 500)
	}

	// Se borra el archivo anterior una vez que el nuevo quedó registrado.
	if (existente?.ruta_storage && existente.ruta_storage !== ruta) {
		await supabase.storage.from(BUCKET).remove([existente.ruta_storage])
	}

	return json({ ok: true, tipo, ruta, nombre: archivo.name })
}

export const DELETE: APIRoute = async ({ request, cookies }) => {
	const supabase = clienteServidor(cookies)

	const {
		data: { user }
	} = await supabase.auth.getUser()
	if (!user) return json({ error: 'Necesitas iniciar sesión.' }, 401)

	const { tipo } = (await request.json().catch(() => ({}))) as { tipo?: TipoDocumento }
	if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
		return json({ error: 'Indica qué documento quieres retirar.' }, 400)
	}

	const { data: socio } = await supabase
		.from('socios')
		.select('id')
		.eq('perfil_id', user.id)
		.maybeSingle()
	if (!socio) return json({ error: 'No encontramos tu expediente.' }, 404)

	const { data: documento } = await supabase
		.from('documentos_socio')
		.select('id, estado, ruta_storage')
		.eq('socio_id', socio.id)
		.eq('tipo', tipo)
		.maybeSingle()

	if (!documento) return json({ error: 'Ese documento no existe.' }, 404)
	if (documento.estado === 'verificado') {
		return json({ error: 'No puedes retirar un documento ya validado.' }, 409)
	}

	await supabase.storage.from(BUCKET).remove([documento.ruta_storage])
	await supabase.from('documentos_socio').delete().eq('id', documento.id)

	return json({ ok: true })
}

function json(cuerpo: unknown, estado = 200) {
	return new Response(JSON.stringify(cuerpo), {
		status: estado,
		headers: { 'content-type': 'application/json; charset=utf-8' }
	})
}
