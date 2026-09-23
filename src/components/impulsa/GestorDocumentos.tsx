// =============================================================================
// Gestor de documentos del expediente (portal del socio)
// -----------------------------------------------------------------------------
// Lista los documentos que pide la cooperativa y su estado de revisión. Permite
// subir y reemplazar los que aún no están validados.
// =============================================================================

import { useState } from 'react'
import { ETIQUETAS_TIPO_DOCUMENTO, ETIQUETAS_ESTADO_DOCUMENTO } from '../../lib/formato'
import type { EstadoDocumento, TipoDocumento } from '../../lib/supabase/database.types'

interface DocumentoVista {
	tipo: TipoDocumento
	estado: EstadoDocumento
	nombre_archivo: string | null
	motivo_rechazo: string | null
	revisado_en: string | null
}

interface Props {
	documentos: DocumentoVista[]
	/** false cuando el expediente ya fue dictaminado. */
	editable: boolean
}

const CATALOGO: { tipo: TipoDocumento; obligatorio: boolean; ayuda: string }[] = [
	{ tipo: 'ine_frente', obligatorio: true, ayuda: 'Frente de tu credencial para votar.' },
	{ tipo: 'ine_reverso', obligatorio: true, ayuda: 'Reverso, donde está el código de barras.' },
	{
		tipo: 'comprobante_domicilio',
		obligatorio: true,
		ayuda: 'Luz, agua o predial con antigüedad máxima de 3 meses.'
	},
	{
		tipo: 'comprobante_ingresos',
		obligatorio: false,
		ayuda: 'Recibos de nómina o constancia de ingresos.'
	},
	{ tipo: 'curp', obligatorio: false, ayuda: 'Impresión descargada de gob.mx.' },
	{ tipo: 'rfc', obligatorio: false, ayuda: 'Constancia de situación fiscal del SAT.' },
	{ tipo: 'acta_nacimiento', obligatorio: false, ayuda: 'Copia legible del acta.' }
]

export default function GestorDocumentos({ documentos, editable }: Props) {
	const [estado, setEstado] = useState<Record<string, DocumentoVista>>(
		Object.fromEntries(documentos.map((d) => [d.tipo, d]))
	)
	const [subiendo, setSubiendo] = useState<TipoDocumento | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [exito, setExito] = useState<string | null>(null)

	async function subir(tipo: TipoDocumento, archivo: File) {
		setSubiendo(tipo)
		setError(null)
		setExito(null)

		const cuerpo = new FormData()
		cuerpo.append('archivo', archivo)
		cuerpo.append('tipo', tipo)

		const respuesta = await fetch('/api/socios/documentos', { method: 'POST', body: cuerpo })
		const datos = await respuesta.json().catch(() => ({}))
		setSubiendo(null)

		if (!respuesta.ok) {
			setError(datos.error ?? 'No pudimos subir el archivo.')
			return
		}

		setEstado((previo) => ({
			...previo,
			[tipo]: {
				tipo,
				estado: 'pendiente',
				nombre_archivo: archivo.name,
				motivo_rechazo: null,
				revisado_en: null
			}
		}))
		setExito(`${ETIQUETAS_TIPO_DOCUMENTO[tipo]} se subió correctamente y quedó en revisión.`)
	}

	return (
		<div>
			{error && (
				<div className="aviso aviso--error" role="alert">
					<p>{error}</p>
				</div>
			)}
			{exito && (
				<div className="aviso aviso--exito" role="status">
					<p>{exito}</p>
				</div>
			)}

			<div className="space-y-3">
				{CATALOGO.map((item) => {
					const doc = estado[item.tipo]
					const bloqueado = !editable || doc?.estado === 'verificado'

					return (
						<div
							key={item.tipo}
							className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
						>
							<div className="min-w-52 flex-1">
								<p className="mb-0.5 font-medium text-neutral-900 dark:text-neutral-100">
									{ETIQUETAS_TIPO_DOCUMENTO[item.tipo]}
									{item.obligatorio && <span className="text-red-600"> *</span>}
								</p>
								<p className="mb-0 text-xs text-neutral-500 dark:text-neutral-400">
									{doc?.nombre_archivo ?? item.ayuda}
								</p>
								{doc?.estado === 'rechazado' && doc.motivo_rechazo && (
									<p className="mt-1.5 mb-0 text-xs font-medium text-red-600 dark:text-red-400">
										Motivo del rechazo: {doc.motivo_rechazo}
									</p>
								)}
								{doc?.estado === 'verificado' && doc.revisado_en && (
									<p className="text-campo-700 dark:text-campo-300 mt-1.5 mb-0 text-xs">
										Validado el {doc.revisado_en}
									</p>
								)}
							</div>

							<div className="flex items-center gap-3">
								<span className={`estado estado--${doc?.estado ?? 'inactivo'}`}>
									{doc ? ETIQUETAS_ESTADO_DOCUMENTO[doc.estado] : 'Sin cargar'}
								</span>

								{!bloqueado && (
									<label className="btn btn--contorno btn--sm cursor-pointer">
										{subiendo === item.tipo ? 'Subiendo…' : doc ? 'Reemplazar' : 'Subir'}
										<input
											type="file"
											className="sr-only mb-0!"
											accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
											disabled={subiendo !== null}
											onChange={(e) => {
												const archivo = e.target.files?.[0]
												if (archivo) subir(item.tipo, archivo)
												e.target.value = ''
											}}
										/>
									</label>
								)}
							</div>
						</div>
					)
				})}
			</div>

			{!editable && (
				<p className="small mt-4 mb-0">
					Tu expediente ya fue dictaminado. Para actualizar un documento, acude a tu sucursal con
					el original.
				</p>
			)}
		</div>
	)
}
