-- =============================================================================
-- 20260809100000_fundamentos.sql
-- Cooperativa Impulsa - Extensiones, tipos enumerados y utilidades comunes.
--
-- Esta migracion no crea tablas de negocio: define el vocabulario (ENUM) y las
-- funciones auxiliares de las que dependen todas las migraciones posteriores.
-- =============================================================================

-- --- Extensiones -------------------------------------------------------------
create extension if not exists "pgcrypto" with schema extensions;  -- gen_random_uuid()
-- pg_trgm da indices GIN para `ILIKE '%texto%'`, que es como busca el panel.
create extension if not exists "pg_trgm" with schema extensions;
-- unaccent queda disponible para usarse en CONSULTAS (no en indices: es STABLE).
create extension if not exists "unaccent" with schema extensions;

-- --- Esquema privado ---------------------------------------------------------
-- Aloja las funciones internas y los helpers de autorizacion.
--
-- Lo que impide que se llamen desde la API REST no son los permisos sino
-- `config.toml`, que solo publica los esquemas `public`, `storage` y
-- `graphql_public`. Los roles SI necesitan USAGE sobre este esquema: sin el,
-- una politica RLS que invoque `privado.rol_actual()` fallaria con
-- «permission denied for schema privado» y bloquearia toda lectura.
--
-- El acceso fino a cada funcion se decide al final, en la migracion de RLS:
-- ahi se revoca EXECUTE de PUBLIC sobre todo el esquema y se conceden
-- unicamente los helpers que las politicas necesitan.
create schema if not exists privado;
grant usage on schema privado to anon, authenticated, service_role;

-- =============================================================================
-- TIPOS ENUMERADOS
-- Los valores se escriben en snake_case y sin acentos porque se usan tambien
-- como sufijos de clase CSS en el front (`.estado--en_revision`).
-- =============================================================================

-- Roles del sistema. Orden de menor a mayor privilegio.
create type rol_usuario as enum (
  'socio',      -- persona asociada; solo ve su propia informacion
  'promotor',   -- capta socios y captura solicitudes
  'cajero',     -- registra pagos y movimientos de ahorro
  'analista',   -- dictamina solicitudes de credito
  'gerente',    -- autoriza, desembolsa y consulta reportes
  'admin'       -- control total, incluida la gestion de personal
);

create type estado_socio as enum (
  'prospecto',    -- registro iniciado, sin expediente completo
  'en_revision',  -- expediente enviado, pendiente de validar
  'activo',       -- socio con expediente aprobado
  'suspendido',   -- temporalmente sin acceso a productos
  'baja',         -- renuncia o exclusion
  'rechazado'     -- no cumplio requisitos de admision
);

create type estado_documento as enum ('pendiente', 'verificado', 'rechazado');

create type tipo_documento as enum (
  'ine_frente',
  'ine_reverso',
  'curp',
  'rfc',
  'comprobante_domicilio',
  'comprobante_ingresos',
  'acta_nacimiento',
  'estado_cuenta_bancario',
  'fotografia',
  'firma',
  'otro'
);

create type estado_solicitud as enum (
  'borrador',
  'enviada',
  'en_revision',
  'aprobada',
  'rechazada',
  'cancelada',
  'desembolsada'
);

create type estado_credito as enum (
  'vigente',
  'atrasado',
  'liquidado',
  'castigado',   -- irrecuperable, dado de baja contablemente
  'cancelado'
);

create type estado_cuota as enum ('pendiente', 'parcial', 'pagada', 'vencida', 'condonada');

create type metodo_pago as enum (
  'efectivo',
  'transferencia',
  'deposito',
  'domiciliacion',
  'descuento_nomina'
);

create type tipo_movimiento_ahorro as enum (
  'deposito',
  'retiro',
  'interes',
  'comision',
  'ajuste'
);

-- Frecuencia de pago. El numero de periodos al ano se resuelve con
-- `privado.periodos_por_anio()` mas abajo.
create type periodicidad_pago as enum ('semanal', 'catorcenal', 'quincenal', 'mensual');

create type estado_publicacion as enum ('borrador', 'publicado', 'archivado');

create type genero_persona as enum ('masculino', 'femenino', 'no_binario', 'prefiere_no_decir');

create type estado_civil_persona as enum (
  'soltero',
  'casado',
  'union_libre',
  'separado',
  'divorciado',
  'viudo'
);

create type nivel_escolaridad as enum (
  'sin_estudios',
  'primaria',
  'secundaria',
  'preparatoria',
  'tecnico',
  'licenciatura',
  'posgrado'
);

-- =============================================================================
-- UTILIDADES
-- =============================================================================

-- Mantiene `actualizado_en` al dia. Se engancha como trigger BEFORE UPDATE.
create or replace function privado.tocar_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

-- Numero de periodos de pago en un ano.
create or replace function privado.periodos_por_anio(p_periodicidad periodicidad_pago)
returns integer
language sql
immutable
as $$
  select case p_periodicidad
    when 'semanal'   then 52
    when 'catorcenal' then 26
    when 'quincenal' then 24
    when 'mensual'   then 12
  end;
$$;

-- Suma un periodo a una fecha segun la periodicidad.
-- Para quincenal se usa un mes/2 aproximado con dias fijos, que es la practica
-- habitual en cartera de cooperativas (dias 15 y ultimo del mes se manejan en
-- el front al elegir la fecha de primer pago).
create or replace function privado.sumar_periodos(
  p_fecha date,
  p_periodicidad periodicidad_pago,
  p_n integer
)
returns date
language sql
immutable
as $$
  select case p_periodicidad
    when 'semanal'    then p_fecha + (p_n * 7)
    when 'catorcenal' then p_fecha + (p_n * 14)
    when 'quincenal'  then p_fecha + (p_n * 15)
    when 'mensual'    then (p_fecha + (p_n || ' months')::interval)::date
  end;
$$;

-- Genera folios legibles y unicos por prefijo: SOL-2026-000123.
-- Usa una tabla de contadores con bloqueo por fila para evitar huecos y
-- condiciones de carrera entre peticiones concurrentes.
create table if not exists folios (
  prefijo text primary key,
  anio    integer not null,
  ultimo  integer not null default 0
);
comment on table folios is
  'Contadores de folios consecutivos por prefijo y ano. Uso interno.';

create or replace function privado.siguiente_folio(p_prefijo text)
returns text
language plpgsql
security definer
set search_path = public, privado
as $$
declare
  v_anio   integer := extract(year from now())::integer;
  v_numero integer;
begin
  insert into folios (prefijo, anio, ultimo)
  values (p_prefijo, v_anio, 1)
  on conflict (prefijo) do update
    -- Al cambiar de ano el consecutivo se reinicia.
    set ultimo = case when folios.anio = v_anio then folios.ultimo + 1 else 1 end,
        anio   = v_anio
  returning ultimo into v_numero;

  return p_prefijo || '-' || v_anio || '-' || lpad(v_numero::text, 6, '0');
end;
$$;

comment on function privado.siguiente_folio is
  'Devuelve el siguiente folio consecutivo del prefijo dado (ej. SOL-2026-000123).';

-- =============================================================================
-- CONFIGURACION
-- Parametros que la cooperativa puede cambiar desde /admin sin volver a
-- desplegar: tasa moratoria por omision, dias de gracia, IVA sobre intereses,
-- textos de contacto, etc. Se define aqui porque otras migraciones la
-- consultan.
-- =============================================================================
create table configuracion (
  clave          text primary key,
  valor          jsonb not null,
  descripcion    text,
  grupo          text not null default 'general',
  editable       boolean not null default true,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid
);

comment on table configuracion is
  'Parametros del sistema editables desde el panel administrativo.';
comment on column configuracion.editable is
  'false para llaves internas que no deben tocarse desde la interfaz.';

create index configuracion_grupo_idx on configuracion (grupo);

create trigger configuracion_actualizada before update on configuracion
  for each row execute function privado.tocar_actualizado_en();

-- Lector tipado, para no repetir el casteo de jsonb en cada funcion.
create or replace function privado.config_numero(p_clave text, p_defecto numeric)
returns numeric
language sql
stable
security definer
set search_path = public, privado
as $$
  select coalesce((select (valor #>> '{}')::numeric from configuracion where clave = p_clave), p_defecto);
$$;
