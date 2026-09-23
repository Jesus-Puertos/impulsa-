// =============================================================================
// Motor de crédito (lado cliente/servidor)
// -----------------------------------------------------------------------------
// Espejo en TypeScript de las funciones SQL `calcular_pago_periodico` y
// `generar_amortizacion`. Sirve para que el simulador responda al instante sin
// ir a la base, y para verificar en el servidor lo que envía el navegador.
//
// La fuente de verdad de un crédito ya desembolsado es SIEMPRE la tabla
// `amortizaciones` de Postgres. Este módulo solo proyecta escenarios.
// Fórmulas y criterios: docs/07-motor-de-credito.md
// =============================================================================

import type { Periodicidad } from './supabase/database.types'

export const PERIODOS_POR_ANIO: Record<Periodicidad, number> = {
	semanal: 52,
	catorcenal: 26,
	quincenal: 24,
	mensual: 12
}

export const ETIQUETAS_PERIODICIDAD: Record<Periodicidad, string> = {
	semanal: 'Semanal',
	catorcenal: 'Catorcenal',
	quincenal: 'Quincenal',
	mensual: 'Mensual'
}

export const ETIQUETAS_PERIODO: Record<Periodicidad, string> = {
	semanal: 'semanas',
	catorcenal: 'catorcenas',
	quincenal: 'quincenas',
	mensual: 'meses'
}

export interface ParametrosSimulacion {
	monto: number
	tasaAnual: number
	periodos: number
	periodicidad: Periodicidad
	comisionAperturaPct?: number
	/** IVA sobre intereses en porcentaje. 0 mientras estén exentos. */
	ivaInteresesPct?: number
	fechaPrimerPago?: Date
}

export interface Cuota {
	numero: number
	fechaVencimiento: Date
	saldoInicial: number
	capital: number
	interes: number
	iva: number
	pago: number
	saldoFinal: number
}

export interface ResultadoSimulacion {
	pagoPeriodico: number
	comisionApertura: number
	totalIntereses: number
	totalIva: number
	totalAPagar: number
	/** Lo que efectivamente recibe el socio: monto menos comisión. */
	montoLiquido: number
	cat: number
	tabla: Cuota[]
}

const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Cuota fija del sistema francés.
 *
 *              P · i
 *     A = ─────────────────      i = tasa anual / 100 / periodos por año
 *          1 − (1 + i)^−n
 */
export function calcularPagoPeriodico(
	monto: number,
	tasaAnual: number,
	periodos: number,
	periodicidad: Periodicidad
): number {
	if (monto <= 0 || periodos <= 0) return 0

	const i = tasaAnual / 100 / PERIODOS_POR_ANIO[periodicidad]
	if (i === 0) return redondear(monto / periodos)

	return redondear((monto * i) / (1 - Math.pow(1 + i, -periodos)))
}

/**
 * Construye la tabla de amortización completa.
 *
 * La última cuota absorbe el residuo de redondeo para que el saldo final sea
 * exactamente cero; por eso suele diferir en centavos de las anteriores.
 */
export function simular(p: ParametrosSimulacion): ResultadoSimulacion {
	const {
		monto,
		tasaAnual,
		periodos,
		periodicidad,
		comisionAperturaPct = 0,
		ivaInteresesPct = 0,
		fechaPrimerPago
	} = p

	const i = tasaAnual / 100 / PERIODOS_POR_ANIO[periodicidad]
	const pagoPeriodico = calcularPagoPeriodico(monto, tasaAnual, periodos, periodicidad)
	const comisionApertura = redondear((monto * comisionAperturaPct) / 100)
	const inicio = fechaPrimerPago ?? sumarPeriodos(new Date(), periodicidad, 1)

	const tabla: Cuota[] = []
	let saldo = monto
	let totalIntereses = 0
	let totalIva = 0

	for (let k = 1; k <= periodos; k++) {
		const interes = redondear(saldo * i)
		const iva = redondear((interes * ivaInteresesPct) / 100)

		let capital: number
		if (k === periodos) {
			capital = redondear(saldo)
		} else {
			capital = redondear(pagoPeriodico - interes)
			if (capital > saldo) capital = saldo
		}

		const saldoFinal = redondear(saldo - capital)

		tabla.push({
			numero: k,
			fechaVencimiento: sumarPeriodos(inicio, periodicidad, k - 1),
			saldoInicial: saldo,
			capital,
			interes,
			iva,
			pago: redondear(capital + interes + iva),
			saldoFinal
		})

		totalIntereses += interes
		totalIva += iva
		saldo = saldoFinal
	}

	const totalAPagar = redondear(monto + totalIntereses + totalIva)

	return {
		pagoPeriodico,
		comisionApertura,
		totalIntereses: redondear(totalIntereses),
		totalIva: redondear(totalIva),
		totalAPagar,
		montoLiquido: redondear(monto - comisionApertura),
		cat: calcularCat(tabla, redondear(monto - comisionApertura), periodicidad),
		tabla
	}
}

/**
 * Costo Anual Total.
 *
 * Es la tasa que iguala el valor presente de los pagos con lo que el socio
 * recibe de verdad (monto menos comisión de apertura), expresada en términos
 * anuales. Se resuelve la TIR por bisección: converge siempre dentro del rango
 * acotado, a diferencia de Newton-Raphson, que puede divergir con tasas altas.
 */
export function calcularCat(
	tabla: Cuota[],
	montoLiquido: number,
	periodicidad: Periodicidad
): number {
	if (montoLiquido <= 0 || tabla.length === 0) return 0

	const flujos = tabla.map((c) => c.pago)
	const vpn = (tasa: number) =>
		flujos.reduce((acc, pago, idx) => acc + pago / Math.pow(1 + tasa, idx + 1), 0) - montoLiquido

	let bajo = 0
	let alto = 3 // 300 % por periodo: techo suficiente para cualquier producto

	if (vpn(bajo) < 0) return 0
	if (vpn(alto) > 0) return 0 // fuera de rango: se prefiere no publicar un CAT irreal

	for (let n = 0; n < 200; n++) {
		const medio = (bajo + alto) / 2
		if (vpn(medio) > 0) bajo = medio
		else alto = medio
		if (alto - bajo < 1e-12) break
	}

	const tasaPeriodo = (bajo + alto) / 2
	const anual = (Math.pow(1 + tasaPeriodo, PERIODOS_POR_ANIO[periodicidad]) - 1) * 100

	return Math.round(anual * 10) / 10
}

/** Avanza `n` periodos desde una fecha, según la periodicidad de pago. */
export function sumarPeriodos(desde: Date, periodicidad: Periodicidad, n: number): Date {
	const fecha = new Date(desde)

	switch (periodicidad) {
		case 'semanal':
			fecha.setDate(fecha.getDate() + n * 7)
			break
		case 'catorcenal':
			fecha.setDate(fecha.getDate() + n * 14)
			break
		case 'quincenal':
			fecha.setDate(fecha.getDate() + n * 15)
			break
		case 'mensual':
			fecha.setMonth(fecha.getMonth() + n)
			break
	}

	return fecha
}

// =============================================================================
// CAPACIDAD DE PAGO
// =============================================================================

export interface AnalisisCapacidad {
	ingresoDisponible: number
	pagoPeriodicoMensualizado: number
	razon: number
	dentroDeLimite: boolean
	pagoMaximoRecomendado: number
	montoMaximoRecomendado: number
}

/**
 * Evalúa si un pago cabe en el presupuesto declarado por el socio.
 *
 * Todo se lleva a base mensual para poder comparar productos con distinta
 * periodicidad contra un ingreso que siempre se declara mensual.
 */
export function analizarCapacidadPago(params: {
	ingresoMensual: number
	egresosMensuales: number
	otrosIngresos?: number
	pagoPeriodico: number
	periodicidad: Periodicidad
	factorMaximo: number
	tasaAnual: number
	periodos: number
}): AnalisisCapacidad {
	const {
		ingresoMensual,
		egresosMensuales,
		otrosIngresos = 0,
		pagoPeriodico,
		periodicidad,
		factorMaximo,
		tasaAnual,
		periodos
	} = params

	const ingresoDisponible = Math.max(ingresoMensual + otrosIngresos - egresosMensuales, 0)
	const pagosPorMes = PERIODOS_POR_ANIO[periodicidad] / 12
	const pagoPeriodicoMensualizado = redondear(pagoPeriodico * pagosPorMes)

	const razon = ingresoDisponible > 0 ? pagoPeriodicoMensualizado / ingresoDisponible : Infinity
	const pagoMaximoMensual = redondear(ingresoDisponible * factorMaximo)
	const pagoMaximoPeriodico = redondear(pagoMaximoMensual / pagosPorMes)

	// Se invierte la fórmula de la anualidad para obtener el principal máximo:
	//   P = A · (1 − (1 + i)^−n) / i
	const i = tasaAnual / 100 / PERIODOS_POR_ANIO[periodicidad]
	const montoMaximo =
		i === 0
			? pagoMaximoPeriodico * periodos
			: (pagoMaximoPeriodico * (1 - Math.pow(1 + i, -periodos))) / i

	return {
		ingresoDisponible,
		pagoPeriodicoMensualizado,
		razon: Number.isFinite(razon) ? Math.round(razon * 1000) / 1000 : 0,
		dentroDeLimite: razon <= factorMaximo,
		pagoMaximoRecomendado: pagoMaximoPeriodico,
		montoMaximoRecomendado: Math.floor(montoMaximo / 100) * 100
	}
}
