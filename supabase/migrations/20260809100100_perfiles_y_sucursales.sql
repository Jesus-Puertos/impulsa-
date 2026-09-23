-- =============================================================================
-- 20260809100100_perfiles_y_sucursales.sql
-- Identidad de las personas que usan el sistema y red de sucursales.
--
-- `perfiles` extiende `auth.users` (gestionada por Supabase Auth) con los datos
-- que la cooperativa necesita: nombre completo, telefono, rol y adscripcion.
-- Toda persona con cuenta tiene un perfil, sea socio o personal interno.
-- =============================================================================

-- --- Sucursales --------------------------------------------------------------
create table sucursales (
  id            uuid primary key default gen_random_uuid(),
  clave         text not null unique,          -- SUC-CENTRO
  nombre        text not null,
  calle         text,
  numero        text,
  colonia       text,
  municipio     text,
  estado        text,
  codigo_postal text,
  telefono      text,
  correo        text,
  horario       text,
  latitud       numeric(10, 7),
  longitud      numeric(10, 7),
  es_matriz     boolean not null default false,
  activa        boolean not null default true,
  orden         integer not null default 0,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table sucursales is 'Puntos de atencion fisicos de la cooperativa.';

create index sucursales_activa_idx on sucursales (activa, orden);

-- --- Perfiles ----------------------------------------------------------------
create table perfiles (
  -- Comparte la PK con auth.users: un usuario, un perfil.
  id                uuid primary key references auth.users (id) on delete cascade,
  nombre            text not null default '',
  apellido_paterno  text not null default '',
  apellido_materno  text,
  correo            text not null,
  telefono          text,
  rol               rol_usuario not null default 'socio',
  sucursal_id       uuid references sucursales (id) on delete set null,
  avatar_url        text,
  activo            boolean not null default true,
  ultimo_acceso     timestamptz,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);

comment on table perfiles is
  'Datos de aplicacion de cada cuenta de auth.users, incluido su rol.';
comment on column perfiles.rol is
  'Determina los permisos. Solo un admin puede modificarlo (ver politicas RLS).';

create index perfiles_rol_idx on perfiles (rol) where activo;
create index perfiles_sucursal_idx on perfiles (sucursal_id);

-- Nombre completo listo para mostrar, sin concatenar en cada consulta.
create or replace function nombre_completo(p perfiles)
returns text
language sql
stable
as $$
  select trim(both ' ' from
    coalesce(p.nombre, '') || ' ' ||
    coalesce(p.apellido_paterno, '') || ' ' ||
    coalesce(p.apellido_materno, ''));
$$;

-- =============================================================================
-- ALTA AUTOMATICA DE PERFIL
-- Supabase Auth inserta en auth.users; este trigger crea el perfil espejo.
-- Los datos vienen de `raw_user_meta_data`, que el front envia en signUp().
-- =============================================================================
create or replace function privado.manejar_usuario_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public, privado
as $$
declare
  v_rol rol_usuario := 'socio';
begin
  -- El correo declarado en ADMIN_BOOTSTRAP_EMAIL se promueve a admin en su
  -- primer registro para poder entrar al panel sin tocar la base a mano.
  if exists (
    select 1 from configuracion
    where clave = 'admin_bootstrap_email'
      and lower(valor #>> '{}') = lower(new.email)
  ) then
    v_rol := 'admin';
  end if;

  insert into perfiles (id, correo, nombre, apellido_paterno, apellido_materno, telefono, rol)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    coalesce(new.raw_user_meta_data ->> 'apellido_paterno', ''),
    nullif(new.raw_user_meta_data ->> 'apellido_materno', ''),
    nullif(new.raw_user_meta_data ->> 'telefono', ''),
    v_rol
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function privado.manejar_usuario_nuevo();

-- =============================================================================
-- HELPERS DE AUTORIZACION
-- Son SECURITY DEFINER a proposito: leen `perfiles` saltandose RLS, lo que
-- evita la recursion infinita que se produce si una politica de `perfiles`
-- consulta `perfiles`.
-- =============================================================================

create or replace function privado.rol_actual()
returns rol_usuario
language sql
stable
security definer
set search_path = public, privado
as $$
  select rol from perfiles where id = auth.uid() and activo;
$$;

-- True si el usuario pertenece al personal (cualquier rol que no sea socio).
create or replace function privado.es_personal()
returns boolean
language sql
stable
security definer
set search_path = public, privado
as $$
  select coalesce(privado.rol_actual() <> 'socio', false);
$$;

create or replace function privado.tiene_rol(variadic p_roles rol_usuario[])
returns boolean
language sql
stable
security definer
set search_path = public, privado
as $$
  select coalesce(privado.rol_actual() = any (p_roles), false);
$$;

-- True si el usuario puede dictaminar o autorizar credito.
create or replace function privado.es_analista()
returns boolean
language sql
stable
security definer
set search_path = public, privado
as $$
  select privado.tiene_rol('analista', 'gerente', 'admin');
$$;

create or replace function privado.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public, privado
as $$
  select privado.tiene_rol('admin');
$$;

-- `privado.socio_actual()` se define junto con la tabla `socios`, en la
-- migracion 20260809100200, porque una funcion SQL no puede compilarse si su
-- tabla todavia no existe.

-- Los permisos de ejecucion definitivos se otorgan al final, en la migracion
-- de RLS (20260809100800), cuando ya existen todas las funciones.

create trigger sucursales_actualizado before update on sucursales
  for each row execute function privado.tocar_actualizado_en();
create trigger perfiles_actualizado before update on perfiles
  for each row execute function privado.tocar_actualizado_en();
