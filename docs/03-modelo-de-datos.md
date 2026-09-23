# 03 · Modelo de datos

Diccionario de las 26 tablas y 4 vistas del sistema. El SQL comentado está en
[`../supabase/migrations/`](../supabase/migrations/).

## Diagrama de relaciones

```
auth.users (Supabase Auth)
    │ 1:1
    ▼
perfiles ──────────────┐
    │ 1:1              │ N:1
    ▼                  ▼
  socios          sucursales
    │
    ├──< documentos_socio        (INE, comprobantes…)
    ├──< referencias_socio
    ├──< beneficiarios
    ├──< simulaciones
    ├──< cuentas_ahorro ──< movimientos_ahorro
    │
    └──< solicitudes_credito ──< avales
            │      │            └< garantias
            │      └─────────────> productos_credito
            │ 1:1
            ▼
         creditos ──< amortizaciones
            │              ▲
            └──< pagos ──< aplicaciones_pago
```

Convenciones que aplican a todas las tablas:

- Llave primaria `uuid` generada con `gen_random_uuid()`, salvo `bitacora`
  (`bigserial`) y `configuracion` (la clave de texto).
- `creado_en` y `actualizado_en` de tipo `timestamptz`; el segundo lo mantiene
  el trigger `privado.tocar_actualizado_en`.
- Importes en `numeric(14, 2)`. **Nunca** `float`: en dinero, el redondeo
  binario produce centavos fantasma.
- Porcentajes en `numeric(6, 3)` como número, no fracción: `24.5` = 24.5 %.
- Los nombres de columna y los valores de ENUM van en snake_case sin acentos,
  porque también se usan como sufijos de clase CSS (`.estado--en_revision`).

---

## Tipos enumerados

| Tipo                     | Valores                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `rol_usuario`            | socio, promotor, cajero, analista, gerente, admin                                    |
| `estado_socio`           | prospecto, en_revision, activo, suspendido, baja, rechazado                          |
| `estado_documento`       | pendiente, verificado, rechazado                                                     |
| `tipo_documento`         | ine_frente, ine_reverso, curp, rfc, comprobante_domicilio, comprobante_ingresos, acta_nacimiento, estado_cuenta_bancario, fotografia, firma, otro |
| `estado_solicitud`       | borrador, enviada, en_revision, aprobada, rechazada, cancelada, desembolsada          |
| `estado_credito`         | vigente, atrasado, liquidado, castigado, cancelado                                   |
| `estado_cuota`           | pendiente, parcial, pagada, vencida, condonada                                       |
| `metodo_pago`            | efectivo, transferencia, deposito, domiciliacion, descuento_nomina                   |
| `tipo_movimiento_ahorro` | deposito, retiro, interes, comision, ajuste                                          |
| `periodicidad_pago`      | semanal, catorcenal, quincenal, mensual                                              |
| `estado_publicacion`     | borrador, publicado, archivado                                                       |
| `genero_persona`         | masculino, femenino, no_binario, prefiere_no_decir                                   |
| `estado_civil_persona`   | soltero, casado, union_libre, separado, divorciado, viudo                            |
| `nivel_escolaridad`      | sin_estudios, primaria, secundaria, preparatoria, tecnico, licenciatura, posgrado    |

---

## Identidad y organización

### `perfiles`

Extiende `auth.users` con lo que la cooperativa necesita. Comparte la llave
primaria: un usuario, un perfil. Lo crea el trigger `al_crear_usuario` al
registrarse alguien.

| Campo                                    | Notas                                             |
| ---------------------------------------- | ------------------------------------------------- |
| `id`                                     | FK a `auth.users`, `on delete cascade`            |
| `nombre`, `apellido_paterno`, `apellido_materno` | Se llenan desde los metadatos del registro |
| `correo`, `telefono`                     |                                                   |
| `rol`                                    | Solo un admin puede cambiarlo (política RLS)      |
| `sucursal_id`                            | Adscripción del personal                          |
| `activo`                                 | `false` corta el acceso sin borrar el historial   |
| `ultimo_acceso`                          |                                                   |

### `sucursales`

Puntos de atención. Sus datos alimentan la página pública `/sucursales`.
Incluye `latitud`/`longitud` para el enlace al mapa, `es_matriz` y `orden`.

### `configuracion`

Parámetros editables desde `/admin/configuracion` sin volver a desplegar.
Formato clave-valor con el valor en `jsonb`.

| Clave                             | Uso                                                       |
| --------------------------------- | --------------------------------------------------------- |
| `iva_intereses_pct`               | IVA sobre intereses. 0 mientras estén exentos.            |
| `dias_gracia_mora`                | Días tras el vencimiento antes de generar moratorios.     |
| `tasa_moratoria_default`          | Valor por omisión para productos nuevos.                  |
| `capacidad_pago_maxima`           | Tope institucional de compromiso del ingreso.             |
| `monto_maximo_sin_aval`           | Umbral a partir del cual se exige aval.                   |
| `aportacion_social_minima`        | Aportación al capital social.                             |
| `antiguedad_minima_credito_meses` | Meses como socio activo antes de pedir crédito.           |
| `admin_bootstrap_email`           | Correo que recibe rol admin al registrarse. No editable.  |
| `nombre_cooperativa`, `razon_social`, `rfc_cooperativa`, `correo_contacto`, `telefono_contacto`, `whatsapp_contacto`, `direccion_matriz` | Datos institucionales |

### `folios`

Contadores consecutivos por prefijo y año, con bloqueo por fila. Los usa
`privado.siguiente_folio()` para generar `SOC-2026-000123`, `SOL-…`, `CRE-…`,
`PAG-…`, `AHO-…`, `MOV-…`. Sin políticas RLS: es infraestructura interna.

---

## Expediente del socio

### `socios`

El expediente completo. Un socio puede existir **sin cuenta de acceso** (alta en
ventanilla), por eso `perfil_id` es opcional.

**Identificación**: `nombre`, `apellido_paterno`, `apellido_materno`, `curp`,
`rfc`, `fecha_nacimiento`, `genero`, `estado_civil`, `nacionalidad`,
`entidad_nacimiento`, `clave_elector`, `numero_ine`, `vigencia_ine`.

**Contacto y domicilio**: `correo`, `telefono`, `telefono_alterno`, `calle`,
`numero_exterior`, `numero_interior`, `colonia`, `municipio`, `entidad`,
`codigo_postal`, `referencia_domicilio`, `antiguedad_domicilio_meses`,
`tipo_vivienda`.

**Perfil económico**: `ocupacion`, `escolaridad`, `nombre_empresa`,
`antiguedad_laboral_meses`, `ingreso_mensual`, `egresos_mensuales`,
`otros_ingresos`, `fuente_otros_ingresos`, `dependientes_economicos`.

**Bancarios**: `banco`, `clabe`.

**Situación**: `estado`, `numero_socio`, `sucursal_id`, `promotor_id`,
`aportacion_social`, `score_interno`, `fecha_alta`, `fecha_baja`,
`motivo_baja`, `notas_internas`, `acepta_aviso_privacidad`,
`acepta_consulta_buro`.

**Restricciones de integridad**

| Restricción                 | Qué exige                                                        |
| --------------------------- | ---------------------------------------------------------------- |
| `socios_curp_formato`       | 18 caracteres con la estructura oficial de CURP                  |
| `socios_rfc_formato`        | 13 caracteres de persona física                                  |
| `socios_clabe_formato`      | Exactamente 18 dígitos                                           |
| `socios_cp_formato`         | 5 dígitos                                                        |
| `socios_mayor_de_edad`      | Nacimiento anterior a hace 18 años                               |
| `socios_baja_coherente`     | Estado `baja` obliga a registrar `fecha_baja`                    |

**Triggers**, en orden de ejecución:

1. `socios_actualizado` — mantiene `actualizado_en`.
2. `socios_normalizar` — pone CURP/RFC en mayúsculas, limpia la CLABE, y al
   pasar a `activo` por primera vez asigna `numero_socio` y `fecha_alta`.
3. `socios_proteger` — si quien edita **no** es personal, revierte los campos
   reservados (`numero_socio`, `score_interno`, `notas_internas`,
   `promotor_id`, `aportacion_social`, fechas de alta y baja, `perfil_id`).
4. `auditar_socios` — escribe en `bitacora`.

### `documentos_socio`

Metadatos del expediente digital. El archivo vive en el bucket privado
`documentos-kyc`; aquí solo se guarda `ruta_storage`.

Índice único `(socio_id, tipo)`: un documento vigente por tipo. Al resubir se
reemplaza la fila y se borra el archivo anterior.

El trigger `documentos_socio_sellar` estampa `revisado_por` y `revisado_en`
cuando cambia el estado, sin confiar en lo que mande el cliente.

### `referencias_socio` y `beneficiarios`

Referencias personales (con marca `verificada` para cuando el promotor llama) y
designación de beneficiarios del haber social. Un trigger impide que la suma de
porcentajes de beneficiarios de un socio exceda 100.

---

## Crédito

### `productos_credito`

El catálogo comercial. Cambiar una tasa aquí afecta simulaciones y solicitudes
nuevas; **los créditos ya desembolsados conservan la suya**.

| Campo                                             | Notas                                          |
| ------------------------------------------------- | ---------------------------------------------- |
| `monto_minimo` / `monto_maximo`                   | Rango del deslizador del simulador             |
| `plazo_minimo_periodos` / `plazo_maximo_periodos` | En unidades de `periodicidad`                  |
| `tasa_anual`                                      | Ordinaria, en porcentaje                       |
| `tasa_moratoria_anual`                            | Sobre capital vencido                          |
| `comision_apertura_pct`                           | Se descuenta del desembolso y entra al CAT     |
| `factor_capacidad_pago`                           | Fracción máxima del ingreso disponible (0.35)  |
| `requiere_aval`, `requiere_garantia`              | Requisitos del producto                        |
| `requisitos[]`, `destinos[]`                      | Arreglos de texto que se muestran en `/creditos` |

### `simulaciones`

Toda simulación se asienta, tenga o no sesión. Cumple dos fines: dejar
constancia de las condiciones que se mostraron, y alimentar el embudo comercial
(`quiere_contacto`, `contactado`, `contactado_por`).

### `solicitudes_credito`

Del borrador al dictamen. Guarda lo que pidió el socio (`monto_solicitado`,
`plazo_periodos`, `destino`) y lo que autorizó el analista (`monto_aprobado`,
`plazo_aprobado`, `tasa_aplicada`, `comentarios_analista`, `motivo_rechazo`).

`capacidad_pago_calculada` deja rastro de la relación pago/ingreso con la que se
dictaminó, aunque el socio actualice sus ingresos después.

Restricciones: rechazar exige motivo; aprobar exige monto, plazo y tasa.

El trigger `solicitudes_sellar` asigna folio al salir de borrador y estampa las
fechas de envío y resolución.

### `avales` y `garantias`

El aval puede ser un socio existente (`socio_aval_id`) o una persona externa
capturada a mano. Las garantías registran tipo, descripción, valor estimado y
la ruta del avalúo.

### `creditos`

Créditos desembolsados. Las condiciones pactadas son inmutables; los saldos
(`saldo_capital`, `saldo_interes`, `saldo_moratorio`, `total_pagado`,
`dias_mora`) los mantienen las funciones de negocio.

> `saldo_capital` **no debe editarse a mano**. `registrar_pago` lo recalcula
> desde la tabla de amortización en cada aplicación, no por acumulación, para
> que un error puntual no se arrastre.

### `amortizaciones`

Una fila por cuota. Se genera al desembolsar y no se recalcula: los pagos solo
actualizan las columnas `*_pagado` y el `estado`.

| Plan pactado                                                | Ejecución real                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| `saldo_inicial`, `capital`, `interes`, `iva_interes`, `pago_programado`, `saldo_final` | `capital_pagado`, `interes_pagado`, `iva_pagado`, `moratorio_generado`, `moratorio_pagado`, `estado`, `fecha_liquidacion` |

### `pagos` y `aplicaciones_pago`

`pagos` es el ingreso de dinero con su desglose resultante.
`aplicaciones_pago` detalla cuánto de ese pago fue a cada cuota y a cada
concepto. Con esas dos tablas se puede reconstruir cualquier saldo histórico.

Un pago no se borra: se marca `cancelado` con motivo, y el ajuste contable se
registra aparte.

---

## Ahorro

### `productos_ahorro`

Instrumentos de captación: tasa, apertura mínima, plazo forzoso en días,
si permite retiro anticipado y con qué penalización.

### `cuentas_ahorro`

`saldo` es un espejo mantenido por trigger. No editar a mano.

### `movimientos_ahorro`

Libro **append-only**. El trigger `movimientos_ahorro_aplicar`:

1. Bloquea la fila de la cuenta con `FOR UPDATE` (dos cajeros simultáneos no
   leen el mismo saldo).
2. Determina el signo según el tipo.
3. Rechaza el retiro si no hay saldo suficiente.
4. Sella `saldo_posterior`, el folio y quién lo registró.
5. Actualiza el saldo de la cuenta.

El trigger `movimientos_ahorro_inmutable` impide UPDATE y DELETE. Un error se
corrige con un movimiento de signo contrario, nunca reescribiendo la historia.

---

## Contenido y operación

| Tabla                  | Para qué                                                              |
| ---------------------- | --------------------------------------------------------------------- |
| `entradas_blog`        | Artículos en Markdown, con slug único, categoría, etiquetas, SEO y contador de vistas. `autor_nombre` se conserva aunque el autor cause baja. |
| `testimonios`          | Testimonios de socios con calificación y orden.                       |
| `preguntas_frecuentes` | Banco de FAQ agrupado por categoría.                                  |
| `avisos`               | Comunicados con ventana de vigencia (`inicia_en`, `termina_en`).      |
| `notificaciones`       | Avisos dirigidos a una persona. Los generan las funciones de negocio mediante `privado.notificar()`. |
| `bitacora`             | Auditoría inmutable de las tablas sensibles.                          |
| `mensajes_contacto`    | Bandeja del formulario público.                                       |

### Auditoría

El trigger genérico `privado.auditar()` está enganchado a `socios`,
`solicitudes_credito`, `creditos`, `pagos`, `perfiles`, `productos_credito` y
`configuracion`. Guarda el estado completo antes y después en `jsonb`, junto con
quién lo hizo. Solo tiene política de SELECT: nadie puede alterarla desde la API.

---

## Vistas

Todas con `security_invoker = on`, para que hereden las políticas RLS de quien
consulta. Sin esa opción, una vista se ejecutaría con los permisos de su
propietario y sería una puerta trasera al padrón.

| Vista                   | Qué agrega                                                                  |
| ----------------------- | --------------------------------------------------------------------------- |
| `v_creditos_detalle`    | Crédito + socio + producto + próxima cuota + `porcentaje_amortizado`.       |
| `v_solicitudes_detalle` | Solicitud + datos del socio + `dias_en_espera` + `ingreso_disponible` + documentos verificados. |
| `v_cobranza`            | Cuotas abiertas con `dias_vencida` (negativo = aún no vence) y desglose de lo pendiente. |
| `v_socios_resumen`      | Padrón con posición consolidada de crédito y ahorro por socio.               |

## Funciones invocables desde la aplicación

| Función                                              | Devuelve  | Quién puede                       |
| ---------------------------------------------------- | --------- | --------------------------------- |
| `calcular_pago_periodico(monto, tasa, n, periodicidad)` | numeric | Cualquiera, incluso anónimo       |
| `generar_amortizacion(credito_id)`                   | integer   | Interno (lo llama el desembolso)  |
| `desembolsar_credito(solicitud_id, fecha, primer_pago)` | uuid   | gerente, admin                    |
| `registrar_pago(credito_id, monto, metodo, ref, fecha, notas)` | uuid | cajero, analista, gerente, admin |
| `actualizar_mora(fecha)`                             | tabla     | Personal (idealmente programada)  |
| `kpis_panel()`                                       | jsonb     | Personal                          |
| `serie_colocacion(meses)`                            | tabla     | Personal                          |

El detalle de las fórmulas está en
[07 · Motor de crédito](07-motor-de-credito.md).
