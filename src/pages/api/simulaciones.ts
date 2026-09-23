// =============================================================================
// POST /api/simulaciones
// Registra una simulación de crédito. Abierto a visitantes anónimos.
//
// El servidor RECALCULA el resultado a partir del producto guardado en la base
// en lugar de confiar en las cifras que manda el navegador: así lo que queda
// asentado es lo que la cooperativa ofrece, no lo que alguien pudo alterar
// desde las herramientas de desarrollo.
// =============================================================================

import type { APIRoute } from 'astro'
import { clienteServidor } from '../../lib/supabase/server'
import { simular } from '../../lib/credito'
import { validarTelefono, validarCorreo } from '../../lib/validaciones'

export const prerender = false

export const POST: APIRoute = async ({ request, cookies }) => {
	let cuerpo: Record<string, unknown>

	try {
		cuerpo = await request.json()
	} catch {
		return json({ error: 'El cuerpo de la petición no es JSON válido.' }, 400)
	}

	const productoId = String(cuerpo.producto_id ?? '')
	const monto = Number(cuerpo.monto)
	const plazo = Number(cuerpo.plazo_periodos)
	const quiereContacto = Boolean(cuerpo.quiere_contacto)

	if (!productoId) return json({ error: 'Falta indicar el producto.' }, 400)
	if (!Number.isFinite(monto) || monto <= 0) return json({ error: 'El monto no es válido.' }, 400)
	if (!Number.isInteger(plazo) || plazo <= 0) return json({ error: 'El plazo no es válido.' }, 400)

	const supabase = clienteServidor(cookies)

	const { data: producto, error: errorProducto } = await supabase
		.from('productos_credito')
		.select('*')
		.eq('id', productoId)
		.eq('activo', true)
		.maybeSingle()

	if (errorProducto || !producto) {
		return json({ error: 'El producto de crédito no está disponible.' }, 404)
	}

	// Los límites del producto son la autoridad, no los del formulario.
	if (monto < producto.monto_minimo || monto > producto.monto_maximo) {
		return json(
			{
				error: `El monto debe estar entre ${producto.monto_minimo} y ${producto.monto_maximo} para este producto.`
			},
			422
		)
	}
	if (plazo < producto.plazo_minimo_periodos || plazo > producto.plazo_maximo_periodos) {
		return json(
			{
				error: `El plazo debe estar entre ${producto.plazo_minimo_periodos} y ${producto.plazo_maximo_periodos} periodos.`
			},
			422
		)
	}

	// Datos de contacto: solo se exigen si la persona pidió que la llamaran.
	let nombreContacto: string | null = null
	let telefonoContacto: string | null = null
	let correoContacto: string | null = null

	if (quiereContacto) {
		nombreContacto = String(cuerpo.nombre_contacto ?? '').trim()
		telefonoContacto = String(cuerpo.telefono_contacto ?? '').trim()
		correoContacto = String(cuerpo.correo_contacto ?? '').trim() || null

		if (nombreContacto.length < 3) {
			return json({ error: 'Escribe tu nombre para que podamos contactarte.' }, 422)
		}

		const tel = validarTelefono(telefonoContacto)
		if (!tel.valido) return json({ error: tel.mensaje }, 422)

		if (correoContacto) {
			const mail = validarCorreo(correoContacto)
			if (!mail.valido) return json({ error: mail.mensaje }, 422)
		}
	}

	const resultado = simular({
		monto,
		tasaAnual: producto.tasa_anual,
		periodos: plazo,
		periodicidad: producto.periodicidad,
		comisionAperturaPct: producto.comision_apertura_pct
	})

	// Si hay sesión y expediente, la simulación queda ligada al socio.
	const {
		data: { user }
	} = await supabase.auth.getUser()

	let socioId: string | null = null
	if (user) {
		const { data: socio } = await supabase
			.from('socios')
			.select('id')
			.eq('perfil_id', user.id)
			.maybeSingle()
		socioId = socio?.id ?? null
	}

	const { data, error } = await supabase
		.from('simulaciones')
		.insert({
			producto_id: producto.id,
			socio_id: socioId,
			monto,
			plazo_periodos: plazo,
			periodicidad: producto.periodicidad,
			tasa_anual: producto.tasa_anual,
			comision_apertura: resultado.comisionApertura,
			pago_periodico: resultado.pagoPeriodico,
			total_intereses: resultado.totalIntereses,
			total_a_pagar: resultado.totalAPagar,
			cat: resultado.cat,
			quiere_contacto: quiereContacto,
			nombre_contacto: nombreContacto,
			telefono_contacto: telefonoContacto,
			correo_contacto: correoContacto,
			origen: 'web'
		})
		.select('id')
		.single()

	if (error) {
		console.error('[simulaciones] no se pudo guardar:', error.message)
		return json({ error: 'No pudimos guardar tu simulación. Inténtalo de nuevo.' }, 500)
	}

	return json({
		id: data.id,
		pago_periodico: resultado.pagoPeriodico,
		total_a_pagar: resultado.totalAPagar,
		cat: resultado.cat
	})
}

function json(cuerpo: unknown, estado = 200) {
	return new Response(JSON.stringify(cuerpo), {
		status: estado,
		headers: { 'content-type': 'application/json; charset=utf-8' }
	})
}
