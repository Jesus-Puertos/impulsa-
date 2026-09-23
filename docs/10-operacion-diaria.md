# 10 · Operación diaria

Manual de uso para el personal de la cooperativa.

## Rutina de cada día

### Al abrir

1. Entra a `/admin`. El tablero muestra las cuatro bandejas de trabajo
   pendiente.
2. Atiende en este orden:
   - **Documentos por validar** — bloquean expedientes completos
   - **Solicitudes por dictaminar** — ordenadas por antigüedad de espera
   - **Prospectos por llamar** — gente que pidió que la contactaran
   - **Mensajes sin atender**
3. Revisa **Cobranza**. Si el tramo de +90 días creció, avisa a gerencia.

### Al cerrar

1. Verifica que los pagos del día estén registrados: `/admin/creditos`, filtro
   **Activos**, y compara con el corte de caja.
2. Comprueba que los movimientos de ahorro cuadren con el efectivo.
3. Si `actualizar_mora()` no está programada, ejecútala desde
   **Cobranza → Recalcular mora**.

---

## Flujos completos

### Dar de alta un socio en ventanilla

`/admin/socios` → **Registrar socio**

1. Captura los datos mínimos. La fecha de nacimiento y el género se deducen de
   la CURP; no hace falta capturarlos.
2. Marca la casilla del aviso de privacidad **solo si el socio ya lo firmó en
   papel**.
3. Al guardar, entras al expediente. Sube ahí sus documentos.
4. Valida cada documento contra el original que trae en mano.
5. Cambia la situación a **Activo**. En ese momento se le asigna número de socio
   y fecha de alta automáticamente.

> Si el socio quiere acceso al portal, dile que se registre en `/registro` con
> **la misma CURP**. El sistema lo enlazará con su expediente.

### Validar el expediente de alguien que se registró en línea

`/admin/socios` → filtro **En revisión**

1. Abre el expediente y revisa los datos capturados.
2. En **Documentos del expediente**, pulsa **Ver** en cada uno. Se abre en una
   pestaña nueva con un enlace que caduca en 5 minutos.
3. Comprueba que la foto sea legible, esté vigente y los datos coincidan con lo
   capturado.
4. **Validar** o **Rechazar**. Si rechazas, escribe un motivo concreto: el socio
   lo verá tal cual en su portal.

   ✅ «La foto está borrosa y no se lee la CURP. Tómala con más luz.»
   ❌ «Documento incorrecto.»

5. Llama a las dos referencias personales y márcalas como verificadas.
6. Con todo validado, cambia la situación a **Activo**.

### Dictaminar una solicitud

`/admin/solicitudes` → **Por dictaminar**

1. Abre la solicitud. Pulsa **Tomar esta solicitud** para que quede a tu nombre.
2. Revisa las cuatro tarjetas superiores:
   - **Pago / ingreso libre** — en rojo si supera el límite del producto
   - **Ingreso disponible** — lo que le queda tras sus gastos declarados
   - **Documentos validados** — deberían ser al menos tres
   - **Créditos activos** — cuántos tiene ya
3. Mira **Comportamiento de pago anterior**. Un historial con mora es la señal
   más útil que tienes.
4. Decide:

   **Autorizar.** Puedes cambiar monto, plazo o tasa. Si la capacidad de pago
   está excedida, autoriza el monto máximo recomendado en lugar de rechazar: el
   socio recibe algo útil y la cartera queda sana.

   **Rechazar.** El motivo debe ser claro y respetuoso, y decirle qué puede
   hacer:

   ✅ «El pago solicitado supera tu capacidad de pago actual. Podemos revisar un
   monto de hasta $18,000, o esperar a que liquides tu crédito vigente.»
   ❌ «No cumple con los requisitos.»

5. El socio recibe la notificación al instante.

### Desembolsar

Solo gerencia. En la solicitud aprobada:

1. Verifica que el socio ya firmó el contrato.
2. Captura la fecha de desembolso.
3. La fecha del primer pago es opcional; si la dejas vacía, se toma un periodo
   después.
4. Pulsa **Desembolsar**.

El sistema crea el crédito y su tabla de amortización completa, y notifica al
socio con el monto y la fecha de su primer pago.

> **Esta operación no se puede deshacer desde el panel.** Verifica los datos
> antes de confirmar.

### Registrar un pago

`/admin/creditos` → busca el socio → **Abrir**

1. El campo de monto viene con el **adeudo exigible al día**, que puede ser más
   de una cuota si hay atraso. Ajústalo a lo que realmente recibiste.
2. Elige la forma de pago y captura la referencia (folio bancario o de caja).
3. **Registrar y aplicar**.

El pago se imputa automáticamente a las cuotas más antiguas, cubriendo primero
moratorios, luego intereses y al final capital. El desglose queda visible en la
tabla de pagos.

Si el pago excede el adeudo total, la diferencia queda como **excedente** y no se
aplica: devuélvela o abónala a otro crédito.

### Corregir un pago mal registrado

Solo gerencia puede cancelarlo, y **la cancelación no revierte los saldos
automáticamente**. Procedimiento:

1. Cancela el pago escribiendo el motivo.
2. Avisa a contabilidad para el ajuste correspondiente.
3. Registra el pago correcto.

### Trabajar la cobranza

`/admin/cobranza`

Las tres tarjetas superiores muestran la antigüedad de saldos. Filtra por tramo
y trabaja de arriba hacia abajo.

El teléfono de cada socio es un enlace directo para llamar desde el celular.

Guía de contacto por tramo:

| Tramo       | Qué hacer                                                       |
| ----------- | --------------------------------------------------------------- |
| Por vencer  | Recordatorio amable dos o tres días antes                       |
| 1-30 días   | Llamada. Casi siempre es olvido o un imprevisto pasajero        |
| 31-90 días  | Llamada y visita. Ofrece reestructurar antes de que empeore     |
| +90 días    | Escala a gerencia. Valorar convenio o recuperación de garantía  |

> La mora se recalcula con `actualizar_mora()`. Si no está programada, ejecútala
> a diario con el botón **Recalcular mora**; de lo contrario los moratorios no se
> acumulan y los créditos atrasados no aparecen aquí.

### Abrir una cuenta de ahorro

`/admin/ahorro` → **Abrir cuenta**

Solo socios **activos**. Elige el instrumento y, si es ahorro programado,
captura la meta. Después registra el depósito de apertura con **Operar**.

El sistema rechaza retiros sin saldo suficiente y bloquea la cuenta durante la
operación, así que dos cajeros no pueden descuadrarla.

Un movimiento registrado **no se puede editar ni borrar**. Si te equivocas,
registra un movimiento en sentido contrario con la nota correspondiente.

### Publicar un artículo

`/admin/contenido` → pestaña **Artículos** → **Crear nuevo**

- El slug se genera del título si lo dejas vacío.
- El contenido va en Markdown: `##` para subtítulos, `**negritas**`, `-` para
  listas.
- Guárdalo primero como **Borrador** y revísalo antes de publicar.
- Al pasarlo a **Publicado** aparece de inmediato en el sitio.

### Cambiar una tasa

`/admin/productos` → **Editar** en el producto

El cambio aplica a **simulaciones y solicitudes nuevas**. Los créditos ya
desembolsados conservan la tasa con la que se pactaron: eso es correcto y es
también una obligación contractual.

> Cambia tasas solo con acuerdo del Consejo de Administración. El cambio queda
> registrado en la bitácora con tu nombre y la fecha.

---

## Calendario de mantenimiento

| Frecuencia | Tarea                                                                |
| ---------- | -------------------------------------------------------------------- |
| Diario     | Recalcular mora (idealmente automático) · Revisar bandejas pendientes |
| Semanal    | Revisar cartera vencida por tramo · Contactar prospectos sin llamar   |
| Mensual    | Conciliar cartera contra contabilidad · Ejecutar las consultas de verificación de [07](07-motor-de-credito.md) · Revisar la bitácora |
| Trimestral | Revisar tasas y condiciones con el Consejo · Verificar copias de seguridad · Revisar cuentas de personal activas |
| Anual      | Revisar aviso de privacidad y términos · Depurar prospectos antiguos  |

---

## Preguntas del personal

**Un socio dice que pagó y no aparece.**
Busca el crédito y revisa **Pagos registrados**. Si el pago fue por
transferencia, quizá aún no se ha capturado. Verifica con caja antes de decirle
al socio que no pagó.

**El socio no recuerda su contraseña.**
Que use «¿Olvidaste tu contraseña?» en `/acceso`. Si ya no tiene acceso a su
correo, actualízalo en su expediente desde el panel y pídele que lo intente de
nuevo.

**Un documento subido está borroso.**
Recházalo con un motivo específico. El socio lo verá en su portal y podrá
resubirlo sin acudir a sucursal.

**El socio quiere pagar todo su crédito hoy.**
El campo **Total a liquidar hoy** del detalle del crédito ya incluye capital,
intereses y moratorios. No hay penalización por pago anticipado.

**¿Cómo sé quién aprobó una solicitud?**
El expediente muestra el analista, y `/admin/bitacora` guarda cada cambio con
quién lo hizo y cuándo.

**Se fue un compañero de la cooperativa.**
Desactiva su cuenta en `/admin/usuarios`. **No la borres**: se perdería el
rastro de los expedientes que dictaminó.
