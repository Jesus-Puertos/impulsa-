// =============================================================================
// Sesión, roles y permisos
// -----------------------------------------------------------------------------
// El rol vive en la tabla `perfiles` y es la base de la autorización tanto en la
// base de datos (políticas RLS) como en la interfaz. Las funciones de este
// archivo NO son un control de acceso por sí solas: deciden qué se muestra y a
// dónde se redirige, mientras que la barrera real la impone RLS en Postgres.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Rol } from './supabase/database.types'

export type { Rol }

export interface Perfil {
	id: string
	nombre: string
	apellido_paterno: string
	apellido_materno: string | null
	correo: string
	telefono: string | null
	rol: Rol
	sucursal_id: string | null
	avatar_url: string | null
	activo: boolean
	/** Id del expediente de socio, si esta persona además es socia. */
	socio_id: string | null
	/** Estado del expediente; determina qué puede hacer en el portal. */
	socio_estado: string | null
	numero_socio: string | null
}

/** Jerarquía de roles. Un rol incluye implícitamente los permisos del anterior. */
const JERARQUIA: Record<Rol, number> = {
	socio: 0,
	promotor: 1,
	cajero: 2,
	analista: 3,
	gerente: 4,
	admin: 5
}

export const ETIQUETAS_ROL: Record<Rol, string> = {
	socio: 'Socio',
	promotor: 'Promotor',
	cajero: 'Cajero',
	analista: 'Analista de crédito',
	gerente: 'Gerente',
	admin: 'Administrador'
}

/** Todo rol distinto de `socio` es personal de la cooperativa. */
export function esPersonal(rol: Rol | 'invitado' | null | undefined): boolean {
	return rol !== 'socio' && rol !== 'invitado' && rol != null
}

/** True si `rol` alcanza el nivel de `minimo` en la jerarquía. */
export function alcanzaRol(rol: Rol | 'invitado' | null | undefined, minimo: Rol): boolean {
	if (!rol || rol === 'invitado') return false
	return JERARQUIA[rol] >= JERARQUIA[minimo]
}

/** True si `rol` es exactamente uno de los indicados. */
export function tieneRol(rol: Rol | 'invitado' | null | undefined, ...roles: Rol[]): boolean {
	if (!rol || rol === 'invitado') return false
	return roles.includes(rol)
}

/**
 * Carga el perfil del usuario junto con su expediente de socio, si lo tiene.
 *
 * Devuelve `null` cuando el perfil no existe (usuario recién creado cuyo
 * trigger aún no corrió) o está desactivado.
 */
export async function cargarPerfil(
	supabase: SupabaseClient<Database>,
	usuarioId: string
): Promise<Perfil | null> {
	const { data, error } = await supabase
		.from('perfiles')
		.select(
			// El nombre del constraint es obligatorio: `socios` apunta dos veces a
			// `perfiles` (`perfil_id` y `promotor_id`), y sin desambiguar PostgREST
			// rechaza la consulta entera con PGRST201. Aquí interesa el expediente
			// propio, no el de los socios que esta persona promueve.
			`id, nombre, apellido_paterno, apellido_materno, correo, telefono, rol,
			 sucursal_id, avatar_url, activo,
			 socios!socios_perfil_id_fkey ( id, estado, numero_socio )`
		)
		.eq('id', usuarioId)
		.maybeSingle()

	// Un fallo de consulta y un perfil desactivado acaban ambos en `null`, pero
	// solo el primero es un defecto: sin esta traza se manifiesta como un
	// «no encontramos tu perfil» que no lleva a ninguna parte.
	if (error) {
		console.error('[cargarPerfil]', error.message)
		return null
	}

	if (!data || !data.activo) return null

	// `socios` llega como arreglo por ser una relación inversa, aunque la
	// restricción UNIQUE sobre perfil_id garantiza que traiga cero o un elemento.
	const socio = Array.isArray(data.socios) ? data.socios[0] : data.socios

	return {
		id: data.id,
		nombre: data.nombre,
		apellido_paterno: data.apellido_paterno,
		apellido_materno: data.apellido_materno,
		correo: data.correo,
		telefono: data.telefono,
		rol: data.rol,
		sucursal_id: data.sucursal_id,
		avatar_url: data.avatar_url,
		activo: data.activo,
		socio_id: socio?.id ?? null,
		socio_estado: socio?.estado ?? null,
		numero_socio: socio?.numero_socio ?? null
	}
}

export function nombreCompleto(p: {
	nombre: string
	apellido_paterno: string
	apellido_materno?: string | null
}): string {
	return [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ').trim()
}

export function iniciales(p: { nombre: string; apellido_paterno: string }): string {
	return `${p.nombre.charAt(0)}${p.apellido_paterno.charAt(0)}`.toUpperCase()
}
