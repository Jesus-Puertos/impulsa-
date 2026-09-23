-- =============================================================================
-- REPARACIÓN 001 · Índices de búsqueda y permisos del esquema `privado`
--
-- Motivo
--   La migración 20260809100200 creaba un índice GIN cuya expresión llamaba a
--   `unaccent()`. PostgreSQL la rechaza con:
--
--     ERROR: 42P17: functions in index expression must be marked IMMUTABLE
--
--   `unaccent()` es STABLE, no IMMUTABLE: depende de un diccionario que puede
--   reconfigurarse, así que el planificador no puede garantizar que el valor
--   indexado siga siendo válido.
--
--   Al revisar la causa se encontraron otros dos defectos en las migraciones,
--   corregidos también en el repositorio:
--
--     * `revoke all on schema privado` quitaba USAGE a `anon` y
--       `authenticated`. Sin USAGE, cualquier política RLS que invoque
--       `privado.rol_actual()` habría fallado con «permission denied for
--       schema privado», bloqueando toda lectura de la API.
--     * Un `RAISE` en el validador de beneficiarios usaba `%%` (porcentaje
--       literal) pero pasaba un argumento, lo que produce «too many parameters
--       specified for RAISE» al superar el 100 %.
--
-- Cómo usarlo
--   Pega este archivo completo en el SQL Editor de Supabase y ejecútalo. Es
--   idempotente: puedes correrlo las veces que haga falta.
--
--   * Si la migración 200 se revirtió entera (lo habitual: el editor envuelve
--     la ejecución en una transacción), el script te avisará y solo tendrás
--     que volver a ejecutar las migraciones ya corregidas, en orden.
--   * Si la tabla `socios` sí existe, el script deja todo en su sitio y puedes
--     continuar con la migración 20260809100300.
-- =============================================================================

-- 1. Extensiones ----------------------------------------------------------------
create extension if not exists "pg_trgm" with schema extensions;

-- 2. Permisos del esquema `privado` ---------------------------------------------
-- Imprescindible: sin USAGE, las políticas RLS no pueden evaluar sus helpers.
grant usage on schema privado to anon, authenticated, service_role;

-- 3. Retira el índice defectuoso si llegó a existir ------------------------------
drop index if exists socios_busqueda_idx;

-- 4. Índices de búsqueda correctos -----------------------------------------------
do $$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'socios') then
    raise notice '---------------------------------------------------------------';
    raise notice 'La tabla `socios` no existe: la migración 20260809100200 se';
    raise notice 'revirtió por completo. Vuelve a ejecutar las migraciones ya';
    raise notice 'corregidas desde 20260809100200 en adelante, en orden.';
    raise notice 'Este script no tiene nada más que hacer.';
    raise notice '---------------------------------------------------------------';
    return;
  end if;

  -- Trigramas, no texto completo: el panel busca con `ILIKE '%texto%'`.
  create index if not exists socios_nombre_trgm_idx on socios using gin (
    (trim(both ' ' from
      coalesce(nombre, '') || ' ' ||
      coalesce(apellido_paterno, '') || ' ' ||
      coalesce(apellido_materno, '')
    )) extensions.gin_trgm_ops
  );

  create index if not exists socios_curp_trgm_idx
    on socios using gin (curp extensions.gin_trgm_ops);

  create index if not exists socios_numero_socio_trgm_idx
    on socios using gin (numero_socio extensions.gin_trgm_ops);

  create index if not exists socios_telefono_trgm_idx
    on socios using gin (telefono extensions.gin_trgm_ops);

  raise notice 'Índices de búsqueda de socios creados correctamente.';
end
$$;

-- 5. Corrige el RAISE del validador de beneficiarios -----------------------------
do $$
begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'beneficiarios') then
    raise notice 'La tabla `beneficiarios` aún no existe; se omite este paso.';
    return;
  end if;

  create or replace function privado.validar_porcentaje_beneficiarios()
  returns trigger
  language plpgsql
  as $funcion$
  declare
    v_total numeric(6, 2);
  begin
    select coalesce(sum(porcentaje), 0) into v_total
    from beneficiarios
    where socio_id = new.socio_id
      and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

    if v_total + new.porcentaje > 100 then
      -- `%` sustituye el argumento; `%%` imprime un signo de porcentaje.
      raise exception 'La suma de porcentajes de beneficiarios (%) excede 100%%',
        v_total + new.porcentaje;
    end if;

    return new;
  end;
  $funcion$;

  raise notice 'Validador de beneficiarios corregido.';
end
$$;

-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================

-- a) Deben aparecer los cuatro índices `*_trgm_idx`.
select 'indices' as revision, indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'socios' and indexname like '%trgm%'
order by indexname;

-- b) `anon` y `authenticated` deben tener USAGE sobre `privado`.
--    Si alguna fila dice `false`, las políticas RLS fallarán.
select
  'usage privado' as revision,
  rol,
  has_schema_privilege(rol, 'privado', 'usage') as tiene_usage
from unnest(array['anon', 'authenticated', 'service_role']) as rol;
