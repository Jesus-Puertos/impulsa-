// =============================================================================
// POST /api/solicitudes
// Crea una solicitud de crédito del socio autenticado y la envía a dictamen.
//
// Las condiciones (monto, plazo, tasa) se validan contra el producto guardado
// en la base. La tasa nunca la propone el cliente: se toma del catálogo.
// =============================================================================

import type { APIRoute } from 'astro'
import { clienteServidor } from '../../../lib/supabase/server'
import { analizarCapacidadPago, calcularPagoPeriodico } from '../../../lib/credito'

export const prerender = false

export const POST: APIRoute = async ({ request, cookies }) => {
	const supabase = clienteServidor(cookies)

	const {
		data: { user }
	} = await supabase.auth.getUser()
	if (!user) return json({ error: 'Necesitas iniciar sesión.' }, 401)

	const cuerpo = (await request.json().catch(() => null)) as {
		producto_id?: string
		monto?: number
		plazo_periodos?: number
		destino?: string
		descripcion_destino?: string
		simulacion_id?: string
	} | null

	if (!cuerpo) return json({ error: 'El cuerpo de la petición no es JSON válido.' }, 400)

	const { data: socio } = await supabase
		.from('socios')
		.select('*')
		.eq('perfil_id', user.id)
		.maybeSingle()

	if (!socio) return json({ error: 'No encontramos tu expediente.' }, 404)

	// Solo un socio con expediente aprobado puede pedir crédito.
	if (socio.estado !== 'activo') {
		return json(
			{
				error:
					socio.estado === 'en_revision'
						? 'Tu expediente todavía está en revisión. En cuanto se apruebe podrás solicitar tu crédito.'
						: 'Necesitas tener tu expediente aprobado para solicitar un crédito.'
			},
			409
		)
	}

	const { data: producto } = await supabase
		.from('productos_credito')
		.select('*')
		.eq('id', cuerpo.producto_id ?? '')
		.eq('activo', true)
		.maybeSingle()

	if (!producto) return json({ error: 'El producto de crédito no está disponible.' }, 404)

	const monto = Number(cuerpo.monto)
	const plazo = Number(cuerpo.plazo_periodos)

	if (monto < producto.monto_minimo || monto > producto.monto_maximo) {
		return json({ error: 'El monto está fuera del rango del producto.', campo: 'monto' }, 422)
	}
	if (plazo < producto.plazo_minimo_periodos || plazo > producto.plazo_maximo_periodos) {
		return json({ error: 'El plazo está fuera del rango del producto.', campo: 'plazo' }, 422)
	}
	if (!cuerpo.destino?.trim()) {
		return json({ error: 'Indica para qué usarás el crédito.', campo: 'destino' }, 422)
	}

	// --- Una solicitud abierta a la vez ---------------------------------------
	// Evita que la misma persona sature la cola del analista con duplicados.
	const { count: abiertas } = await supabase
		.from('solicitudes_credito')
		.select('id', { count: 'exact', head: true })
		.eq('socio_id', socio.id)
		.in('estado', ['enviada', 'en_revision', 'aprobada'])

	if (abiertas && abiertas > 0) {
		return json(
			{ error: 'Ya tienes una solicitud en trámite. Espera su resolución antes de enviar otra.' },
			409
		)
	}

	// --- Capacidad de pago ----------------------------------------------------
	// Se deja asentada en la solicitud para que el analista vea con qué números
	// se calculó, aunque el socio actualice sus ingresos después.
	const pago = calcularPagoPeriodico(monto, producto.tasa_anual, plazo, producto.periodicidad)
	const capacidad = analizarCapacidadPago({
		ingresoMensual: Number(socio.ingreso_mensual ?? 0),
		egresosMensuales: Number(socio.egresos_mensuales ?? 0),
		otrosIngresos: Number(socio.otros_ingresos ?? 0),
		pagoPeriodico: pago,
		periodicidad: producto.periodicidad,
		factorMaximo: producto.factor_capacidad_pago,
		tasaAnual: producto.tasa_anual,
		periodos: plazo
	})

	const { data, error } = await supabase
		.from('solicitudes_credito')
		.insert({
			socio_id: socio.id,
			producto_id: producto.id,
			simulacion_id: cuerpo.simulacion_id ?? null,
			sucursal_id: socio.sucursal_id,
			monto_solicitado: monto,
			plazo_periodos: plazo,
			periodicidad: producto.periodicidad,
			destino: cuerpo.destino.trim(),
			descripcion_destino: cuerpo.descripcion_destino?.trim() || null,
			capacidad_pago_calculada: capacidad.razon,
			creado_por: user.id,
			estado: 'enviada'
		})
		.select('id, folio')
		.single()

	if (error) {
		console.error('[solicitudes] error al crear:', error.message)
		return json({ error: 'No pudimos enviar tu solicitud. Inténtalo de nuevo.' }, 500)
	}

	return json({
		ok: true,
		id: data.id,
		folio: data.folio,
		capacidad_pago: capacidad.razon,
		dentro_de_limite: capacidad.dentroDeLimite
	})
}

function json(cuerpo: unknown, estado = 200) {
	return new Response(JSON.stringify(cuerpo), {
		status: estado,
		headers: { 'content-type': 'application/json; charset=utf-8' }
	})
}
