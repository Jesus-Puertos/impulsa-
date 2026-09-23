// =============================================================================
// POST /api/admin/documentos
// Acciones del personal sobre los documentos de un expediente:
//   - `url`       genera un enlace firmado temporal para ver el archivo
//   - `verificar` marca el documento como válido
//   - `rechazar`  lo rechaza indicando el motivo y avisa al socio
//
// Los documentos viven en un bucket privado. Nunca se expone una URL pública:
// cada visualización produce un enlace que caduca en minutos.
// =============================================================================

import type { APIRoute } from 'astro'
import { clienteServidor } from '../../../lib/supabase/server'
import { ETIQUETAS_TIPO_DOCUMENTO } from '../../../lib/formato'
import { cargarPerfil, esPersonal, alcanzaRol } from '../../../lib/auth'

export const prerender = false

/** Vigencia del enlace firmado. Suficiente para revisar, corto para compartir. */
const SEGUNDOS_VIGENCIA = 300

export const POST: APIRoute = async ({ request, cookies }) => {
	const supabase = clienteServidor(cookies)

	const {
		data: { user }
	} = await supabase.auth.getUser()
	if (!user) return json({ error: 'Necesitas iniciar sesión.' }, 401)

	const perfil = await cargarPerfil(supabase, user.id)
	if (!perfil || !esPersonal(perfil.rol)) {
		return json({ error: 'No tienes permiso para esta operación.' }, 403)
	}

	const cuerpo = (await request.json().catch(() => null)) as {
		accion?: string
		documento_id?: string
		motivo?: string
	} | null

	if (!cuerpo?.documento_id) return json({ error: 'Falta indicar el documento.' }, 400)

	const { data: documento } = await supabase
		.from('documentos_socio')
		.select('*')
		.eq('id', cuerpo.documento_id)
		.maybeSingle()

	if (!documento) return json({ error: 'El documento no existe.' }, 404)

	// --- Ver ------------------------------------------------------------------
	if (cuerpo.accion === 'url') {
		const { data, error } = await supabase.storage
			.from('documentos-kyc')
			.createSignedUrl(documento.ruta_storage, SEGUNDOS_VIGENCIA)

		if (error || !data) {
			console.error('[admin/documentos] no se pudo firmar:', error?.message)
			return json({ error: 'No pudimos abrir el archivo.' }, 500)
		}

		return json({ url: data.signedUrl, vigencia_segundos: SEGUNDOS_VIGENCIA })
	}

	// --- Dictaminar -----------------------------------------------------------
	if (cuerpo.accion === 'verificar' || cuerpo.accion === 'rechazar') {
		if (!alcanzaRol(perfil.rol, 'analista')) {
			return json({ error: 'Solo un analista o superior puede validar documentos.' }, 403)
		}

		const rechaza = cuerpo.accion === 'rechazar'
		const motivo = cuerpo.motivo?.trim()

		if (rechaza && !motivo) {
			return json({ error: 'Indica por qué se rechaza el documento.' }, 422)
		}

		// `revisado_por` y `revisado_en` los sella el trigger de la base.
		const { error } = await supabase
			.from('documentos_socio')
			.update({
				estado: rechaza ? 'rechazado' : 'verificado',
				motivo_rechazo: rechaza ? motivo : null
			})
			.eq('id', documento.id)

		if (error) {
			console.error('[admin/documentos] error al dictaminar:', error.message)
			return json({ error: 'No pudimos actualizar el documento.' }, 500)
		}

		// Aviso al socio: un rechazo sin notificación deja el trámite parado sin
		// que nadie sepa por qué.
		const { data: socio } = await supabase
			.from('socios')
			.select('perfil_id')
			.eq('id', documento.socio_id)
			.maybeSingle()

		if (socio?.perfil_id) {
			await supabase.from('notificaciones').insert({
				perfil_id: socio.perfil_id,
				titulo: rechaza ? 'Un documento necesita corrección' : 'Documento validado',
				mensaje: rechaza
					? `Tu ${ETIQUETAS_TIPO_DOCUMENTO[documento.tipo]} fue rechazado: ${motivo}. Súbelo de nuevo desde tu portal.`
					: `Validamos tu ${ETIQUETAS_TIPO_DOCUMENTO[documento.tipo]}.`,
				tipo: rechaza ? 'alerta' : 'exito',
				enlace: '/portal/documentos'
			})
		}

		return json({ ok: true, estado: rechaza ? 'rechazado' : 'verificado' })
	}

	return json({ error: 'Acción no reconocida.' }, 400)
}

function json(cuerpo: unknown, estado = 200) {
	return new Response(JSON.stringify(cuerpo), {
		status: estado,
		headers: { 'content-type': 'application/json; charset=utf-8' }
	})
}
