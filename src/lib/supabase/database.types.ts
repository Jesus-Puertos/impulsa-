// =============================================================================
// Tipos de la base de datos
// -----------------------------------------------------------------------------
// Escritos a mano para que el proyecto compile sin depender de la CLI. Para
// obtener los tipos exactos que genera PostgREST (incluidos los campos con
// valor por omisión en los Insert), regenéralos con:
//
//   npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
//
// Mientras tanto, `Insert` y `Update` se derivan como parciales de `Row`: se
// pierde la verificación de campos obligatorios en el insert, pero se conserva
// el autocompletado y la detección de nombres de columna mal escritos.
// =============================================================================

export type Json = string | number | boolean | null | { [k: string]: Json | undefined } | Json[]

// --- Enumerados (espejo de los tipos ENUM de PostgreSQL) ---------------------
export type Rol = 'socio' | 'promotor' | 'cajero' | 'analista' | 'gerente' | 'admin'

export type EstadoSocio =
	| 'prospecto'
	| 'en_revision'
	| 'activo'
	| 'suspendido'
	| 'baja'
	| 'rechazado'

export type EstadoDocumento = 'pendiente' | 'verificado' | 'rechazado'

export type TipoDocumento =
	| 'ine_frente'
	| 'ine_reverso'
	| 'curp'
	| 'rfc'
	| 'comprobante_domicilio'
	| 'comprobante_ingresos'
	| 'acta_nacimiento'
	| 'estado_cuenta_bancario'
	| 'fotografia'
	| 'firma'
	| 'otro'

export type EstadoSolicitud =
	| 'borrador'
	| 'enviada'
	| 'en_revision'
	| 'aprobada'
	| 'rechazada'
	| 'cancelada'
	| 'desembolsada'

export type EstadoCredito = 'vigente' | 'atrasado' | 'liquidado' | 'castigado' | 'cancelado'

export type EstadoCuota = 'pendiente' | 'parcial' | 'pagada' | 'vencida' | 'condonada'

export type MetodoPago =
	| 'efectivo'
	| 'transferencia'
	| 'deposito'
	| 'domiciliacion'
	| 'descuento_nomina'

export type TipoMovimientoAhorro = 'deposito' | 'retiro' | 'interes' | 'comision' | 'ajuste'

export type Periodicidad = 'semanal' | 'catorcenal' | 'quincenal' | 'mensual'

export type EstadoPublicacion = 'borrador' | 'publicado' | 'archivado'

export type Genero = 'masculino' | 'femenino' | 'no_binario' | 'prefiere_no_decir'

export type EstadoCivil =
	| 'soltero'
	| 'casado'
	| 'union_libre'
	| 'separado'
	| 'divorciado'
	| 'viudo'

export type Escolaridad =
	| 'sin_estudios'
	| 'primaria'
	| 'secundaria'
	| 'preparatoria'
	| 'tecnico'
	| 'licenciatura'
	| 'posgrado'

// --- Filas -------------------------------------------------------------------

export type Sucursal = {
	id: string
	clave: string
	nombre: string
	calle: string | null
	numero: string | null
	colonia: string | null
	municipio: string | null
	estado: string | null
	codigo_postal: string | null
	telefono: string | null
	correo: string | null
	horario: string | null
	latitud: number | null
	longitud: number | null
	es_matriz: boolean
	activa: boolean
	orden: number
	creado_en: string
	actualizado_en: string
}

export type PerfilRow = {
	id: string
	nombre: string
	apellido_paterno: string
	apellido_materno: string | null
	correo: string
	telefono: string | null
	rol: Rol
	sucursal_id: string | null
	avatar_url: string | null
	activo: boolean
	ultimo_acceso: string | null
	creado_en: string
	actualizado_en: string
}

export type Socio = {
	id: string
	perfil_id: string | null
	numero_socio: string | null
	nombre: string
	apellido_paterno: string
	apellido_materno: string | null
	curp: string
	rfc: string | null
	fecha_nacimiento: string
	genero: Genero | null
	estado_civil: EstadoCivil | null
	nacionalidad: string
	entidad_nacimiento: string | null
	clave_elector: string | null
	numero_ine: string | null
	vigencia_ine: string | null
	correo: string | null
	telefono: string | null
	telefono_alterno: string | null
	calle: string | null
	numero_exterior: string | null
	numero_interior: string | null
	colonia: string | null
	municipio: string | null
	entidad: string | null
	codigo_postal: string | null
	referencia_domicilio: string | null
	antiguedad_domicilio_meses: number | null
	tipo_vivienda: string | null
	ocupacion: string | null
	escolaridad: Escolaridad | null
	nombre_empresa: string | null
	antiguedad_laboral_meses: number | null
	ingreso_mensual: number | null
	egresos_mensuales: number | null
	otros_ingresos: number | null
	fuente_otros_ingresos: string | null
	dependientes_economicos: number | null
	banco: string | null
	clabe: string | null
	estado: EstadoSocio
	sucursal_id: string | null
	promotor_id: string | null
	aportacion_social: number
	score_interno: number | null
	acepta_aviso_privacidad: boolean
	acepta_consulta_buro: boolean
	fecha_alta: string | null
	fecha_baja: string | null
	motivo_baja: string | null
	notas_internas: string | null
	creado_en: string
	actualizado_en: string
}

export type DocumentoSocio = {
	id: string
	socio_id: string
	tipo: TipoDocumento
	ruta_storage: string
	nombre_archivo: string | null
	mime: string | null
	tamano_bytes: number | null
	estado: EstadoDocumento
	revisado_por: string | null
	revisado_en: string | null
	motivo_rechazo: string | null
	vigencia_hasta: string | null
	creado_en: string
	actualizado_en: string
}

export type ReferenciaSocio = {
	id: string
	socio_id: string
	nombre: string
	parentesco: string | null
	telefono: string
	direccion: string | null
	verificada: boolean
	creado_en: string
}

export type Beneficiario = {
	id: string
	socio_id: string
	nombre: string
	parentesco: string
	fecha_nacimiento: string | null
	telefono: string | null
	porcentaje: number
	creado_en: string
}

export type ProductoCredito = {
	id: string
	clave: string
	nombre: string
	descripcion: string | null
	descripcion_larga: string | null
	monto_minimo: number
	monto_maximo: number
	plazo_minimo_periodos: number
	plazo_maximo_periodos: number
	tasa_anual: number
	tasa_moratoria_anual: number
	comision_apertura_pct: number
	periodicidad: Periodicidad
	requiere_aval: boolean
	requiere_garantia: boolean
	antiguedad_minima_socio_meses: number
	ingreso_minimo_mensual: number | null
	factor_capacidad_pago: number
	requisitos: string[]
	destinos: string[]
	icono: string | null
	color: string | null
	destacado: boolean
	orden: number
	activo: boolean
	creado_en: string
	actualizado_en: string
}

export type Simulacion = {
	id: string
	producto_id: string | null
	socio_id: string | null
	monto: number
	plazo_periodos: number
	periodicidad: Periodicidad
	tasa_anual: number
	comision_apertura: number
	pago_periodico: number
	total_intereses: number
	total_a_pagar: number
	cat: number | null
	nombre_contacto: string | null
	correo_contacto: string | null
	telefono_contacto: string | null
	quiere_contacto: boolean
	contactado: boolean
	contactado_por: string | null
	origen: string
	creado_en: string
}

export type SolicitudCredito = {
	id: string
	folio: string | null
	socio_id: string
	producto_id: string
	simulacion_id: string | null
	sucursal_id: string | null
	monto_solicitado: number
	plazo_periodos: number
	periodicidad: Periodicidad
	destino: string
	descripcion_destino: string | null
	estado: EstadoSolicitud
	monto_aprobado: number | null
	plazo_aprobado: number | null
	tasa_aplicada: number | null
	analista_id: string | null
	comentarios_analista: string | null
	motivo_rechazo: string | null
	capacidad_pago_calculada: number | null
	fecha_envio: string | null
	fecha_resolucion: string | null
	creado_por: string | null
	creado_en: string
	actualizado_en: string
}

export type Aval = {
	id: string
	solicitud_id: string
	socio_aval_id: string | null
	nombre: string
	apellido_paterno: string | null
	apellido_materno: string | null
	curp: string | null
	telefono: string
	parentesco: string | null
	ocupacion: string | null
	ingreso_mensual: number | null
	domicilio: string | null
	acepto: boolean
	creado_en: string
}

export type Garantia = {
	id: string
	solicitud_id: string
	tipo: string
	descripcion: string
	valor_estimado: number | null
	ubicacion: string | null
	documento_ruta: string | null
	creado_en: string
}

export type Credito = {
	id: string
	folio: string | null
	solicitud_id: string | null
	socio_id: string
	producto_id: string
	sucursal_id: string | null
	monto_principal: number
	tasa_anual: number
	tasa_moratoria_anual: number
	plazo_periodos: number
	periodicidad: Periodicidad
	comision_apertura: number
	pago_periodico: number
	total_intereses: number
	cat: number | null
	fecha_desembolso: string
	fecha_primer_pago: string
	fecha_vencimiento: string | null
	saldo_capital: number
	saldo_interes: number
	saldo_moratorio: number
	total_pagado: number
	estado: EstadoCredito
	dias_mora: number
	fecha_liquidacion: string | null
	desembolsado_por: string | null
	notas: string | null
	creado_en: string
	actualizado_en: string
}

export type Amortizacion = {
	id: string
	credito_id: string
	numero_cuota: number
	fecha_vencimiento: string
	saldo_inicial: number
	capital: number
	interes: number
	iva_interes: number
	pago_programado: number
	saldo_final: number
	capital_pagado: number
	interes_pagado: number
	iva_pagado: number
	moratorio_generado: number
	moratorio_pagado: number
	estado: EstadoCuota
	fecha_liquidacion: string | null
	creado_en: string
}

export type Pago = {
	id: string
	folio: string | null
	credito_id: string
	socio_id: string
	sucursal_id: string | null
	monto: number
	metodo: MetodoPago
	referencia: string | null
	fecha_pago: string
	capital_aplicado: number
	interes_aplicado: number
	iva_aplicado: number
	moratorio_aplicado: number
	excedente: number
	cancelado: boolean
	cancelado_por: string | null
	cancelado_en: string | null
	motivo_cancelacion: string | null
	registrado_por: string | null
	notas: string | null
	creado_en: string
}

export type AplicacionPago = {
	id: string
	pago_id: string
	cuota_id: string
	capital: number
	interes: number
	iva: number
	moratorio: number
	creado_en: string
}

export type ProductoAhorro = {
	id: string
	clave: string
	nombre: string
	descripcion: string | null
	descripcion_larga: string | null
	tasa_anual: number
	monto_minimo_apertura: number
	monto_minimo_saldo: number
	plazo_dias: number | null
	permite_retiro_anticipado: boolean
	penalizacion_retiro_pct: number
	aportacion_sugerida: number | null
	periodicidad_aportacion: Periodicidad | null
	icono: string | null
	color: string | null
	destacado: boolean
	orden: number
	activo: boolean
	creado_en: string
	actualizado_en: string
}

export type CuentaAhorro = {
	id: string
	numero_cuenta: string | null
	socio_id: string
	producto_id: string
	sucursal_id: string | null
	saldo: number
	interes_acumulado: number
	fecha_apertura: string
	fecha_vencimiento: string | null
	meta_ahorro: number | null
	activa: boolean
	fecha_cierre: string | null
	aperturada_por: string | null
	creado_en: string
	actualizado_en: string
}

export type MovimientoAhorro = {
	id: string
	cuenta_id: string
	folio: string | null
	tipo: TipoMovimientoAhorro
	monto: number
	saldo_posterior: number
	metodo: MetodoPago | null
	referencia: string | null
	fecha: string
	registrado_por: string | null
	notas: string | null
	creado_en: string
}

export type EntradaBlog = {
	id: string
	slug: string
	titulo: string
	resumen: string | null
	contenido: string
	imagen_portada: string | null
	categoria: string
	etiquetas: string[]
	autor_id: string | null
	autor_nombre: string | null
	estado: EstadoPublicacion
	destacado: boolean
	minutos_lectura: number | null
	publicado_en: string | null
	seo_titulo: string | null
	seo_descripcion: string | null
	vistas: number
	creado_en: string
	actualizado_en: string
}

export type Testimonio = {
	id: string
	nombre: string
	cargo: string | null
	texto: string
	foto_url: string | null
	sucursal: string | null
	calificacion: number | null
	estado: EstadoPublicacion
	orden: number
	creado_en: string
	actualizado_en: string
}

export type PreguntaFrecuente = {
	id: string
	categoria: string
	pregunta: string
	respuesta: string
	orden: number
	estado: EstadoPublicacion
	creado_en: string
	actualizado_en: string
}

export type AvisoSitio = {
	id: string
	titulo: string
	mensaje: string
	tipo: string
	enlace: string | null
	texto_enlace: string | null
	inicia_en: string
	termina_en: string | null
	activo: boolean
	creado_en: string
	actualizado_en: string
}

export type Notificacion = {
	id: string
	perfil_id: string
	titulo: string
	mensaje: string
	tipo: string
	enlace: string | null
	leida: boolean
	leida_en: string | null
	creado_en: string
}

export type EntradaBitacora = {
	id: number
	actor_id: string | null
	actor_correo: string | null
	accion: string
	tabla: string
	registro_id: string | null
	datos_antes: Json | null
	datos_despues: Json | null
	creado_en: string
}

export type MensajeContacto = {
	id: string
	nombre: string
	correo: string
	telefono: string | null
	asunto: string | null
	mensaje: string
	sucursal_id: string | null
	atendido: boolean
	atendido_por: string | null
	atendido_en: string | null
	respuesta: string | null
	origen: string
	creado_en: string
}

export type Configuracion = {
	clave: string
	valor: Json
	descripcion: string | null
	grupo: string
	editable: boolean
	actualizado_en: string
	actualizado_por: string | null
}

// --- Vistas ------------------------------------------------------------------

export type CreditoDetalle = {
	id: string
	folio: string | null
	socio_id: string
	estado: EstadoCredito
	monto_principal: number
	saldo_capital: number
	saldo_interes: number
	saldo_moratorio: number
	saldo_total: number
	total_pagado: number
	pago_periodico: number
	periodicidad: Periodicidad
	plazo_periodos: number
	tasa_anual: number
	dias_mora: number
	fecha_desembolso: string
	fecha_vencimiento: string | null
	sucursal_id: string | null
	numero_socio: string | null
	socio_nombre: string
	curp: string
	socio_telefono: string | null
	producto_nombre: string
	producto_clave: string
	sucursal_nombre: string | null
	porcentaje_amortizado: number
	cuotas_pagadas: number
	proxima_fecha_pago: string | null
	proximo_pago_monto: number | null
}

export type SolicitudDetalle = {
	id: string
	folio: string | null
	estado: EstadoSolicitud
	monto_solicitado: number
	plazo_periodos: number
	periodicidad: Periodicidad
	destino: string
	descripcion_destino: string | null
	monto_aprobado: number | null
	plazo_aprobado: number | null
	tasa_aplicada: number | null
	comentarios_analista: string | null
	motivo_rechazo: string | null
	capacidad_pago_calculada: number | null
	analista_id: string | null
	fecha_envio: string | null
	fecha_resolucion: string | null
	creado_en: string
	socio_id: string
	numero_socio: string | null
	socio_nombre: string
	curp: string
	socio_telefono: string | null
	ingreso_mensual: number | null
	egresos_mensuales: number | null
	socio_estado: EstadoSocio
	producto_nombre: string
	producto_tasa: number
	factor_capacidad_pago: number
	sucursal_nombre: string | null
	dias_en_espera: number | null
	ingreso_disponible: number
	documentos_verificados: number
	creditos_activos: number
}

export type FilaCobranza = {
	cuota_id: string
	credito_id: string
	numero_cuota: number
	fecha_vencimiento: string
	pago_programado: number
	estado_cuota: EstadoCuota
	capital_pendiente: number
	interes_pendiente: number
	moratorio_pendiente: number
	total_pendiente: number
	dias_vencida: number
	credito_folio: string | null
	estado_credito: EstadoCredito
	socio_id: string
	numero_socio: string | null
	socio_nombre: string
	socio_telefono: string | null
	sucursal_id: string | null
	sucursal_nombre: string | null
}

export type SocioResumen = {
	id: string
	numero_socio: string | null
	nombre_completo: string
	curp: string
	rfc: string | null
	correo: string | null
	telefono: string | null
	estado: EstadoSocio
	municipio: string | null
	entidad: string | null
	fecha_alta: string | null
	ingreso_mensual: number | null
	score_interno: number | null
	sucursal_nombre: string | null
	sucursal_id: string | null
	documentos_cargados: number
	documentos_verificados: number
	documentos_pendientes: number
	creditos_activos: number
	deuda_total: number
	ahorro_total: number
	dias_mora_maximo: number | null
}

/** Estructura devuelta por la función `kpis_panel()`. */
export type KpisPanel = {
	socios: {
		total: number
		activos: number
		en_revision: number
		prospectos: number
		altas_mes: number
	}
	solicitudes: { pendientes: number; aprobadas_mes: number; monto_pendiente: number }
	cartera: {
		creditos_activos: number
		colocado_total: number
		colocado_mes: number
		saldo_cartera: number
		en_mora: number
		saldo_en_mora: number
	}
	ahorro: { cuentas: number; saldo_total: number; captado_mes: number }
	recuperacion: { cobrado_mes: number; por_cobrar_7d: number }
	pendientes: {
		documentos_por_revisar: number
		mensajes_sin_atender: number
		leads_sin_contactar: number
	}
	generado_en: string
}

// --- Ensamblado del tipo Database -------------------------------------------
// `Insert` y `Update` se derivan como parciales; ver la nota de la cabecera.
type Tabla<R, Rel extends readonly unknown[] = []> = {
	Row: R
	Insert: Partial<R>
	Update: Partial<R>
	Relationships: Rel
}
type Vista<R> = { Row: R; Relationships: [] }

/**
 * Declaración de una llave foránea, en el formato que espera PostgREST para
 * resolver los `select('*, tabla_relacionada(...)')`.
 */
type Fk<
	Nombre extends string,
	Columna extends string,
	Relacion extends string,
	Unica extends boolean = false
> = {
	foreignKeyName: Nombre
	columns: [Columna]
	isOneToOne: Unica
	referencedRelation: Relacion
	referencedColumns: ['id']
}

// Solo se declaran las relaciones que el código realmente consulta con embeds.
// Añade aquí las que necesites, o regenera el archivo con la CLI de Supabase.
type RelSocios = [
	Fk<'socios_perfil_id_fkey', 'perfil_id', 'perfiles', true>,
	Fk<'socios_sucursal_id_fkey', 'sucursal_id', 'sucursales'>,
	Fk<'socios_promotor_id_fkey', 'promotor_id', 'perfiles'>
]

type RelCuentasAhorro = [
	Fk<'cuentas_ahorro_socio_id_fkey', 'socio_id', 'socios'>,
	Fk<'cuentas_ahorro_producto_id_fkey', 'producto_id', 'productos_ahorro'>,
	Fk<'cuentas_ahorro_sucursal_id_fkey', 'sucursal_id', 'sucursales'>
]

type RelSolicitudes = [
	Fk<'solicitudes_credito_socio_id_fkey', 'socio_id', 'socios'>,
	Fk<'solicitudes_credito_producto_id_fkey', 'producto_id', 'productos_credito'>,
	Fk<'solicitudes_credito_sucursal_id_fkey', 'sucursal_id', 'sucursales'>
]

type RelSimulaciones = [
	Fk<'simulaciones_producto_id_fkey', 'producto_id', 'productos_credito'>,
	Fk<'simulaciones_socio_id_fkey', 'socio_id', 'socios'>
]

type RelCreditos = [
	Fk<'creditos_socio_id_fkey', 'socio_id', 'socios'>,
	Fk<'creditos_producto_id_fkey', 'producto_id', 'productos_credito'>,
	Fk<'creditos_sucursal_id_fkey', 'sucursal_id', 'sucursales'>
]

type RelMensajes = [Fk<'mensajes_contacto_sucursal_id_fkey', 'sucursal_id', 'sucursales'>]

type RelDocumentos = [Fk<'documentos_socio_socio_id_fkey', 'socio_id', 'socios'>]

type RelMovimientos = [Fk<'movimientos_ahorro_cuenta_id_fkey', 'cuenta_id', 'cuentas_ahorro'>]

type RelAmortizaciones = [Fk<'amortizaciones_credito_id_fkey', 'credito_id', 'creditos'>]

type RelPagos = [
	Fk<'pagos_credito_id_fkey', 'credito_id', 'creditos'>,
	Fk<'pagos_socio_id_fkey', 'socio_id', 'socios'>
]

export type Database = {
	public: {
		Tables: {
			sucursales: Tabla<Sucursal>
			perfiles: Tabla<PerfilRow>
			configuracion: Tabla<Configuracion>
			socios: Tabla<Socio, RelSocios>
			documentos_socio: Tabla<DocumentoSocio, RelDocumentos>
			referencias_socio: Tabla<ReferenciaSocio>
			beneficiarios: Tabla<Beneficiario>
			productos_credito: Tabla<ProductoCredito>
			simulaciones: Tabla<Simulacion, RelSimulaciones>
			solicitudes_credito: Tabla<SolicitudCredito, RelSolicitudes>
			avales: Tabla<Aval>
			garantias: Tabla<Garantia>
			creditos: Tabla<Credito, RelCreditos>
			amortizaciones: Tabla<Amortizacion, RelAmortizaciones>
			pagos: Tabla<Pago, RelPagos>
			aplicaciones_pago: Tabla<AplicacionPago>
			productos_ahorro: Tabla<ProductoAhorro>
			cuentas_ahorro: Tabla<CuentaAhorro, RelCuentasAhorro>
			movimientos_ahorro: Tabla<MovimientoAhorro, RelMovimientos>
			entradas_blog: Tabla<EntradaBlog>
			testimonios: Tabla<Testimonio>
			preguntas_frecuentes: Tabla<PreguntaFrecuente>
			avisos: Tabla<AvisoSitio>
			notificaciones: Tabla<Notificacion>
			bitacora: Tabla<EntradaBitacora>
			mensajes_contacto: Tabla<MensajeContacto, RelMensajes>
		}
		Views: {
			v_creditos_detalle: Vista<CreditoDetalle>
			v_solicitudes_detalle: Vista<SolicitudDetalle>
			v_cobranza: Vista<FilaCobranza>
			v_socios_resumen: Vista<SocioResumen>
		}
		Functions: {
			calcular_pago_periodico: {
				Args: {
					p_monto: number
					p_tasa_anual: number
					p_periodos: number
					p_periodicidad: Periodicidad
				}
				Returns: number
			}
			generar_amortizacion: { Args: { p_credito_id: string }; Returns: number }
			desembolsar_credito: {
				Args: {
					p_solicitud_id: string
					p_fecha_desembolso?: string
					p_fecha_primer_pago?: string
				}
				Returns: string
			}
			registrar_pago: {
				Args: {
					p_credito_id: string
					p_monto: number
					p_metodo?: MetodoPago
					p_referencia?: string
					p_fecha?: string
					p_notas?: string
				}
				Returns: string
			}
			actualizar_mora: {
				Args: { p_fecha?: string }
				Returns: { creditos_afectados: number; cuotas_vencidas: number }[]
			}
			kpis_panel: { Args: Record<string, never>; Returns: KpisPanel }
			serie_colocacion: {
				Args: { p_meses?: number }
				Returns: { mes: string; monto: number; cantidad: number }[]
			}
		}
		Enums: {
			rol_usuario: Rol
			estado_socio: EstadoSocio
			estado_documento: EstadoDocumento
			tipo_documento: TipoDocumento
			estado_solicitud: EstadoSolicitud
			estado_credito: EstadoCredito
			estado_cuota: EstadoCuota
			metodo_pago: MetodoPago
			tipo_movimiento_ahorro: TipoMovimientoAhorro
			periodicidad_pago: Periodicidad
			estado_publicacion: EstadoPublicacion
			genero_persona: Genero
			estado_civil_persona: EstadoCivil
			nivel_escolaridad: Escolaridad
		}
		CompositeTypes: Record<string, never>
	}
}
