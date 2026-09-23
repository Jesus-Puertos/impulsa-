-- =============================================================================
-- 20260809100400_creditos_amortizacion_pagos.sql
-- Nucleo operativo: creditos desembolsados, su tabla de amortizacion, los pagos
-- recibidos y la forma en que un pago se reparte entre cuotas.
--
-- Modelo de amortizacion: sistema frances (cuota fija). Los intereses se
-- calculan sobre saldos insolutos. El detalle de las formulas esta en
-- `docs/07-motor-de-credito.md`.
-- =============================================================================

create table creditos (
  id            uuid primary key default gen_random_uuid(),
  folio         text unique,
  solicitud_id  uuid unique references solicitudes_credito (id) on delete set null,
  socio_id      uuid not null references socios (id) on delete restrict,
  producto_id   uuid not null references productos_credito (id) on delete restrict,
  sucursal_id   uuid references sucursales (id) on delete set null,

  -- --- Condiciones pactadas (inmutables tras el desembolso) ------------------
  monto_principal numeric(14, 2) not null check (monto_principal > 0),
  tasa_anual      numeric(6, 3) not null check (tasa_anual >= 0),
  tasa_moratoria_anual numeric(6, 3) not null default 36 check (tasa_moratoria_anual >= 0),
  plazo_periodos  integer not null check (plazo_periodos > 0),
  periodicidad    periodicidad_pago not null,
  comision_apertura numeric(14, 2) not null default 0 check (comision_apertura >= 0),
  pago_periodico  numeric(14, 2) not null check (pago_periodico > 0),
  total_intereses numeric(14, 2) not null default 0,
  cat             numeric(6, 2),

  fecha_desembolso   date not null default current_date,
  fecha_primer_pago  date not null,
  fecha_vencimiento  date,

  -- --- Situacion actual (la mantienen los triggers de pago) ------------------
  saldo_capital     numeric(14, 2) not null default 0 check (saldo_capital >= 0),
  saldo_interes     numeric(14, 2) not null default 0 check (saldo_interes >= 0),
  saldo_moratorio   numeric(14, 2) not null default 0 check (saldo_moratorio >= 0),
  total_pagado      numeric(14, 2) not null default 0 check (total_pagado >= 0),
  estado            estado_credito not null default 'vigente',
  dias_mora         integer not null default 0 check (dias_mora >= 0),
  fecha_liquidacion date,

  desembolsado_por uuid references perfiles (id) on delete set null,
  notas            text,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),

  constraint creditos_primer_pago_posterior check (fecha_primer_pago >= fecha_desembolso)
);

comment on table creditos is
  'Creditos efectivamente desembolsados y su situacion vigente.';
comment on column creditos.saldo_capital is
  'Capital insoluto. Lo actualiza `aplicar_pago`; no debe editarse a mano.';
comment on column creditos.dias_mora is
  'Dias transcurridos desde la cuota vencida mas antigua sin liquidar.';

create index creditos_socio_idx on creditos (socio_id);
create index creditos_estado_idx on creditos (estado);
create index creditos_sucursal_idx on creditos (sucursal_id);
create index creditos_mora_idx on creditos (dias_mora desc) where estado = 'atrasado';

create trigger creditos_actualizado before update on creditos
  for each row execute function privado.tocar_actualizado_en();

-- SECURITY DEFINER: el trigger llama a `privado.siguiente_folio`, cuyo
-- EXECUTE esta revocado de PUBLIC. Correr como propietario evita tener que
-- exponer el generador de folios a los roles de la API.
create or replace function privado.sellar_credito()
returns trigger
language plpgsql
security definer
set search_path = public, privado
as $$
begin
  if new.folio is null then
    new.folio := privado.siguiente_folio('CRE');
  end if;
  return new;
end;
$$;

create trigger creditos_sellar before insert on creditos
  for each row execute function privado.sellar_credito();

-- =============================================================================
-- TABLA DE AMORTIZACION
-- Una fila por cuota. Se genera al desembolsar y no se recalcula: los pagos
-- solo actualizan las columnas `*_pagado` y el estado.
-- =============================================================================
create table amortizaciones (
  id            uuid primary key default gen_random_uuid(),
  credito_id    uuid not null references creditos (id) on delete cascade,
  numero_cuota  integer not null check (numero_cuota > 0),
  fecha_vencimiento date not null,

  -- --- Plan pactado ----------------------------------------------------------
  saldo_inicial numeric(14, 2) not null,
  capital       numeric(14, 2) not null check (capital >= 0),
  interes       numeric(14, 2) not null check (interes >= 0),
  iva_interes   numeric(14, 2) not null default 0 check (iva_interes >= 0),
  pago_programado numeric(14, 2) not null check (pago_programado > 0),
  saldo_final   numeric(14, 2) not null check (saldo_final >= 0),

  -- --- Ejecucion real --------------------------------------------------------
  capital_pagado    numeric(14, 2) not null default 0 check (capital_pagado >= 0),
  interes_pagado    numeric(14, 2) not null default 0 check (interes_pagado >= 0),
  iva_pagado        numeric(14, 2) not null default 0 check (iva_pagado >= 0),
  moratorio_generado numeric(14, 2) not null default 0 check (moratorio_generado >= 0),
  moratorio_pagado  numeric(14, 2) not null default 0 check (moratorio_pagado >= 0),
  estado            estado_cuota not null default 'pendiente',
  fecha_liquidacion date,

  creado_en     timestamptz not null default now(),

  unique (credito_id, numero_cuota)
);

comment on table amortizaciones is
  'Plan de pagos del credito (sistema frances) y su avance real.';

create index amortizaciones_credito_idx on amortizaciones (credito_id, numero_cuota);
create index amortizaciones_vencidas_idx on amortizaciones (fecha_vencimiento)
  where estado in ('pendiente', 'parcial', 'vencida');

-- =============================================================================
-- PAGOS
-- Un pago es un ingreso de dinero. Su reparto entre cuotas y conceptos se
-- detalla en `aplicaciones_pago`, lo que permite reconstruir cualquier saldo.
-- =============================================================================
create table pagos (
  id            uuid primary key default gen_random_uuid(),
  folio         text unique,
  credito_id    uuid not null references creditos (id) on delete restrict,
  socio_id      uuid not null references socios (id) on delete restrict,
  sucursal_id   uuid references sucursales (id) on delete set null,

  monto         numeric(14, 2) not null check (monto > 0),
  metodo        metodo_pago not null default 'efectivo',
  referencia    text,                    -- folio bancario o de ventanilla
  fecha_pago    date not null default current_date,

  -- Desglose resultante de aplicar el pago (suma = monto, salvo excedente).
  capital_aplicado   numeric(14, 2) not null default 0,
  interes_aplicado   numeric(14, 2) not null default 0,
  iva_aplicado       numeric(14, 2) not null default 0,
  moratorio_aplicado numeric(14, 2) not null default 0,
  excedente          numeric(14, 2) not null default 0,

  cancelado      boolean not null default false,
  cancelado_por  uuid references perfiles (id) on delete set null,
  cancelado_en   timestamptz,
  motivo_cancelacion text,

  registrado_por uuid references perfiles (id) on delete set null,
  notas          text,
  creado_en      timestamptz not null default now(),

  constraint pagos_cancelacion_con_motivo check (
    not cancelado or motivo_cancelacion is not null
  )
);

comment on table pagos is 'Ingresos recibidos a cuenta de un credito.';
comment on column pagos.excedente is
  'Parte del pago que no se pudo aplicar por exceder el adeudo total.';

create index pagos_credito_idx on pagos (credito_id, fecha_pago desc);
create index pagos_socio_idx on pagos (socio_id);
create index pagos_fecha_idx on pagos (fecha_pago desc);

-- SECURITY DEFINER: el trigger llama a `privado.siguiente_folio`, cuyo
-- EXECUTE esta revocado de PUBLIC. Correr como propietario evita tener que
-- exponer el generador de folios a los roles de la API.
create or replace function privado.sellar_pago()
returns trigger
language plpgsql
security definer
set search_path = public, privado
as $$
begin
  if new.folio is null then
    new.folio := privado.siguiente_folio('PAG');
  end if;
  new.registrado_por := coalesce(new.registrado_por, auth.uid());
  return new;
end;
$$;

create trigger pagos_sellar before insert on pagos
  for each row execute function privado.sellar_pago();

-- --- Reparto de cada pago entre cuotas y conceptos ---------------------------
create table aplicaciones_pago (
  id         uuid primary key default gen_random_uuid(),
  pago_id    uuid not null references pagos (id) on delete cascade,
  cuota_id   uuid not null references amortizaciones (id) on delete cascade,
  capital    numeric(14, 2) not null default 0,
  interes    numeric(14, 2) not null default 0,
  iva        numeric(14, 2) not null default 0,
  moratorio  numeric(14, 2) not null default 0,
  creado_en  timestamptz not null default now()
);

comment on table aplicaciones_pago is
  'Detalle de como se distribuyo un pago entre las cuotas del credito.';

create index aplicaciones_pago_pago_idx on aplicaciones_pago (pago_id);
create index aplicaciones_pago_cuota_idx on aplicaciones_pago (cuota_id);
