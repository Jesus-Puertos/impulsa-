// =============================================================================
// Visor y dictamen de documentos del expediente (panel administrativo)
// -----------------------------------------------------------------------------
// Los archivos están en un bucket privado, así que para verlos se pide al
// servidor un enlace firmado de vigencia corta y se abre en una pestaña nueva.
// =============================================================================

import { useState } from 'react'
import { ETIQUETAS_TIPO_DOCUMENTO, ETIQUETAS_ESTADO_DOCUMENTO } from '../../lib/formato'
import type { EstadoDocumento, TipoDocumento } from '../../lib/supabase/database.types'

interface DocumentoVista {
	id: string
	tipo: TipoDocumento
	estado: EstadoDocumento
	nombre_archivo: string | null
	motivo_rechazo: string | null
	creado_en: string
}

interface Props {
	socioId: string
	documentos: DocumentoVista[]
	puedeDictaminar: boolean
}

export default function VisorDocumentos({ documentos, puedeDictaminar }: Props) {
	const [estado, setEstado] = useState(documentos)
	const [ocupado, setOcupado] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [rechazando, setRechazando] = useState<string | null>(null)
	const [motivo, setMotivo] = useState('')

	async function abrir(documentoId: string) {
		setOcupado(documentoId)
		setError(null)

		const respuesta = await fetch('/api/admin/documentos', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ accion: 'url', documento_id: documentoId })
		})

		const datos = await respuesta.json().catch(() => ({}))
		setOcupado(null)

		if (!respuesta.ok) {
			setError(datos.error ?? 'No pudimos abrir el archivo.')
			return
		}

		window.open(datos.url, '_blank', 'noopener,noreferrer')
	}

	async function dictaminar(documentoId: string, accion: 'verificar' | 'rechazar') {
		if (accion === 'rechazar' && !motivo.trim()) {
			setError('Escribe el motivo del rechazo.')
			return
		}

		setOcupado(documentoId)
		setError(null)

		const respuesta = await fetch('/api/admin/documentos', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ accion, documento_id: documentoId, motivo })
		})

		const datos = await respuesta.json().catch(() => ({}))
		setOcupado(null)

		if (!respuesta.ok) {
			setError(datos.error ?? 'No pudimos actualizar el documento.')
			return
		}

		setEstado((previo) =>
			previo.map((d) =>
				d.id === documentoId
					? {
							...d,
							estado: datos.estado,
							motivo_rechazo: accion === 'rechazar' ? motivo : null
						}
					: d
			)
		)
		setRechazando(null)
		setMotivo('')
	}

	if (estado.length === 0) {
		return (
			<p className="mb-0 text-sm text-neutral-500 dark:text-neutral-400">
				El socio todavía no ha subido documentos.
			</p>
		)
	}

	return (
		<div>
			{error && (
				<div className="aviso aviso--error" role="alert">
					<p>{error}</p>
				</div>
			)}

			<div className="space-y-3">
				{estado.map((d) => (
					<div
						key={d.id}
						className="rounded-sm border border-neutral-200 p-4 dark:border-neutral-800"
					>
						<div className="flex flex-wrap items-center justify-between gap-4">
							<div className="min-w-52 flex-1">
								<p className="mb-0.5 font-medium text-neutral-900 dark:text-neutral-100">
									{ETIQUETAS_TIPO_DOCUMENTO[d.tipo]}
								</p>
								<p className="mb-0 text-xs text-neutral-500 dark:text-neutral-400">
									{d.nombre_archivo ?? 'Sin nombre'} · subido el {d.creado_en}
								</p>
								{d.motivo_rechazo && (
									<p className="mt-1 mb-0 text-xs text-red-600 dark:text-red-400">
										Rechazado: {d.motivo_rechazo}
									</p>
								)}
							</div>

							<div className="flex flex-wrap items-center gap-2">
								<span className={`estado estado--${d.estado}`}>
									{ETIQUETAS_ESTADO_DOCUMENTO[d.estado]}
								</span>

								<button
									type="button"
									className="btn btn--contorno btn--sm"
									onClick={() => abrir(d.id)}
									disabled={ocupado === d.id}
								>
									{ocupado === d.id ? 'Abriendo…' : 'Ver'}
								</button>

								{puedeDictaminar && d.estado !== 'verificado' && (
									<button
										type="button"
										className="btn btn--primario btn--sm"
										onClick={() => dictaminar(d.id, 'verificar')}
										disabled={ocupado === d.id}
									>
										Validar
									</button>
								)}

								{puedeDictaminar && d.estado !== 'rechazado' && (
									<button
										type="button"
										className="btn btn--peligro btn--sm"
										onClick={() => {
											setRechazando(rechazando === d.id ? null : d.id)
											setMotivo('')
											setError(null)
										}}
									>
										Rechazar
									</button>
								)}
							</div>
						</div>

						{rechazando === d.id && (
							<div className="mt-4 border-t border-dashed border-neutral-200 pt-4 dark:border-neutral-700">
								<div className="campo mb-3!">
									<label htmlFor={`motivo-${d.id}`}>
										¿Por qué se rechaza? El socio verá este texto.
									</label>
									<input
										id={`motivo-${d.id}`}
										value={motivo}
										onChange={(e) => setMotivo(e.target.value)}
										placeholder="Ej. la foto está borrosa y no se lee la CURP"
										autoFocus
									/>
								</div>
								<div className="flex gap-2">
									<button
										type="button"
										className="btn btn--peligro btn--sm"
										onClick={() => dictaminar(d.id, 'rechazar')}
										disabled={ocupado === d.id}
									>
										Confirmar rechazo
									</button>
									<button
										type="button"
										className="btn btn--fantasma btn--sm"
										onClick={() => setRechazando(null)}
									>
										Cancelar
									</button>
								</div>
							</div>
						)}
					</div>
				))}
			</div>

			<p className="small mt-4 mb-0">
				Los enlaces para ver documentos caducan a los 5 minutos y no deben compartirse.
			</p>
		</div>
	)
}
