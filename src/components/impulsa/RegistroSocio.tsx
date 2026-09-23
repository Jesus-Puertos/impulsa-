// =============================================================================
// Registro de socio (alta de expediente)
// -----------------------------------------------------------------------------
// Formulario por pasos. Cada paso se guarda en cuanto se completa, así que si
// la persona cierra el navegador a la mitad no pierde lo capturado: al volver
// entra con su cuenta y continúa donde se quedó.
//
// El primer paso crea la cuenta de acceso. Los siguientes actualizan el
// expediente ya existente, por eso el componente puede arrancar en cualquier
// paso cuando recibe un expediente en curso.
// =============================================================================

import { useState } from 'react'
import {
	validarCurp,
	validarCorreo,
	validarTelefono,
	validarCodigoPostal,
	validarRfc,
	calcularEdad,
	fechaNacimientoDesdeCurp
} from '../../lib/validaciones'
import { ETIQUETAS_TIPO_DOCUMENTO } from '../../lib/formato'
import type { Socio, Sucursal, TipoDocumento } from '../../lib/supabase/database.types'

interface Props {
	sucursales: Sucursal[]
	/** Expediente en curso cuando la persona vuelve a continuar su registro. */
	expediente?: Partial<Socio> | null
	/** Tipos de documento ya cargados, para no volver a pedirlos. */
	documentosCargados?: TipoDocumento[]
	/** Simulación de origen, si llegó desde el simulador. */
	simulacionId?: string
}

const PASOS = [
	{ id: 'cuenta', titulo: 'Tu cuenta', descripcion: 'Datos de acceso e identidad' },
	{ id: 'domicilio', titulo: 'Domicilio', descripcion: 'Dónde vives' },
	{ id: 'economia', titulo: 'Tu economía', descripcion: 'Ingresos y ocupación' },
	{ id: 'documentos', titulo: 'Documentos', descripcion: 'INE y comprobantes' },
	{ id: 'referencias', titulo: 'Referencias', descripcion: 'Personas que te conocen' },
	{ id: 'envio', titulo: 'Enviar', descripcion: 'Revisa y confirma' }
] as const

const DOCUMENTOS_PEDIDOS: { tipo: TipoDocumento; obligatorio: boolean; ayuda: string }[] = [
	{
		tipo: 'ine_frente',
		obligatorio: true,
		ayuda: 'Foto del frente de tu credencial, completa y sin reflejos.'
	},
	{ tipo: 'ine_reverso', obligatorio: true, ayuda: 'Foto del reverso, donde está el código.' },
	{
		tipo: 'comprobante_domicilio',
		obligatorio: true,
		ayuda: 'Luz, agua o predial, con antigüedad máxima de 3 meses.'
	},
	{
		tipo: 'comprobante_ingresos',
		obligatorio: false,
		ayuda: 'Recibos de nómina, estados de cuenta o constancia de ingresos.'
	},
	{ tipo: 'curp', obligatorio: false, ayuda: 'Impresión de tu CURP descargada de gob.mx.' }
]

const ENTIDADES = [
	'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas',
	'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México',
	'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit',
	'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí',
	'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas'
]

interface Referencia {
	nombre: string
	parentesco: string
	telefono: string
	direccion: string
}

interface BeneficiarioForm {
	nombre: string
	parentesco: string
	fecha_nacimiento: string
	porcentaje: string
}

export default function RegistroSocio({
	sucursales,
	expediente = null,
	documentosCargados = [],
	simulacionId
}: Props) {
	// Con expediente en curso se salta el paso de creación de cuenta.
	const [paso, setPaso] = useState(expediente ? 1 : 0)
	const [guardando, setGuardando] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [campoConError, setCampoConError] = useState<string | null>(null)

	// --- Paso 0: cuenta -------------------------------------------------------
	const [cuenta, setCuenta] = useState({
		nombre: expediente?.nombre ?? '',
		apellido_paterno: expediente?.apellido_paterno ?? '',
		apellido_materno: expediente?.apellido_materno ?? '',
		curp: expediente?.curp ?? '',
		correo: expediente?.correo ?? '',
		telefono: expediente?.telefono ?? '',
		contrasena: '',
		contrasena2: ''
	})

	// --- Paso 1: domicilio ----------------------------------------------------
	const [domicilio, setDomicilio] = useState({
		calle: expediente?.calle ?? '',
		numero_exterior: expediente?.numero_exterior ?? '',
		numero_interior: expediente?.numero_interior ?? '',
		colonia: expediente?.colonia ?? '',
		municipio: expediente?.municipio ?? '',
		entidad: expediente?.entidad ?? 'Veracruz',
		codigo_postal: expediente?.codigo_postal ?? '',
		referencia_domicilio: expediente?.referencia_domicilio ?? '',
		tipo_vivienda: expediente?.tipo_vivienda ?? 'propia',
		antiguedad_domicilio_meses: String(expediente?.antiguedad_domicilio_meses ?? ''),
		sucursal_id: expediente?.sucursal_id ?? (sucursales[0]?.id ?? '')
	})

	// --- Paso 2: economía -----------------------------------------------------
	const [economia, setEconomia] = useState({
		ocupacion: expediente?.ocupacion ?? '',
		escolaridad: expediente?.escolaridad ?? '',
		estado_civil: expediente?.estado_civil ?? '',
		nombre_empresa: expediente?.nombre_empresa ?? '',
		antiguedad_laboral_meses: String(expediente?.antiguedad_laboral_meses ?? ''),
		ingreso_mensual: String(expediente?.ingreso_mensual ?? ''),
		egresos_mensuales: String(expediente?.egresos_mensuales ?? ''),
		otros_ingresos: String(expediente?.otros_ingresos ?? ''),
		dependientes_economicos: String(expediente?.dependientes_economicos ?? '0'),
		rfc: expediente?.rfc ?? '',
		banco: expediente?.banco ?? '',
		clabe: expediente?.clabe ?? ''
	})

	// --- Paso 3: documentos ---------------------------------------------------
	const [subidos, setSubidos] = useState<Set<TipoDocumento>>(new Set(documentosCargados))
	const [subiendo, setSubiendo] = useState<TipoDocumento | null>(null)

	// --- Paso 4: referencias --------------------------------------------------
	const [referencias, setReferencias] = useState<Referencia[]>([
		{ nombre: '', parentesco: '', telefono: '', direccion: '' },
		{ nombre: '', parentesco: '', telefono: '', direccion: '' }
	])
	const [beneficiarios, setBeneficiarios] = useState<BeneficiarioForm[]>([
		{ nombre: '', parentesco: '', fecha_nacimiento: '', porcentaje: '100' }
	])

	// --- Paso 5: envío --------------------------------------------------------
	const [aceptaPrivacidad, setAceptaPrivacidad] = useState(expediente?.acepta_aviso_privacidad ?? false)
	const [aceptaBuro, setAceptaBuro] = useState(expediente?.acepta_consulta_buro ?? false)
	const [enviado, setEnviado] = useState(false)

	function fallar(mensaje: string, campo?: string) {
		setError(mensaje)
		setCampoConError(campo ?? null)
		setGuardando(false)
		window.scrollTo({ top: 0, behavior: 'smooth' })
		return false
	}

	function limpiar() {
		setError(null)
		setCampoConError(null)
	}

	// =========================================================================
	// Guardado por paso
	// =========================================================================

	async function guardarCuenta() {
		const correo = validarCorreo(cuenta.correo)
		if (!correo.valido) return fallar(correo.mensaje!, 'correo')

		const curp = validarCurp(cuenta.curp)
		if (!curp.valido) return fallar(curp.mensaje!, 'curp')

		const tel = validarTelefono(cuenta.telefono)
		if (!tel.valido) return fallar(tel.mensaje!, 'telefono')

		if (!cuenta.nombre.trim() || !cuenta.apellido_paterno.trim()) {
			return fallar('Escribe tu nombre y tu apellido paterno.', 'nombre')
		}
		if (cuenta.contrasena.length < 8) {
			return fallar('Tu contraseña debe tener al menos 8 caracteres.', 'contrasena')
		}
		if (cuenta.contrasena !== cuenta.contrasena2) {
			return fallar('Las contraseñas no coinciden.', 'contrasena2')
		}

		const respuesta = await fetch('/api/auth/registro', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				correo: cuenta.correo,
				contrasena: cuenta.contrasena,
				nombre: cuenta.nombre,
				apellido_paterno: cuenta.apellido_paterno,
				apellido_materno: cuenta.apellido_materno,
				curp: cuenta.curp,
				telefono: cuenta.telefono
			})
		})

		const datos = await respuesta.json().catch(() => ({}))

		if (!respuesta.ok) return fallar(datos.error ?? 'No pudimos crear tu cuenta.', datos.campo)

		// Los pasos siguientes escriben en el expediente con la sesión del socio,
		// así que solo se continúa cuando la cuenta quedó con sesión abierta Y el
		// expediente existe. Cualquier otro desenlace —confirmación de correo
		// pendiente (sin sesión) o el 207 de «cuenta creada sin expediente»— lleva
		// a /acceso; seguir aquí terminaría en un 401 en el paso de domicilio.
		//
		// Ojo con la comparación: 207 también satisface `respuesta.ok`, y en ese
		// caso `sesion_iniciada` ni siquiera viene en la respuesta.
		if (datos.ok !== true || datos.sesion_iniciada !== true) {
			window.location.href = '/acceso?registro=ok'
			return false
		}

		return true
	}

	async function parchear(cambios: Record<string, unknown>) {
		const respuesta = await fetch('/api/socios/expediente', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(cambios)
		})

		if (!respuesta.ok) {
			const datos = await respuesta.json().catch(() => ({}))
			return fallar(datos.error ?? 'No pudimos guardar tus datos.', datos.campo)
		}
		return true
	}

	async function guardarDomicilio() {
		const cp = validarCodigoPostal(domicilio.codigo_postal)
		if (!cp.valido) return fallar(cp.mensaje!, 'codigo_postal')

		for (const [campo, etiqueta] of [
			['calle', 'la calle'],
			['colonia', 'la colonia'],
			['municipio', 'el municipio']
		] as const) {
			if (!domicilio[campo].trim()) return fallar(`Escribe ${etiqueta}.`, campo)
		}

		return parchear({
			...domicilio,
			antiguedad_domicilio_meses: domicilio.antiguedad_domicilio_meses || null
		})
	}

	async function guardarEconomia() {
		if (!economia.ocupacion.trim()) return fallar('Escribe tu ocupación.', 'ocupacion')

		const ingreso = Number(economia.ingreso_mensual)
		if (!Number.isFinite(ingreso) || ingreso <= 0) {
			return fallar('Escribe tu ingreso mensual aproximado.', 'ingreso_mensual')
		}

		if (economia.rfc) {
			const rfc = validarRfc(economia.rfc)
			if (!rfc.valido) return fallar(rfc.mensaje!, 'rfc')
		}

		return parchear({
			...economia,
			escolaridad: economia.escolaridad || null,
			estado_civil: economia.estado_civil || null,
			antiguedad_laboral_meses: economia.antiguedad_laboral_meses || null,
			egresos_mensuales: economia.egresos_mensuales || 0,
			otros_ingresos: economia.otros_ingresos || 0,
			dependientes_economicos: economia.dependientes_economicos || 0
		})
	}

	async function subirDocumento(tipo: TipoDocumento, archivo: File) {
		setSubiendo(tipo)
		limpiar()

		const cuerpo = new FormData()
		cuerpo.append('archivo', archivo)
		cuerpo.append('tipo', tipo)

		const respuesta = await fetch('/api/socios/documentos', { method: 'POST', body: cuerpo })
		setSubiendo(null)

		if (!respuesta.ok) {
			const datos = await respuesta.json().catch(() => ({}))
			return fallar(datos.error ?? 'No pudimos subir el archivo.')
		}

		setSubidos((previos) => new Set(previos).add(tipo))
		return true
	}

	function validarDocumentos() {
		const faltantes = DOCUMENTOS_PEDIDOS.filter((d) => d.obligatorio && !subidos.has(d.tipo))
		if (faltantes.length > 0) {
			return fallar(
				`Faltan documentos obligatorios: ${faltantes.map((d) => ETIQUETAS_TIPO_DOCUMENTO[d.tipo]).join(', ')}.`
			)
		}
		return true
	}

	async function guardarReferencias() {
		const llenas = referencias.filter((r) => r.nombre.trim() && r.telefono.trim())
		if (llenas.length < 2) {
			return fallar('Necesitamos al menos dos referencias personales completas.', 'referencias')
		}

		const conPorcentaje = beneficiarios.filter((b) => b.nombre.trim())
		if (conPorcentaje.length > 0) {
			const suma = conPorcentaje.reduce((acc, b) => acc + Number(b.porcentaje || 0), 0)
			if (Math.abs(suma - 100) > 0.01) {
				return fallar(
					`Los porcentajes de tus beneficiarios deben sumar 100%. Ahora suman ${suma}%.`,
					'beneficiarios'
				)
			}
		}

		const respuesta = await fetch('/api/socios/referencias', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ referencias: llenas, beneficiarios: conPorcentaje })
		})

		if (!respuesta.ok) {
			const datos = await respuesta.json().catch(() => ({}))
			return fallar(datos.error ?? 'No pudimos guardar tus referencias.', datos.campo)
		}
		return true
	}

	async function enviarExpediente() {
		if (!aceptaPrivacidad) {
			return fallar('Debes aceptar el aviso de privacidad para continuar.', 'privacidad')
		}

		const guardado = await parchear({
			acepta_aviso_privacidad: aceptaPrivacidad,
			acepta_consulta_buro: aceptaBuro
		})
		if (!guardado) return false

		const respuesta = await fetch('/api/socios/enviar', { method: 'POST' })
		const datos = await respuesta.json().catch(() => ({}))

		if (!respuesta.ok && !datos.ya_enviado) {
			return fallar(datos.error ?? 'No pudimos enviar tu expediente.')
		}

		setEnviado(true)
		return true
	}

	async function avanzar() {
		limpiar()
		setGuardando(true)

		const acciones = [
			guardarCuenta,
			guardarDomicilio,
			guardarEconomia,
			async () => validarDocumentos(),
			guardarReferencias,
			enviarExpediente
		]

		const ok = await acciones[paso]()
		setGuardando(false)

		if (ok && paso < PASOS.length - 1) {
			setPaso(paso + 1)
			window.scrollTo({ top: 0, behavior: 'smooth' })
		}
	}

	// =========================================================================
	// Pantalla final
	// =========================================================================
	if (enviado) {
		return (
			<div className="panel mx-auto max-w-2xl text-center">
				<div className="bg-campo-100 mx-auto mb-5 flex size-16 items-center justify-center rounded-full">
					<svg
						viewBox="0 0 24 24"
						className="text-campo-700 size-8"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
					>
						<path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
					</svg>
				</div>
				<h2 className="h3">Tu expediente está en revisión</h2>
				<p>
					Recibimos tus datos y documentos. Un analista los revisará y te avisaremos por correo
					en un plazo de <strong>3 a 5 días hábiles</strong>.
				</p>
				<p className="text-sm text-neutral-500 dark:text-neutral-400">
					Mientras tanto puedes entrar a tu portal para consultar el avance de tu trámite o
					corregir algún dato si te lo pedimos.
				</p>
				<div className="mt-6 flex flex-wrap justify-center gap-3">
					<a href="/portal" className="btn btn--primario">
						Ir a mi portal
					</a>
					{simulacionId && (
						<a href={`/portal/solicitudes/nueva?simulacion=${simulacionId}`} className="btn btn--contorno">
							Continuar con mi solicitud
						</a>
					)}
				</div>
			</div>
		)
	}

	const pasoActual = PASOS[paso]

	return (
		<div className="mx-auto max-w-3xl">
			{/* -------------------------------------------------- Indicador */}
			<ol className="mb-8 flex flex-wrap gap-2" aria-label="Avance del registro">
				{PASOS.map((p, i) => (
					<li key={p.id} className="flex flex-1 flex-col gap-1.5" aria-current={i === paso ? 'step' : undefined}>
						<span
							className={`h-1 rounded-full transition-colors ${
								i < paso
									? 'bg-campo-500'
									: i === paso
										? 'bg-primary-600'
										: 'bg-neutral-200 dark:bg-neutral-700'
							}`}
						/>
						<span
							className={`hidden text-[0.7rem] sm:block ${
								i === paso
									? 'text-primary-700 dark:text-primary-300 font-medium'
									: 'text-neutral-500 dark:text-neutral-400'
							}`}
						>
							{p.titulo}
						</span>
					</li>
				))}
			</ol>

			<div className="panel">
				<span className="h5">
					Paso {paso + 1} de {PASOS.length}
				</span>
				<h2 className="h3 mb-1">{pasoActual.titulo}</h2>
				<p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
					{pasoActual.descripcion}
				</p>

				{error && (
					<div className="aviso aviso--error" role="alert">
						<p>{error}</p>
					</div>
				)}

				{/* ================================================ Paso 0 */}
				{paso === 0 && (
					<>
						<div className="campo--fila">
							<Campo
								id="nombre"
								etiqueta="Nombre(s)"
								valor={cuenta.nombre}
								alCambiar={(v) => setCuenta({ ...cuenta, nombre: v })}
								error={campoConError === 'nombre'}
								requerido
							/>
							<Campo
								id="apellido_paterno"
								etiqueta="Apellido paterno"
								valor={cuenta.apellido_paterno}
								alCambiar={(v) => setCuenta({ ...cuenta, apellido_paterno: v })}
								requerido
							/>
						</div>
						<Campo
							id="apellido_materno"
							etiqueta="Apellido materno"
							valor={cuenta.apellido_materno}
							alCambiar={(v) => setCuenta({ ...cuenta, apellido_materno: v })}
						/>

						<Campo
							id="curp"
							etiqueta="CURP"
							valor={cuenta.curp}
							alCambiar={(v) => setCuenta({ ...cuenta, curp: v.toUpperCase() })}
							error={campoConError === 'curp'}
							ayuda={ayudaCurp(cuenta.curp)}
							maxLength={18}
							requerido
						/>

						<div className="campo--fila">
							<Campo
								id="correo"
								etiqueta="Correo electrónico"
								tipo="email"
								valor={cuenta.correo}
								alCambiar={(v) => setCuenta({ ...cuenta, correo: v })}
								error={campoConError === 'correo'}
								ayuda="Aquí te avisaremos del resultado de tu trámite."
								requerido
							/>
							<Campo
								id="telefono"
								etiqueta="Teléfono celular"
								tipo="tel"
								valor={cuenta.telefono}
								alCambiar={(v) => setCuenta({ ...cuenta, telefono: v })}
								error={campoConError === 'telefono'}
								ayuda="10 dígitos."
								requerido
							/>
						</div>

						<div className="campo--fila">
							<Campo
								id="contrasena"
								etiqueta="Contraseña"
								tipo="password"
								valor={cuenta.contrasena}
								alCambiar={(v) => setCuenta({ ...cuenta, contrasena: v })}
								error={campoConError === 'contrasena'}
								ayuda="Mínimo 8 caracteres."
								requerido
							/>
							<Campo
								id="contrasena2"
								etiqueta="Repite tu contraseña"
								tipo="password"
								valor={cuenta.contrasena2}
								alCambiar={(v) => setCuenta({ ...cuenta, contrasena2: v })}
								error={campoConError === 'contrasena2'}
								requerido
							/>
						</div>
					</>
				)}

				{/* ================================================ Paso 1 */}
				{paso === 1 && (
					<>
						<div className="campo--fila">
							<Campo
								id="calle"
								etiqueta="Calle"
								valor={domicilio.calle}
								alCambiar={(v) => setDomicilio({ ...domicilio, calle: v })}
								error={campoConError === 'calle'}
								requerido
							/>
							<div className="grid grid-cols-2 gap-4">
								<Campo
									id="numero_exterior"
									etiqueta="Núm. exterior"
									valor={domicilio.numero_exterior}
									alCambiar={(v) => setDomicilio({ ...domicilio, numero_exterior: v })}
								/>
								<Campo
									id="numero_interior"
									etiqueta="Núm. interior"
									valor={domicilio.numero_interior}
									alCambiar={(v) => setDomicilio({ ...domicilio, numero_interior: v })}
								/>
							</div>
						</div>

						<div className="campo--fila">
							<Campo
								id="colonia"
								etiqueta="Colonia o localidad"
								valor={domicilio.colonia}
								alCambiar={(v) => setDomicilio({ ...domicilio, colonia: v })}
								error={campoConError === 'colonia'}
								requerido
							/>
							<Campo
								id="codigo_postal"
								etiqueta="Código postal"
								valor={domicilio.codigo_postal}
								alCambiar={(v) => setDomicilio({ ...domicilio, codigo_postal: v })}
								error={campoConError === 'codigo_postal'}
								maxLength={5}
								requerido
							/>
						</div>

						<div className="campo--fila">
							<Campo
								id="municipio"
								etiqueta="Municipio"
								valor={domicilio.municipio}
								alCambiar={(v) => setDomicilio({ ...domicilio, municipio: v })}
								error={campoConError === 'municipio'}
								requerido
							/>
							<div className="campo">
								<label htmlFor="entidad">Estado</label>
								<select
									id="entidad"
									value={domicilio.entidad}
									onChange={(e) => setDomicilio({ ...domicilio, entidad: e.target.value })}
								>
									{ENTIDADES.map((e) => (
										<option key={e} value={e}>
											{e}
										</option>
									))}
								</select>
							</div>
						</div>

						<div className="campo">
							<label htmlFor="referencia_domicilio">Referencias para llegar</label>
							<textarea
								id="referencia_domicilio"
								value={domicilio.referencia_domicilio}
								onChange={(e) =>
									setDomicilio({ ...domicilio, referencia_domicilio: e.target.value })
								}
								placeholder="Entre qué calles, color de la casa, algún punto conocido cerca…"
							/>
							<span className="campo__ayuda">
								Nos ayuda a ubicarte para la visita de verificación.
							</span>
						</div>

						<div className="campo--fila">
							<div className="campo">
								<label htmlFor="tipo_vivienda">Tu vivienda es</label>
								<select
									id="tipo_vivienda"
									value={domicilio.tipo_vivienda}
									onChange={(e) => setDomicilio({ ...domicilio, tipo_vivienda: e.target.value })}
								>
									<option value="propia">Propia</option>
									<option value="rentada">Rentada</option>
									<option value="familiar">De un familiar</option>
									<option value="hipotecada">Hipotecada</option>
								</select>
							</div>
							<Campo
								id="antiguedad_domicilio_meses"
								etiqueta="Meses viviendo ahí"
								tipo="number"
								valor={domicilio.antiguedad_domicilio_meses}
								alCambiar={(v) =>
									setDomicilio({ ...domicilio, antiguedad_domicilio_meses: v })
								}
							/>
						</div>

						{sucursales.length > 0 && (
							<div className="campo">
								<label htmlFor="sucursal_id">Sucursal donde quieres ser atendido</label>
								<select
									id="sucursal_id"
									value={domicilio.sucursal_id}
									onChange={(e) => setDomicilio({ ...domicilio, sucursal_id: e.target.value })}
								>
									{sucursales.map((s) => (
										<option key={s.id} value={s.id}>
											{s.nombre} — {s.municipio}
										</option>
									))}
								</select>
							</div>
						)}
					</>
				)}

				{/* ================================================ Paso 2 */}
				{paso === 2 && (
					<>
						<div className="campo--fila">
							<Campo
								id="ocupacion"
								etiqueta="¿A qué te dedicas?"
								valor={economia.ocupacion}
								alCambiar={(v) => setEconomia({ ...economia, ocupacion: v })}
								error={campoConError === 'ocupacion'}
								ayuda="Ej. comerciante, productor de café, empleada, maestra."
								requerido
							/>
							<Campo
								id="nombre_empresa"
								etiqueta="Empresa o negocio"
								valor={economia.nombre_empresa}
								alCambiar={(v) => setEconomia({ ...economia, nombre_empresa: v })}
								ayuda="Si trabajas por tu cuenta, escribe el nombre de tu negocio."
							/>
						</div>

						<div className="campo--fila">
							<div className="campo">
								<label htmlFor="escolaridad">Escolaridad</label>
								<select
									id="escolaridad"
									value={economia.escolaridad}
									onChange={(e) => setEconomia({ ...economia, escolaridad: e.target.value })}
								>
									<option value="">Prefiero no decir</option>
									<option value="sin_estudios">Sin estudios</option>
									<option value="primaria">Primaria</option>
									<option value="secundaria">Secundaria</option>
									<option value="preparatoria">Preparatoria</option>
									<option value="tecnico">Técnico</option>
									<option value="licenciatura">Licenciatura</option>
									<option value="posgrado">Posgrado</option>
								</select>
							</div>
							<div className="campo">
								<label htmlFor="estado_civil">Estado civil</label>
								<select
									id="estado_civil"
									value={economia.estado_civil}
									onChange={(e) => setEconomia({ ...economia, estado_civil: e.target.value })}
								>
									<option value="">Prefiero no decir</option>
									<option value="soltero">Soltero(a)</option>
									<option value="casado">Casado(a)</option>
									<option value="union_libre">Unión libre</option>
									<option value="separado">Separado(a)</option>
									<option value="divorciado">Divorciado(a)</option>
									<option value="viudo">Viudo(a)</option>
								</select>
							</div>
						</div>

						<div className="campo--fila">
							<Campo
								id="ingreso_mensual"
								etiqueta="Ingreso mensual"
								tipo="number"
								valor={economia.ingreso_mensual}
								alCambiar={(v) => setEconomia({ ...economia, ingreso_mensual: v })}
								error={campoConError === 'ingreso_mensual'}
								ayuda="Lo que recibes al mes, aproximado."
								requerido
							/>
							<Campo
								id="egresos_mensuales"
								etiqueta="Gastos fijos al mes"
								tipo="number"
								valor={economia.egresos_mensuales}
								alCambiar={(v) => setEconomia({ ...economia, egresos_mensuales: v })}
								ayuda="Renta, servicios, colegiaturas, otras deudas."
							/>
						</div>

						<div className="campo--fila">
							<Campo
								id="antiguedad_laboral_meses"
								etiqueta="Meses en tu actividad actual"
								tipo="number"
								valor={economia.antiguedad_laboral_meses}
								alCambiar={(v) => setEconomia({ ...economia, antiguedad_laboral_meses: v })}
							/>
							<Campo
								id="dependientes_economicos"
								etiqueta="Personas que dependen de ti"
								tipo="number"
								valor={economia.dependientes_economicos}
								alCambiar={(v) => setEconomia({ ...economia, dependientes_economicos: v })}
							/>
						</div>

						<h4 className="mt-8">Datos opcionales</h4>
						<p className="text-sm text-neutral-500 dark:text-neutral-400">
							No son obligatorios ahora, pero agilizan el trámite si decides solicitar un crédito.
						</p>

						<Campo
							id="rfc"
							etiqueta="RFC"
							valor={economia.rfc}
							alCambiar={(v) => setEconomia({ ...economia, rfc: v.toUpperCase() })}
							error={campoConError === 'rfc'}
							maxLength={13}
							ayuda="13 caracteres. Debe coincidir con tu CURP."
						/>

						<div className="campo--fila">
							<Campo
								id="banco"
								etiqueta="Banco"
								valor={economia.banco}
								alCambiar={(v) => setEconomia({ ...economia, banco: v })}
							/>
							<Campo
								id="clabe"
								etiqueta="CLABE interbancaria"
								valor={economia.clabe}
								alCambiar={(v) => setEconomia({ ...economia, clabe: v })}
								error={campoConError === 'clabe'}
								maxLength={18}
								ayuda="18 dígitos. Para depositarte si te aprueban un crédito."
							/>
						</div>
					</>
				)}

				{/* ================================================ Paso 3 */}
				{paso === 3 && (
					<>
						<div className="aviso aviso--info">
							<p>
								Toma las fotos con buena luz, sobre una superficie plana y cuidando que se lean
								todos los datos. Aceptamos JPG, PNG o PDF de hasta 10 MB.
							</p>
						</div>

						{DOCUMENTOS_PEDIDOS.map((doc) => (
							<CargaDocumento
								key={doc.tipo}
								tipo={doc.tipo}
								obligatorio={doc.obligatorio}
								ayuda={doc.ayuda}
								cargado={subidos.has(doc.tipo)}
								subiendo={subiendo === doc.tipo}
								alSeleccionar={(archivo) => subirDocumento(doc.tipo, archivo)}
							/>
						))}
					</>
				)}

				{/* ================================================ Paso 4 */}
				{paso === 4 && (
					<>
						<h4>Referencias personales</h4>
						<p className="text-sm text-neutral-500 dark:text-neutral-400">
							Dos personas que te conozcan y no vivan contigo. Las contactaremos solo para
							confirmar tus datos.
						</p>

						{referencias.map((ref, i) => (
							<fieldset
								key={i}
								className="mb-5 rounded-sm border border-neutral-200 p-4 dark:border-neutral-800"
							>
								<legend className="px-2 text-sm font-medium">Referencia {i + 1}</legend>
								<div className="campo--fila">
									<Campo
										id={`ref-nombre-${i}`}
										etiqueta="Nombre completo"
										valor={ref.nombre}
										alCambiar={(v) => actualizarLista(setReferencias, referencias, i, 'nombre', v)}
									/>
									<Campo
										id={`ref-tel-${i}`}
										etiqueta="Teléfono"
										tipo="tel"
										valor={ref.telefono}
										alCambiar={(v) =>
											actualizarLista(setReferencias, referencias, i, 'telefono', v)
										}
									/>
								</div>
								<div className="campo--fila">
									<Campo
										id={`ref-par-${i}`}
										etiqueta="Relación contigo"
										valor={ref.parentesco}
										alCambiar={(v) =>
											actualizarLista(setReferencias, referencias, i, 'parentesco', v)
										}
										ayuda="Ej. vecino, compadre, cliente, hermana."
									/>
									<Campo
										id={`ref-dir-${i}`}
										etiqueta="Dónde vive"
										valor={ref.direccion}
										alCambiar={(v) =>
											actualizarLista(setReferencias, referencias, i, 'direccion', v)
										}
									/>
								</div>
							</fieldset>
						))}

						{referencias.length < 4 && (
							<button
								type="button"
								className="btn btn--contorno btn--sm mb-8"
								onClick={() =>
									setReferencias([
										...referencias,
										{ nombre: '', parentesco: '', telefono: '', direccion: '' }
									])
								}
							>
								Agregar otra referencia
							</button>
						)}

						<h4 className="mt-8">Beneficiarios</h4>
						<p className="text-sm text-neutral-500 dark:text-neutral-400">
							Quién recibiría tu haber social. Los porcentajes deben sumar 100%. Puedes
							cambiarlos cuando quieras desde tu portal.
						</p>

						{beneficiarios.map((ben, i) => (
							<fieldset
								key={i}
								className="mb-5 rounded-sm border border-neutral-200 p-4 dark:border-neutral-800"
							>
								<legend className="px-2 text-sm font-medium">Beneficiario {i + 1}</legend>
								<div className="campo--fila">
									<Campo
										id={`ben-nombre-${i}`}
										etiqueta="Nombre completo"
										valor={ben.nombre}
										alCambiar={(v) =>
											actualizarLista(setBeneficiarios, beneficiarios, i, 'nombre', v)
										}
									/>
									<Campo
										id={`ben-par-${i}`}
										etiqueta="Parentesco"
										valor={ben.parentesco}
										alCambiar={(v) =>
											actualizarLista(setBeneficiarios, beneficiarios, i, 'parentesco', v)
										}
									/>
								</div>
								<div className="campo--fila">
									<Campo
										id={`ben-fecha-${i}`}
										etiqueta="Fecha de nacimiento"
										tipo="date"
										valor={ben.fecha_nacimiento}
										alCambiar={(v) =>
											actualizarLista(setBeneficiarios, beneficiarios, i, 'fecha_nacimiento', v)
										}
									/>
									<Campo
										id={`ben-pct-${i}`}
										etiqueta="Porcentaje"
										tipo="number"
										valor={ben.porcentaje}
										alCambiar={(v) =>
											actualizarLista(setBeneficiarios, beneficiarios, i, 'porcentaje', v)
										}
									/>
								</div>
							</fieldset>
						))}

						{beneficiarios.length < 4 && (
							<button
								type="button"
								className="btn btn--contorno btn--sm"
								onClick={() =>
									setBeneficiarios([
										...beneficiarios,
										{ nombre: '', parentesco: '', fecha_nacimiento: '', porcentaje: '' }
									])
								}
							>
								Agregar otro beneficiario
							</button>
						)}
					</>
				)}

				{/* ================================================ Paso 5 */}
				{paso === 5 && (
					<>
						<div className="aviso aviso--info">
							<p>
								Al enviar, tu expediente pasa a revisión. Recibirás la respuesta por correo en
								un plazo de 3 a 5 días hábiles.
							</p>
						</div>

						<label className="mb-4 flex cursor-pointer items-start gap-3 text-sm">
							<input
								type="checkbox"
								className="mb-0! mt-1 size-4 shrink-0 accent-[var(--color-primary-600)]"
								checked={aceptaPrivacidad}
								onChange={(e) => setAceptaPrivacidad(e.target.checked)}
							/>
							<span>
								He leído y acepto el{' '}
								<a href="/aviso-de-privacidad" target="_blank" rel="noopener">
									aviso de privacidad
								</a>{' '}
								y autorizo el tratamiento de mis datos personales para el trámite de admisión
								como socio. <strong className="text-red-600">Obligatorio</strong>
							</span>
						</label>

						<label className="mb-6 flex cursor-pointer items-start gap-3 text-sm">
							<input
								type="checkbox"
								className="mb-0! mt-1 size-4 shrink-0 accent-[var(--color-primary-600)]"
								checked={aceptaBuro}
								onChange={(e) => setAceptaBuro(e.target.checked)}
							/>
							<span>
								Autorizo a Cooperativa Impulsa a consultar mi historial crediticio en las
								sociedades de información crediticia. <em>Opcional</em>, pero agiliza el
								dictamen si más adelante solicitas un crédito.
							</span>
						</label>

						<div className="panel bg-neutral-50 dark:bg-neutral-800">
							<h4 className="mb-3 text-base">Resumen de tu registro</h4>
							<dl className="space-y-1.5 text-sm">
								<Resumen etiqueta="Nombre" valor={`${cuenta.nombre} ${cuenta.apellido_paterno} ${cuenta.apellido_materno}`.trim()} />
								<Resumen etiqueta="CURP" valor={cuenta.curp} />
								<Resumen etiqueta="Correo" valor={cuenta.correo} />
								<Resumen etiqueta="Teléfono" valor={cuenta.telefono} />
								<Resumen
									etiqueta="Domicilio"
									valor={`${domicilio.calle} ${domicilio.numero_exterior}, ${domicilio.colonia}, ${domicilio.municipio}, ${domicilio.entidad}`}
								/>
								<Resumen etiqueta="Ocupación" valor={economia.ocupacion} />
								<Resumen etiqueta="Documentos subidos" valor={`${subidos.size}`} />
							</dl>
						</div>
					</>
				)}

				{/* ---------------------------------------------- Navegación */}
				<div className="mt-8 flex items-center justify-between gap-3 border-t border-neutral-200 pt-6 dark:border-neutral-800">
					<button
						type="button"
						className="btn btn--fantasma"
						onClick={() => {
							limpiar()
							setPaso(Math.max(paso - 1, expediente ? 1 : 0))
						}}
						disabled={paso === 0 || (Boolean(expediente) && paso === 1) || guardando}
					>
						← Atrás
					</button>

					<button
						type="button"
						className="btn btn--primario"
						onClick={avanzar}
						disabled={guardando || subiendo !== null}
					>
						{guardando
							? 'Guardando…'
							: paso === PASOS.length - 1
								? 'Enviar mi expediente'
								: 'Guardar y continuar →'}
					</button>
				</div>
			</div>

			<p className="small mt-6 text-center">
				Tus datos viajan cifrados y solo los ve el personal autorizado de la cooperativa.
			</p>
		</div>
	)
}

// =============================================================================
// Subcomponentes
// =============================================================================

function Campo({
	id,
	etiqueta,
	valor,
	alCambiar,
	tipo = 'text',
	ayuda,
	error = false,
	requerido = false,
	maxLength
}: {
	id: string
	etiqueta: string
	valor: string
	alCambiar: (v: string) => void
	tipo?: string
	ayuda?: string
	error?: boolean
	requerido?: boolean
	maxLength?: number
}) {
	return (
		<div className="campo">
			<label htmlFor={id}>
				{etiqueta}
				{requerido && <span className="text-red-600"> *</span>}
			</label>
			<input
				id={id}
				type={tipo}
				value={valor}
				maxLength={maxLength}
				aria-invalid={error || undefined}
				onChange={(e) => alCambiar(e.target.value)}
			/>
			{ayuda && <span className="campo__ayuda">{ayuda}</span>}
		</div>
	)
}

function CargaDocumento({
	tipo,
	obligatorio,
	ayuda,
	cargado,
	subiendo,
	alSeleccionar
}: {
	tipo: TipoDocumento
	obligatorio: boolean
	ayuda: string
	cargado: boolean
	subiendo: boolean
	alSeleccionar: (archivo: File) => void
}) {
	return (
		<div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-sm border border-neutral-200 p-4 dark:border-neutral-800">
			<div className="min-w-48 flex-1">
				<p className="mb-0.5 font-medium text-neutral-900 dark:text-neutral-100">
					{ETIQUETAS_TIPO_DOCUMENTO[tipo]}
					{obligatorio && <span className="text-red-600"> *</span>}
				</p>
				<p className="mb-0 text-xs text-neutral-500 dark:text-neutral-400">{ayuda}</p>
			</div>

			<div className="flex items-center gap-3">
				{cargado && <span className="estado estado--verificado">Cargado</span>}
				<label className="btn btn--contorno btn--sm cursor-pointer">
					{subiendo ? 'Subiendo…' : cargado ? 'Reemplazar' : 'Seleccionar'}
					<input
						type="file"
						className="sr-only mb-0!"
						accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
						disabled={subiendo}
						onChange={(e) => {
							const archivo = e.target.files?.[0]
							if (archivo) alSeleccionar(archivo)
							e.target.value = ''
						}}
					/>
				</label>
			</div>
		</div>
	)
}

function Resumen({ etiqueta, valor }: { etiqueta: string; valor: string }) {
	return (
		<div className="flex flex-wrap justify-between gap-2">
			<dt className="text-neutral-500 dark:text-neutral-400">{etiqueta}</dt>
			<dd className="text-right font-medium">{valor || '—'}</dd>
		</div>
	)
}

// =============================================================================
// Utilidades
// =============================================================================

function actualizarLista<T>(
	establecer: (v: T[]) => void,
	lista: T[],
	indice: number,
	campo: keyof T,
	valor: string
) {
	const copia = [...lista]
	copia[indice] = { ...copia[indice], [campo]: valor }
	establecer(copia)
}

/** Muestra en vivo lo que la CURP dice de la persona: refuerza que está bien escrita. */
function ayudaCurp(curp: string): string {
	if (curp.length !== 18) return '18 caracteres, tal como aparece en tu documento oficial.'

	const resultado = validarCurp(curp)
	if (!resultado.valido) return resultado.mensaje!

	const nacimiento = fechaNacimientoDesdeCurp(curp)
	if (!nacimiento) return 'CURP válida.'

	return `CURP válida. Nacimiento: ${nacimiento.split('-').reverse().join('/')} (${calcularEdad(nacimiento)} años).`
}
