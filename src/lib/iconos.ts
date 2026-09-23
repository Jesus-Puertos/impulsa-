// =============================================================================
// Resolución de iconos de catálogo
// -----------------------------------------------------------------------------
// La columna `productos_credito.icono` es texto libre editable desde /admin, y
// `astro-icon` lanza cuando recibe un nombre que no existe en `src/icons/`. Como
// la portada es SSR, ese fallo no aparecería en el build sino como un 500 en la
// petición: bastaría un dedazo capturando un producto para tumbar el inicio.
//
// Por eso el nombre nunca llega crudo al componente. Se comprueba contra los
// archivos que de verdad existen, se intenta un alias conocido y, si nada
// encaja, se devuelve un icono de respaldo.
// =============================================================================

/**
 * Nombres disponibles, leídos del propio directorio de iconos.
 *
 * `eager: false` deja las importaciones sin resolver: solo interesan las claves
 * del objeto, así que no se carga ningún SVG.
 */
const DISPONIBLES = new Set(
	Object.keys(import.meta.glob('/src/icons/*.svg')).map(
		(ruta) => ruta.split('/').pop()!.replace('.svg', '')
	)
)

/**
 * Traducciones para nombres que el catálogo usa pero el set local no incluye.
 *
 * El set de `src/icons/` es un subconjunto de Heroicons, así que hay nombres
 * razonables que no están. En lugar de añadir SVG sueltos, se apuntan al
 * equivalente más cercano ya presente.
 */
const ALIAS: Record<string, string> = {
	briefcase: 'shopping-bag',
	building: 'squares-plus',
	'building-office': 'squares-plus',
	cash: 'credit-card',
	banknotes: 'credit-card',
	globe: 'globe-alt',
	home: 'key',
	house: 'key',
	'academic-cap': 'book',
	truck: 'shopping-bag',
	heart: 'lifebuoy',
	'currency-dollar': 'credit-card',
	sparkles: 'bolt',
	'arrow-trending-up': 'trending-up'
}

/** Icono que se usa cuando el valor del catálogo no lleva a ninguna parte. */
export const ICONO_RESPALDO = 'credit-card'

/**
 * Devuelve un nombre de icono que existe con certeza en `src/icons/`.
 *
 * @param valor Contenido de la columna `icono`; puede venir nulo o con basura.
 * @param respaldo Icono a usar cuando no hay coincidencia.
 */
export function iconoDeCatalogo(valor: string | null | undefined, respaldo = ICONO_RESPALDO): string {
	if (!valor) return respaldo

	const limpio = valor.trim().toLowerCase()
	if (DISPONIBLES.has(limpio)) return limpio

	const alias = ALIAS[limpio]
	if (alias && DISPONIBLES.has(alias)) return alias

	return DISPONIBLES.has(respaldo) ? respaldo : ICONO_RESPALDO
}

// =============================================================================
// Color corporativo del producto
// -----------------------------------------------------------------------------
// `productos_credito.color` guarda un token (primary, oro, campo). Tailwind
// necesita ver las clases completas escritas literalmente para incluirlas en el
// CSS, así que no se pueden componer con plantillas: van enumeradas.
// =============================================================================

export type TokenColor = 'primary' | 'oro' | 'campo'

export interface PaletaProducto {
	/** Fondo y color del círculo que envuelve al icono. */
	halo: string
	/** Color del dato destacado (la tasa). */
	acento: string
	/** Filo superior de la tarjeta. */
	filo: string
}

const PALETA: Record<TokenColor, PaletaProducto> = {
	primary: {
		halo: 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-200',
		acento: 'text-primary-700 dark:text-primary-300',
		filo: 'bg-primary-600 dark:bg-primary-500'
	},
	oro: {
		halo: 'bg-oro-100 text-oro-800 dark:bg-oro-800/30 dark:text-oro-200',
		acento: 'text-oro-700 dark:text-oro-300',
		filo: 'bg-oro-400 dark:bg-oro-300'
	},
	campo: {
		halo: 'bg-campo-100 text-campo-800 dark:bg-campo-800/30 dark:text-campo-200',
		acento: 'text-campo-700 dark:text-campo-300',
		filo: 'bg-campo-500 dark:bg-campo-400'
	}
}

/** Paleta del producto, con `primary` como respaldo para tokens desconocidos. */
export function paletaDeCatalogo(valor: string | null | undefined): PaletaProducto {
	const clave = (valor ?? '').trim().toLowerCase()
	return PALETA[clave as TokenColor] ?? PALETA.primary
}
