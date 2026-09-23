-- =============================================================================
-- 20260809100700_motor_de_credito.sql
-- Reglas de negocio del credito, escritas en la base de datos a proposito:
-- generar una tabla de amortizacion o aplicar un pago tiene que producir el
-- mismo resultado venga de /admin, de un script o de un proceso programado, y
-- tiene que ser atomico. Ver `docs/07-motor-de-credito.md` para las formulas.
-- =============================================================================

-- =============================================================================
-- CALCULO DEL PAGO PERIODICO (sistema frances)
--
--            P * i
--   A = -----------------      i = tasa_anual / 100 / periodos_por_anio
--        1 - (1 + i)^-n        n = numero de periodos
--
-- Si la tasa es cero la cuota es simplemente el capital entre los periodos.
-- =============================================================================
create or replace function calcular_pago_periodico(
  p_monto        numeric,
  p_tasa_anual   numeric,
  p_periodos     integer,
  p_periodicidad periodicidad_pago
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_i numeric;
begin
  if p_monto <= 0 or p_periodos <= 0 then
    raise exception 'Monto y plazo deben ser mayores que cero';
  end if;

  v_i := (p_tasa_anual / 100.0) / privado.periodos_por_anio(p_periodicidad);

  if v_i = 0 then
    return round(p_monto / p_periodos, 2);
  end if;

  return round(p_monto * v_i / (1 - power(1 + v_i, -p_periodos)), 2);
end;
$$;

comment on function calcular_pago_periodico is
  'Cuota fija del sistema frances para un monto, tasa anual y numero de periodos.';

grant execute on function calcular_pago_periodico to anon, authenticated;

-- =============================================================================
-- GENERACION DE LA TABLA DE AMORTIZACION
-- Los intereses se calculan sobre saldos insolutos. La ultima cuota absorbe el
-- residuo de redondeo para que el saldo final sea exactamente cero.
-- =============================================================================
create or replace function generar_amortizacion(p_credito_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, privado
as $$
declare
  v_credito   creditos%rowtype;
  v_i         numeric;
  v_iva_pct   numeric;
  v_saldo     numeric(14, 2);
  v_interes   numeric(14, 2);
  v_iva       numeric(14, 2);
  v_capital   numeric(14, 2);
  v_pago      numeric(14, 2);
  v_fecha     date;
  v_total_intereses numeric(14, 2) := 0;
  k integer;
begin
  select * into v_credito from creditos where id = p_credito_id for update;
  if not found then
    raise exception 'El credito % no existe', p_credito_id;
  end if;

  if exists (select 1 from amortizaciones where credito_id = p_credito_id) then
    raise exception 'El credito % ya tiene tabla de amortizacion', v_credito.folio;
  end if;

  v_i := (v_credito.tasa_anual / 100.0) / privado.periodos_por_anio(v_credito.periodicidad);
  -- Los intereses de credito cooperativo a personas fisicas suelen estar
  -- exentos de IVA; el parametro queda configurable por si la figura fiscal
  -- de la cooperativa cambia.
  v_iva_pct := privado.config_numero('iva_intereses_pct', 0) / 100.0;

  v_saldo := v_credito.monto_principal;

  for k in 1 .. v_credito.plazo_periodos loop
    v_fecha := privado.sumar_periodos(v_credito.fecha_primer_pago, v_credito.periodicidad, k - 1);

    v_interes := round(v_saldo * v_i, 2);
    v_iva     := round(v_interes * v_iva_pct, 2);

    if k = v_credito.plazo_periodos then
      -- Ultima cuota: liquida el saldo restante sin dejar centavos colgando.
      v_capital := v_saldo;
    else
      v_capital := round(v_credito.pago_periodico - v_interes, 2);
      -- Si la cuota no alcanza a cubrir el interes el credito nunca amortiza.
      if v_capital <= 0 then
        raise exception 'La cuota (%) no cubre el interes del periodo % (%). Revise tasa y plazo.',
          v_credito.pago_periodico, k, v_interes;
      end if;
      if v_capital > v_saldo then
        v_capital := v_saldo;
      end if;
    end if;

    v_pago := v_capital + v_interes + v_iva;
    v_total_intereses := v_total_intereses + v_interes;

    insert into amortizaciones (
      credito_id, numero_cuota, fecha_vencimiento,
      saldo_inicial, capital, interes, iva_interes, pago_programado, saldo_final
    ) values (
      p_credito_id, k, v_fecha,
      v_saldo, v_capital, v_interes, v_iva, v_pago, v_saldo - v_capital
    );

    v_saldo := v_saldo - v_capital;
  end loop;

  update creditos set
    saldo_capital     = v_credito.monto_principal,
    total_intereses   = v_total_intereses,
    fecha_vencimiento = privado.sumar_periodos(
                          v_credito.fecha_primer_pago,
                          v_credito.periodicidad,
                          v_credito.plazo_periodos - 1)
  where id = p_credito_id;

  return v_credito.plazo_periodos;
end;
$$;

comment on function generar_amortizacion is
  'Crea las cuotas del credito y fija su saldo inicial. Falla si ya existen.';

-- =============================================================================
-- DESEMBOLSO
-- Convierte una solicitud aprobada en un credito vigente con su plan de pagos.
-- =============================================================================
create or replace function desembolsar_credito(
  p_solicitud_id     uuid,
  p_fecha_desembolso date default current_date,
  p_fecha_primer_pago date default null
)
returns uuid
language plpgsql
security definer
set search_path = public, privado
as $$
declare
  v_sol      solicitudes_credito%rowtype;
  v_prod     productos_credito%rowtype;
  v_credito_id uuid;
  v_pago     numeric(14, 2);
  v_primer_pago date;
  v_perfil_id uuid;
begin
  if not privado.tiene_rol('gerente', 'admin') then
    raise exception 'Solo gerencia o administracion pueden desembolsar creditos';
  end if;

  select * into v_sol from solicitudes_credito where id = p_solicitud_id for update;
  if not found then
    raise exception 'La solicitud % no existe', p_solicitud_id;
  end if;

  if v_sol.estado <> 'aprobada' then
    raise exception 'Solo se desembolsan solicitudes aprobadas (estado actual: %)', v_sol.estado;
  end if;

  select * into v_prod from productos_credito where id = v_sol.producto_id;

  -- Por omision el primer pago vence un periodo despues del desembolso.
  v_primer_pago := coalesce(
    p_fecha_primer_pago,
    privado.sumar_periodos(p_fecha_desembolso, v_sol.periodicidad, 1)
  );

  v_pago := calcular_pago_periodico(
    v_sol.monto_aprobado, v_sol.tasa_aplicada, v_sol.plazo_aprobado, v_sol.periodicidad
  );

  insert into creditos (
    solicitud_id, socio_id, producto_id, sucursal_id,
    monto_principal, tasa_anual, tasa_moratoria_anual, plazo_periodos, periodicidad,
    comision_apertura, pago_periodico,
    fecha_desembolso, fecha_primer_pago, desembolsado_por
  ) values (
    v_sol.id, v_sol.socio_id, v_sol.producto_id, v_sol.sucursal_id,
    v_sol.monto_aprobado, v_sol.tasa_aplicada, v_prod.tasa_moratoria_anual,
    v_sol.plazo_aprobado, v_sol.periodicidad,
    round(v_sol.monto_aprobado * v_prod.comision_apertura_pct / 100.0, 2), v_pago,
    p_fecha_desembolso, v_primer_pago, auth.uid()
  )
  returning id into v_credito_id;

  perform generar_amortizacion(v_credito_id);

  update solicitudes_credito set estado = 'desembolsada' where id = p_solicitud_id;

  select perfil_id into v_perfil_id from socios where id = v_sol.socio_id;
  perform privado.notificar(
    v_perfil_id,
    'Tu crédito fue desembolsado',
    format('Se depositaron $%s. Tu primer pago vence el %s.',
           to_char(v_sol.monto_aprobado, 'FM999,999,990.00'),
           to_char(v_primer_pago, 'DD/MM/YYYY')),
    'exito',
    '/portal/creditos/' || v_credito_id
  );

  return v_credito_id;
end;
$$;

comment on function desembolsar_credito is
  'Crea el credito y su amortizacion a partir de una solicitud aprobada.';

-- =============================================================================
-- APLICACION DE PAGOS
--
-- Orden de imputacion, de la cuota mas antigua a la mas reciente:
--   1. intereses moratorios
--   2. IVA de intereses
--   3. intereses ordinarios
--   4. capital
--
-- Este orden protege al socio: liquida primero lo que sigue generando cargo.
-- Todo el reparto queda asentado en `aplicaciones_pago`.
-- =============================================================================
create or replace function registrar_pago(
  p_credito_id uuid,
  p_monto      numeric,
  p_metodo     metodo_pago default 'efectivo',
  p_referencia text default null,
  p_fecha      date default current_date,
  p_notas      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, privado
as $$
declare
  v_credito creditos%rowtype;
  v_cuota   amortizaciones%rowtype;
  v_pago_id uuid;
  v_resto   numeric(14, 2) := p_monto;
  v_aplica  numeric(14, 2);
  v_ap_capital numeric(14, 2);
  v_ap_interes numeric(14, 2);
  v_ap_iva     numeric(14, 2);
  v_ap_mora    numeric(14, 2);
  v_tot_capital numeric(14, 2) := 0;
  v_tot_interes numeric(14, 2) := 0;
  v_tot_iva     numeric(14, 2) := 0;
  v_tot_mora    numeric(14, 2) := 0;
  v_perfil_id uuid;
begin
  if not privado.tiene_rol('cajero', 'analista', 'gerente', 'admin') then
    raise exception 'No tiene permiso para registrar pagos';
  end if;

  if p_monto <= 0 then
    raise exception 'El monto del pago debe ser mayor que cero';
  end if;

  select * into v_credito from creditos where id = p_credito_id for update;
  if not found then
    raise exception 'El credito % no existe', p_credito_id;
  end if;

  if v_credito.estado in ('liquidado', 'cancelado') then
    raise exception 'El credito % esta % y no admite pagos', v_credito.folio, v_credito.estado;
  end if;

  insert into pagos (credito_id, socio_id, sucursal_id, monto, metodo, referencia, fecha_pago, notas)
  values (p_credito_id, v_credito.socio_id, v_credito.sucursal_id,
          p_monto, p_metodo, p_referencia, p_fecha, p_notas)
  returning id into v_pago_id;

  for v_cuota in
    select * from amortizaciones
    where credito_id = p_credito_id
      and estado in ('pendiente', 'parcial', 'vencida')
    order by numero_cuota
    for update
  loop
    exit when v_resto <= 0;

    v_ap_capital := 0; v_ap_interes := 0; v_ap_iva := 0; v_ap_mora := 0;

    -- 1. moratorios
    v_aplica := least(v_resto, v_cuota.moratorio_generado - v_cuota.moratorio_pagado);
    if v_aplica > 0 then
      v_ap_mora := v_aplica;
      v_resto := v_resto - v_aplica;
    end if;

    -- 2. IVA de intereses
    v_aplica := least(v_resto, v_cuota.iva_interes - v_cuota.iva_pagado);
    if v_aplica > 0 then
      v_ap_iva := v_aplica;
      v_resto := v_resto - v_aplica;
    end if;

    -- 3. intereses ordinarios
    v_aplica := least(v_resto, v_cuota.interes - v_cuota.interes_pagado);
    if v_aplica > 0 then
      v_ap_interes := v_aplica;
      v_resto := v_resto - v_aplica;
    end if;

    -- 4. capital
    v_aplica := least(v_resto, v_cuota.capital - v_cuota.capital_pagado);
    if v_aplica > 0 then
      v_ap_capital := v_aplica;
      v_resto := v_resto - v_aplica;
    end if;

    if v_ap_capital + v_ap_interes + v_ap_iva + v_ap_mora = 0 then
      continue;
    end if;

    insert into aplicaciones_pago (pago_id, cuota_id, capital, interes, iva, moratorio)
    values (v_pago_id, v_cuota.id, v_ap_capital, v_ap_interes, v_ap_iva, v_ap_mora);

    update amortizaciones set
      capital_pagado   = capital_pagado + v_ap_capital,
      interes_pagado   = interes_pagado + v_ap_interes,
      iva_pagado       = iva_pagado + v_ap_iva,
      moratorio_pagado = moratorio_pagado + v_ap_mora,
      estado = case
        when capital_pagado + v_ap_capital >= capital
         and interes_pagado + v_ap_interes >= interes
         and iva_pagado + v_ap_iva >= iva_interes
         and moratorio_pagado + v_ap_mora >= moratorio_generado
        then 'pagada'::estado_cuota
        else 'parcial'::estado_cuota
      end,
      fecha_liquidacion = case
        when capital_pagado + v_ap_capital >= capital
         and interes_pagado + v_ap_interes >= interes
        then p_fecha
        else fecha_liquidacion
      end
    where id = v_cuota.id;

    v_tot_capital := v_tot_capital + v_ap_capital;
    v_tot_interes := v_tot_interes + v_ap_interes;
    v_tot_iva     := v_tot_iva + v_ap_iva;
    v_tot_mora    := v_tot_mora + v_ap_mora;
  end loop;

  update pagos set
    capital_aplicado   = v_tot_capital,
    interes_aplicado   = v_tot_interes,
    iva_aplicado       = v_tot_iva,
    moratorio_aplicado = v_tot_mora,
    excedente          = v_resto
  where id = v_pago_id;

  -- Los saldos del credito se recalculan desde la amortizacion, nunca por
  -- acumulacion: asi un error puntual no se arrastra.
  update creditos c set
    saldo_capital = coalesce((
      select sum(a.capital - a.capital_pagado) from amortizaciones a
      where a.credito_id = c.id and a.estado <> 'condonada'), 0),
    saldo_interes = coalesce((
      select sum((a.interes - a.interes_pagado) + (a.iva_interes - a.iva_pagado))
      from amortizaciones a
      where a.credito_id = c.id and a.estado <> 'condonada'), 0),
    saldo_moratorio = coalesce((
      select sum(a.moratorio_generado - a.moratorio_pagado) from amortizaciones a
      where a.credito_id = c.id), 0),
    total_pagado = coalesce((
      select sum(p.monto - p.excedente) from pagos p
      where p.credito_id = c.id and not p.cancelado), 0)
  where c.id = p_credito_id;

  -- Un credito sin capital ni intereses pendientes queda liquidado.
  update creditos set
    estado = 'liquidado',
    fecha_liquidacion = p_fecha,
    dias_mora = 0
  where id = p_credito_id
    and saldo_capital <= 0
    and saldo_interes <= 0
    and saldo_moratorio <= 0
    and estado in ('vigente', 'atrasado');

  select s.perfil_id into v_perfil_id from socios s where s.id = v_credito.socio_id;
  perform privado.notificar(
    v_perfil_id,
    'Pago registrado',
    format('Recibimos tu pago de $%s aplicado al crédito %s.',
           to_char(p_monto, 'FM999,999,990.00'), v_credito.folio),
    'exito',
    '/portal/creditos/' || p_credito_id
  );

  return v_pago_id;
end;
$$;

comment on function registrar_pago is
  'Registra un pago y lo imputa a las cuotas mas antiguas (mora, IVA, interes, capital).';

-- =============================================================================
-- ACTUALIZACION DE MORA
-- Pensada para ejecutarse una vez al dia (pg_cron o una funcion programada).
-- Recalcula el interes moratorio devengado y reclasifica los creditos.
-- =============================================================================
create or replace function actualizar_mora(p_fecha date default current_date)
returns table (creditos_afectados integer, cuotas_vencidas integer)
language plpgsql
security definer
set search_path = public, privado
as $$
declare
  v_dias_gracia integer := privado.config_numero('dias_gracia_mora', 3)::integer;
  v_cuotas integer;
  v_creditos integer;
begin
  -- Interes moratorio simple sobre el capital vencido:
  --   capital_vencido * (tasa_moratoria / 100 / 365) * dias_de_atraso
  with vencidas as (
    update amortizaciones a set
      estado = case when a.estado = 'parcial' then 'parcial' else 'vencida' end,
      moratorio_generado = round(
        (a.capital - a.capital_pagado)
        * (c.tasa_moratoria_anual / 100.0 / 365.0)
        * greatest(p_fecha - a.fecha_vencimiento - v_dias_gracia, 0)
      , 2)
    from creditos c
    where a.credito_id = c.id
      and c.estado in ('vigente', 'atrasado')
      and a.fecha_vencimiento < p_fecha
      and a.estado in ('pendiente', 'parcial', 'vencida')
    returning a.credito_id
  )
  select count(*)::integer into v_cuotas from vencidas;

  -- Dias de mora = antiguedad de la cuota vencida mas antigua sin liquidar.
  with atraso as (
    select
      c.id,
      coalesce(max(p_fecha - a.fecha_vencimiento), 0) as dias
    from creditos c
    left join amortizaciones a
      on a.credito_id = c.id
     and a.fecha_vencimiento < p_fecha
     and a.estado in ('pendiente', 'parcial', 'vencida')
    where c.estado in ('vigente', 'atrasado')
    group by c.id
  )
  update creditos c set
    dias_mora = greatest(atraso.dias, 0),
    estado = case
      when atraso.dias > v_dias_gracia then 'atrasado'::estado_credito
      else 'vigente'::estado_credito
    end,
    saldo_moratorio = coalesce((
      select sum(a.moratorio_generado - a.moratorio_pagado)
      from amortizaciones a where a.credito_id = c.id), 0)
  from atraso
  where c.id = atraso.id;

  get diagnostics v_creditos = row_count;

  return query select v_creditos, v_cuotas;
end;
$$;

comment on function actualizar_mora is
  'Recalcula interes moratorio y dias de atraso. Ejecutar diariamente.';

grant execute on function generar_amortizacion, desembolsar_credito, registrar_pago,
  actualizar_mora to authenticated;
