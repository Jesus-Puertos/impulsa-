// =============================================================================
// Formulario de solicitud de crédito (portal del socio)
// -----------------------------------------------------------------------------
// Reutiliza el motor del simulador para que el socio vea el pago exacto que
// está pidiendo antes de enviar, y le advierte si el pago rebasa su capacidad
// declarada. La advertencia no bloquea: la decisión final es del analista, pero
// el socio merece saberlo antes de firmar nada.
// =============================================================================

import { useMemo, useState } from 'react'
import { simular, analizarCapacidadPago, ETIQUETAS_PERIODO } from '../../lib/credito'
import { pesos, porcentaje } from '../../lib/formato'
import type { ProductoCredito } from '../../lib/supabase/database.types'

interface Props {
	productos: ProductoCredito[]
	/** Datos económicos del expediente, para evaluar capacidad de pago. */
	economia: { ingreso: number; egresos: number; otros: number }
	/** Simulación de origen, si viene del simulador público. */
	simulacion?: {
		id: string
		producto_id: string | null
		monto: number
		plazo_periodos: number
	} | null
}

export default function FormularioSolicitud({ productos, economia, simulacion }: Props) {
	const inicial =
		productos.find((p) => p.id === simulacion?.producto_id) ?? productos[0]

	const [productoId, setProductoId] = useState(inicial?.id ?? '')
	const producto = productos.find((p) => p.id === productoId) ?? inicial

	const [monto, setMonto] = useState(simulacion?.monto ?? inicial?.monto_minimo ?? 0)
	const [plazo, setPlazo] = useState(
		simulacion?.plazo_periodos ?? inicial?.plazo_minimo_periodos ?? 0
	)
	const [destino, setDestino] = useState('')
	const [descripcion, setDescripcion] = useState('')
	const [acepta, setAcepta] = useState(false)

	const [enviando, setEnviando] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const resultado = useMemo(() => {
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
		if (!producto || !resultado) return null
		return analizarCapacidadPago({
			ingresoMensual: economia.ingreso,
			egresosMensuales: economia.egresos,
			otrosIngresos: economia.otros,
			pagoPeriodico: resultado.pagoPeriodico,
			periodicidad: producto.periodicidad,
			factorMaximo: producto.factor_capacidad_pago,
			tasaAnual: producto.tasa_anual,
			periodos: plazo
		})
	}, [producto, resultado, economia, plazo])

	function cambiarProducto(id: string) {
		const nuevo = productos.find((p) => p.id === id)
		if (!nuevo) return
		setProductoId(id)
		setMonto((m) => Math.min(Math.max(m, nuevo.monto_minimo), nuevo.monto_maximo))
		setPlazo((p) =>
			Math.min(Math.max(p, nuevo.plazo_minimo_periodos), nuevo.plazo_maximo_periodos)
		)
		setDestino('')
	}

	async function enviar(e: React.FormEvent) {
		e.preventDefault()
		setError(null)

		if (!destino) {
			setError('Indica para qué usarás el crédito.')
			return
		}
		if (!acepta) {
			setError('Debes confirmar que la información es verdadera.')
			return
		}

		setEnviando(true)

		const respuesta = await fetch('/api/solicitudes', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				producto_id: productoId,
				monto,
				plazo_periodos: plazo,
				destino,
				descripcion_destino: descripcion,
				simulacion_id: simulacion?.id
			})
		})

		const datos = await respuesta.json().catch(() => ({}))
		setEnviando(false)

		if (!respuesta.ok) {
			setError(datos.error ?? 'No pudimos enviar tu solicitud.')
			window.scrollTo({ top: 0, behavior: 'smooth' })
			return
		}

		window.location.href = '/portal/solicitudes?enviada=1'
	}

	if (!producto || !resultado) {
		return (
			<div className="aviso aviso--alerta">
				<p>No hay productos de crédito disponibles en este momento.</p>
			</div>
		)
	}

	const unidad = ETIQUETAS_PERIODO[producto.periodicidad]

	return (
		<form onSubmit={enviar} className="grid gap-6 lg:grid-cols-[1fr_20rem]">
			<div className="panel">
				{error && (
					<div className="aviso aviso--error" role="alert">
						<p>{error}</p>
					</div>
				)}

				<div className="campo">
					<label htmlFor="producto">Producto de crédito</label>
					<select id="producto" value={productoId} onChange={(e) => cambiarProducto(e.target.value)}>
						{productos.map((p) => (
							<option key={p.id} value={p.id}>
								{p.nombre} — {porcentaje(p.tasa_anual)} anual
							</option>
						))}
					</select>
					{producto.descripcion && <span className="campo__ayuda">{producto.descripcion}</span>}
				</div>

				<div className="campo">
					<div className="flex items-baseline justify-between">
						<label htmlFor="monto">Monto que solicitas</label>
						<output className="font-display text-xl text-primary-700 dark:text-primary-300">
							{pesos(monto)}
						</output>
					</div>
					<input
						id="monto"
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

				<div className="campo">
					<div className="flex items-baseline justify-between">
						<label htmlFor="plazo">Plazo</label>
						<output className="font-display text-xl text-primary-700 dark:text-primary-300">
							{plazo} {unidad}
						</output>
					</div>
					<input
						id="plazo"
						type="range"
						className="deslizador"
						min={producto.plazo_minimo_periodos}
						max={producto.plazo_maximo_periodos}
						value={plazo}
						onChange={(e) => setPlazo(Number(e.target.value))}
					/>
				</div>

				<div className="campo">
					<label htmlFor="destino">¿Para qué lo vas a usar?</label>
					<select id="destino" value={destino} onChange={(e) => setDestino(e.target.value)} required>
						<option value="">Selecciona una opción</option>
						{producto.destinos.map((d) => (
							<option key={d} value={d}>
								{d}
							</option>
						))}
						<option value="Otro">Otro</option>
					</select>
					<span className="campo__ayuda">
						Nos ayuda a ofrecerte las condiciones correctas y es un requisito del dictamen.
					</span>
				</div>

				<div className="campo">
					<label htmlFor="descripcion">Cuéntanos un poco más (opcional)</label>
					<textarea
						id="descripcion"
						value={descripcion}
						onChange={(e) => setDescripcion(e.target.value)}
						placeholder="Ej. Voy a comprar una despulpadora para procesar mi cosecha de café."
					/>
				</div>

				{producto.requiere_aval && (
					<div className="aviso aviso--alerta">
						<p>
							Este producto requiere un <strong>aval que sea socio</strong> de la cooperativa. Al
							revisar tu solicitud te pediremos sus datos y su firma.
						</p>
					</div>
				)}
				{producto.requiere_garantia && (
					<div className="aviso aviso--alerta">
						<p>
							Este producto requiere <strong>garantía</strong>. Te contactaremos para acordar el
							bien que la respalda y su avalúo.
						</p>
					</div>
				)}

				<label className="mt-4 flex cursor-pointer items-start gap-3 text-sm">
					<input
						type="checkbox"
						className="mb-0! mt-1 size-4 shrink-0 accent-[var(--color-primary-600)]"
						checked={acepta}
						onChange={(e) => setAcepta(e.target.checked)}
					/>
					<span>
						Declaro que la información de mi expediente es verdadera y autorizo a la cooperativa a
						verificarla, incluida la consulta de mi historial crediticio.
					</span>
				</label>
			</div>

			{/* Resumen */}
			<aside className="flex flex-col gap-4">
				<div className="panel bg-primary-600! text-white dark:bg-primary-700!">
					<span className="text-xs tracking-wider text-primary-100 uppercase">Pagarías</span>
					<p className="font-display mb-4 text-3xl leading-none text-white tabular-nums">
						{pesos(resultado.pagoPeriodico)}
					</p>
					<dl className="space-y-2 border-t border-white/20 pt-4 text-sm">
						<div className="flex justify-between gap-3">
							<dt className="text-primary-100">Intereses</dt>
							<dd className="tabular-nums">{pesos(resultado.totalIntereses)}</dd>
						</div>
						{resultado.comisionApertura > 0 && (
							<div className="flex justify-between gap-3">
								<dt className="text-primary-100">Comisión apertura</dt>
								<dd className="tabular-nums">{pesos(resultado.comisionApertura)}</dd>
							</div>
						)}
						<div className="flex justify-between gap-3">
							<dt className="text-primary-100">Total a pagar</dt>
							<dd className="font-semibold tabular-nums">{pesos(resultado.totalAPagar)}</dd>
						</div>
						<div className="flex justify-between gap-3">
							<dt className="text-primary-100">CAT</dt>
							<dd className="tabular-nums">{porcentaje(resultado.cat)}</dd>
						</div>
					</dl>
				</div>

				{capacidad && economia.ingreso > 0 && (
					<div className={`aviso ${capacidad.dentroDeLimite ? 'aviso--exito' : 'aviso--alerta'}`}>
						<p>
							Según los ingresos de tu expediente, este pago representa el{' '}
							<strong>{porcentaje(capacidad.razon * 100)}</strong> de tu ingreso disponible.
							{!capacidad.dentroDeLimite && (
								<>
									{' '}
									Está por encima del {porcentaje(producto.factor_capacidad_pago * 100)} que
									recomendamos; podemos autorizar un monto menor.
								</>
							)}
						</p>
					</div>
				)}

				{economia.ingreso === 0 && (
					<div className="aviso aviso--alerta">
						<p>
							No tenemos tus ingresos registrados.{' '}
							<a href="/portal/perfil">Actualiza tu perfil</a> para que podamos evaluar mejor tu
							solicitud.
						</p>
					</div>
				)}

				<button type="submit" className="btn btn--primario w-full" disabled={enviando}>
					{enviando ? 'Enviando…' : 'Enviar solicitud'}
				</button>

				<p className="small mb-0">
					Al enviar, tu solicitud pasa a dictamen. Recibirás respuesta en un plazo de 3 a 5 días
					hábiles.
				</p>
			</aside>
		</form>
	)
}
