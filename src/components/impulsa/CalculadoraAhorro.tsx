// =============================================================================
// Calculadora de ahorro programado
// -----------------------------------------------------------------------------
// Proyecta el saldo de una cuenta con aportaciones periódicas y capitalización
// mensual. Es la contraparte del simulador de crédito: el mismo rigor, pero
// para ver crecer el dinero en lugar de pagarlo.
// =============================================================================

import { useMemo, useState } from 'react'
import { pesos, porcentaje } from '../../lib/formato'
import type { ProductoAhorro } from '../../lib/supabase/database.types'

interface Props {
	productos: ProductoAhorro[]
}

export default function CalculadoraAhorro({ productos }: Props) {
	const conRendimiento = productos.filter((p) => p.tasa_anual > 0)
	const inicial = conRendimiento[0] ?? productos[0]

	const [productoId, setProductoId] = useState(inicial?.id ?? '')
	const producto = productos.find((p) => p.id === productoId) ?? inicial

	const [inicialDeposito, setInicialDeposito] = useState(inicial?.monto_minimo_apertura ?? 500)
	const [aportacion, setAportacion] = useState(500)
	const [meses, setMeses] = useState(24)

	const proyeccion = useMemo(() => {
		if (!producto) return null

		const tasaMensual = producto.tasa_anual / 100 / 12
		const puntos: { mes: number; saldo: number; aportado: number; interes: number }[] = []

		let saldo = inicialDeposito
		let aportado = inicialDeposito

		for (let m = 1; m <= meses; m++) {
			// El interés se calcula sobre el saldo del mes anterior y la aportación
			// se abona al inicio del periodo, que es como opera la cuenta real.
			saldo += aportacion
			aportado += aportacion
			saldo += saldo * tasaMensual

			puntos.push({
				mes: m,
				saldo: Math.round(saldo * 100) / 100,
				aportado: Math.round(aportado * 100) / 100,
				interes: Math.round((saldo - aportado) * 100) / 100
			})
		}

		const ultimo = puntos[puntos.length - 1]
		return {
			puntos,
			saldoFinal: ultimo?.saldo ?? inicialDeposito,
			totalAportado: ultimo?.aportado ?? inicialDeposito,
			interesGanado: ultimo?.interes ?? 0
		}
	}, [producto, inicialDeposito, aportacion, meses])

	if (!producto || !proyeccion) {
		return (
			<div className="aviso aviso--alerta">
				<p>No hay instrumentos de ahorro publicados en este momento.</p>
			</div>
		)
	}

	const maximo = proyeccion.saldoFinal || 1
	// Se muestran hasta 24 barras para que la gráfica siga siendo legible en
	// plazos largos; con más de 24 meses se toma una de cada N.
	const paso = Math.max(1, Math.ceil(proyeccion.puntos.length / 24))
	const barras = proyeccion.puntos.filter((_, i) => i % paso === 0 || i === proyeccion.puntos.length - 1)

	return (
		<div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
			<div className="panel">
				<div className="campo">
					<label htmlFor="producto-ahorro">Instrumento</label>
					<select
						id="producto-ahorro"
						value={productoId}
						onChange={(e) => {
							const nuevo = productos.find((p) => p.id === e.target.value)
							setProductoId(e.target.value)
							if (nuevo) setInicialDeposito(Math.max(inicialDeposito, nuevo.monto_minimo_apertura))
						}}
					>
						{productos.map((p) => (
							<option key={p.id} value={p.id}>
								{p.nombre} — {porcentaje(p.tasa_anual)} anual
							</option>
						))}
					</select>
				</div>

				<div className="campo--fila">
					<div className="campo">
						<label htmlFor="inicial">Depósito inicial</label>
						<input
							id="inicial"
							type="number"
							min={producto.monto_minimo_apertura}
							step={100}
							value={inicialDeposito}
							onChange={(e) => setInicialDeposito(Number(e.target.value))}
						/>
						<span className="campo__ayuda">
							Mínimo de apertura: {pesos(producto.monto_minimo_apertura)}
						</span>
					</div>

					<div className="campo">
						<label htmlFor="aportacion">Aportación mensual</label>
						<input
							id="aportacion"
							type="number"
							min={0}
							step={100}
							value={aportacion}
							onChange={(e) => setAportacion(Number(e.target.value))}
						/>
						<span className="campo__ayuda">Puedes dejarlo en 0 para ver solo el rendimiento.</span>
					</div>
				</div>

				<div className="campo">
					<div className="flex items-baseline justify-between">
						<label htmlFor="meses">¿Por cuánto tiempo?</label>
						<output className="font-display text-xl text-campo-600 dark:text-campo-400">
							{meses} meses
						</output>
					</div>
					<input
						id="meses"
						type="range"
						className="deslizador"
						min={6}
						max={120}
						step={6}
						value={meses}
						onChange={(e) => setMeses(Number(e.target.value))}
					/>
					<div className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
						<span>6 meses</span>
						<span>10 años</span>
					</div>
				</div>

				{/* Gráfica */}
				<div className="mt-8">
					<div className="flex h-40 items-end gap-1" role="img" aria-label="Crecimiento del ahorro">
						{barras.map((p) => (
							<div key={p.mes} className="group relative flex flex-1 flex-col justify-end">
								<span
									className="bg-campo-300 block rounded-t-sm"
									style={{ height: `${(p.interes / maximo) * 100}%` }}
								/>
								<span
									className="bg-campo-600 block"
									style={{ height: `${(p.aportado / maximo) * 100}%` }}
								/>
								<span className="sr-only">
									Mes {p.mes}: {pesos(p.saldo)}
								</span>
							</div>
						))}
					</div>
					<div className="mt-3 flex gap-4 text-xs text-neutral-500 dark:text-neutral-400">
						<span className="flex items-center gap-1.5">
							<span className="bg-campo-600 inline-block size-3 rounded-sm" /> Lo que aportas
						</span>
						<span className="flex items-center gap-1.5">
							<span className="bg-campo-300 inline-block size-3 rounded-sm" /> Rendimiento
						</span>
					</div>
				</div>
			</div>

			<aside className="panel h-fit">
				<span className="text-xs tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
					En {meses} meses tendrías
				</span>
				<p className="font-display text-campo-600 dark:text-campo-400 mb-5 text-4xl leading-none tabular-nums">
					{pesos(proyeccion.saldoFinal)}
				</p>

				<dl className="space-y-2.5 border-t border-neutral-200 pt-4 text-sm dark:border-neutral-700">
					<div className="flex justify-between gap-3">
						<dt className="text-neutral-500 dark:text-neutral-400">Tú aportas</dt>
						<dd className="tabular-nums">{pesos(proyeccion.totalAportado)}</dd>
					</div>
					<div className="flex justify-between gap-3">
						<dt className="text-neutral-500 dark:text-neutral-400">Rendimiento</dt>
						<dd className="text-campo-700 dark:text-campo-300 font-semibold tabular-nums">
							+{pesos(proyeccion.interesGanado)}
						</dd>
					</div>
					<div className="flex justify-between gap-3">
						<dt className="text-neutral-500 dark:text-neutral-400">Tasa anual</dt>
						<dd className="tabular-nums">{porcentaje(producto.tasa_anual)}</dd>
					</div>
				</dl>

				{producto.plazo_dias && meses * 30 < producto.plazo_dias && (
					<div className="aviso aviso--alerta mt-4 mb-0">
						<p>
							Este instrumento tiene un plazo forzoso de {producto.plazo_dias} días. Retirar antes
							{producto.permite_retiro_anticipado
								? ` tiene una penalización de ${porcentaje(producto.penalizacion_retiro_pct)}.`
								: ' no está permitido.'}
						</p>
					</div>
				)}

				<a href="/registro" className="btn btn--primario mt-5 w-full">
					Hazte socio y empieza
				</a>

				<p className="small mt-4 mb-0">
					Proyección informativa con capitalización mensual. No constituye una oferta
					vinculante.
				</p>
			</aside>
		</div>
	)
}
