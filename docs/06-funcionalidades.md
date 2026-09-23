# 06 · Funcionalidades

Inventario de todo lo que hace el sistema. Las funcionalidades marcadas con ⭐
son las que pediste explícitamente; el resto se añadió para que las primeras
tengan sentido en operación real.

---

## Sitio público

### ⭐ Simulador de crédito · `/simulador`

- Selección de producto, monto y plazo con deslizadores.
- Cálculo instantáneo en el navegador: pago periódico, total de intereses,
  costo total y **CAT**.
- **Tabla de amortización completa** desplegable, cuota por cuota.
- **Análisis de capacidad de pago** opcional: la persona captura su ingreso y
  sus gastos, y el simulador le dice qué porcentaje de su ingreso disponible se
  llevaría el pago y cuál sería un monto más manejable.
- Formulario «prefiero que me llamen» que genera un prospecto en el panel.
- Cada simulación se asienta en la base como constancia de las condiciones
  mostradas.
- El servidor **recalcula** el resultado antes de guardarlo: nunca confía en las
  cifras del navegador.

### Catálogo de créditos · `/creditos`

Ficha por producto con montos, plazos, tasa ordinaria y moratoria, comisión,
requisitos, destinos permitidos, si exige aval o garantía, y un **ejemplo
concreto** de pago. Todo viene del CMS.

### Ahorro e inversión · `/ahorro`

Catálogo de instrumentos con rendimiento, apertura mínima, plazo forzoso y
penalización por retiro anticipado. Incluye una **calculadora de ahorro** que
proyecta el saldo con aportaciones periódicas y capitalización mensual, con
gráfica que separa lo aportado del rendimiento.

### Educación financiera · `/blog`

Artículos administrados desde el CMS, con filtro por categoría, paginación,
artículos relacionados y contador de vistas. El Markdown se convierte a HTML
escapando primero el HTML crudo, para que una cuenta comprometida no pueda
inyectar scripts.

### Otras páginas

| Ruta                     | Contenido                                                     |
| ------------------------ | ------------------------------------------------------------- |
| `/`                      | Portada con productos, pasos, ahorro, valores, testimonios y blog, todo desde el CMS |
| `/nosotros`              | Misión, visión y los seis principios cooperativos             |
| `/sucursales`            | Directorio con dirección, teléfono, horario y enlace al mapa   |
| `/preguntas-frecuentes`  | FAQ por categoría con índice lateral                          |
| `/contact`               | Formulario que alimenta la bandeja del panel, con campo trampa contra bots |
| `/terms`                 | Términos, condiciones y sección de transparencia              |
| `/aviso-de-privacidad`   | Aviso conforme a la LFPDPPP (modelo a revisar por jurídico)   |

Además, una **barra de avisos** superior muestra el comunicado vigente que se
administre desde el CMS.

---

## ⭐ Registro de socios con expediente digital

`/registro` · formulario de seis pasos que **guarda el avance en cada paso**: si
la persona cierra el navegador, vuelve a entrar y continúa donde se quedó.

| Paso | Qué captura                                                             |
| ---- | ----------------------------------------------------------------------- |
| 1    | Cuenta de acceso, nombre, **CURP**, teléfono, correo, contraseña       |
| 2    | Domicilio completo, tipo de vivienda, antigüedad, sucursal preferida   |
| 3    | Ocupación, escolaridad, estado civil, ingresos, egresos, dependientes, **RFC**, banco y CLABE |
| 4    | **Documentos**: INE frente y reverso, comprobante de domicilio (obligatorios); comprobante de ingresos, CURP, RFC, acta (opcionales) |
| 5    | Referencias personales (mínimo dos) y beneficiarios con porcentajes     |
| 6    | Aviso de privacidad, autorización de buró y resumen antes de enviar     |

**Validaciones reales, no cosméticas:**

- **CURP**: formato, entidad federativa válida, fecha de nacimiento existente,
  palabras inconvenientes y **dígito verificador** calculado con el algoritmo
  oficial. Al escribirla correctamente, la interfaz confirma en vivo la fecha de
  nacimiento y la edad que contiene.
- **RFC**: formato de persona física y coincidencia con la CURP en sus 10
  primeras posiciones (si no coinciden, no son la misma persona).
- **CLABE**: 18 dígitos con dígito de control ponderado 3-7-1.
- **Edad**: mayor de 18 años al día de hoy.
- **Beneficiarios**: los porcentajes deben sumar exactamente 100.

Los archivos suben al servidor y de ahí a un bucket privado: el navegador nunca
recibe credenciales de escritura. Límite de 10 MB, solo imágenes y PDF.

Antes de enviar el expediente, el servidor comprueba que estén los datos y
documentos mínimos y devuelve la lista de lo que falta.

---

## Portal del socio · `/portal`

| Pantalla                    | Qué ofrece                                                            |
| --------------------------- | --------------------------------------------------------------------- |
| Resumen                     | Deuda total, ahorro, próximo pago con cuenta regresiva, créditos activos, avisos según el estado del expediente |
| Mis créditos                | Créditos vigentes con barra de avance, e historial de los cerrados     |
| Detalle de crédito          | **Tabla de amortización completa**, desglose del saldo (capital / intereses / moratorios), historial de pagos aplicados y formas de pago |
| Mis solicitudes             | Estado de cada trámite; si fue rechazada, el motivo completo           |
| Detalle de solicitud        | Línea de tiempo del trámite y proyección de pagos                     |
| Nueva solicitud             | Formulario con simulación en vivo y **advertencia si el pago excede su capacidad declarada** |
| Ahorro                      | Saldos, avance hacia la meta y últimos movimientos                    |
| Documentos                  | Estado de revisión de cada documento y **motivo del rechazo**; permite resubir |
| Mi perfil                   | Edición de contacto, domicilio, actividad económica y datos bancarios |
| Notificaciones              | Bandeja que se marca leída al abrirse                                  |

---

## ⭐ Panel administrativo · `/admin`

CMS propio, sin dependencias de terceros. La navegación lateral se filtra por
rol: cada persona ve solo lo que puede usar.

### Tablero

Cartera total, colocación del mes, socios activos e **índice de morosidad** (en
rojo si supera el 5 %). Tarjetas de trabajo pendiente que enlazan a su bandeja:
solicitudes por dictaminar, documentos por validar, prospectos por llamar y
mensajes sin atender. Gráfica de colocación de los últimos 12 meses, captación
de ahorro y recuperación del mes. Cola de dictamen y cuotas más atrasadas.

### Socios

- Padrón con búsqueda por nombre, CURP, número de socio o teléfono; filtros por
  situación y por documentos pendientes; paginación.
- **Expediente completo**: identidad, domicilio, perfil económico, documentos,
  referencias, beneficiarios, historial de crédito y de solicitudes.
- **Validación de documentos**: se abren con enlace firmado de 5 minutos y se
  aprueban o rechazan con motivo; el socio recibe la notificación al instante.
- Cambio de situación del expediente con notificación automática.
- Score interno y notas internas que el socio nunca ve.
- Alta en ventanilla para quien llega sin registrarse en línea.

### Solicitudes

Cola ordenada por antigüedad de espera. En el detalle, el analista ve la
capacidad de pago calculada, el ingreso disponible, cuántos documentos están
validados, cuántos créditos activos tiene y su comportamiento de pago anterior.

Alertas automáticas si el pago excede la capacidad de pago del producto o si el
expediente no está activo.

Puede **tomar** la solicitud (queda a su nombre), **aprobar** con monto, plazo y
tasa distintos a los solicitados, o **rechazar** con un motivo que el socio verá
tal cual. Gerencia desembolsa desde la misma pantalla.

### Cartera

Listado con filtros y búsqueda, ordenado por días de mora. En el detalle:
registro de pagos con monto sugerido (el adeudo exigible al día, no solo la
próxima cuota), tabla de amortización con las cuotas vencidas resaltadas,
historial de pagos, cancelación de pagos con motivo (solo gerencia) y recálculo
de mora bajo demanda.

### Cobranza

Antigüedad de saldos por tramos (1-30, 31-90, +90 días) con su monto. Lista de
trabajo con teléfono del socio como enlace directo para llamar. Botón para
recalcular la mora de toda la cartera.

### Ahorro

Apertura de cuentas, registro de depósitos, retiros, intereses y comisiones, con
libro de movimientos. El sistema rechaza retiros sin saldo suficiente y bloquea
la cuenta durante la operación para evitar condiciones de carrera.

### Productos

CRUD completo de productos de crédito y de ahorro: montos, plazos, tasas,
comisiones, periodicidad, capacidad de pago, requisitos y destinos. Cambiar una
tasa se refleja de inmediato en el simulador; **los créditos ya desembolsados
conservan la suya**.

### Contenido del sitio

Cuatro pestañas: artículos (editor Markdown con SEO y destacados), testimonios,
preguntas frecuentes y avisos con ventana de vigencia.

### Mensajes y prospectos

Bandeja del formulario de contacto con nota de seguimiento, y lista de quienes
pidieron ser llamados desde el simulador, con las condiciones que simularon.

### Personal

Alta de cuentas de personal con rol y sucursal, cambio de rol y activación o
desactivación. Un administrador no puede degradarse ni desactivarse a sí mismo.

### Configuración

Parámetros del sistema agrupados: IVA sobre intereses, días de gracia, capacidad
de pago máxima, aportación social, datos institucionales y de contacto.

### Bitácora

Auditoría de todas las operaciones sensibles, con filtros por tabla y acción, y
la lista de campos que cambió cada movimiento.

---

## Funcionalidades transversales

- **Notificaciones automáticas** al socio en cada hito: documento validado o
  rechazado, dictamen de solicitud, desembolso, pago registrado.
- **Folios consecutivos** por tipo y año (`SOC-2026-000123`, `SOL-…`, `CRE-…`,
  `PAG-…`, `AHO-…`, `MOV-…`), a prueba de concurrencia.
- **Modo oscuro** en todo el sistema.
- **Accesibilidad**: navegación por teclado, `aria-current` en menús,
  `aria-invalid` en campos con error, `role="alert"` en mensajes, textos
  alternativos en gráficas.
- **Funciona sin JavaScript** en acceso, contacto, perfil y todos los
  formularios del panel: se procesan como POST del servidor.

---

## Pendientes

Cosas que quedaron fuera y conviene resolver antes de operar con dinero real.

### Requieren una decisión de la cooperativa

1. **Isotipo oficial.** El actual es provisional. Ver
   [05 · Identidad corporativa](05-identidad-corporativa.md).
2. **Condiciones reales de los productos.** Las del seed son plausibles pero
   inventadas. Deben capturarse las autorizadas por el Consejo.
3. **Revisión jurídica** del aviso de privacidad y de los términos.
4. **Datos institucionales**: RFC, domicilio fiscal, denominación exacta,
   teléfonos y correos reales en `/admin/configuracion`.

### Trabajo técnico pendiente

5. **Programar `actualizar_mora()`** para que corra a diario. Hoy se ejecuta a
   mano desde `/admin/cobranza`. Ver
   [10 · Operación diaria](10-operacion-diaria.md).
6. **Correos transaccionales.** Las notificaciones son internas (bandeja del
   portal). Enviarlas también por correo requiere conectar un proveedor SMTP en
   Supabase Auth y añadir un servicio de envío.
7. **Generación de contratos en PDF.** Hoy el contrato se imprime fuera del
   sistema. Sería el siguiente paso natural.
8. **Exportación a CSV/Excel** de padrón, cartera y cobranza.
9. **Reestructuración de créditos.** No hay flujo para renegociar un crédito en
   mora; se resuelve fuera del sistema.
10. **Capitalización automática de intereses de ahorro.** Hoy se registran como
    movimiento manual del tipo `interes`.
11. **Cancelación de pagos con reversa automática.** Marcar un pago como
    cancelado no revierte los saldos: el aviso lo dice explícitamente y pide
    registrar el ajuste con contabilidad.
12. **Autenticación de dos factores** para cuentas de personal.
