// =============================================================================
// POST /api/auth/registro
// Crea la cuenta de acceso y abre el expediente de socio en estado `prospecto`.
//
// Ambas cosas se hacen en un solo paso para que, cuando la confirmación por
// correo está desactivada, la persona siga completando su expediente sin volver
// a escribir nada. Con la confirmación activada no hay sesión todavía: la cuenta
// y el expediente quedan creados, y `sesion_iniciada: false` le indica al front
// que debe mandar a /acceso en lugar de intentar los pasos siguientes.
//
// Si la creación del expediente falla, la cuenta ya existe: el usuario puede
// entrar y el portal le pedirá completar sus datos.
// =============================================================================

import type { APIRoute } from 'astro'
import { clienteAdmin, clienteServidor } from '../../../lib/supabase/server'
import {
	validarCurp,
	validarCorreo,
	validarTelefono,
	validarMayorDeEdad,
	fechaNacimientoDesdeCurp,
	generoDesdeCurp,
	primerError
} from '../../../lib/validaciones'

export const prerender = false

const LONGITUD_MINIMA_CONTRASENA = 8

export const POST: APIRoute = async ({ request, cookies }) => {
	let cuerpo: Record<string, string>

	try {
		cuerpo = await request.json()
	} catch {
		return json({ error: 'El cuerpo de la petición no es JSON válido.' }, 400)
	}

	const correo = (cuerpo.correo ?? '').trim().toLowerCase()
	const contrasena = cuerpo.contrasena ?? ''
	const nombre = (cuerpo.nombre ?? '').trim()
	const apellidoPaterno = (cuerpo.apellido_paterno ?? '').trim()
	const apellidoMaterno = (cuerpo.apellido_materno ?? '').trim() || null
	const curp = (cuerpo.curp ?? '').trim().toUpperCase()
	const telefono = (cuerpo.telefono ?? '').trim()

	// --- Validación -----------------------------------------------------------
	const fallo = primerError(
		['correo', validarCorreo(correo)],
		['curp', validarCurp(curp)],
		['telefono', validarTelefono(telefono)]
	)
	if (fallo) return json({ error: fallo.mensaje, campo: fallo.campo }, 422)

	if (contrasena.length < LONGITUD_MINIMA_CONTRASENA) {
		return json(
			{
				error: `La contraseña debe tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres.`,
				campo: 'contrasena'
			},
			422
		)
	}
	if (!nombre || !apellidoPaterno) {
		return json({ error: 'El nombre y el apellido paterno son obligatorios.', campo: 'nombre' }, 422)
	}

	// La CURP codifica la fecha de nacimiento; se usa como fuente de verdad para
	// no depender de que la persona la teclee bien dos veces.
	const fechaNacimiento = fechaNacimientoDesdeCurp(curp)
	if (!fechaNacimiento) {
		return json({ error: 'No pudimos leer la fecha de nacimiento de tu CURP.', campo: 'curp' }, 422)
	}

	const edad = validarMayorDeEdad(fechaNacimiento)
	if (!edad.valido) return json({ error: edad.mensaje, campo: 'curp' }, 422)

	// `clienteServidor` escribe las cookies de sesión cuando signUp devuelve una.
	// `clienteAdmin` cubre lo que quien se registra todavía no puede hacer por sí
	// mismo: en este punto es `anon`, y tanto leer como escribir en `socios` está
	// reservado a `authenticated`. Con la confirmación por correo activada nunca
	// hay sesión aquí, así que sin la clave de servicio el expediente jamás se
	// crearía.
	const supabase = clienteServidor(cookies)

	let admin: ReturnType<typeof clienteAdmin>
	try {
		admin = clienteAdmin()
	} catch (e) {
		console.error('[registro]', e)
		return json({ error: 'El registro no está disponible en este momento.' }, 503)
	}

	// --- CURP duplicada -------------------------------------------------------
	// Se consulta antes de crear la cuenta para no dejar usuarios huérfanos. La
	// restricción UNIQUE de la tabla sigue siendo la garantía real.
	const { count } = await admin
		.from('socios')
		.select('id', { count: 'exact', head: true })
		.eq('curp', curp)

	if (count && count > 0) {
		return json(
			{
				error: 'Ya existe un expediente con esa CURP. Si eres tú, entra con tu correo o acude a tu sucursal.',
				campo: 'curp'
			},
			409
		)
	}

	// --- Cuenta de acceso -----------------------------------------------------
	const { data, error: errorAuth } = await supabase.auth.signUp({
		email: correo,
		password: contrasena,
		options: {
			// El trigger `manejar_usuario_nuevo` lee estos metadatos para crear el perfil.
			data: {
				nombre,
				apellido_paterno: apellidoPaterno,
				apellido_materno: apellidoMaterno,
				telefono
			},
			emailRedirectTo: `${import.meta.env.PUBLIC_SITE_URL ?? new URL(request.url).origin}/portal`
		}
	})

	if (errorAuth) {
		const yaExiste = /already registered|already been registered/i.test(errorAuth.message)
		return json(
			{
				error: yaExiste
					? 'Ese correo ya tiene una cuenta. Entra con tu contraseña o recupérala.'
					: 'No pudimos crear tu cuenta. Inténtalo de nuevo en unos minutos.',
				campo: yaExiste ? 'correo' : undefined
			},
			yaExiste ? 409 : 500
		)
	}

	if (!data.user) {
		return json({ error: 'No pudimos crear tu cuenta.' }, 500)
	}

	// --- Expediente de socio --------------------------------------------------
	const { data: socio, error: errorSocio } = await admin
		.from('socios')
		.insert({
			perfil_id: data.user.id,
			nombre,
			apellido_paterno: apellidoPaterno,
			apellido_materno: apellidoMaterno,
			curp,
			fecha_nacimiento: fechaNacimiento,
			genero: generoDesdeCurp(curp),
			correo,
			telefono,
			estado: 'prospecto'
		})
		.select('id')
		.single()

	if (errorSocio) {
		console.error('[registro] cuenta creada sin expediente:', errorSocio.message)
		return json(
			{
				error:
					'Tu cuenta se creó, pero no pudimos abrir tu expediente. Entra al portal y continúa desde ahí.',
				cuenta_creada: true
			},
			207
		)
	}

	// `signUp` deja sesión iniciada solo cuando la confirmación por correo está
	// desactivada. En producción normalmente estará activa, así que el front
	// debe llevar a /acceso si esto viene en false.
	const sesionIniciada = Boolean(data.session)

	return json({ ok: true, socio_id: socio.id, sesion_iniciada: sesionIniciada })
}

function json(cuerpo: unknown, estado = 200) {
	return new Response(JSON.stringify(cuerpo), {
		status: estado,
		headers: { 'content-type': 'application/json; charset=utf-8' }
	})
}
