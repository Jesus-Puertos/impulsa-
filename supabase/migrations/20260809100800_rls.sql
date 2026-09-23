-- =============================================================================
-- 20260809100800_rls.sql
-- Seguridad a nivel de fila. Sin estas politicas la clave anonima del front
-- podria leer todo el padron de socios.
--
-- Principios:
--   * Todas las tablas llevan RLS activo. Sin politica = sin acceso.
--   * El socio ve y edita unicamente lo suyo, y solo mientras el tramite lo
--     permite (un expediente aprobado ya no lo puede alterar el socio).
--   * El personal ve segun su rol; el dinero solo lo mueven funciones
--     SECURITY DEFINER que validan el rol por dentro.
--   * El contenido publicado del CMS es legible por visitantes anonimos.
--
-- Reejecucion
--   Cada politica va precedida de su `drop policy if exists`. PostgreSQL no
--   admite `create policy if not exists`, y sin el DROP previo un segundo pase
--   se detiene en la primera con:
--
--     ERROR: 42710: policy "..." for table "..." already exists
--
--   El DROP y el CREATE viajan en la misma transaccion, asi que la politica
--   nunca queda ausente: o se reemplaza entera, o no se toca.
-- =============================================================================

alter table sucursales             enable row level security;
alter table perfiles               enable row level security;
alter table configuracion          enable row level security;
alter table folios                 enable row level security;
alter table socios                 enable row level security;
alter table documentos_socio       enable row level security;
alter table referencias_socio      enable row level security;
alter table beneficiarios          enable row level security;
alter table productos_credito      enable row level security;
alter table simulaciones           enable row level security;
alter table solicitudes_credito    enable row level security;
alter table avales                 enable row level security;
alter table garantias              enable row level security;
alter table creditos               enable row level security;
alter table amortizaciones         enable row level security;
alter table pagos                  enable row level security;
alter table aplicaciones_pago      enable row level security;
alter table productos_ahorro       enable row level security;
alter table cuentas_ahorro         enable row level security;
alter table movimientos_ahorro     enable row level security;
alter table entradas_blog          enable row level security;
alter table testimonios            enable row level security;
alter table preguntas_frecuentes   enable row level security;
alter table avisos                 enable row level security;
alter table notificaciones         enable row level security;
alter table bitacora               enable row level security;
alter table mensajes_contacto      enable row level security;

-- `folios` es infraestructura: solo la tocan funciones SECURITY DEFINER.
-- Al no declarar ninguna politica, queda inaccesible desde la API.

-- =============================================================================
-- SUCURSALES - directorio publico
-- =============================================================================
drop policy if exists "sucursales activas visibles para todos" on sucursales;
create policy "sucursales activas visibles para todos"
  on sucursales for select
  using (activa or privado.es_personal());

drop policy if exists "sucursales administrables por gerencia" on sucursales;
create policy "sucursales administrables por gerencia"
  on sucursales for all
  using (privado.tiene_rol('gerente', 'admin'))
  with check (privado.tiene_rol('gerente', 'admin'));

-- =============================================================================
-- PERFILES
-- =============================================================================
drop policy if exists "perfil propio visible" on perfiles;
create policy "perfil propio visible"
  on perfiles for select
  using (id = auth.uid() or privado.es_personal());

-- El usuario edita sus datos de contacto pero no puede ascenderse: el WITH
-- CHECK compara el rol entrante contra el rol que ya tiene en la base.
drop policy if exists "perfil propio editable sin cambiar rol" on perfiles;
create policy "perfil propio editable sin cambiar rol"
  on perfiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and rol = privado.rol_actual());

drop policy if exists "personal administrado por admin" on perfiles;
create policy "personal administrado por admin"
  on perfiles for all
  using (privado.es_admin())
  with check (privado.es_admin());

-- =============================================================================
-- CONFIGURACION
-- =============================================================================
drop policy if exists "configuracion legible por personal" on configuracion;
create policy "configuracion legible por personal"
  on configuracion for select
  using (privado.es_personal());

drop policy if exists "configuracion editable por admin" on configuracion;
create policy "configuracion editable por admin"
  on configuracion for all
  using (privado.es_admin())
  with check (privado.es_admin());

-- =============================================================================
-- SOCIOS Y EXPEDIENTE
-- =============================================================================
drop policy if exists "socio ve su expediente" on socios;
create policy "socio ve su expediente"
  on socios for select
  using (perfil_id = auth.uid() or privado.es_personal());

-- Al registrarse, la persona crea su propio expediente como prospecto.
drop policy if exists "socio crea su expediente" on socios;
create policy "socio crea su expediente"
  on socios for insert
  to authenticated
  with check (
    (perfil_id = auth.uid() and estado = 'prospecto')
    or privado.tiene_rol('promotor', 'analista', 'gerente', 'admin')
  );

-- El socio completa su expediente solo mientras no ha sido dictaminado. Los
-- campos reservados al personal (numero_socio, score, notas internas) los
-- protege el trigger `privado.proteger_campos_socio`, no esta politica: una
-- subconsulta a `socios` dentro de su propio WITH CHECK provocaria recursion.
drop policy if exists "socio completa su expediente" on socios;
create policy "socio completa su expediente"
  on socios for update
  using (perfil_id = auth.uid() and estado in ('prospecto', 'en_revision'))
  with check (perfil_id = auth.uid() and estado in ('prospecto', 'en_revision'));

drop policy if exists "personal gestiona socios" on socios;
create policy "personal gestiona socios"
  on socios for all
  using (privado.tiene_rol('promotor', 'analista', 'gerente', 'admin'))
  with check (privado.tiene_rol('promotor', 'analista', 'gerente', 'admin'));

-- --- Documentos --------------------------------------------------------------
drop policy if exists "socio ve sus documentos" on documentos_socio;
create policy "socio ve sus documentos"
  on documentos_socio for select
  using (
    socio_id = privado.socio_actual() or privado.es_personal()
  );

drop policy if exists "socio sube sus documentos" on documentos_socio;
create policy "socio sube sus documentos"
  on documentos_socio for insert
  to authenticated
  with check (
    (socio_id = privado.socio_actual() and estado = 'pendiente')
    or privado.es_personal()
  );

-- Puede reemplazar un documento mientras no esté verificado.
drop policy if exists "socio reemplaza documentos no verificados" on documentos_socio;
create policy "socio reemplaza documentos no verificados"
  on documentos_socio for update
  using (socio_id = privado.socio_actual() and estado in ('pendiente', 'rechazado'))
  with check (socio_id = privado.socio_actual() and estado = 'pendiente');

drop policy if exists "personal dictamina documentos" on documentos_socio;
create policy "personal dictamina documentos"
  on documentos_socio for all
  using (privado.tiene_rol('promotor', 'analista', 'gerente', 'admin'))
  with check (privado.tiene_rol('promotor', 'analista', 'gerente', 'admin'));

-- --- Referencias y beneficiarios ---------------------------------------------
drop policy if exists "socio gestiona sus referencias" on referencias_socio;
create policy "socio gestiona sus referencias"
  on referencias_socio for all
  using (socio_id = privado.socio_actual() or privado.es_personal())
  with check (socio_id = privado.socio_actual() or privado.es_personal());

drop policy if exists "socio gestiona sus beneficiarios" on beneficiarios;
create policy "socio gestiona sus beneficiarios"
  on beneficiarios for all
  using (socio_id = privado.socio_actual() or privado.es_personal())
  with check (socio_id = privado.socio_actual() or privado.es_personal());

-- =============================================================================
-- CATALOGOS DE PRODUCTO - vitrina publica
-- =============================================================================
drop policy if exists "productos de credito activos visibles" on productos_credito;
create policy "productos de credito activos visibles"
  on productos_credito for select
  using (activo or privado.es_personal());

drop policy if exists "productos de credito administrables" on productos_credito;
create policy "productos de credito administrables"
  on productos_credito for all
  using (privado.tiene_rol('gerente', 'admin'))
  with check (privado.tiene_rol('gerente', 'admin'));

drop policy if exists "productos de ahorro activos visibles" on productos_ahorro;
create policy "productos de ahorro activos visibles"
  on productos_ahorro for select
  using (activo or privado.es_personal());

drop policy if exists "productos de ahorro administrables" on productos_ahorro;
create policy "productos de ahorro administrables"
  on productos_ahorro for all
  using (privado.tiene_rol('gerente', 'admin'))
  with check (privado.tiene_rol('gerente', 'admin'));

-- =============================================================================
-- SIMULACIONES - cualquiera puede simular, incluso sin cuenta
-- =============================================================================
drop policy if exists "cualquiera registra una simulacion" on simulaciones;
create policy "cualquiera registra una simulacion"
  on simulaciones for insert
  to anon, authenticated
  with check (true);

drop policy if exists "simulaciones propias visibles" on simulaciones;
create policy "simulaciones propias visibles"
  on simulaciones for select
  using (socio_id = privado.socio_actual() or privado.es_personal());

drop policy if exists "personal da seguimiento a leads" on simulaciones;
create policy "personal da seguimiento a leads"
  on simulaciones for update
  using (privado.es_personal())
  with check (privado.es_personal());

-- =============================================================================
-- SOLICITUDES DE CREDITO
-- =============================================================================
drop policy if exists "socio ve sus solicitudes" on solicitudes_credito;
create policy "socio ve sus solicitudes"
  on solicitudes_credito for select
  using (socio_id = privado.socio_actual() or privado.es_personal());

drop policy if exists "socio crea sus solicitudes" on solicitudes_credito;
create policy "socio crea sus solicitudes"
  on solicitudes_credito for insert
  to authenticated
  with check (
    (socio_id = privado.socio_actual() and estado in ('borrador', 'enviada'))
    or privado.tiene_rol('promotor', 'analista', 'gerente', 'admin')
  );

-- El socio puede corregir su solicitud hasta que la envia; despues es del
-- analista. Solo se le permite cambiar a 'enviada' o 'cancelada'.
drop policy if exists "socio edita solicitud en borrador" on solicitudes_credito;
create policy "socio edita solicitud en borrador"
  on solicitudes_credito for update
  using (socio_id = privado.socio_actual() and estado = 'borrador')
  with check (
    socio_id = privado.socio_actual()
    and estado in ('borrador', 'enviada', 'cancelada')
  );

drop policy if exists "personal dictamina solicitudes" on solicitudes_credito;
create policy "personal dictamina solicitudes"
  on solicitudes_credito for all
  using (privado.tiene_rol('promotor', 'analista', 'gerente', 'admin'))
  with check (privado.tiene_rol('promotor', 'analista', 'gerente', 'admin'));

-- --- Avales y garantias: siguen la visibilidad de su solicitud ---------------
drop policy if exists "avales visibles con la solicitud" on avales;
create policy "avales visibles con la solicitud"
  on avales for all
  using (
    exists (
      select 1 from solicitudes_credito s
      where s.id = avales.solicitud_id
        and (s.socio_id = privado.socio_actual() or privado.es_personal())
    )
  )
  with check (
    exists (
      select 1 from solicitudes_credito s
      where s.id = avales.solicitud_id
        and ((s.socio_id = privado.socio_actual() and s.estado = 'borrador')
             or privado.es_personal())
    )
  );

drop policy if exists "garantias visibles con la solicitud" on garantias;
create policy "garantias visibles con la solicitud"
  on garantias for all
  using (
    exists (
      select 1 from solicitudes_credito s
      where s.id = garantias.solicitud_id
        and (s.socio_id = privado.socio_actual() or privado.es_personal())
    )
  )
  with check (
    exists (
      select 1 from solicitudes_credito s
      where s.id = garantias.solicitud_id
        and ((s.socio_id = privado.socio_actual() and s.estado = 'borrador')
             or privado.es_personal())
    )
  );

-- =============================================================================
-- CREDITOS, AMORTIZACION Y PAGOS
-- Son de solo lectura desde la API. Toda escritura pasa por las funciones
-- `desembolsar_credito` y `registrar_pago`, que validan el rol internamente.
-- =============================================================================
drop policy if exists "socio consulta sus creditos" on creditos;
create policy "socio consulta sus creditos"
  on creditos for select
  using (socio_id = privado.socio_actual() or privado.es_personal());

drop policy if exists "gerencia ajusta creditos" on creditos;
create policy "gerencia ajusta creditos"
  on creditos for update
  using (privado.tiene_rol('gerente', 'admin'))
  with check (privado.tiene_rol('gerente', 'admin'));

drop policy if exists "socio consulta su amortizacion" on amortizaciones;
create policy "socio consulta su amortizacion"
  on amortizaciones for select
  using (
    exists (
      select 1 from creditos c
      where c.id = amortizaciones.credito_id
        and (c.socio_id = privado.socio_actual() or privado.es_personal())
    )
  );

drop policy if exists "socio consulta sus pagos" on pagos;
create policy "socio consulta sus pagos"
  on pagos for select
  using (socio_id = privado.socio_actual() or privado.es_personal());

drop policy if exists "gerencia cancela pagos" on pagos;
create policy "gerencia cancela pagos"
  on pagos for update
  using (privado.tiene_rol('gerente', 'admin'))
  with check (privado.tiene_rol('gerente', 'admin'));

drop policy if exists "detalle de aplicacion visible con el pago" on aplicaciones_pago;
create policy "detalle de aplicacion visible con el pago"
  on aplicaciones_pago for select
  using (
    exists (
      select 1 from pagos p
      where p.id = aplicaciones_pago.pago_id
        and (p.socio_id = privado.socio_actual() or privado.es_personal())
    )
  );

-- =============================================================================
-- AHORRO
-- =============================================================================
drop policy if exists "socio consulta sus cuentas" on cuentas_ahorro;
create policy "socio consulta sus cuentas"
  on cuentas_ahorro for select
  using (socio_id = privado.socio_actual() or privado.es_personal());

drop policy if exists "personal gestiona cuentas de ahorro" on cuentas_ahorro;
create policy "personal gestiona cuentas de ahorro"
  on cuentas_ahorro for all
  using (privado.tiene_rol('cajero', 'gerente', 'admin'))
  with check (privado.tiene_rol('cajero', 'gerente', 'admin'));

drop policy if exists "socio consulta sus movimientos" on movimientos_ahorro;
create policy "socio consulta sus movimientos"
  on movimientos_ahorro for select
  using (
    exists (
      select 1 from cuentas_ahorro c
      where c.id = movimientos_ahorro.cuenta_id
        and (c.socio_id = privado.socio_actual() or privado.es_personal())
    )
  );

drop policy if exists "caja registra movimientos" on movimientos_ahorro;
create policy "caja registra movimientos"
  on movimientos_ahorro for insert
  to authenticated
  with check (privado.tiene_rol('cajero', 'gerente', 'admin'));

-- =============================================================================
-- CMS - lectura publica de lo publicado, edicion para el personal
-- =============================================================================
drop policy if exists "entradas publicadas visibles" on entradas_blog;
create policy "entradas publicadas visibles"
  on entradas_blog for select
  using (
    (estado = 'publicado' and publicado_en <= now())
    or privado.es_personal()
  );

drop policy if exists "personal edita entradas" on entradas_blog;
create policy "personal edita entradas"
  on entradas_blog for all
  using (privado.tiene_rol('promotor', 'gerente', 'admin'))
  with check (privado.tiene_rol('promotor', 'gerente', 'admin'));

drop policy if exists "testimonios publicados visibles" on testimonios;
create policy "testimonios publicados visibles"
  on testimonios for select
  using (estado = 'publicado' or privado.es_personal());

drop policy if exists "personal edita testimonios" on testimonios;
create policy "personal edita testimonios"
  on testimonios for all
  using (privado.tiene_rol('promotor', 'gerente', 'admin'))
  with check (privado.tiene_rol('promotor', 'gerente', 'admin'));

drop policy if exists "preguntas publicadas visibles" on preguntas_frecuentes;
create policy "preguntas publicadas visibles"
  on preguntas_frecuentes for select
  using (estado = 'publicado' or privado.es_personal());

drop policy if exists "personal edita preguntas" on preguntas_frecuentes;
create policy "personal edita preguntas"
  on preguntas_frecuentes for all
  using (privado.tiene_rol('promotor', 'gerente', 'admin'))
  with check (privado.tiene_rol('promotor', 'gerente', 'admin'));

drop policy if exists "avisos vigentes visibles" on avisos;
create policy "avisos vigentes visibles"
  on avisos for select
  using (
    (activo and inicia_en <= now() and (termina_en is null or termina_en >= now()))
    or privado.es_personal()
  );

drop policy if exists "personal edita avisos" on avisos;
create policy "personal edita avisos"
  on avisos for all
  using (privado.tiene_rol('promotor', 'gerente', 'admin'))
  with check (privado.tiene_rol('promotor', 'gerente', 'admin'));

-- =============================================================================
-- NOTIFICACIONES, BITACORA Y CONTACTO
-- =============================================================================
drop policy if exists "bandeja propia" on notificaciones;
create policy "bandeja propia"
  on notificaciones for select
  using (perfil_id = auth.uid());

drop policy if exists "marcar propias como leidas" on notificaciones;
create policy "marcar propias como leidas"
  on notificaciones for update
  using (perfil_id = auth.uid())
  with check (perfil_id = auth.uid());

-- La bitacora es de solo lectura incluso para quien la puede consultar: no hay
-- politica de INSERT/UPDATE/DELETE, y el trigger que escribe es SECURITY DEFINER.
drop policy if exists "bitacora consultable por direccion" on bitacora;
create policy "bitacora consultable por direccion"
  on bitacora for select
  using (privado.tiene_rol('gerente', 'admin'));

drop policy if exists "cualquiera escribe al formulario de contacto" on mensajes_contacto;
create policy "cualquiera escribe al formulario de contacto"
  on mensajes_contacto for insert
  to anon, authenticated
  with check (true);

drop policy if exists "personal atiende mensajes" on mensajes_contacto;
create policy "personal atiende mensajes"
  on mensajes_contacto for select
  using (privado.es_personal());

drop policy if exists "personal actualiza mensajes" on mensajes_contacto;
create policy "personal actualiza mensajes"
  on mensajes_contacto for update
  using (privado.es_personal())
  with check (privado.es_personal());

-- =============================================================================
-- PERMISOS SOBRE EL ESQUEMA `privado`
--
-- Se ejecuta aqui, y no al crear cada funcion, porque en este punto ya existen
-- todas y el resultado es determinista.
--
-- Que este esquema no se pueda llamar desde la API REST lo garantiza
-- `config.toml`, que solo publica `public`, `storage` y `graphql_public`. El
-- USAGE que se concedio en la migracion de fundamentos es imprescindible: sin
-- el, cualquier politica que invoque `privado.rol_actual()` fallaria con
-- «permission denied for schema privado» y bloquearia toda lectura.
--
-- Aqui se cierra el unico hueco que queda: las funciones con efectos
-- secundarios. PostgreSQL concede EXECUTE a PUBLIC en toda funcion nueva, asi
-- que sin esto alguien con una sesion valida podria invocar
-- `privado.siguiente_folio('SOL')` en bucle y agotar los consecutivos, o
-- insertar notificaciones falsas en la bandeja de otro socio.
--
-- Se revocan una por una, y no con `revoke ... on all functions`, para no tocar
-- las funciones de trigger: quitarles el permiso no aporta seguridad (no se
-- pueden invocar directamente) y si arrastraran alguna dependencia romperian
-- operaciones legitimas.
-- =============================================================================
-- Nota de sintaxis: desde PostgreSQL 14 se puede omitir la lista de argumentos
-- cuando el nombre de la funcion es unico en su esquema, como ocurre aqui. Se
-- prefiere esa forma porque escribir la firma a mano es la fuente habitual de
-- errores, sobre todo con `tiene_rol`, que es VARIADIC.
revoke execute on function privado.siguiente_folio from public;
revoke execute on function privado.notificar from public;
revoke execute on function privado.config_numero from public;

-- `service_role` salta RLS por diseno y solo se usa desde el servidor. Conserva
-- acceso completo para las tareas administrativas y los procesos programados.
grant execute on all functions in schema privado to service_role;

-- Helpers de autorizacion: los evalua cada politica, en cada consulta.
-- `anon` tambien los necesita: politicas como «sucursales activas visibles»
-- llaman a `privado.es_personal()` incluso para visitantes sin sesion.
grant execute on function
  privado.rol_actual,
  privado.es_personal,
  privado.tiene_rol,
  privado.es_analista,
  privado.es_admin,
  privado.socio_actual
  to anon, authenticated;

-- `calcular_pago_periodico` es publica y llama a este helper por dentro. Sin
-- este permiso, el simulador fallaria al invocarla desde la API.
grant execute on function privado.periodos_por_anio to anon, authenticated;

-- =============================================================================
-- PERMISOS DE TABLA
-- RLS filtra filas, pero PostgREST tambien exige el GRANT correspondiente.
-- =============================================================================
grant usage on schema public to anon, authenticated;

grant select on sucursales, productos_credito, productos_ahorro,
  entradas_blog, testimonios, preguntas_frecuentes, avisos
  to anon, authenticated;

grant insert on simulaciones, mensajes_contacto to anon, authenticated;

grant select, insert, update on socios, documentos_socio, referencias_socio,
  beneficiarios, solicitudes_credito, avales, garantias, simulaciones,
  mensajes_contacto, notificaciones, perfiles, configuracion, cuentas_ahorro,
  movimientos_ahorro
  to authenticated;

grant select on creditos, amortizaciones, pagos, aplicaciones_pago, bitacora
  to authenticated;

grant update on creditos, pagos to authenticated;

grant delete on documentos_socio, referencias_socio, beneficiarios, avales,
  garantias, entradas_blog, testimonios, preguntas_frecuentes, avisos
  to authenticated;

grant insert, update, delete on entradas_blog, testimonios, preguntas_frecuentes,
  avisos, sucursales, productos_credito, productos_ahorro
  to authenticated;
