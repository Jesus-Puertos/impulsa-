-- =============================================================================
-- 20260809100300_productos_y_solicitudes.sql
-- Catalogo de productos de credito, simulaciones publicas y el flujo de
-- solicitud hasta el dictamen.
--
-- Flujo: simulacion (publica, opcional) -> solicitud (borrador -> enviada ->
-- en_revision -> aprobada/rechazada) -> credito (otra migracion).
-- =============================================================================

create table productos_credito (
  id           uuid primary key default gen_random_uuid(),
  clave        text not null unique,           -- CRED-PYME
  nombre       text not null,
  descripcion  text,
  descripcion_larga text,

  -- --- Parametros financieros ------------------------------------------------
  monto_minimo numeric(14, 2) not null check (monto_minimo > 0),
  monto_maximo numeric(14, 2) not null check (monto_maximo > 0),
  plazo_minimo_periodos integer not null check (plazo_minimo_periodos > 0),
  plazo_maximo_periodos integer not null check (plazo_maximo_periodos > 0),
  -- Tasa de interes ORDINARIA anual, en porcentaje (24.5 = 24.5 %).
  tasa_anual   numeric(6, 3) not null check (tasa_anual >= 0 and tasa_anual <= 200),
  -- Tasa MORATORIA anual aplicada sobre el capital vencido.
  tasa_moratoria_anual numeric(6, 3) not null default 36 check (tasa_moratoria_anual >= 0),
  comision_apertura_pct numeric(5, 2) not null default 0
    check (comision_apertura_pct >= 0 and comision_apertura_pct <= 20),
  periodicidad periodicidad_pago not null default 'mensual',

  -- --- Requisitos ------------------------------------------------------------
  requiere_aval      boolean not null default false,
  requiere_garantia  boolean not null default false,
  antiguedad_minima_socio_meses integer not null default 0,
  ingreso_minimo_mensual numeric(14, 2),
  -- Proporcion maxima del ingreso que puede destinarse al pago (capacidad de
  -- pago). 0.30 = el pago no debe exceder el 30 % del ingreso disponible.
  factor_capacidad_pago numeric(4, 3) not null default 0.300
    check (factor_capacidad_pago > 0 and factor_capacidad_pago <= 1),
  requisitos    text[] not null default '{}',
  destinos      text[] not null default '{}',

  -- --- Presentacion ----------------------------------------------------------
  icono   text,
  color   text,               -- token de color corporativo: primary, oro, campo
  destacado boolean not null default false,
  orden   integer not null default 0,
  activo  boolean not null default true,

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint productos_rango_monto check (monto_maximo >= monto_minimo),
  constraint productos_rango_plazo check (plazo_maximo_periodos >= plazo_minimo_periodos)
);

comment on table productos_credito is
  'Catalogo de creditos que ofrece la cooperativa. Editable desde /admin.';
comment on column productos_credito.tasa_anual is
  'Tasa de interes ordinaria anual en porcentaje (ej. 24.5 = 24.5 %).';
comment on column productos_credito.factor_capacidad_pago is
  'Fraccion maxima del ingreso disponible que puede comprometerse al pago.';

create index productos_credito_activo_idx on productos_credito (activo, orden);

create trigger productos_credito_actualizado before update on productos_credito
  for each row execute function privado.tocar_actualizado_en();

-- =============================================================================
-- SIMULACIONES
-- Toda simulacion del sitio publico se guarda, tenga o no sesion. Cumple dos
-- fines: alimentar el embudo comercial (un prospecto que simula es un lead) y
-- dejar constancia de las condiciones que se le mostraron al usuario.
-- =============================================================================
create table simulaciones (
  id            uuid primary key default gen_random_uuid(),
  producto_id   uuid references productos_credito (id) on delete set null,
  socio_id      uuid references socios (id) on delete set null,

  monto           numeric(14, 2) not null check (monto > 0),
  plazo_periodos  integer not null check (plazo_periodos > 0),
  periodicidad    periodicidad_pago not null,
  tasa_anual      numeric(6, 3) not null,
  comision_apertura numeric(14, 2) not null default 0,

  -- Resultados calculados en el cliente y verificados en el servidor.
  pago_periodico  numeric(14, 2) not null,
  total_intereses numeric(14, 2) not null,
  total_a_pagar   numeric(14, 2) not null,
  cat             numeric(6, 2),   -- Costo Anual Total, en porcentaje

  -- Datos de contacto si el visitante pidio que lo llamaran.
  nombre_contacto   text,
  correo_contacto   text,
  telefono_contacto text,
  quiere_contacto   boolean not null default false,
  contactado        boolean not null default false,
  contactado_por    uuid references perfiles (id) on delete set null,

  origen     text not null default 'web',   -- web, ventanilla, telefono
  creado_en  timestamptz not null default now()
);

comment on table simulaciones is
  'Registro de cada simulacion de credito. Sirve como bitacora y como lead.';

create index simulaciones_socio_idx on simulaciones (socio_id);
create index simulaciones_lead_idx on simulaciones (quiere_contacto, contactado, creado_en desc)
  where quiere_contacto;

-- =============================================================================
-- SOLICITUDES DE CREDITO
-- =============================================================================
create table solicitudes_credito (
  id            uuid primary key default gen_random_uuid(),
  folio         text unique,
  socio_id      uuid not null references socios (id) on delete cascade,
  producto_id   uuid not null references productos_credito (id) on delete restrict,
  simulacion_id uuid references simulaciones (id) on delete set null,
  sucursal_id   uuid references sucursales (id) on delete set null,

  -- --- Lo que pide el socio --------------------------------------------------
  monto_solicitado numeric(14, 2) not null check (monto_solicitado > 0),
  plazo_periodos   integer not null check (plazo_periodos > 0),
  periodicidad     periodicidad_pago not null,
  destino          text not null,
  descripcion_destino text,

  -- --- Lo que dictamina el analista ------------------------------------------
  estado           estado_solicitud not null default 'borrador',
  monto_aprobado   numeric(14, 2) check (monto_aprobado > 0),
  plazo_aprobado   integer check (plazo_aprobado > 0),
  tasa_aplicada    numeric(6, 3) check (tasa_aplicada >= 0),
  analista_id      uuid references perfiles (id) on delete set null,
  comentarios_analista text,
  motivo_rechazo   text,
  -- Relacion pago/ingreso calculada al dictaminar, para dejar rastro del
  -- criterio con el que se autorizo.
  capacidad_pago_calculada numeric(6, 3),

  fecha_envio      timestamptz,
  fecha_resolucion timestamptz,
  creado_por       uuid references perfiles (id) on delete set null,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),

  constraint solicitudes_rechazo_con_motivo check (
    estado <> 'rechazada' or motivo_rechazo is not null
  ),
  constraint solicitudes_aprobacion_con_montos check (
    estado not in ('aprobada', 'desembolsada')
    or (monto_aprobado is not null and plazo_aprobado is not null and tasa_aplicada is not null)
  )
);

comment on table solicitudes_credito is
  'Solicitud formal de credito y su dictamen. Al aprobarse origina un credito.';
comment on column solicitudes_credito.capacidad_pago_calculada is
  'Pago periodico entre ingreso disponible al momento del dictamen.';

create index solicitudes_estado_idx on solicitudes_credito (estado, creado_en desc);
create index solicitudes_socio_idx on solicitudes_credito (socio_id);
create index solicitudes_analista_idx on solicitudes_credito (analista_id);

create trigger solicitudes_actualizado before update on solicitudes_credito
  for each row execute function privado.tocar_actualizado_en();

-- Asigna folio al enviarse y sella las marcas de tiempo del dictamen.
-- SECURITY DEFINER: el trigger llama a `privado.siguiente_folio`, cuyo
-- EXECUTE esta revocado de PUBLIC. Correr como propietario evita tener que
-- exponer el generador de folios a los roles de la API.
create or replace function privado.sellar_solicitud()
returns trigger
language plpgsql
security definer
set search_path = public, privado
as $$
begin
  if new.estado <> 'borrador' and new.folio is null then
    new.folio := privado.siguiente_folio('SOL');
  end if;

  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    if new.estado = 'enviada' then
      new.fecha_envio := coalesce(new.fecha_envio, now());
    end if;

    if new.estado in ('aprobada', 'rechazada', 'cancelada') then
      new.fecha_resolucion := now();
      -- Quien dictamina queda registrado aunque el cliente no lo envie.
      if new.estado in ('aprobada', 'rechazada') then
        new.analista_id := coalesce(new.analista_id, auth.uid());
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger solicitudes_sellar before insert or update on solicitudes_credito
  for each row execute function privado.sellar_solicitud();

-- =============================================================================
-- AVALES Y GARANTIAS
-- =============================================================================
create table avales (
  id            uuid primary key default gen_random_uuid(),
  solicitud_id  uuid not null references solicitudes_credito (id) on delete cascade,
  -- Si el aval ya es socio se enlaza; si no, se capturan sus datos sueltos.
  socio_aval_id uuid references socios (id) on delete set null,
  nombre            text not null,
  apellido_paterno  text,
  apellido_materno  text,
  curp              text,
  telefono          text not null,
  parentesco        text,
  ocupacion         text,
  ingreso_mensual   numeric(14, 2) check (ingreso_mensual >= 0),
  domicilio         text,
  acepto            boolean not null default false,
  creado_en         timestamptz not null default now(),

  constraint avales_curp_formato check (
    curp is null or curp ~ '^[A-Z]{4}[0-9]{6}[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[0-9A-Z][0-9]$'
  )
);

comment on table avales is 'Personas que garantizan solidariamente una solicitud.';

create index avales_solicitud_idx on avales (solicitud_id);

create table garantias (
  id            uuid primary key default gen_random_uuid(),
  solicitud_id  uuid not null references solicitudes_credito (id) on delete cascade,
  tipo          text not null,          -- prendaria, hipotecaria, liquida, deposito
  descripcion   text not null,
  valor_estimado numeric(14, 2) check (valor_estimado >= 0),
  ubicacion     text,
  documento_ruta text,                  -- avaluo o factura en Storage
  creado_en     timestamptz not null default now()
);

comment on table garantias is 'Bienes afectos en garantia de una solicitud.';

create index garantias_solicitud_idx on garantias (solicitud_id);
