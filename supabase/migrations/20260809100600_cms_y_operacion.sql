-- =============================================================================
-- 20260809100600_cms_y_operacion.sql
-- Contenido editable del sitio publico (el CMS propio) y las tablas de apoyo a
-- la operacion diaria: notificaciones, bitacora de auditoria y bandeja de
-- mensajes de contacto.
-- =============================================================================

-- =============================================================================
-- CONTENIDO EDITORIAL
-- =============================================================================
create table entradas_blog (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  titulo        text not null,
  resumen       text,
  contenido     text not null default '',   -- Markdown
  imagen_portada text,
  categoria     text not null default 'Educación financiera',
  etiquetas     text[] not null default '{}',
  autor_id      uuid references perfiles (id) on delete set null,
  autor_nombre  text,                        -- se conserva aunque el autor cause baja
  estado        estado_publicacion not null default 'borrador',
  destacado     boolean not null default false,
  minutos_lectura integer check (minutos_lectura > 0),
  publicado_en  timestamptz,
  seo_titulo    text,
  seo_descripcion text,
  vistas        integer not null default 0,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint entradas_publicada_con_fecha check (
    estado <> 'publicado' or publicado_en is not null
  )
);

comment on table entradas_blog is
  'Articulos de educacion financiera y noticias, administrados desde /admin.';

create index entradas_blog_publicadas_idx on entradas_blog (estado, publicado_en desc);
create index entradas_blog_categoria_idx on entradas_blog (categoria);

create table testimonios (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  cargo      text,                 -- "Socia desde 2019", "Productor de café"
  texto      text not null,
  foto_url   text,
  sucursal   text,
  calificacion smallint check (calificacion between 1 and 5),
  estado     estado_publicacion not null default 'borrador',
  orden      integer not null default 0,
  creado_en  timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table testimonios is 'Testimonios de socios mostrados en el sitio publico.';

create index testimonios_publicados_idx on testimonios (estado, orden);

create table preguntas_frecuentes (
  id        uuid primary key default gen_random_uuid(),
  categoria text not null default 'General',
  pregunta  text not null,
  respuesta text not null,
  orden     integer not null default 0,
  estado    estado_publicacion not null default 'publicado',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table preguntas_frecuentes is 'Banco de preguntas frecuentes por categoria.';

create index preguntas_frecuentes_idx on preguntas_frecuentes (estado, categoria, orden);

-- Avisos temporales en la parte superior del sitio (tasas nuevas, asambleas,
-- suspension de servicio). Se muestran solo dentro de su ventana de vigencia.
create table avisos (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null,
  mensaje    text not null,
  tipo       text not null default 'info',   -- info, alerta, exito, error
  enlace     text,
  texto_enlace text,
  inicia_en  timestamptz not null default now(),
  termina_en timestamptz,
  activo     boolean not null default true,
  creado_en  timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table avisos is 'Comunicados con vigencia mostrados en el sitio publico.';

create index avisos_vigentes_idx on avisos (activo, inicia_en, termina_en);

create trigger entradas_blog_actualizado before update on entradas_blog
  for each row execute function privado.tocar_actualizado_en();
create trigger testimonios_actualizado before update on testimonios
  for each row execute function privado.tocar_actualizado_en();
create trigger preguntas_frecuentes_actualizado before update on preguntas_frecuentes
  for each row execute function privado.tocar_actualizado_en();
create trigger avisos_actualizado before update on avisos
  for each row execute function privado.tocar_actualizado_en();

-- Sella la fecha de publicacion la primera vez que una entrada se publica.
create or replace function privado.sellar_publicacion()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'publicado' and new.publicado_en is null then
    new.publicado_en := now();
  end if;
  return new;
end;
$$;

create trigger entradas_blog_publicacion before insert or update on entradas_blog
  for each row execute function privado.sellar_publicacion();

-- =============================================================================
-- NOTIFICACIONES
-- =============================================================================
create table notificaciones (
  id         uuid primary key default gen_random_uuid(),
  perfil_id  uuid not null references perfiles (id) on delete cascade,
  titulo     text not null,
  mensaje    text not null,
  tipo       text not null default 'info',
  enlace     text,
  leida      boolean not null default false,
  leida_en   timestamptz,
  creado_en  timestamptz not null default now()
);

comment on table notificaciones is
  'Avisos dirigidos a una persona concreta (resolucion de solicitud, pago aplicado, cuota proxima).';

create index notificaciones_bandeja_idx on notificaciones (perfil_id, leida, creado_en desc);

-- Atajo para que las funciones de negocio notifiquen sin repetir el insert.
create or replace function privado.notificar(
  p_perfil_id uuid,
  p_titulo text,
  p_mensaje text,
  p_tipo text default 'info',
  p_enlace text default null
)
returns void
language plpgsql
security definer
set search_path = public, privado
as $$
begin
  if p_perfil_id is null then
    return;   -- socios captados en ventanilla no tienen cuenta de acceso
  end if;

  insert into notificaciones (perfil_id, titulo, mensaje, tipo, enlace)
  values (p_perfil_id, p_titulo, p_mensaje, p_tipo, p_enlace);
end;
$$;

-- =============================================================================
-- BITACORA DE AUDITORIA
-- Registro inmutable de cambios sobre las tablas sensibles. Se alimenta con el
-- trigger generico `privado.auditar()`.
-- =============================================================================
create table bitacora (
  id           bigserial primary key,
  actor_id     uuid references perfiles (id) on delete set null,
  actor_correo text,
  accion       text not null,          -- INSERT, UPDATE, DELETE
  tabla        text not null,
  registro_id  text,
  datos_antes  jsonb,
  datos_despues jsonb,
  creado_en    timestamptz not null default now()
);

comment on table bitacora is
  'Rastro de auditoria de las tablas sensibles. Solo lectura para el personal.';

create index bitacora_tabla_idx on bitacora (tabla, creado_en desc);
create index bitacora_actor_idx on bitacora (actor_id, creado_en desc);
create index bitacora_registro_idx on bitacora (registro_id);

create or replace function privado.auditar()
returns trigger
language plpgsql
security definer
set search_path = public, privado
as $$
declare
  v_id text;
begin
  v_id := case tg_op
    when 'DELETE' then (to_jsonb(old) ->> 'id')
    else (to_jsonb(new) ->> 'id')
  end;

  insert into bitacora (actor_id, actor_correo, accion, tabla, registro_id, datos_antes, datos_despues)
  values (
    auth.uid(),
    (select correo from perfiles where id = auth.uid()),
    tg_op,
    tg_table_name,
    v_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

-- Tablas bajo auditoria: dinero, expediente y permisos.
create trigger auditar_socios after insert or update or delete on socios
  for each row execute function privado.auditar();
create trigger auditar_solicitudes after insert or update or delete on solicitudes_credito
  for each row execute function privado.auditar();
create trigger auditar_creditos after insert or update or delete on creditos
  for each row execute function privado.auditar();
create trigger auditar_pagos after insert or update or delete on pagos
  for each row execute function privado.auditar();
create trigger auditar_perfiles after insert or update or delete on perfiles
  for each row execute function privado.auditar();
create trigger auditar_productos_credito after insert or update or delete on productos_credito
  for each row execute function privado.auditar();
create trigger auditar_configuracion after insert or update or delete on configuracion
  for each row execute function privado.auditar();

-- =============================================================================
-- BANDEJA DE CONTACTO
-- =============================================================================
create table mensajes_contacto (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  correo     text not null,
  telefono   text,
  asunto     text,
  mensaje    text not null,
  sucursal_id uuid references sucursales (id) on delete set null,
  atendido   boolean not null default false,
  atendido_por uuid references perfiles (id) on delete set null,
  atendido_en  timestamptz,
  respuesta  text,
  origen     text not null default 'web',
  creado_en  timestamptz not null default now()
);

comment on table mensajes_contacto is
  'Mensajes recibidos por el formulario de contacto del sitio publico.';

create index mensajes_contacto_pendientes_idx on mensajes_contacto (atendido, creado_en desc);
