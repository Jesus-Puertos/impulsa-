// =============================================================================
// Formato de moneda, fechas y etiquetas
// -----------------------------------------------------------------------------
// Un único lugar para decidir cómo se ve un peso o una fecha en todo el sistema.
// Los formateadores de Intl se crean una sola vez: instanciarlos por llamada es
// caro y en tablas de amortización se llaman cientos de veces.
// =============================================================================

import type {
	EstadoCredito,
	EstadoCuota,
	EstadoDocumento,
	EstadoSocio,
	EstadoSolicitud,
	MetodoPago,
	TipoDocumento
} from './supabase/database.types'

const MONEDA = new Intl.NumberFormat('es-MX', {
	style: 'currency',
	currency: 'MXN',
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
})

const MONEDA_CORTA = new Intl.NumberFormat('es-MX', {
	style: 'currency',
	currency: 'MXN',
	minimumFractionDigits: 0,
	maximumFractionDigits: 0
})

const FECHA_LARGA = new Intl.DateTimeFormat('es-MX', {
	day: 'numeric',
	month: 'long',
	year: 'numeric'
})

const FECHA_CORTA = new Intl.DateTimeFormat('es-MX', {
	day: '2-digit',
	month: '2-digit',
	year: 'numeric'
})

const FECHA_HORA = new Intl.DateTimeFormat('es-MX', {
	day: '2-digit',
	month: '2-digit',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit'
})

export function pesos(valor: number | null | undefined): string {
	return MONEDA.format(valor ?? 0)
}

/** Sin centavos. Para tarjetas de resumen y KPIs donde el detalle estorba. */
export function pesosCortos(valor: number | null | undefined): string {
	return MONEDA_CORTA.format(valor ?? 0)
}

export function porcentaje(valor: number | null | undefined, decimales = 1): string {
	if (valor == null) return '—'
	return `${valor.toFixed(decimales).replace(/\.0+$/, '')}%`
}

/**
 * Formatea una fecha admitiendo tanto `Date` como las cadenas que devuelve
 * Postgres. Las fechas puras (`YYYY-MM-DD`) se interpretan en horario local
 * para que no se corran un día por la conversión desde UTC.
 */
export function fecha(valor: string | Date | null | undefined, estilo: 'larga' | 'corta' = 'corta') {
	const d = aFecha(valor)
	if (!d) return '—'
	return estilo === 'larga' ? FECHA_LARGA.format(d) : FECHA_CORTA.format(d)
}

export function fechaHora(valor: string | Date | null | undefined): string {
	const d = aFecha(valor)
	return d ? FECHA_HORA.format(d) : '—'
}

export function aFecha(valor: string | Date | null | undefined): Date | null {
	if (!valor) return null
	if (valor instanceof Date) return valor

	// `2026-08-09` sin hora se parsea como UTC y en México retrocede al día 8.
	const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(valor)
	const d = soloFecha ? new Date(`${valor}T12:00:00`) : new Date(valor)

	return Number.isNaN(d.getTime()) ? null : d
}

/** Formato ISO `YYYY-MM-DD` para inputs de tipo date. */
export function aIso(valor: Date | string | null | undefined): string {
	const d = aFecha(valor)
	if (!d) return ''
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "hace 3 días", "en 2 semanas". Útil en bandejas y listados de cobranza. */
export function tiempoRelativo(valor: string | Date | null | undefined): string {
	const d = aFecha(valor)
	if (!d) return '—'

	const rtf = new Intl.RelativeTimeFormat('es-MX', { numeric: 'auto' })
	const dias = Math.round((d.getTime() - Date.now()) / 86400000)

	if (Math.abs(dias) < 1) return 'hoy'
	if (Math.abs(dias) < 31) return rtf.format(dias, 'day')
	if (Math.abs(dias) < 365) return rtf.format(Math.round(dias / 30), 'month')
	return rtf.format(Math.round(dias / 365), 'year')
}

// =============================================================================
// ETIQUETAS DE ESTADO
// Las claves coinciden con los ENUM de Postgres; el valor es el texto que ve
// la persona usuaria.
// =============================================================================

export const ETIQUETAS_ESTADO_SOCIO: Record<EstadoSocio, string> = {
	prospecto: 'Prospecto',
	en_revision: 'En revisión',
	activo: 'Activo',
	suspendido: 'Suspendido',
	baja: 'Baja',
	rechazado: 'Rechazado'
}

export const ETIQUETAS_ESTADO_SOLICITUD: Record<EstadoSolicitud, string> = {
	borrador: 'Borrador',
	enviada: 'Enviada',
	en_revision: 'En revisión',
	aprobada: 'Aprobada',
	rechazada: 'Rechazada',
	cancelada: 'Cancelada',
	desembolsada: 'Desembolsada'
}

export const ETIQUETAS_ESTADO_CREDITO: Record<EstadoCredito, string> = {
	vigente: 'Vigente',
	atrasado: 'Atrasado',
	liquidado: 'Liquidado',
	castigado: 'Castigado',
	cancelado: 'Cancelado'
}

export const ETIQUETAS_ESTADO_CUOTA: Record<EstadoCuota, string> = {
	pendiente: 'Pendiente',
	parcial: 'Pago parcial',
	pagada: 'Pagada',
	vencida: 'Vencida',
	condonada: 'Condonada'
}

export const ETIQUETAS_ESTADO_DOCUMENTO: Record<EstadoDocumento, string> = {
	pendiente: 'Por revisar',
	verificado: 'Verificado',
	rechazado: 'Rechazado'
}

export const ETIQUETAS_TIPO_DOCUMENTO: Record<TipoDocumento, string> = {
	ine_frente: 'INE (frente)',
	ine_reverso: 'INE (reverso)',
	curp: 'Constancia de CURP',
	rfc: 'Constancia de situación fiscal',
	comprobante_domicilio: 'Comprobante de domicilio',
	comprobante_ingresos: 'Comprobante de ingresos',
	acta_nacimiento: 'Acta de nacimiento',
	estado_cuenta_bancario: 'Estado de cuenta bancario',
	fotografia: 'Fotografía',
	firma: 'Firma',
	otro: 'Otro documento'
}

export const ETIQUETAS_METODO_PAGO: Record<MetodoPago, string> = {
	efectivo: 'Efectivo',
	transferencia: 'Transferencia',
	deposito: 'Depósito',
	domiciliacion: 'Domiciliación',
	descuento_nomina: 'Descuento por nómina'
}

/** Recorta un texto largo sin cortar palabras a la mitad. */
export function recortar(texto: string | null | undefined, maximo = 120): string {
	if (!texto) return ''
	if (texto.length <= maximo) return texto
	return `${texto.slice(0, texto.lastIndexOf(' ', maximo))}…`
}

/** Convierte un título en slug para URLs del blog. */
export function aSlug(texto: string): string {
	return texto
		.normalize('NFD')
		// Elimina los signos diacríticos que NFD dejó sueltos (acentos, diéresis).
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
}
