-- =============================================================================
-- 20260809100900_storage.sql
-- Buckets de Supabase Storage y sus politicas.
--
-- Convencion de rutas en `documentos-kyc`:  {socio_id}/{tipo}-{epoch}.{ext}
-- El primer segmento de la ruta es el id del socio, y sobre el se apoyan las
-- politicas: nadie puede leer una carpeta que no sea la suya.
--
-- Reejecucion
--   Los buckets se insertan con `on conflict do nothing` y cada politica va
--   precedida de su `drop policy if exists`, de modo que el archivo se puede
--   volver a correr completo sin errores.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- Expedientes: PRIVADO. El acceso se da con URLs firmadas de corta vigencia.
  ('documentos-kyc', 'documentos-kyc', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']),
  -- Imagenes del CMS: publicas por definicion.
  ('contenido', 'contenido', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/avif']),
  ('avatares', 'avatares', true, 2097152,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- =============================================================================
-- documentos-kyc
-- =============================================================================
drop policy if exists "socio sube documentos a su carpeta" on storage.objects;
create policy "socio sube documentos a su carpeta"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'documentos-kyc'
    and (
      (storage.foldername(name))[1] = privado.socio_actual()::text
      or privado.es_personal()
    )
  );

drop policy if exists "socio lee documentos de su carpeta" on storage.objects;
create policy "socio lee documentos de su carpeta"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'documentos-kyc'
    and (
      (storage.foldername(name))[1] = privado.socio_actual()::text
      or privado.es_personal()
    )
  );

drop policy if exists "socio reemplaza documentos de su carpeta" on storage.objects;
create policy "socio reemplaza documentos de su carpeta"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'documentos-kyc'
    and (
      (storage.foldername(name))[1] = privado.socio_actual()::text
      or privado.es_personal()
    )
  );

-- Solo el personal puede borrar evidencia del expediente.
drop policy if exists "personal elimina documentos kyc" on storage.objects;
create policy "personal elimina documentos kyc"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'documentos-kyc' and privado.es_personal());

-- =============================================================================
-- contenido (CMS)
-- =============================================================================
drop policy if exists "contenido legible por cualquiera" on storage.objects;
create policy "contenido legible por cualquiera"
  on storage.objects for select
  using (bucket_id = 'contenido');

drop policy if exists "personal administra contenido" on storage.objects;
create policy "personal administra contenido"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'contenido'
    and privado.tiene_rol('promotor', 'gerente', 'admin')
  )
  with check (
    bucket_id = 'contenido'
    and privado.tiene_rol('promotor', 'gerente', 'admin')
  );

-- =============================================================================
-- avatares
-- =============================================================================
drop policy if exists "avatares legibles por cualquiera" on storage.objects;
create policy "avatares legibles por cualquiera"
  on storage.objects for select
  using (bucket_id = 'avatares');

drop policy if exists "cada quien administra su avatar" on storage.objects;
create policy "cada quien administra su avatar"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
