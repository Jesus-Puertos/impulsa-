-- =============================================================================
-- 20260809100500_ahorro_e_inversion.sql
-- Productos de captacion: ahorro a la vista, ahorro programado e inversion a
-- plazo fijo. El saldo de cada cuenta se deriva de sus movimientos.
-- =============================================================================

create table productos_ahorro (
  id           uuid primary key default gen_random_uuid(),
  clave        text not null unique,        -- AHO-VISTA
  nombre       text not null,
  descripcion  text,
  descripcion_larga text,

  -- Rendimiento anual en porcentaje. 0 para cuentas a la vista sin interes.
  tasa_anual   numeric(6, 3) not null default 0 check (tasa_anual >= 0),
  monto_minimo_apertura numeric(14, 2) not null default 0 check (monto_minimo_apertura >= 0),
  monto_minimo_saldo    numeric(14, 2) not null default 0 check (monto_minimo_saldo >= 0),
  -- Plazo forzoso en dias. null en cuentas a la vista.
  plazo_dias   integer check (plazo_dias > 0),
  permite_retiro_anticipado boolean not null default true,
  penalizacion_retiro_pct numeric(5, 2) not null default 0
    check (penalizacion_retiro_pct >= 0 and penalizacion_retiro_pct <= 100),
  -- Aportacion periodica comprometida en el ahorro programado.
  aportacion_sugerida numeric(14, 2),
  periodicidad_aportacion periodicidad_pago,

  icono     text,
  color     text,
  destacado boolean not null default false,
  orden     integer not null default 0,
  activo    boolean not null default true,

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table productos_ahorro is
  'Catalogo de instrumentos de ahorro e inversion. Editable desde /admin.';

create index productos_ahorro_activo_idx on productos_ahorro (activo, orden);

create trigger productos_ahorro_actualizado before update on productos_ahorro
  for each row execute function privado.tocar_actualizado_en();

-- =============================================================================
-- CUENTAS
-- =============================================================================
create table cuentas_ahorro (
  id            uuid primary key default gen_random_uuid(),
  numero_cuenta text unique,
  socio_id      uuid not null references socios (id) on delete restrict,
  producto_id   uuid not null references productos_ahorro (id) on delete restrict,
  sucursal_id   uuid references sucursales (id) on delete set null,

  -- Espejo de la suma de movimientos; lo mantiene un trigger.
  saldo         numeric(14, 2) not null default 0,
  -- Intereses devengados aun no capitalizados.
  interes_acumulado numeric(14, 2) not null default 0 check (interes_acumulado >= 0),

  fecha_apertura    date not null default current_date,
  fecha_vencimiento date,                 -- solo en inversion a plazo
  meta_ahorro       numeric(14, 2) check (meta_ahorro > 0),
  activa            boolean not null default true,
  fecha_cierre      date,

  aperturada_por uuid references perfiles (id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table cuentas_ahorro is 'Cuentas de ahorro o inversion de cada socio.';
comment on column cuentas_ahorro.saldo is
  'Saldo espejo mantenido por el trigger de movimientos. No editar a mano.';

create index cuentas_ahorro_socio_idx on cuentas_ahorro (socio_id);
create index cuentas_ahorro_activa_idx on cuentas_ahorro (activa);

create trigger cuentas_ahorro_actualizado before update on cuentas_ahorro
  for each row execute function privado.tocar_actualizado_en();

-- SECURITY DEFINER: el trigger llama a `privado.siguiente_folio`, cuyo
-- EXECUTE esta revocado de PUBLIC. Correr como propietario evita tener que
-- exponer el generador de folios a los roles de la API.
create or replace function privado.sellar_cuenta_ahorro()
returns trigger
language plpgsql
security definer
set search_path = public, privado
as $$
begin
  if new.numero_cuenta is null then
    new.numero_cuenta := privado.siguiente_folio('AHO');
  end if;
  return new;
end;
$$;

create trigger cuentas_ahorro_sellar before insert on cuentas_ahorro
  for each row execute function privado.sellar_cuenta_ahorro();

-- =============================================================================
-- MOVIMIENTOS
-- Libro de la cuenta. Es append-only: un error se corrige con un movimiento de
-- signo contrario, nunca borrando la fila.
-- =============================================================================
create table movimientos_ahorro (
  id          uuid primary key default gen_random_uuid(),
  cuenta_id   uuid not null references cuentas_ahorro (id) on delete cascade,
  folio       text unique,
  tipo        tipo_movimiento_ahorro not null,
  -- Siempre positivo. El signo lo determina el `tipo`.
  monto       numeric(14, 2) not null check (monto > 0),
  saldo_posterior numeric(14, 2) not null,
  metodo      metodo_pago,
  referencia  text,
  fecha       date not null default current_date,
  registrado_por uuid references perfiles (id) on delete set null,
  notas       text,
  creado_en   timestamptz not null default now()
);

comment on table movimientos_ahorro is
  'Libro de movimientos de una cuenta. Append-only: no se edita ni se borra.';

create index movimientos_ahorro_cuenta_idx on movimientos_ahorro (cuenta_id, fecha desc, creado_en desc);

-- Recalcula el saldo de la cuenta y lo sella en el movimiento. Se ejecuta
-- BEFORE INSERT y bloquea la fila de la cuenta para que dos cajeros
-- simultaneos no lean el mismo saldo.
create or replace function privado.aplicar_movimiento_ahorro()
returns trigger
language plpgsql
security definer
set search_path = public, privado
as $$
declare
  v_saldo numeric(14, 2);
  v_signo integer;
begin
  select saldo into v_saldo from cuentas_ahorro where id = new.cuenta_id for update;

  if v_saldo is null then
    raise exception 'La cuenta de ahorro % no existe', new.cuenta_id;
  end if;

  v_signo := case new.tipo
    when 'deposito' then 1
    when 'interes'  then 1
    when 'retiro'   then -1
    when 'comision' then -1
    when 'ajuste'   then 1   -- un ajuste negativo se captura como comision
  end;

  if v_signo = -1 and v_saldo < new.monto then
    raise exception 'Saldo insuficiente: la cuenta tiene % y se intenta retirar %',
      v_saldo, new.monto;
  end if;

  v_saldo := v_saldo + (v_signo * new.monto);

  new.saldo_posterior := v_saldo;
  new.folio := coalesce(new.folio, privado.siguiente_folio('MOV'));
  new.registrado_por := coalesce(new.registrado_por, auth.uid());

  update cuentas_ahorro set saldo = v_saldo, actualizado_en = now()
  where id = new.cuenta_id;

  return new;
end;
$$;

create trigger movimientos_ahorro_aplicar before insert on movimientos_ahorro
  for each row execute function privado.aplicar_movimiento_ahorro();

-- Impide reescribir la historia contable.
create or replace function privado.bloquear_edicion_movimiento()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Los movimientos de ahorro no se pueden modificar ni eliminar. '
    'Registre un movimiento de ajuste en sentido contrario.';
end;
$$;

create trigger movimientos_ahorro_inmutable before update or delete on movimientos_ahorro
  for each row execute function privado.bloquear_edicion_movimiento();
