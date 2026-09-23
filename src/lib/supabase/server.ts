// =============================================================================
// Clientes de Supabase para el servidor
// -----------------------------------------------------------------------------
// `clienteServidor` está ligado a las cookies de la petición: hereda la sesión
// del visitante y respeta RLS. Es el que usan las páginas SSR y los endpoints.
//
// `clienteAdmin` usa la service role key y SALTA RLS por completo. Solo debe
// invocarse desde endpoints del servidor, y solo cuando la operación no puede
// hacerse con el cliente del usuario (alta de personal, firmado de documentos
// de expediente ajeno, procesos programados).
// =============================================================================

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import type { AstroCookies } from 'astro'
import type { Database } from './database.types'

/**
 * Cliente con la sesión del visitante, leída de las cookies de la petición.
 *
 * @param cookies El objeto `Astro.cookies` de la página o endpoint.
 */
export function clienteServidor(cookies: AstroCookies) {
	return createServerClient<Database>(
		import.meta.env.PUBLIC_SUPABASE_URL,
		import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
		{
			cookies: {
				getAll() {
					// Astro no expone un iterador de cookies, así que se leen las que
					// usa Supabase por convención (`sb-<ref>-auth-token`, con posibles
					// fragmentos numerados cuando el token excede el tamaño máximo).
					const prefijo = prefijoCookie()
					const nombres = [prefijo, ...Array.from({ length: 5 }, (_, i) => `${prefijo}.${i}`)]

					return nombres
						.filter((nombre) => cookies.has(nombre))
						.map((nombre) => ({ name: nombre, value: cookies.get(nombre)!.value }))
				},
				setAll(cookiesNuevas) {
					for (const { name, value, options } of cookiesNuevas) {
						cookies.set(name, value, opcionesCookie(options))
					}
				}
			}
		}
	)
}

/**
 * Cliente con privilegios totales. No respeta RLS.
 *
 * Lanza si se invoca sin la clave configurada, para que el fallo aparezca en
 * el despliegue y no como un error silencioso de permisos en producción.
 */
export function clienteAdmin() {
	const clave = import.meta.env.SUPABASE_SERVICE_ROLE_KEY

	if (!clave) {
		throw new Error(
			'Falta SUPABASE_SERVICE_ROLE_KEY. Configúrala en el entorno del servidor ' +
				'(ver docs/02-supabase-setup.md).'
		)
	}

	return createClient<Database>(import.meta.env.PUBLIC_SUPABASE_URL, clave, {
		auth: { autoRefreshToken: false, persistSession: false }
	})
}

/** Nombre base de la cookie de sesión, derivado de la referencia del proyecto. */
function prefijoCookie() {
	const url = import.meta.env.PUBLIC_SUPABASE_URL ?? ''
	const referencia = url.match(/https?:\/\/([^.]+)\./)?.[1] ?? 'local'
	return `sb-${referencia}-auth-token`
}

function opcionesCookie(options: CookieOptions) {
	return {
		...options,
		path: options.path ?? '/',
		httpOnly: options.httpOnly ?? true,
		sameSite: (options.sameSite as 'lax' | 'strict' | 'none') ?? 'lax',
		secure: options.secure ?? import.meta.env.PROD
	}
}
