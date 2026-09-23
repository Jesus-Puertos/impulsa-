// =============================================================================
// PUT /api/socios/referencias
// Reemplaza el juego completo de referencias personales y beneficiarios.
//
// Se sustituye todo en vez de sincronizar altas y bajas: la lista es corta
// (2-3 elementos) y así el front no necesita llevar el id de cada fila.
// =============================================================================

import type { APIRoute } from 'astro'
import { clienteServidor } from '../../../lib/supabase/server'
import { validarTelefono } from '../../../lib/validaciones'

export const prerender = false

interface ReferenciaEntrante {
	nombre?: string
	parentesco?: string
	telefono?: string
	direccion?: string
}

interface BeneficiarioEntrante {
	nombre?: string
	parentesco?: string
	fecha_nacimiento?: string
	telefono?: string
	porcentaje?: number | string
}

export const PUT: APIRoute = async ({ request, cookies }) => {
	const supabase = clienteServidor(cookies)

	const {
		data: { user }
	} = await supabase.auth.getUser()
	if (!user) return json({ error: 'Necesitas iniciar sesión.' }, 401)

	const cuerpo = (await request.json().catch(() => null)) as {
		referencias?: ReferenciaEntrante[]
		beneficiarios?: BeneficiarioEntrante[]
	} | null

	if (!cuerpo) return json({ error: 'El cuerpo de la petición no es JSON válido.' }, 400)

	const { data: socio } = await supabase
		.from('socios')
		.select('id, estado')
		.eq('perfil_id', user.id)
		.maybeSingle()

	if (!socio) return json({ error: 'No encontramos tu expediente.' }, 404)
	if (!['prospecto', 'en_revision'].includes(socio.estado)) {
		return json({ error: 'Tu expediente ya fue dictaminado y no se puede editar.' }, 409)
	}

	// --- Referencias ----------------------------------------------------------
	if (Array.isArray(cuerpo.referencias)) {
		const limpias = cuerpo.referencias
			.filter((r) => (r.nombre ?? '').trim() && (r.telefono ?? '').trim())
			.map((r) => ({
				socio_id: socio.id,
				nombre: r.nombre!.trim(),
				parentesco: (r.parentesco ?? '').trim() || null,
				telefono: r.telefono!.trim(),
				direccion: (r.direccion ?? '').trim() || null
			}))

		for (const r of limpias) {
			const tel = validarTelefono(r.telefono)
			if (!tel.valido) {
				return json({ error: `Teléfono de ${r.nombre}: ${tel.mensaje}`, campo: 'referencias' }, 422)
			}
		}

		await supabase.from('referencias_socio').delete().eq('socio_id', socio.id)
		if (limpias.length > 0) {
			const { error } = await supabase.from('referencias_socio').insert(limpias)
			if (error) {
				console.error('[referencias] error al guardar:', error.message)
				return json({ error: 'No pudimos guardar tus referencias.' }, 500)
			}
		}
	}

	// --- Beneficiarios --------------------------------------------------------
	if (Array.isArray(cuerpo.beneficiarios)) {
		const limpios = cuerpo.beneficiarios
			.filter((b) => (b.nombre ?? '').trim() && Number(b.porcentaje) > 0)
			.map((b) => ({
				socio_id: socio.id,
				nombre: b.nombre!.trim(),
				parentesco: (b.parentesco ?? '').trim() || 'No especificado',
				fecha_nacimiento: b.fecha_nacimiento || null,
				telefono: (b.telefono ?? '').trim() || null,
				porcentaje: Number(b.porcentaje)
			}))

		const suma = limpios.reduce((acc, b) => acc + b.porcentaje, 0)
		if (limpios.length > 0 && Math.abs(suma - 100) > 0.01) {
			return json(
				{
					error: `Los porcentajes de tus beneficiarios deben sumar exactamente 100%. Ahora suman ${suma}%.`,
					campo: 'beneficiarios'
				},
				422
			)
		}

		await supabase.from('beneficiarios').delete().eq('socio_id', socio.id)
		if (limpios.length > 0) {
			const { error } = await supabase.from('beneficiarios').insert(limpios)
			if (error) {
				console.error('[beneficiarios] error al guardar:', error.message)
				return json({ error: 'No pudimos guardar a tus beneficiarios.' }, 500)
			}
		}
	}

	return json({ ok: true })
}

function json(cuerpo: unknown, estado = 200) {
	return new Response(JSON.stringify(cuerpo), {
		status: estado,
		headers: { 'content-type': 'application/json; charset=utf-8' }
	})
}
