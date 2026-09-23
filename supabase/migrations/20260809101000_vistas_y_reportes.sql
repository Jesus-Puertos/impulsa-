-- =============================================================================
-- 20260809101000_vistas_y_reportes.sql
-- Vistas de consulta para el panel y funciones de indicadores.
--
-- Todas las vistas llevan `security_invoker = on` para que hereden las
-- politicas RLS de quien consulta. Sin esa opcion una vista se ejecutaria con
-- los permisos de su propietario y abriria una puerta trasera al padron.
-- =============================================================================

-- --- Credito con su contexto y su proxima cuota ------------------------------
create view v_creditos_detalle
with (security_invoker = on) as
select
  c.id,
  c.folio,
  c.socio_id,
  c.estado,
  c.monto_principal,
  c.saldo_capital,
  c.saldo_interes,
  c.saldo_moratorio,
  (c.saldo_capital + c.saldo_interes + c.saldo_moratorio) as saldo_total,
  c.total_pagado,
  c.pago_periodico,
  c.periodicidad,
  c.plazo_periodos,
  c.tasa_anual,
  c.dias_mora,
  c.fecha_desembolso,
  c.fecha_vencimiento,
  c.sucursal_id,
  s.numero_socio,
  trim(s.nombre || ' ' || s.apellido_paterno || ' ' || coalesce(s.apellido_materno, '')) as socio_nombre,
  s.curp,
  s.telefono as socio_telefono,
  p.nombre as producto_nombre,
  p.clave  as producto_clave,
  suc.nombre as sucursal_nombre,
  -- Avance real de amortizacion, util para barras de progreso.
  case when c.monto_principal > 0
    then round(100.0 * (c.monto_principal - c.saldo_capital) / c.monto_principal, 2)
    else 0 end as porcentaje_amortizado,
  (select count(*) from amortizaciones a
     where a.credito_id = c.id and a.estado = 'pagada') as cuotas_pagadas,
  (select min(a.fecha_vencimiento) from amortizaciones a
     where a.credito_id = c.id and a.estado in ('pendiente', 'parcial', 'vencida')
  ) as proxima_fecha_pago,
  (select a.pago_programado from amortizaciones a
     where a.credito_id = c.id and a.estado in ('pendiente', 'parcial', 'vencida')
     order by a.numero_cuota limit 1
  ) as proximo_pago_monto
from creditos c
join socios s on s.id = c.socio_id
join productos_credito p on p.id = c.producto_id
left join sucursales suc on suc.id = c.sucursal_id;

comment on view v_creditos_detalle is
  'Credito enriquecido con socio, producto y proxima cuota. Base del panel de cartera.';

-- --- Solicitudes en cola de dictamen -----------------------------------------
create view v_solicitudes_detalle
with (security_invoker = on) as
select
  sol.id,
  sol.folio,
  sol.estado,
  sol.monto_solicitado,
  sol.plazo_periodos,
  sol.periodicidad,
  sol.destino,
  sol.descripcion_destino,
  sol.monto_aprobado,
  sol.plazo_aprobado,
  sol.tasa_aplicada,
  sol.comentarios_analista,
  sol.motivo_rechazo,
  sol.capacidad_pago_calculada,
  sol.analista_id,
  sol.fecha_envio,
  sol.fecha_resolucion,
  sol.creado_en,
  sol.socio_id,
  s.numero_socio,
  trim(s.nombre || ' ' || s.apellido_paterno || ' ' || coalesce(s.apellido_materno, '')) as socio_nombre,
  s.curp,
  s.telefono as socio_telefono,
  s.ingreso_mensual,
  s.egresos_mensuales,
  s.estado as socio_estado,
  p.nombre as producto_nombre,
  p.tasa_anual as producto_tasa,
  p.factor_capacidad_pago,
  suc.nombre as sucursal_nombre,
  -- Dias que lleva esperando dictamen; ordena la cola de trabajo.
  case when sol.estado in ('enviada', 'en_revision')
    then (current_date - sol.fecha_envio::date)
    else null end as dias_en_espera,
  -- Cuanto le queda libre al socio despues de sus gastos declarados.
  (coalesce(s.ingreso_mensual, 0) + coalesce(s.otros_ingresos, 0)
   - coalesce(s.egresos_mensuales, 0)) as ingreso_disponible,
  (select count(*) from documentos_socio d
     where d.socio_id = s.id and d.estado = 'verificado') as documentos_verificados,
  (select count(*) from creditos c
     where c.socio_id = s.id and c.estado in ('vigente', 'atrasado')) as creditos_activos
from solicitudes_credito sol
join socios s on s.id = sol.socio_id
join productos_credito p on p.id = sol.producto_id
left join sucursales suc on suc.id = sol.sucursal_id;

comment on view v_solicitudes_detalle is
  'Solicitudes con los datos que el analista necesita para dictaminar.';

-- --- Cobranza: cuotas por vencer y vencidas ----------------------------------
create view v_cobranza
with (security_invoker = on) as
select
  a.id as cuota_id,
  a.credito_id,
  a.numero_cuota,
  a.fecha_vencimiento,
  a.pago_programado,
  a.estado as estado_cuota,
  (a.capital - a.capital_pagado) as capital_pendiente,
  (a.interes - a.interes_pagado) as interes_pendiente,
  (a.moratorio_generado - a.moratorio_pagado) as moratorio_pendiente,
  (a.pago_programado - a.capital_pagado - a.interes_pagado - a.iva_pagado
    + (a.moratorio_generado - a.moratorio_pagado)) as total_pendiente,
  (current_date - a.fecha_vencimiento) as dias_vencida,
  c.folio as credito_folio,
  c.estado as estado_credito,
  s.id as socio_id,
  s.numero_socio,
  trim(s.nombre || ' ' || s.apellido_paterno || ' ' || coalesce(s.apellido_materno, '')) as socio_nombre,
  s.telefono as socio_telefono,
  c.sucursal_id,
  suc.nombre as sucursal_nombre
from amortizaciones a
join creditos c on c.id = a.credito_id
join socios s on s.id = c.socio_id
left join sucursales suc on suc.id = c.sucursal_id
where a.estado in ('pendiente', 'parcial', 'vencida')
  and c.estado in ('vigente', 'atrasado');

comment on view v_cobranza is
  'Cuotas abiertas con su antiguedad. Negativo en dias_vencida = aun no vence.';

-- --- Padron de socios con su exposicion --------------------------------------
create view v_socios_resumen
with (security_invoker = on) as
select
  s.id,
  s.numero_socio,
  trim(s.nombre || ' ' || s.apellido_paterno || ' ' || coalesce(s.apellido_materno, '')) as nombre_completo,
  s.curp,
  s.rfc,
  s.correo,
  s.telefono,
  s.estado,
  s.municipio,
  s.entidad,
  s.fecha_alta,
  s.ingreso_mensual,
  s.score_interno,
  suc.nombre as sucursal_nombre,
  s.sucursal_id,
  (select count(*) from documentos_socio d where d.socio_id = s.id) as documentos_cargados,
  (select count(*) from documentos_socio d
     where d.socio_id = s.id and d.estado = 'verificado') as documentos_verificados,
  (select count(*) from documentos_socio d
     where d.socio_id = s.id and d.estado = 'pendiente') as documentos_pendientes,
  (select count(*) from creditos c
     where c.socio_id = s.id and c.estado in ('vigente', 'atrasado')) as creditos_activos,
  coalesce((select sum(c.saldo_capital + c.saldo_interes + c.saldo_moratorio)
     from creditos c where c.socio_id = s.id and c.estado in ('vigente', 'atrasado')), 0) as deuda_total,
  coalesce((select sum(ca.saldo) from cuentas_ahorro ca
     where ca.socio_id = s.id and ca.activa), 0) as ahorro_total,
  (select max(c.dias_mora) from creditos c
     where c.socio_id = s.id and c.estado = 'atrasado') as dias_mora_maximo
from socios s
left join sucursales suc on suc.id = s.sucursal_id;

comment on view v_socios_resumen is
  'Padron con la posicion consolidada de credito y ahorro de cada socio.';

-- =============================================================================
-- INDICADORES DEL PANEL
-- Devuelve un solo objeto JSON para que el dashboard haga una unica llamada.
-- =============================================================================
create or replace function kpis_panel()
returns jsonb
language plpgsql
security definer
set search_path = public, privado
as $$
declare
  v_resultado jsonb;
begin
  if not privado.es_personal() then
    raise exception 'Solo el personal puede consultar los indicadores';
  end if;

  select jsonb_build_object(
    'socios', jsonb_build_object(
      'total',        (select count(*) from socios),
      'activos',      (select count(*) from socios where estado = 'activo'),
      'en_revision',  (select count(*) from socios where estado = 'en_revision'),
      'prospectos',   (select count(*) from socios where estado = 'prospecto'),
      'altas_mes',    (select count(*) from socios
                        where fecha_alta >= date_trunc('month', current_date))
    ),
    'solicitudes', jsonb_build_object(
      'pendientes',   (select count(*) from solicitudes_credito
                        where estado in ('enviada', 'en_revision')),
      'aprobadas_mes',(select count(*) from solicitudes_credito
                        where estado in ('aprobada', 'desembolsada')
                          and fecha_resolucion >= date_trunc('month', current_date)),
      'monto_pendiente', coalesce((select sum(monto_solicitado) from solicitudes_credito
                        where estado in ('enviada', 'en_revision')), 0)
    ),
    'cartera', jsonb_build_object(
      'creditos_activos', (select count(*) from creditos where estado in ('vigente', 'atrasado')),
      'colocado_total',   coalesce((select sum(monto_principal) from creditos
                            where estado in ('vigente', 'atrasado', 'liquidado')), 0),
      'colocado_mes',     coalesce((select sum(monto_principal) from creditos
                            where fecha_desembolso >= date_trunc('month', current_date)), 0),
      'saldo_cartera',    coalesce((select sum(saldo_capital) from creditos
                            where estado in ('vigente', 'atrasado')), 0),
      'en_mora',          (select count(*) from creditos where estado = 'atrasado'),
      'saldo_en_mora',    coalesce((select sum(saldo_capital) from creditos
                            where estado = 'atrasado'), 0)
    ),
    'ahorro', jsonb_build_object(
      'cuentas',      (select count(*) from cuentas_ahorro where activa),
      'saldo_total',  coalesce((select sum(saldo) from cuentas_ahorro where activa), 0),
      'captado_mes',  coalesce((select sum(m.monto) from movimientos_ahorro m
                        where m.tipo = 'deposito'
                          and m.fecha >= date_trunc('month', current_date)), 0)
    ),
    'recuperacion', jsonb_build_object(
      'cobrado_mes',  coalesce((select sum(monto - excedente) from pagos
                        where not cancelado
                          and fecha_pago >= date_trunc('month', current_date)), 0),
      'por_cobrar_7d',coalesce((select sum(total_pendiente) from v_cobranza
                        where fecha_vencimiento between current_date
                          and current_date + 7), 0)
    ),
    'pendientes', jsonb_build_object(
      'documentos_por_revisar', (select count(*) from documentos_socio where estado = 'pendiente'),
      'mensajes_sin_atender',   (select count(*) from mensajes_contacto where not atendido),
      'leads_sin_contactar',    (select count(*) from simulaciones
                                  where quiere_contacto and not contactado)
    ),
    'generado_en', now()
  ) into v_resultado;

  return v_resultado;
end;
$$;

comment on function kpis_panel is
  'Indicadores agregados del panel administrativo en un unico objeto JSON.';

grant execute on function kpis_panel to authenticated;

-- --- Serie de colocacion mensual, para la grafica del panel ------------------
create or replace function serie_colocacion(p_meses integer default 12)
returns table (mes date, monto numeric, cantidad integer)
language sql
security definer
set search_path = public, privado
as $$
  select
    date_trunc('month', g.mes)::date as mes,
    coalesce(sum(c.monto_principal), 0) as monto,
    count(c.id)::integer as cantidad
  from generate_series(
    date_trunc('month', current_date) - ((p_meses - 1) || ' months')::interval,
    date_trunc('month', current_date),
    '1 month'
  ) as g(mes)
  left join creditos c
    on date_trunc('month', c.fecha_desembolso) = g.mes
  where privado.es_personal()
  group by g.mes
  order by g.mes;
$$;

comment on function serie_colocacion is
  'Monto y numero de creditos desembolsados por mes en los ultimos N meses.';

grant execute on function serie_colocacion to authenticated;

grant select on v_creditos_detalle, v_solicitudes_detalle, v_cobranza, v_socios_resumen
  to authenticated;
