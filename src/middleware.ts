// =============================================================================
// Middleware de sesión y control de acceso
// -----------------------------------------------------------------------------
// Corre antes de cada página renderizada en el servidor. Resuelve la sesión una
// sola vez, la deja en `Astro.locals` y bloquea las rutas protegidas.
//
// Ojo: esto es control de NAVEGACIÓN. La barrera real contra lectura de datos
// ajenos son las políticas RLS de Postgres; si alguien saltara este middleware
// seguiría sin poder leer nada que no le corresponda.
// =============================================================================

import { defineMiddleware } from 'astro:middleware'
import { clienteServidor } from './lib/supabase/server'
import { cargarPerfil, esPersonal } from './lib/auth'

/** Rutas que exigen sesión iniciada, sin importar el rol. */
const RUTAS_AUTENTICADAS = ['/portal']

/** Rutas reservadas al personal de la cooperativa. */
const RUTAS_PERSONAL = ['/admin']

/** Rutas de acceso: si ya hay sesión, no tiene sentido volver a mostrarlas. */
const RUTAS_ANONIMAS = ['/acceso', '/recuperar']

export const onRequest = defineMiddleware(async (context, next) => {
	const { pathname } = context.url

	// Las páginas prerenderizadas se generan en build, donde no hay petición ni
	// cookies reales. Tampoco tienen nada que proteger.
	if (context.isPrerendered) return next()

	// Permite `astro build` y el arranque en frío sin credenciales configuradas:
	// el sitio público sigue funcionando y las rutas privadas avisan del fallo.
	if (!import.meta.env.PUBLIC_SUPABASE_URL || !import.meta.env.PUBLIC_SUPABASE_ANON_KEY) {
		context.locals.usuario = null
		context.locals.perfil = null
		context.locals.rol = 'invitado'
		if (requiere(pathname, [...RUTAS_AUTENTICADAS, ...RUTAS_PERSONAL])) {
			return new Response(
				'Supabase no está configurado. Copia .env.example a .env y define las claves.',
				{ status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }
			)
		}
		return next()
	}

	const supabase = clienteServidor(context.cookies)
	context.locals.supabase = supabase

	// getUser() valida el token contra el servidor de Auth. getSession() se
	// limita a decodificar la cookie, por lo que no sirve para autorizar.
	const {
		data: { user }
	} = await supabase.auth.getUser()

	context.locals.usuario = user ?? null

	const perfil = user ? await cargarPerfil(supabase, user.id) : null
	context.locals.perfil = perfil
	context.locals.rol = perfil?.rol ?? 'invitado'

	// --- Rutas de acceso: redirige a quien ya inició sesión --------------------
	if (perfil && requiere(pathname, RUTAS_ANONIMAS)) {
		return context.redirect(esPersonal(perfil.rol) ? '/admin' : '/portal')
	}

	// --- Rutas del personal ----------------------------------------------------
	if (requiere(pathname, RUTAS_PERSONAL)) {
		if (!user) return context.redirect(`/acceso?destino=${encodeURIComponent(pathname)}`)
		if (!perfil || !esPersonal(perfil.rol)) {
			// Un socio autenticado que intenta entrar al panel no recibe un login,
			// sino un "no tienes acceso": ya está identificado.
			return context.redirect('/portal?error=sin_permiso')
		}
	}

	// --- Rutas del socio -------------------------------------------------------
	if (requiere(pathname, RUTAS_AUTENTICADAS)) {
		if (!user) return context.redirect(`/acceso?destino=${encodeURIComponent(pathname)}`)
		if (!perfil) return context.redirect('/acceso?error=perfil_inactivo')
	}

	return next()
})

function requiere(pathname: string, prefijos: string[]): boolean {
	return prefijos.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}
