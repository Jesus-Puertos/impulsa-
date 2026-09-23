// =============================================================================
// Simulador de crédito
// -----------------------------------------------------------------------------
// Calcula en el navegador para que mover el deslizador se sienta instantáneo.
// La simulación se guarda en la base solo cuando la persona pide contacto o
// decide continuar con su solicitud: así el registro sirve como evidencia de
// las condiciones mostradas, sin llenar la tabla con cada arrastre del control.
// =============================================================================

import { useMemo, useState, useId } from 'react'
import {
	simular,
	analizarCapacidadPago,
	ETIQUETAS_PERIODO,
	ETIQUETAS_PERIODICIDAD,
	type ResultadoSimulacion
} from '../../lib/credito'
import { pesos, porcentaje, fecha } from '../../lib/formato'
import type { ProductoCredito } from '../../lib/supabase/database.types'

interface Props {
	productos: ProductoCredito[]
	/** Preselecciona un producto al abrir (desde la página del producto). */
	claveInicial?: string
	/** True si hay sesión: cambia el destino del botón de continuar. */
	autenticado?: boolean
}

export default function SimuladorCredito({ productos, claveInicial, autenticado = false }: Props) {
	const idBase = useId()
	const inicial = productos.find((p) => p.clave === claveInicial) ?? productos[0]

	const [productoId, setProductoId] = useState(inicial?.id ?? '')
	const producto = productos.find((p) => p.id === productoId) ?? inicial

	const [monto, setMonto] = useState(() => montoPorOmision(inicial))
	const [plazo, setPlazo] = useState(() => plazoPorOmision(inicial))
	const [mostrarTabla, setMostrarTabla] = useState(false)

	// Análisis de capacidad de pago: opcional, se despliega bajo demanda.
	const [analizarPresupuesto, setAnalizarPresupuesto] = useState(false)
	const [ingreso, setIngreso] = useState(0)
	const [egresos, setEgresos] = useState(0)

	// Solicitud de contacto
	const [pidiendoContacto, setPidiendoContacto] = useState(false)
	const [contacto, setContacto] = useState({ nombre: '', telefono: '', correo: '' })
	const [enviando, setEnviando] = useState(false)
	const [enviado, setEnviado] = useState(false)
	const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

	const resultado: ResultadoSimulacion | null = useMemo(() => {
		if (!producto) return null
		return simular({
			monto,
			tasaAnual: producto.tasa_anual,
			periodos: plazo,
			periodicidad: producto.periodicidad,
			comisionAperturaPct: producto.comision_apertura_pct
		})
	}, [producto, monto, plazo])

	const capacidad = useMemo(() => {
		if (!producto || !resultado || !analizarPresupuesto || ingreso <= 0) return null
		return analizarCapacidadPago({
			ingresoMensual: ingreso,
			egresosMensuales: egresos,
			pagoPeriodico: resultado.pagoPeriodico,
			periodicidad: producto.periodicidad,
			factorMaximo: producto.factor_capacidad_pago,
			tasaAnual: producto.tasa_anual,
			periodos: plazo
		})
	}, [producto, resultado, analizarPresupuesto, ingreso, egresos, plazo])

	// Al cambiar de producto, encaja monto y plazo dentro de sus límites en
	// lugar de dejar valores imposibles en los controles.
	function cambiarProducto(id: string) {
		const nuevo = productos.find((p) => p.id === id)
		if (!nuevo) return
		setProductoId(id)
		setMonto((m) => acotar(m, nuevo.monto_minimo, nuevo.monto_maximo))
		setPlazo((p) => acotar(p, nuevo.plazo_minimo_periodos, nuevo.plazo_maximo_periodos))
	}

	async function guardarSimulacion(quiereContacto: boolean): Promise<string | null> {
		if (!producto || !resultado) return null

		const respuesta = await fetch('/api/simulaciones', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				producto_id: producto.id,
				monto,
				plazo_periodos: plazo,
				periodicidad: producto.periodicidad,
				quiere_contacto: quiereContacto,
				nombre_contacto: quiereContacto ? contacto.nombre : null,
				telefono_contacto: quiereContacto ? contacto.telefono : null,
				correo_contacto: quiereContacto ? contacto.correo : null
			})
		})

		if (!respuesta.ok) {
			const cuerpo = await respuesta.json().catch(() => ({}))
			throw new Error(cuerpo.error ?? 'No se pudo guardar la simulación.')
		}

		const { id } = await respuesta.json()
		return id as string
	}

	async function enviarContacto(e: React.FormEvent) {
		e.preventDefault()
		setEnviando(true)
		setErrorEnvio(null)

		try {
			await guardarSimulacion(true)
			setEnviado(true)
		} catch (error) {
			setErrorEnvio(error instanceof Error ? error.message : 'Ocurrió un error inesperado.')
		} finally {
			setEnviando(false)
		}
	}

	async function continuarSolicitud() {
		try {
			const id = await guardarSimulacion(false)
			// Sin sesión se pasa por el registro; la simulación viaja en la URL
			// para recuperarla al terminar el alta.
			const destino = autenticado
				? `/portal/solicitudes/nueva?simulacion=${id}`
				: `/registro?simulacion=${id}`
			window.location.href = destino
		} catch {
			window.location.href = autenticado ? '/portal/solicitudes/nueva' : '/registro'
		}
	}

	if (!producto || !resultado) {
		return (
			<div className="aviso aviso--alerta">
				<p>
					Todavía no hay productos de crédito publicados. Configúralos desde el panel
					administrativo.
				</p>
			</div>
		)
	}

	const unidad = ETIQUETAS_PERIODO[producto.periodicidad]

	return (
		<div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
			{/* ---------------------------------------------------- Controles */}
			<div className="panel">
				<h3 className="panel__titulo">Arma tu crédito</h3>
				<p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
					Mueve los controles y mira cómo cambia tu pago. Los cálculos usan las condiciones
					vigentes de cada producto.
				</p>

				<div className="campo">
					<label htmlFor={`${idBase}-producto`}>¿Qué necesitas financiar?</label>
					<select
						id={`${idBase}-producto`}
						value={productoId}
						onChange={(e) => cambiarProducto(e.target.value)}
					>
						{productos.map((p) => (
							<option key={p.id} value={p.id}>
								{p.nombre}
							</option>
						))}
					</select>
					{producto.descripcion && <span className="campo__ayuda">{producto.descripcion}</span>}
				</div>

				{/* Monto */}
				<div className="campo">
					<div className="flex items-baseline justify-between">
						<label htmlFor={`${idBase}-monto`}>¿Cuánto necesitas?</label>
						<output className="font-display text-2xl text-primary-700 dark:text-primary-300">
							{pesos(monto)}
						</output>
					</div>
					<input
						id={`${idBase}-monto`}
						type="range"
						className="deslizador"
						min={producto.monto_minimo}
						max={producto.monto_maximo}
						step={500}
						value={monto}
						onChange={(e) => setMonto(Number(e.target.value))}
					/>
					<div className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
						<span>{pesos(producto.monto_minimo)}</span>
						<span>{pesos(producto.monto_maximo)}</span>
					</div>
				</div>

				{/* Plazo */}
				<div className="campo">
					<div className="flex items-baseline justify-between">
						<label htmlFor={`${idBase}-plazo`}>¿En cuánto tiempo lo pagas?</label>
						<output className="font-display text-2xl text-primary-700 dark:text-primary-300">
							{plazo} {unidad}
						</output>
					</div>
					<input
						id={`${idBase}-plazo`}
						type="range"
						className="deslizador"
						min={producto.plazo_minimo_periodos}
						max={producto.plazo_maximo_periodos}
						step={1}
						value={plazo}
						onChange={(e) => setPlazo(Number(e.target.value))}
					/>
					<div className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
						<span>
							{producto.plazo_minimo_periodos} {unidad}
						</span>
						<span>
							{producto.plazo_maximo_periodos} {unidad}
						</span>
					</div>
				</div>

				{/* Capacidad de pago */}
				<div className="mt-6 border-t border-dashed border-neutral-200 pt-5 dark:border-neutral-800">
					<label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
						<input
							type="checkbox"
							className="mb-0! h-4 w-4 accent-[var(--color-primary-600)]"
							checked={analizarPresupuesto}
							onChange={(e) => setAnalizarPresupuesto(e.target.checked)}
						/>
						Quiero saber si este pago cabe en mi presupuesto
					</label>

					{analizarPresupuesto && (
						<div className="campo--fila mt-4">
							<div className="campo">
								<label htmlFor={`${idBase}-ingreso`}>Ingreso mensual</label>
								<input
									id={`${idBase}-ingreso`}
									type="number"
									min={0}
									step={100}
									placeholder="12000"
									value={ingreso || ''}
									onChange={(e) => setIngreso(Number(e.target.value))}
								/>
							</div>
							<div className="campo">
								<label htmlFor={`${idBase}-egresos`}>Gastos fijos al mes</label>
								<input
									id={`${idBase}-egresos`}
									type="number"
									min={0}
									step={100}
									placeholder="7000"
									value={egresos || ''}
									onChange={(e) => setEgresos(Number(e.target.value))}
								/>
							</div>
						</div>
					)}

					{capacidad && (
						<div
							className={`aviso ${capacidad.dentroDeLimite ? 'aviso--exito' : 'aviso--alerta'}`}
						>
							{capacidad.dentroDeLimite ? (
								<p>
									El pago representa el{' '}
									<strong>{porcentaje(capacidad.razon * 100)}</strong> de tu ingreso disponible
									({pesos(capacidad.ingresoDisponible)} al mes). Está dentro del límite
									recomendado de {porcentaje(producto.factor_capacidad_pago * 100)}.
								</p>
							) : (
								<p>
									El pago representa el{' '}
									<strong>{porcentaje(capacidad.razon * 100)}</strong> de tu ingreso
									disponible, por encima del{' '}
									{porcentaje(producto.factor_capacidad_pago * 100)} que recomendamos. Con tus
									datos, un monto de hasta{' '}
									<strong>{pesos(capacidad.montoMaximoRecomendado)}</strong> sería más
									manejable.
								</p>
							)}
						</div>
					)}
				</div>
			</div>

			{/* ------------------------------------------------------ Resumen */}
			<div className="flex flex-col gap-4">
				<div className="panel bg-primary-600! text-white dark:bg-primary-700!">
					<span className="text-xs tracking-wider text-primary-100 uppercase">
						Tu pago {ETIQUETAS_PERIODICIDAD[producto.periodicidad].toLowerCase()}
					</span>
					<p className="font-display mb-0 text-4xl leading-none text-white tabular-nums">
						{pesos(resultado.pagoPeriodico)}
					</p>
					<dl className="mt-5 space-y-2 border-t border-white/20 pt-4 text-sm">
						<Renglon etiqueta="Monto solicitado" valor={pesos(monto)} claro />
						<Renglon
							etiqueta="Tasa de interés anual"
							valor={porcentaje(producto.tasa_anual)}
							claro
						/>
						<Renglon etiqueta="Total de intereses" valor={pesos(resultado.totalIntereses)} claro />
						{resultado.comisionApertura > 0 && (
							<Renglon
								etiqueta="Comisión por apertura"
								valor={pesos(resultado.comisionApertura)}
								claro
							/>
						)}
						<Renglon etiqueta="Total a pagar" valor={pesos(resultado.totalAPagar)} claro fuerte />
						<Renglon etiqueta="CAT informativo" valor={porcentaje(resultado.cat)} claro />
					</dl>
					<p className="mt-4 mb-0 text-[0.7rem] leading-relaxed text-primary-100">
						CAT {porcentaje(resultado.cat)} sin IVA, informativo. Calculado el{' '}
						{fecha(new Date(), 'larga')} para un crédito de {pesos(monto)} a {plazo} {unidad}.
						Cifras sujetas a la aprobación de tu solicitud.
					</p>
				</div>

				<button type="button" className="btn btn--oro w-full" onClick={continuarSolicitud}>
					Solicitar este crédito
				</button>

				<button
					type="button"
					className="btn btn--contorno w-full"
					onClick={() => setMostrarTabla((v) => !v)}
					aria-expanded={mostrarTabla}
				>
					{mostrarTabla ? 'Ocultar' : 'Ver'} tabla de pagos
				</button>

				{/* Contacto */}
				{enviado ? (
					<div className="aviso aviso--exito">
						<p>
							Listo, {contacto.nombre.split(' ')[0]}. Un promotor te contactará al{' '}
							{contacto.telefono} en las próximas 24 horas hábiles.
						</p>
					</div>
				) : pidiendoContacto ? (
					<form onSubmit={enviarContacto} className="panel">
						<h4 className="panel__titulo text-base">Que te llamemos</h4>
						<div className="campo">
							<label htmlFor={`${idBase}-nombre`}>Nombre</label>
							<input
								id={`${idBase}-nombre`}
								required
								value={contacto.nombre}
								onChange={(e) => setContacto({ ...contacto, nombre: e.target.value })}
							/>
						</div>
						<div className="campo">
							<label htmlFor={`${idBase}-tel`}>Teléfono</label>
							<input
								id={`${idBase}-tel`}
								required
								inputMode="tel"
								placeholder="272 123 4567"
								value={contacto.telefono}
								onChange={(e) => setContacto({ ...contacto, telefono: e.target.value })}
							/>
						</div>
						<div className="campo">
							<label htmlFor={`${idBase}-mail`}>Correo (opcional)</label>
							<input
								id={`${idBase}-mail`}
								type="email"
								value={contacto.correo}
								onChange={(e) => setContacto({ ...contacto, correo: e.target.value })}
							/>
						</div>
						{errorEnvio && (
							<div className="aviso aviso--error">
								<p>{errorEnvio}</p>
							</div>
						)}
						<button type="submit" className="btn btn--primario w-full" disabled={enviando}>
							{enviando ? 'Enviando…' : 'Solicitar llamada'}
						</button>
					</form>
				) : (
					<button
						type="button"
						className="btn btn--fantasma w-full"
						onClick={() => setPidiendoContacto(true)}
					>
						Prefiero que me llamen
					</button>
				)}
			</div>

			{/* --------------------------------------------- Tabla de pagos */}
			{mostrarTabla && (
				<div className="panel lg:col-span-2">
					<h3 className="panel__titulo">Tabla de amortización</h3>
					<p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
						Cada pago cubre primero los intereses del periodo y el resto abona a capital. Por eso
						al principio amortizas menos y al final más. La última cuota ajusta los centavos de
						redondeo.
					</p>
					<div className="tabla-scroll">
						<table className="tabla-datos">
							<thead>
								<tr>
									<th>#</th>
									<th>Vence</th>
									<th className="num">Saldo inicial</th>
									<th className="num">Capital</th>
									<th className="num">Interés</th>
									<th className="num">Pago</th>
									<th className="num">Saldo final</th>
								</tr>
							</thead>
							<tbody>
								{resultado.tabla.map((c) => (
									<tr key={c.numero}>
										<td>{c.numero}</td>
										<td>{fecha(c.fechaVencimiento)}</td>
										<td className="num">{pesos(c.saldoInicial)}</td>
										<td className="num">{pesos(c.capital)}</td>
										<td className="num">{pesos(c.interes)}</td>
										<td className="num font-medium">{pesos(c.pago)}</td>
										<td className="num">{pesos(c.saldoFinal)}</td>
									</tr>
								))}
							</tbody>
							<tfoot>
								<tr className="border-t-2 border-neutral-300 font-medium dark:border-neutral-700">
									<td colSpan={3} className="px-3 py-2.5">
										Totales
									</td>
									<td className="num px-3 py-2.5">{pesos(monto)}</td>
									<td className="num px-3 py-2.5">{pesos(resultado.totalIntereses)}</td>
									<td className="num px-3 py-2.5">{pesos(resultado.totalAPagar)}</td>
									<td></td>
								</tr>
							</tfoot>
						</table>
					</div>
				</div>
			)}
		</div>
	)
}

function Renglon({
	etiqueta,
	valor,
	claro = false,
	fuerte = false
}: {
	etiqueta: string
	valor: string
	claro?: boolean
	fuerte?: boolean
}) {
	return (
		<div className="flex items-baseline justify-between gap-4">
			<dt className={claro ? 'text-primary-100' : 'text-neutral-500'}>{etiqueta}</dt>
			<dd className={`tabular-nums ${fuerte ? 'font-semibold' : ''}`}>{valor}</dd>
		</div>
	)
}

function acotar(valor: number, minimo: number, maximo: number) {
	return Math.min(Math.max(valor, minimo), maximo)
}

function montoPorOmision(p?: ProductoCredito) {
	if (!p) return 0
	// Un punto de partida a un tercio del rango resulta más representativo que
	// el mínimo, que suele ser un caso extremo.
	const sugerido = p.monto_minimo + (p.monto_maximo - p.monto_minimo) / 3
	return Math.round(sugerido / 500) * 500
}

function plazoPorOmision(p?: ProductoCredito) {
	if (!p) return 0
	return Math.round((p.plazo_minimo_periodos + p.plazo_maximo_periodos) / 2)
}
