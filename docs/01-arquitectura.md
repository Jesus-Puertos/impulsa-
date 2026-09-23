# 01 · Arquitectura

## Panorama

```
Navegador
   │
   ├─── Sitio público (HTML estático o SSR)
   │       /, /creditos, /ahorro, /simulador, /blog, /nosotros…
   │
   ├─── Portal del socio (SSR, requiere sesión)
   │       /portal/**
   │
   └─── Panel administrativo (SSR, requiere rol de personal)
           /admin/**
   │
   ▼
Astro 5 + adaptador Netlify
   │  middleware.ts  ── resuelve sesión y bloquea rutas privadas
   │  src/pages/api  ── endpoints propios (JSON y multipart)
   ▼
Supabase
   ├─ PostgreSQL   tablas, vistas, funciones de negocio, RLS
   ├─ Auth         cuentas, contraseñas, recuperación por correo
   └─ Storage      documentos KYC (privado), contenido y avatares (público)
```

## Decisiones y por qué

### El renderizado es mixto, no todo estático ni todo servidor

El proyecto está en `output: "static"`, y las páginas que necesitan sesión o
datos frescos declaran `export const prerender = false`.

Las páginas de marketing puramente informativas (`/nosotros`, `/terms`,
`/aviso-de-privacidad`, `/404`) se generan en el build y se sirven desde CDN.
Todo lo que muestra productos, contenido del CMS o datos del socio se renderiza
en cada petición: cambiar una tasa desde `/admin` debe verse en el simulador sin
volver a desplegar.

### Las reglas de negocio viven en PostgreSQL

Generar una tabla de amortización o aplicar un pago son funciones SQL
(`generar_amortizacion`, `registrar_pago`, `actualizar_mora`), no código
TypeScript.

Tres razones:

1. **Atomicidad.** Aplicar un pago toca varias cuotas, crea filas de aplicación
   y recalcula saldos. En una función PL/pgSQL eso es una sola transacción; si
   algo falla, no queda un pago a medias.
2. **Un solo resultado posible.** El mismo cálculo sale igual desde el panel,
   desde un script de migración o desde un proceso programado.
3. **Concurrencia.** `SELECT … FOR UPDATE` bloquea la fila del crédito mientras
   se aplica el pago. Dos cajeros cobrando al mismo tiempo no producen saldos
   inconsistentes.

El motor en TypeScript (`src/lib/credito.ts`) es un **espejo** del de SQL, y
existe solo para que el simulador responda al instante y para validar en el
servidor lo que envía el navegador. La verdad de un crédito desembolsado está
siempre en la tabla `amortizaciones`.

### Toda lectura y escritura pasa por el servidor

No hay cliente de Supabase en el navegador. Los componentes React llaman a
endpoints propios bajo `/api`, que usan el cliente del servidor ligado a las
cookies de la petición.

Esto permite que las cookies de sesión sean `httpOnly` (inaccesibles para
JavaScript, lo que neutraliza el robo de sesión por XSS) y concentra la
validación en un solo lugar.

### La seguridad real es RLS, no el middleware

`src/middleware.ts` decide a dónde redirigir a quién. Es control de
**navegación**: mejora la experiencia y evita pantallas vacías.

La barrera real contra la lectura de datos ajenos son las políticas RLS de
PostgreSQL. Aunque alguien saltara el middleware por completo, seguiría sin
poder leer el expediente de otro socio: la base filtra las filas antes de
devolverlas. Ver [04 · Seguridad y RLS](04-seguridad-y-rls.md).

## Mapa del código

```
src/
├── components/
│   ├── impulsa/          Componentes propios de la cooperativa
│   │   ├── SimuladorCredito.tsx      Simulador público (React)
│   │   ├── RegistroSocio.tsx         Alta de socio por pasos (React)
│   │   ├── FormularioSolicitud.tsx   Solicitud desde el portal (React)
│   │   ├── CalculadoraAhorro.tsx     Proyección de ahorro (React)
│   │   ├── GestorDocumentos.tsx      Subida de documentos, socio (React)
│   │   ├── VisorDocumentos.tsx       Dictamen de documentos, panel (React)
│   │   ├── AvisoSitio.astro          Barra de comunicados
│   │   ├── Pendiente.astro           Tarjeta de trabajo pendiente
│   │   └── Renglon.astro             Par etiqueta/valor
│   ├── ui/               Componentes del tema base + MarcaImpulsa.astro
│   └── blocks/           Bloques del tema base
│
├── layouts/
│   ├── Layout.astro          Sitio público
│   ├── LayoutPortal.astro    Portal del socio
│   ├── LayoutAdmin.astro     Panel administrativo
│   └── BlogLayout.astro      (del tema base)
│
├── lib/
│   ├── supabase/
│   │   ├── server.ts            clienteServidor() y clienteAdmin()
│   │   └── database.types.ts    Tipos de todas las tablas y vistas
│   ├── auth.ts           Perfil, roles, jerarquía, cargarPerfil()
│   ├── credito.ts        Amortización, CAT, capacidad de pago
│   ├── validaciones.ts   CURP, RFC, CLABE, teléfono, edad
│   ├── formato.ts        Moneda, fechas, etiquetas de estado
│   └── markdown.ts       Markdown a HTML seguro
│
├── middleware.ts         Sesión y control de acceso
│
└── pages/
    ├── api/
    │   ├── auth/         registro, salir
    │   ├── socios/       expediente, documentos, referencias, enviar
    │   ├── solicitudes/  alta de solicitud
    │   ├── admin/        dictamen de documentos
    │   └── simulaciones.ts
    ├── admin/            Panel (14 pantallas)
    ├── portal/           Portal del socio (9 pantallas)
    └── *.astro           Sitio público
```

## Flujo de una solicitud, de punta a punta

1. Un visitante simula en `/simulador`. El cálculo ocurre en su navegador con
   `src/lib/credito.ts`, sin ida y vuelta al servidor.
2. Al pedir contacto o continuar, `POST /api/simulaciones` **recalcula** el
   resultado en el servidor con los datos del producto guardados en la base y
   asienta la simulación. Nunca se confía en las cifras del cliente.
3. Si no tiene cuenta, `/registro` la crea y abre su expediente en estado
   `prospecto`. Cada paso del formulario se guarda al completarse.
4. Al enviar el expediente (`POST /api/socios/enviar`), se comprueba que estén
   los datos y documentos mínimos y pasa a `en_revision`.
5. Un analista lo revisa en `/admin/socios/[id]`, valida cada documento y
   aprueba al socio, que pasa a `activo`.
6. El socio solicita crédito desde `/portal/solicitudes/nueva`.
   `POST /api/solicitudes` valida montos contra el producto, calcula la
   capacidad de pago y la deja `enviada`.
7. El analista dictamina en `/admin/solicitudes/[id]`: aprueba con monto, plazo
   y tasa, o rechaza con motivo. El socio recibe una notificación.
8. Gerencia desembolsa. La función `desembolsar_credito` crea el crédito y su
   tabla de amortización en una transacción.
9. Caja registra los pagos con `registrar_pago`, que los imputa a las cuotas más
   antiguas. El socio ve todo en su portal.

## Dependencias añadidas al tema base

| Paquete                  | Para qué                                              |
| ------------------------ | ----------------------------------------------------- |
| `@supabase/supabase-js`  | Cliente de base de datos, auth y storage.             |
| `@supabase/ssr`          | Manejo de sesión por cookies en el servidor.          |
| `zod`                    | Disponible para validación de esquemas.               |
| `marked`                 | Markdown a HTML para los artículos del CMS.           |

El tema base (Astro, Tailwind 4, React, astro-icon) no se tocó salvo para
aplicar la identidad corporativa.
