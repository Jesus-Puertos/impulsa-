-- =============================================================================
-- 20260809100200_socios_y_expediente.sql
-- Expediente del socio: identificacion, domicilio, perfil economico, documentos
-- probatorios (INE, CURP, comprobantes), referencias y beneficiarios.
--
-- La integridad de CURP / RFC / CLABE se valida aqui con CHECK ademas de en el
-- formulario: el front puede cambiar, la base es la ultima linea de defensa.
-- =============================================================================

create table socios (
  id            uuid primary key default gen_random_uuid(),
  -- Un socio puede existir sin cuenta de acceso (captado en ventanilla por un
  -- promotor), de ahi que perfil_id sea opcional.
  perfil_id     uuid unique references perfiles (id) on delete set null,
  numero_socio  text unique,

  -- --- Identificacion --------------------------------------------------------
  nombre            text not null,
  apellido_paterno  text not null,
  apellido_materno  text,
  curp              text not null unique,
  rfc               text unique,
  fecha_nacimiento  date not null,
  genero            genero_persona,
  estado_civil      estado_civil_persona,
  nacionalidad      text not null default 'Mexicana',
  entidad_nacimiento text,
  clave_elector     text,          -- clave de elector impresa en la INE
  numero_ine        text,          -- CIC / numero de identificacion del anverso
  vigencia_ine      date,

  -- --- Contacto y domicilio --------------------------------------------------
  correo         text,
  telefono       text,
  telefono_alterno text,
  calle          text,
  numero_exterior text,
  numero_interior text,
  colonia        text,
  municipio      text,
  entidad        text,
  codigo_postal  text,
  referencia_domicilio text,
  antiguedad_domicilio_meses integer check (antiguedad_domicilio_meses >= 0),
  tipo_vivienda  text,             -- propia, rentada, familiar

  -- --- Perfil economico ------------------------------------------------------
  ocupacion            text,
  escolaridad          nivel_escolaridad,
  nombre_empresa       text,
  antiguedad_laboral_meses integer check (antiguedad_laboral_meses >= 0),
  ingreso_mensual      numeric(14, 2) check (ingreso_mensual >= 0),
  egresos_mensuales    numeric(14, 2) check (egresos_mensuales >= 0),
  otros_ingresos       numeric(14, 2) default 0 check (otros_ingresos >= 0),
  fuente_otros_ingresos text,
  dependientes_economicos integer default 0 check (dependientes_economicos >= 0),

  -- --- Datos bancarios -------------------------------------------------------
  banco  text,
  clabe  text,

  -- --- Situacion en la cooperativa -------------------------------------------
  estado         estado_socio not null default 'prospecto',
  sucursal_id    uuid references sucursales (id) on delete set null,
  promotor_id    uuid references perfiles (id) on delete set null,
  aportacion_social numeric(14, 2) not null default 0 check (aportacion_social >= 0),
  -- Calificacion interna 0-1000 para apoyar el dictamen; la calcula el analista
  -- o un proceso posterior, no se deriva automaticamente.
  score_interno  integer check (score_interno between 0 and 1000),
  acepta_aviso_privacidad boolean not null default false,
  acepta_consulta_buro    boolean not null default false,
  fecha_alta     date,
  fecha_baja     date,
  motivo_baja    text,
  notas_internas text,

  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  -- --- Reglas de formato -----------------------------------------------------
  -- CURP: 4 letras + AAMMDD + H/M + 2 letras de entidad + 3 consonantes
  --       internas + homoclave + digito verificador (18 caracteres).
  constraint socios_curp_formato check (
    curp ~ '^[A-Z]{4}[0-9]{6}[HM][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[0-9A-Z][0-9]$'
  ),
  -- RFC de persona fisica: 4 letras + AAMMDD + homoclave (13 caracteres).
  constraint socios_rfc_formato check (
    rfc is null or rfc ~ '^[A-ZÑ&]{4}[0-9]{6}[A-Z0-9]{3}$'
  ),
  -- CLABE interbancaria: exactamente 18 digitos.
  constraint socios_clabe_formato check (clabe is null or clabe ~ '^[0-9]{18}$'),
  constraint socios_cp_formato check (codigo_postal is null or codigo_postal ~ '^[0-9]{5}$'),
  -- Solo se admiten mayores de edad como socios titulares.
  constraint socios_mayor_de_edad check (fecha_nacimiento <= (current_date - interval '18 years')),
  constraint socios_baja_coherente check (
    (estado <> 'baja') or (fecha_baja is not null)
  )
);

comment on table socios is 'Expediente unico de cada persona asociada a la cooperativa.';
comment on column socios.curp is 'Clave Unica de Registro de Poblacion, 18 caracteres en mayusculas.';
comment on column socios.score_interno is 'Calificacion crediticia interna 0-1000 asignada por el analista.';

create index socios_estado_idx on socios (estado);
create index socios_sucursal_idx on socios (sucursal_id);
create index socios_promotor_idx on socios (promotor_id);
create index socios_perfil_idx on socios (perfil_id);
-- Busqueda del buscador del panel.
--
-- Se usan indices de trigramas (pg_trgm) y no un indice de texto completo
-- porque el panel busca con `ILIKE '%texto%'`: quien atiende en ventanilla
-- teclea un fragmento del apellido o los ultimos digitos del telefono, no
-- palabras completas. Un indice GIN de `tsvector` no acelera ese patron.
--
-- Nota: `unaccent()` NO puede usarse en una expresion de indice porque es
-- STABLE, no IMMUTABLE (depende de un diccionario configurable). Si mas
-- adelante se necesita busqueda insensible a acentos, aplicala en la CONSULTA
-- (`where extensions.unaccent(nombre) ilike extensions.unaccent($1)`) o crea
-- una columna generada que ya venga normalizada.
create index socios_nombre_trgm_idx on socios using gin (
  (trim(both ' ' from
    coalesce(nombre, '') || ' ' ||
    coalesce(apellido_paterno, '') || ' ' ||
    coalesce(apellido_materno, '')
  )) extensions.gin_trgm_ops
);
create index socios_curp_trgm_idx on socios using gin (curp extensions.gin_trgm_ops);
create index socios_numero_socio_trgm_idx on socios using gin (numero_socio extensions.gin_trgm_ops);
create index socios_telefono_trgm_idx on socios using gin (telefono extensions.gin_trgm_ops);

create trigger socios_actualizado before update on socios
  for each row execute function privado.tocar_actualizado_en();

-- Normaliza a mayusculas los campos que por norma se escriben asi, para que la
-- unicidad de CURP y RFC no dependa de como los escriba el usuario.
-- SECURITY DEFINER: el trigger llama a `privado.siguiente_folio`, cuyo
-- EXECUTE esta revocado de PUBLIC. Correr como propietario evita tener que
-- exponer el generador de folios a los roles de la API.
create or replace function privado.normalizar_socio()
returns trigger
language plpgsql
security definer
set search_path = public, privado
as $$
begin
  new.curp := upper(trim(new.curp));
  new.rfc  := nullif(upper(trim(coalesce(new.rfc, ''))), '');
  new.clabe := nullif(regexp_replace(coalesce(new.clabe, ''), '\s', '', 'g'), '');
  new.correo := nullif(lower(trim(coalesce(new.correo, ''))), '');

  -- Al pasar a 'activo' por primera vez se asigna numero de socio y fecha de
  -- alta. El numero es el identificador que el socio usa en ventanilla.
  if new.estado = 'activo' and new.numero_socio is null then
    new.numero_socio := privado.siguiente_folio('SOC');
    new.fecha_alta := coalesce(new.fecha_alta, current_date);
  end if;

  return new;
end;
$$;

create trigger socios_normalizar before insert or update on socios
  for each row execute function privado.normalizar_socio();

-- Campos que solo el personal puede tocar. Se protegen con trigger porque una
-- politica RLS no puede comparar el valor entrante contra el almacenado sin
-- consultar la propia tabla (y provocar recursion).
create or replace function privado.proteger_campos_socio()
returns trigger
language plpgsql
security definer
set search_path = public, privado
as $$
begin
  -- El personal y los procesos internos (sin auth.uid()) pasan sin revision.
  if auth.uid() is null or privado.es_personal() then
    return new;
  end if;

  new.numero_socio    := old.numero_socio;
  new.score_interno   := old.score_interno;
  new.notas_internas  := old.notas_internas;
  new.promotor_id     := old.promotor_id;
  new.aportacion_social := old.aportacion_social;
  new.fecha_alta      := old.fecha_alta;
  new.fecha_baja      := old.fecha_baja;
  new.perfil_id       := old.perfil_id;

  return new;
end;
$$;

-- Se ejecuta despues de `socios_normalizar` para que este no pueda reasignar
-- numero_socio en nombre del socio.
create trigger socios_proteger before update on socios
  for each row execute function privado.proteger_campos_socio();

-- Id del socio asociado al usuario autenticado (null si es personal interno).
create or replace function privado.socio_actual()
returns uuid
language sql
stable
security definer
set search_path = public, privado
as $$
  select id from socios where perfil_id = auth.uid() limit 1;
$$;

-- El permiso de ejecucion se otorga en la migracion de RLS (20260809100800),
-- junto con el resto de helpers de autorizacion.

-- =============================================================================
-- DOCUMENTOS DEL EXPEDIENTE (KYC)
-- Los archivos viven en el bucket privado `documentos-kyc` de Supabase Storage;
-- aqui solo se guarda la ruta y el resultado de la revision.
-- =============================================================================
create table documentos_socio (
  id             uuid primary key default gen_random_uuid(),
  socio_id       uuid not null references socios (id) on delete cascade,
  tipo           tipo_documento not null,
  ruta_storage   text not null,
  nombre_archivo text,
  mime           text,
  tamano_bytes   integer check (tamano_bytes > 0),
  estado         estado_documento not null default 'pendiente',
  revisado_por   uuid references perfiles (id) on delete set null,
  revisado_en    timestamptz,
  motivo_rechazo text,
  vigencia_hasta date,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint documentos_rechazo_con_motivo check (
    estado <> 'rechazado' or motivo_rechazo is not null
  )
);

comment on table documentos_socio is
  'Documentos probatorios del expediente. El archivo se almacena en Storage.';

-- Un unico documento vigente por tipo y socio: al resubir se reemplaza la fila.
create unique index documentos_socio_tipo_unico_idx
  on documentos_socio (socio_id, tipo);
create index documentos_socio_estado_idx on documentos_socio (estado);

create trigger documentos_socio_actualizado before update on documentos_socio
  for each row execute function privado.tocar_actualizado_en();

-- Sella quien y cuando reviso, sin confiar en que el cliente lo mande.
create or replace function privado.sellar_revision_documento()
returns trigger
language plpgsql
as $$
begin
  if new.estado is distinct from old.estado and new.estado <> 'pendiente' then
    new.revisado_por := auth.uid();
    new.revisado_en  := now();
  end if;
  return new;
end;
$$;

create trigger documentos_socio_sellar before update on documentos_socio
  for each row execute function privado.sellar_revision_documento();

-- =============================================================================
-- REFERENCIAS Y BENEFICIARIOS
-- =============================================================================
create table referencias_socio (
  id          uuid primary key default gen_random_uuid(),
  socio_id    uuid not null references socios (id) on delete cascade,
  nombre      text not null,
  parentesco  text,
  telefono    text not null,
  direccion   text,
  -- Se marca cuando el promotor confirma la referencia por telefono.
  verificada  boolean not null default false,
  creado_en   timestamptz not null default now()
);

comment on table referencias_socio is
  'Referencias personales o comerciales exigidas en la admision.';

create index referencias_socio_idx on referencias_socio (socio_id);

create table beneficiarios (
  id               uuid primary key default gen_random_uuid(),
  socio_id         uuid not null references socios (id) on delete cascade,
  nombre           text not null,
  parentesco       text not null,
  fecha_nacimiento date,
  telefono         text,
  -- Porcentaje del haber social que le corresponde.
  porcentaje       numeric(5, 2) not null check (porcentaje > 0 and porcentaje <= 100),
  creado_en        timestamptz not null default now()
);

comment on table beneficiarios is
  'Designacion de beneficiarios del haber social del socio.';

create index beneficiarios_socio_idx on beneficiarios (socio_id);

-- La suma de porcentajes de un socio no puede exceder 100.
create or replace function privado.validar_porcentaje_beneficiarios()
returns trigger
language plpgsql
as $$
declare
  v_total numeric(6, 2);
begin
  select coalesce(sum(porcentaje), 0) into v_total
  from beneficiarios
  where socio_id = new.socio_id
    and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if v_total + new.porcentaje > 100 then
    -- En RAISE, `%` sustituye el argumento y `%%` imprime un signo de
    -- porcentaje literal. Aqui hace falta uno de cada tipo.
    raise exception 'La suma de porcentajes de beneficiarios (%) excede 100%%',
      v_total + new.porcentaje;
  end if;

  return new;
end;
$$;

create trigger beneficiarios_validar before insert or update on beneficiarios
  for each row execute function privado.validar_porcentaje_beneficiarios();
