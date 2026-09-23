# 04 · Seguridad y RLS

Este sistema guarda CURP, INE, ingresos y deudas de personas reales. Un fallo
aquí no es un bug: es una filtración de datos personales sensibles.

## Las tres capas

| Capa                      | Qué hace                                              | Si falla                                        |
| ------------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| `src/middleware.ts`       | Redirige según sesión y rol                           | Alguien ve una pantalla vacía o un 403          |
| Endpoints y páginas SSR   | Validan entradas y reglas de negocio                  | Datos mal formados; RLS aún protege             |
| **Políticas RLS**         | Filtran filas en PostgreSQL                           | **Filtración de datos** ← la capa que importa   |

Las dos primeras son comodidad y validación. **La única barrera real es RLS.**
Regla práctica: si al quitar el middleware alguien pudiera leer datos ajenos, la
política RLS está mal escrita.

## Cómo funciona la autorización

Cuatro funciones `SECURITY DEFINER` en el esquema `privado` resuelven quién es
quien pregunta:

```sql
privado.rol_actual()    -- rol del usuario autenticado
privado.es_personal()   -- true si su rol no es 'socio'
privado.tiene_rol(...)  -- true si coincide con alguno de los indicados
privado.es_analista()   -- analista, gerente o admin
privado.es_admin()      -- admin
privado.socio_actual()  -- id del expediente del usuario, o null
```

Son `SECURITY DEFINER` **a propósito**: leen `perfiles` saltándose RLS. Si no lo
hicieran, una política sobre `perfiles` que consultara `perfiles` provocaría
recursión infinita y la consulta fallaría.

### Por qué el esquema `privado` sí concede USAGE

Lo que impide llamar estas funciones desde la API REST **no son los permisos**,
sino `config.toml`, que solo publica los esquemas `public`, `storage` y
`graphql_public`.

Los roles `anon` y `authenticated` necesitan `USAGE` sobre `privado`. Es
contraintuitivo, pero sin él ninguna consulta funcionaría: cada política RLS
invoca `privado.rol_actual()` o `privado.es_personal()`, y sin `USAGE` sobre el
esquema esa llamada falla con *permission denied for schema privado*, lo que
bloquea toda lectura, incluida la del sitio público.

Lo que sí se cierra es el `EXECUTE` que PostgreSQL concede a `PUBLIC` en cada
función nueva, sobre las tres que tienen efectos secundarios:

| Función                    | Por qué se revoca                                          |
| -------------------------- | ---------------------------------------------------------- |
| `privado.siguiente_folio`  | Invocada en bucle agotaría los consecutivos de folios.     |
| `privado.notificar`        | Permitiría insertar avisos falsos en la bandeja de otro socio. |
| `privado.config_numero`    | Expondría parámetros internos a cualquier sesión.          |

Los triggers que necesitan `siguiente_folio` (`normalizar_socio`,
`sellar_solicitud`, `sellar_credito`, `sellar_pago`, `sellar_cuenta_ahorro`) son
`SECURITY DEFINER`, de modo que corren como propietario y no hace falta exponer
el generador de folios a los roles de la API.

## Reglas por tabla

### El socio ve lo suyo, y solo mientras el trámite lo permite

| Tabla                 | Lectura                    | Escritura del socio                                       |
| --------------------- | -------------------------- | --------------------------------------------------------- |
| `socios`              | Su propio expediente       | Solo si está en `prospecto` o `en_revision`               |
| `documentos_socio`    | Los suyos                  | Puede subir y reemplazar mientras no estén `verificado`   |
| `solicitudes_credito` | Las suyas                  | Solo mientras están en `borrador`                          |
| `creditos`            | Los suyos                  | **Ninguna** (solo lectura)                                 |
| `amortizaciones`      | Las de sus créditos        | **Ninguna**                                                |
| `pagos`               | Los suyos                  | **Ninguna**                                                |
| `cuentas_ahorro`      | Las suyas                  | **Ninguna**                                                |
| `notificaciones`      | Las suyas                  | Solo marcarlas como leídas                                 |

### Los campos reservados se protegen con trigger, no con RLS

`numero_socio`, `score_interno`, `notas_internas`, `promotor_id`,
`aportacion_social` y las fechas de alta y baja no los puede tocar el socio.

Esto **no** se resuelve en la política `WITH CHECK`, porque comparar el valor
entrante contra el almacenado exigiría consultar `socios` desde una política de
`socios` — recursión. Lo hace el trigger `privado.proteger_campos_socio`, que
revierte esos campos cuando quien edita no es personal.

### El dinero solo se mueve por funciones

`creditos`, `amortizaciones` y `pagos` no tienen políticas de INSERT desde la
API. Toda escritura pasa por `desembolsar_credito` y `registrar_pago`, que
validan el rol por dentro:

```sql
if not privado.tiene_rol('gerente', 'admin') then
  raise exception 'Solo gerencia o administración pueden desembolsar créditos';
end if;
```

Así, aunque alguien llamara la función desde fuera de la aplicación, la
comprobación sigue ahí.

### El contenido publicado es público; el borrador no

```sql
create policy "entradas publicadas visibles"
  on entradas_blog for select
  using ((estado = 'publicado' and publicado_en <= now()) or privado.es_personal());
```

Un artículo en borrador solo lo ve el personal. Lo mismo para testimonios,
preguntas frecuentes y avisos (estos además respetan su ventana de vigencia).

### `folios` no tiene ninguna política

Es infraestructura. Al tener RLS activo y ninguna política, queda inaccesible
desde la API; solo la tocan funciones `SECURITY DEFINER`.

## Documentos KYC en Storage

El bucket `documentos-kyc` es **privado**. La convención de rutas es:

```
{socio_id}/{tipo}-{epoch}.{extensión}
```

El primer segmento es el id del socio, y sobre él se apoyan las políticas:

```sql
(storage.foldername(name))[1] = privado.socio_actual()::text
```

Nadie puede leer una carpeta que no sea la suya. El personal sí, para poder
dictaminar.

**Nunca se expone una URL pública.** Cada vez que un analista abre un documento,
`POST /api/admin/documentos` genera un enlace firmado que caduca en **5
minutos**. Si ese enlace se filtra, deja de servir casi de inmediato.

Solo el personal puede borrar del bucket: el socio reemplaza, no elimina, para
que no pueda retirar evidencia de un expediente en dictamen.

## Sesiones

- Las cookies de sesión son `httpOnly`, `sameSite=lax` y `secure` en producción.
  Al ser `httpOnly`, JavaScript no puede leerlas: un XSS no roba la sesión.
- No hay cliente de Supabase en el navegador. Todo pasa por endpoints del
  servidor.
- El middleware usa `getUser()`, que **valida el token contra el servidor de
  Auth**. `getSession()` solo decodifica la cookie y por tanto no sirve para
  autorizar.

## La clave de servicio

`SUPABASE_SERVICE_ROLE_KEY` ignora todas las políticas RLS. En este proyecto se
usa en **un solo lugar**: `/admin/usuarios`, para crear cuentas de personal
(operación privilegiada de Auth que no puede hacerse con la sesión del
navegador).

- Nunca en una variable con prefijo `PUBLIC_`.
- Nunca en el repositorio (`.env` está en `.gitignore`).
- En producción, solo como variable de entorno del servidor.
- Si se filtra, rótala de inmediato desde el panel de Supabase.

`clienteAdmin()` lanza un error si la clave no está configurada, para que el
fallo aparezca en el despliegue y no como un error confuso de permisos.

## Validación en dos frentes

Cada dato sensible se valida en el navegador (respuesta inmediata) **y** en el
servidor (autoridad), y la base repite las comprobaciones de formato con
restricciones `CHECK`.

| Dato       | Cliente y servidor                              | Base de datos             |
| ---------- | ----------------------------------------------- | ------------------------- |
| CURP       | Formato, entidad, fecha real y dígito verificador | `CHECK` con regex       |
| RFC        | Formato de persona física; debe coincidir con la CURP en sus 10 primeras posiciones | `CHECK` |
| CLABE      | 18 dígitos con dígito de control (ponderación 3-7-1) | `CHECK` |
| Edad       | Mayor de 18 al día de hoy                       | `CHECK` sobre la fecha    |
| Montos     | Dentro del rango del producto                   | `CHECK` de rango          |

El endpoint `/api/simulaciones` **recalcula** el resultado desde el producto
guardado en la base en lugar de confiar en las cifras del navegador: lo que
queda asentado es lo que la cooperativa ofrece, no lo que alguien pudo alterar
desde las herramientas de desarrollo.

## Auditoría

`bitacora` registra INSERT, UPDATE y DELETE sobre las tablas sensibles, con el
estado completo antes y después y quién lo hizo. Es de solo lectura incluso para
administración: la escribe un trigger `SECURITY DEFINER` y no hay política de
escritura.

Consultable en `/admin/bitacora`, con filtros por tabla y acción.

## Lista de verificación antes de producción

- [ ] Confirmación de correo **activada** en Supabase Auth
- [ ] `Site URL` y `Redirect URLs` apuntan al dominio real, no a localhost
- [ ] `SUPABASE_SERVICE_ROLE_KEY` solo en variables del servidor
- [ ] `.env` no está en el repositorio (`git log --all -- .env` vacío)
- [ ] Todas las migraciones aplicadas, incluida `20260809100800_rls.sql`
- [ ] El bucket `documentos-kyc` figura como **privado** en el panel
- [ ] Cambiada la contraseña provisional de toda cuenta de personal
- [ ] Aviso de privacidad y términos revisados por el área jurídica
- [ ] Copias de seguridad automáticas activadas en Supabase

### Prueba manual de RLS

Con dos cuentas de socio distintas (A y B), inicia sesión como A e intenta:

```
/portal/creditos/<id-de-un-credito-de-B>
```

Debe redirigir a `/portal/creditos`, no mostrar el crédito. Repite con
`/portal/solicitudes/<id-de-B>`. Si alguna muestra datos, hay una política mal
escrita: revísala antes de seguir.
