// =============================================================================
// POST /api/auth/salir
// Cierra la sesión y limpia las cookies.
//
// Solo acepta POST: si fuera GET, cualquier <img src="/api/auth/salir"> en una
// página externa cerraría la sesión de quien la visitara.
// =============================================================================

import type { APIRoute } from 'astro'
import { clienteServidor } from '../../../lib/supabase/server'

export const prerender = false

export const POST: APIRoute = async ({ cookies, redirect }) => {
	const supabase = clienteServidor(cookies)
	await supabase.auth.signOut()

	return redirect('/?sesion=cerrada', 303)
}
