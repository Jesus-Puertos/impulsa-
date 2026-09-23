# Cooperativa Impulsa

Plataforma digital de la cooperativa: sitio público, simulador de crédito,
registro de socios con expediente digital, portal del socio y panel
administrativo propio.

Construido con **Astro 5**, **Tailwind CSS 4**, **React** y **Supabase**
(PostgreSQL, Auth y Storage).

## Arranque rápido

```bash
npm install
cp .env.example .env        # rellena con tus credenciales de Supabase
npm run dev                 # http://localhost:4321
```

Antes necesitas un proyecto de Supabase con las migraciones aplicadas. El paso a
paso está en **[docs/02-puesta-en-marcha.md](docs/02-puesta-en-marcha.md)**.

## Documentación

Toda en **[`docs/`](docs/)**:

| Documento                                                    | Contenido                                       |
| ------------------------------------------------------------ | ----------------------------------------------- |
| [01 · Arquitectura](docs/01-arquitectura.md)                  | Cómo está armado y por qué                      |
| [02 · Puesta en marcha](docs/02-puesta-en-marcha.md)          | De cero a funcionando                           |
| [03 · Modelo de datos](docs/03-modelo-de-datos.md)            | Las 26 tablas, campo por campo                  |
| [04 · Seguridad y RLS](docs/04-seguridad-y-rls.md)            | Quién puede ver qué, y cómo se garantiza        |
| [05 · Identidad corporativa](docs/05-identidad-corporativa.md)| Colores, tipografía y marca                     |
| [06 · Funcionalidades](docs/06-funcionalidades.md)            | Todo lo que hace, y lo que falta                |
| [07 · Motor de crédito](docs/07-motor-de-credito.md)          | Las fórmulas del dinero                         |
| [08 · Roles y permisos](docs/08-roles-y-permisos.md)          | Los seis roles y qué puede cada uno             |
| [09 · Despliegue](docs/09-despliegue.md)                      | Publicar en Netlify o Vercel                    |
| [10 · Operación diaria](docs/10-operacion-diaria.md)          | Manual para el personal                         |

Las migraciones de base de datos están en
[`supabase/migrations/`](supabase/migrations/) y los datos iniciales en
[`supabase/seed.sql`](supabase/seed.sql).

## Mapa de rutas

**Público** · `/` `/creditos` `/ahorro` `/simulador` `/blog` `/nosotros`
`/sucursales` `/preguntas-frecuentes` `/contact` `/terms`
`/aviso-de-privacidad` `/registro` `/acceso`

**Socio** (requiere sesión) · `/portal` y sus nueve secciones

**Personal** (requiere rol) · `/admin` y sus catorce pantallas

## Comandos

| Comando            | Qué hace                                          |
| ------------------ | ------------------------------------------------- |
| `npm run dev`      | Servidor de desarrollo en el puerto 4321          |
| `npm run build`    | Verifica tipos y compila para producción          |
| `npm run preview`  | Sirve el build local                              |
| `npx astro check`  | Solo verificación de tipos                        |

## Antes de operar con dinero real

1. Reemplaza el isotipo provisional por el oficial de la cooperativa
2. Captura las condiciones de producto autorizadas por el Consejo
3. Somete el aviso de privacidad y los términos a revisión jurídica
4. Activa la confirmación de correo en Supabase Auth
5. Programa `actualizar_mora()` para que corra a diario

El detalle de cada punto está en
[docs/06-funcionalidades.md § Pendientes](docs/06-funcionalidades.md#pendientes).

---

Interfaz basada en el tema Mizu Light de Oxygenna, adaptado a la identidad
corporativa de Cooperativa Impulsa.
