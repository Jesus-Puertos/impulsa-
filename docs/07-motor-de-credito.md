# 07 · Motor de crédito

Las fórmulas que gobiernan el dinero, y por qué están donde están.

## Dónde vive cada cosa

| Implementación                                      | Para qué sirve                                         |
| --------------------------------------------------- | ------------------------------------------------------ |
| [`../supabase/migrations/20260809100700_motor_de_credito.sql`](../supabase/migrations/20260809100700_motor_de_credito.sql) | **La verdad.** Genera amortizaciones, desembolsa, aplica pagos y calcula mora. |
| [`../src/lib/credito.ts`](../src/lib/credito.ts)     | **Espejo.** Simulación instantánea y verificación en el servidor. |

La fuente de verdad de un crédito desembolsado es siempre la tabla
`amortizaciones`. El módulo TypeScript solo proyecta escenarios.

> **Si cambias una fórmula, cámbiala en los dos lados.** Un desfase entre lo que
> el simulador promete y lo que la base cobra destruye la confianza del socio.

---

## Sistema francés: cuota fija

El pago es el mismo en cada periodo; lo que cambia es su composición.

```
              P · i
     A = ─────────────────
          1 − (1 + i)^−n
```

| Símbolo | Significado                                                        |
| ------- | ------------------------------------------------------------------ |
| `A`     | Pago periódico (la cuota fija)                                     |
| `P`     | Monto principal                                                    |
| `i`     | Tasa **por periodo** = `tasa_anual / 100 / periodos_por_año`       |
| `n`     | Número de periodos                                                 |

Cuando la tasa es cero, la fórmula se indetermina y se reduce a `A = P / n`.
Ambas implementaciones contemplan ese caso.

### Periodos por año

| Periodicidad | Periodos/año | Avance de fecha |
| ------------ | ------------ | --------------- |
| Semanal      | 52           | +7 días         |
| Catorcenal   | 26           | +14 días        |
| Quincenal    | 24           | +15 días        |
| Mensual      | 12           | +1 mes          |

El avance quincenal usa 15 días fijos, que es la práctica habitual en cartera de
crédito popular. Cuando la cooperativa necesite cobrar los días 15 y último de
cada mes, se ajusta eligiendo la fecha de primer pago al desembolsar.

### Ejemplo

Crédito de $30,000 a 24 meses con tasa anual del 28 %:

```
i = 0.28 / 12 = 0.0233333
A = 30000 × 0.0233333 / (1 − 1.0233333^−24) = 1,647.53
```

---

## Tabla de amortización

Los intereses se calculan **sobre saldos insolutos**: sobre lo que realmente se
debe en cada momento, no sobre el monto original.

Para cada cuota `k`:

```
interés_k  = saldo_k × i
IVA_k      = interés_k × iva_intereses_pct        (0 mientras estén exentos)
capital_k  = A − interés_k
saldo_k+1  = saldo_k − capital_k
```

**La última cuota liquida el saldo restante completo** en lugar de aplicar la
fórmula. Los redondeos a dos decimales de cada periodo acumulan una diferencia
de algunos centavos; sin este ajuste el crédito quedaría con saldo residual para
siempre.

Continuando el ejemplo:

| Cuota | Saldo inicial | Capital  | Interés | Pago     | Saldo final |
| ----- | ------------- | -------- | ------- | -------- | ----------- |
| 1     | 30,000.00     | 947.53   | 700.00  | 1,647.53 | 29,052.47   |
| 2     | 29,052.47     | 969.64   | 677.89  | 1,647.53 | 28,082.83   |
| …     |               |          |         |          |             |
| 24    | 1,610.00      | 1,610.00 | 37.57   | 1,647.57 | 0.00        |

Al principio la mayor parte del pago son intereses; conforme baja el saldo, la
proporción se invierte. **Por eso adelantar pagos ahorra dinero de verdad.**

### Salvaguarda

Si `capital_k` resulta ≤ 0, la cuota no alcanza a cubrir el interés del periodo
y el crédito nunca amortizaría. La función lanza una excepción con el número de
cuota, en lugar de generar una tabla imposible.

---

## CAT — Costo Anual Total

El CAT es la tasa que iguala el valor presente de todos los pagos con **lo que
el socio recibe de verdad** (monto menos comisión de apertura), anualizada.

```
Σ [ pago_k / (1 + r)^k ] = monto − comisión_apertura
CAT = ((1 + r)^periodos_por_año − 1) × 100
```

Se resuelve por **bisección**, no por Newton-Raphson: la bisección converge
siempre dentro de un rango acotado, mientras que Newton-Raphson puede divergir
con tasas altas o flujos irregulares. En un dato que se publica al socio, la
robustez importa más que la velocidad.

Implementado en `calcularCat()` de [`../src/lib/credito.ts`](../src/lib/credito.ts),
con 200 iteraciones y tolerancia de 1e-12 sobre un rango de 0 % a 300 % por
periodo.

> **Nota de cumplimiento.** El CAT que muestra el sistema incluye tasa de
> interés y comisión de apertura. Si la cooperativa añade seguros obligatorios u
> otros cargos, deben incorporarse al cálculo para que el CAT publicado sea
> correcto.

---

## Capacidad de pago

Antes de comprometer a alguien, se comprueba que el pago quepa en su
presupuesto.

```
ingreso_disponible = ingreso_mensual + otros_ingresos − egresos_mensuales
pago_mensualizado  = pago_periódico × (periodos_por_año / 12)
razón              = pago_mensualizado / ingreso_disponible
```

Todo se lleva a base mensual porque el ingreso siempre se declara mensual,
mientras que los productos pueden ser quincenales o semanales.

Si `razón > factor_capacidad_pago` del producto, el sistema advierte y calcula
el monto máximo recomendado invirtiendo la fórmula de la anualidad:

```
P_max = A_max × (1 − (1 + i)^−n) / i
```

La advertencia **no bloquea**: la decisión final es del analista, pero tanto él
como el socio la ven antes de firmar nada.

Valores típicos: 0.30 para crédito emergente, 0.35 para personal y vivienda,
0.40 para productivo y agrícola. El tope institucional está en la configuración
como `capacidad_pago_maxima`.

---

## Aplicación de pagos

`registrar_pago(credito_id, monto, metodo, referencia, fecha, notas)`

### Orden de imputación

De la cuota **más antigua** a la más reciente, y dentro de cada cuota:

1. Intereses **moratorios**
2. **IVA** de intereses
3. Intereses **ordinarios**
4. **Capital**

Este orden protege al socio: liquida primero lo que sigue generando cargo. Si se
aplicara primero a capital, los moratorios seguirían creciendo.

### Qué hace la función, paso a paso

1. Verifica el rol (cajero o superior) y que el monto sea positivo.
2. Bloquea la fila del crédito con `SELECT … FOR UPDATE`. **Dos cajeros
   cobrando al mismo tiempo no producen saldos inconsistentes.**
3. Crea el registro en `pagos`.
4. Recorre las cuotas abiertas aplicando el orden anterior, y escribe en
   `aplicaciones_pago` el detalle de cuánto fue a cada concepto de cada cuota.
5. Actualiza el estado de cada cuota (`pagada` o `parcial`).
6. **Recalcula los saldos del crédito desde la amortización**, no por
   acumulación: así un error puntual no se arrastra.
7. Si no queda capital, intereses ni moratorios, marca el crédito `liquidado`.
8. Notifica al socio.

Todo ocurre en una sola transacción. Si algo falla, no queda un pago a medias.

### Excedente

Si el pago supera el adeudo total, la diferencia se guarda en `pagos.excedente`
y no se aplica. Queda visible para devolverla o abonarla a otro crédito.

---

## Interés moratorio

`actualizar_mora(fecha)` — pensada para ejecutarse **una vez al día**.

```
moratorio = capital_vencido × (tasa_moratoria_anual / 100 / 365) × días_de_atraso
```

Interés simple sobre el capital vencido, contando desde el vencimiento **más los
días de gracia** (parámetro `dias_gracia_mora`, por omisión 3).

La función:

1. Marca como `vencida` toda cuota con vencimiento pasado que no esté pagada.
2. Recalcula `moratorio_generado` de cada una.
3. Fija `dias_mora` del crédito según la cuota vencida más antigua sin liquidar.
4. Reclasifica el crédito: `atrasado` si supera los días de gracia, `vigente` si
   se puso al corriente.

> **Debe programarse.** Mientras no corra, la mora no se acumula y los créditos
> atrasados no aparecen en cobranza. Ver
> [10 · Operación diaria](10-operacion-diaria.md).

---

## Desembolso

`desembolsar_credito(solicitud_id, fecha_desembolso, fecha_primer_pago)`

1. Verifica que quien llama sea gerente o admin.
2. Verifica que la solicitud esté **aprobada**.
3. Calcula la cuota con el monto, plazo y tasa **autorizados** (no los
   solicitados).
4. Crea el crédito con la comisión de apertura calculada.
5. Llama a `generar_amortizacion`, que crea todas las cuotas.
6. Marca la solicitud como `desembolsada`.
7. Notifica al socio con el monto y la fecha de su primer pago.

Si no se indica fecha de primer pago, se toma un periodo después del desembolso.

Todo en una transacción: **nunca existe un crédito sin tabla de amortización**.

---

## IVA sobre intereses

El parámetro `iva_intereses_pct` está en `configuracion` y por omisión es **0**,
porque los intereses de crédito cooperativo a personas físicas suelen estar
exentos.

Se dejó configurable por si la figura fiscal de la cooperativa cambia. Al
modificarlo, las tablas de amortización **ya generadas no cambian**: conservan el
IVA con el que se pactaron. Solo aplica a créditos nuevos.

---

## Redondeo

Todos los importes se redondean a **dos decimales** en cada paso, usando
`numeric(14, 2)` en PostgreSQL y `Math.round(x * 100) / 100` en TypeScript.

`numeric` es decimal exacto. Nunca uses `float` o `double precision` para
dinero: el redondeo binario produce centavos fantasma que, multiplicados por
miles de cuotas, descuadran la contabilidad.

---

## Cómo verificar que el motor está bien

```sql
-- 1. Las cuotas deben sumar exactamente el capital prestado
select
  c.folio,
  c.monto_principal,
  sum(a.capital) as capital_amortizado,
  c.monto_principal - sum(a.capital) as diferencia   -- debe ser 0.00
from creditos c
join amortizaciones a on a.credito_id = c.id
group by c.id, c.folio, c.monto_principal
having abs(c.monto_principal - sum(a.capital)) > 0.01;

-- 2. La última cuota debe dejar saldo cero
select credito_id, numero_cuota, saldo_final
from amortizaciones a
where numero_cuota = (
  select max(numero_cuota) from amortizaciones where credito_id = a.credito_id
) and saldo_final <> 0;

-- 3. Lo aplicado en cada pago debe cuadrar con su desglose
select
  p.folio,
  p.monto,
  p.capital_aplicado + p.interes_aplicado + p.iva_aplicado
    + p.moratorio_aplicado + p.excedente as suma_desglose
from pagos p
where not p.cancelado
  and abs(p.monto - (p.capital_aplicado + p.interes_aplicado + p.iva_aplicado
        + p.moratorio_aplicado + p.excedente)) > 0.01;
```

Las tres consultas deben devolver **cero filas**. Si alguna devuelve algo, hay
un problema en el motor: no sigas operando hasta resolverlo.
