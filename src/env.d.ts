/// <reference types="astro/client" />
/// <reference types="astro-integration-lottie/env" />

import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from './lib/supabase/database.types'
import type { Perfil, Rol } from './lib/auth'

interface ImportMetaEnv {
	readonly PUBLIC_SUPABASE_URL: string
	readonly PUBLIC_SUPABASE_ANON_KEY: string
	readonly SUPABASE_SERVICE_ROLE_KEY: string
	readonly PUBLIC_SITE_URL: string
	readonly ADMIN_BOOTSTRAP_EMAIL: string
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}

declare global {
	namespace App {
		interface Locals {
			/** Cliente Supabase ligado a las cookies de la peticion actual. */
			supabase: SupabaseClient<Database>
			/** Usuario autenticado, o null si la sesion es anonima. */
			usuario: User | null
			/** Perfil del usuario (nombre, rol, socio asociado), o null. */
			perfil: Perfil | null
			/** Rol efectivo. `invitado` cuando no hay sesion. */
			rol: Rol | 'invitado'
		}
	}
}

export {}
