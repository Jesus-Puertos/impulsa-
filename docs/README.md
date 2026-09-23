# Documentación · Cooperativa Impulsa

Plataforma de la cooperativa: sitio público, simulador de crédito, registro de
socios con expediente digital, portal del socio y panel administrativo propio.

## Por dónde empezar

| Si quieres…                                | Lee                                                |
| ------------------------------------------ | -------------------------------------------------- |
| Poner el proyecto a correr hoy              | [02 · Puesta en marcha](02-puesta-en-marcha.md)     |
| Entender cómo está armado                  | [01 · Arquitectura](01-arquitectura.md)             |
| Saber qué guarda cada tabla                | [03 · Modelo de datos](03-modelo-de-datos.md)       |
| Entender quién puede ver qué               | [04 · Seguridad y RLS](04-seguridad-y-rls.md)       |
| Aplicar la identidad de marca              | [05 · Identidad corporativa](05-identidad-corporativa.md) |
| Conocer todo lo que hace el sistema        | [06 · Funcionalidades](06-funcionalidades.md)       |
| Entender cómo se calcula un crédito        | [07 · Motor de crédito](07-motor-de-credito.md)     |
| Configurar roles del personal              | [08 · Roles y permisos](08-roles-y-permisos.md)     |
| Publicar en internet                       | [09 · Despliegue](09-despliegue.md)                 |
| Operar el sistema día a día                | [10 · Operación diaria](10-operacion-diaria.md)     |

## Las migraciones

Las migraciones de la base de datos viven en
[`../supabase/migrations/`](../supabase/migrations/), **no** en esta carpeta.
La CLI de Supabase exige esa ruta exacta y no permite configurarla; separarlas
de la documentación garantizaría que tarde o temprano se desincronizaran.

Cada archivo está comentado por dentro explicando qué crea y por qué. Aquí
tienes el índice, y en [03 · Modelo de datos](03-modelo-de-datos.md) el
diccionario completo campo por campo.

| Archivo                                                                                              | Qué crea                                                                    |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`20260809100000_fundamentos.sql`](../supabase/migrations/20260809100000_fundamentos.sql)              | Extensiones, tipos ENUM, folios consecutivos, tabla `configuracion`.        |
| [`20260809100100_perfiles_y_sucursales.sql`](../supabase/migrations/20260809100100_perfiles_y_sucursales.sql) | Sucursales, perfiles ligados a `auth.users` y helpers de autorización.      |
| [`20260809100200_socios_y_expediente.sql`](../supabase/migrations/20260809100200_socios_y_expediente.sql) | Expediente del socio, documentos KYC, referencias y beneficiarios.          |
| [`20260809100300_productos_y_solicitudes.sql`](../supabase/migrations/20260809100300_productos_y_solicitudes.sql) | Catálogo de crédito, simulaciones, solicitudes, avales y garantías.         |
| [`20260809100400_creditos_amortizacion_pagos.sql`](../supabase/migrations/20260809100400_creditos_amortizacion_pagos.sql) | Créditos, tabla de amortización, pagos y su aplicación.                     |
| [`20260809100500_ahorro_e_inversion.sql`](../supabase/migrations/20260809100500_ahorro_e_inversion.sql) | Productos de captación, cuentas y libro de movimientos.                     |
| [`20260809100600_cms_y_operacion.sql`](../supabase/migrations/20260809100600_cms_y_operacion.sql)      | Blog, testimonios, FAQ, avisos, notificaciones, bitácora y contacto.        |
| [`20260809100700_motor_de_credito.sql`](../supabase/migrations/20260809100700_motor_de_credito.sql)    | Amortización, desembolso, aplicación de pagos y cálculo de mora.            |
| [`20260809100800_rls.sql`](../supabase/migrations/20260809100800_rls.sql)                              | Todas las políticas de seguridad a nivel de fila.                           |
| [`20260809100900_storage.sql`](../supabase/migrations/20260809100900_storage.sql)                      | Buckets de documentos KYC, contenido y avatares, con sus políticas.         |
| [`20260809101000_vistas_y_reportes.sql`](../supabase/migrations/20260809101000_vistas_y_reportes.sql)  | Vistas de consulta e indicadores del panel.                                 |

Los datos iniciales (productos, sucursales, FAQ, artículos) están en
[`../supabase/seed.sql`](../supabase/seed.sql).

## Estado del proyecto

Lo que está construido y funcionando se detalla en
[06 · Funcionalidades](06-funcionalidades.md). Lo que queda pendiente o
requiere una decisión del Consejo está en la sección **Pendientes** de ese
mismo documento.
