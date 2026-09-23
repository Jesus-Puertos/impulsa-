# 02 · Puesta en marcha

De cero a un sistema funcionando. Calcula unos 30 minutos la primera vez.

## Requisitos

- Node.js 20 o superior
- Una cuenta en [supabase.com](https://supabase.com) (el plan gratuito alcanza
  para desarrollo y para arrancar en producción)
- Opcional: [Supabase CLI](https://supabase.com/docs/guides/cli) si quieres
  trabajar con una base local

---

## Camino A · Supabase en la nube (recomendado para empezar)

### 1. Crear el proyecto

1. Entra a [supabase.com/dashboard](https://supabase.com/dashboard) y pulsa
   **New project**.
2. Nómbralo `impulsa`, elige la región **East US (North Virginia)** o la más
   cercana a México, y guarda la contraseña de la base en un lugar seguro.
3. Espera a que termine de aprovisionarse (2-3 minutos).

### 2. Aplicar las migraciones

En el panel de Supabase, abre **SQL Editor** y ejecuta los archivos de
`supabase/migrations/` **en orden numérico**, uno por uno:

```
20260809100000_fundamentos.sql
20260809100100_perfiles_y_sucursales.sql
20260809100200_socios_y_expediente.sql
20260809100300_productos_y_solicitudes.sql
20260809100400_creditos_amortizacion_pagos.sql
20260809100500_ahorro_e_inversion.sql
20260809100600_cms_y_operacion.sql
20260809100700_motor_de_credito.sql
20260809100800_rls.sql
20260809100900_storage.sql
20260809101000_vistas_y_reportes.sql
```

> **El orden importa.** Cada migración asume que las anteriores ya corrieron.
> Si una falla, resuelve el error antes de seguir con la siguiente.

Después ejecuta `supabase/seed.sql` para cargar sucursales, productos,
preguntas frecuentes y artículos de ejemplo.

### 3. Configurar el correo de administrador

En `seed.sql`, la llave `admin_bootstrap_email` define qué correo recibe el rol
`admin` al registrarse. Cámbiala por el correo real de la dirección:

```sql
update configuracion
set valor = '"direccion@tudominio.mx"'
where clave = 'admin_bootstrap_email';
```

### 4. Copiar las credenciales

En **Project Settings → API** encontrarás:

| Dato                     | Va en                          |
| ------------------------ | ------------------------------ |
| Project URL              | `PUBLIC_SUPABASE_URL`          |
| `anon` `public` key      | `PUBLIC_SUPABASE_ANON_KEY`     |
| `service_role` key       | `SUPABASE_SERVICE_ROLE_KEY`    |

> La `service_role` key **ignora todas las políticas RLS**. Nunca la pongas en
> una variable con prefijo `PUBLIC_`, nunca la subas al repositorio y nunca la
> pegues en un chat. Si se filtra, rótala de inmediato desde el panel.

### 5. Configurar el proyecto local

```bash
cd impulsa-
cp .env.example .env
```

Edita `.env` con los valores que copiaste. `PUBLIC_SITE_URL` debe ser
`http://localhost:4321` en desarrollo.

### 6. Instalar y arrancar

```bash
npm install
npm run dev
```

Abre <http://localhost:4321>.

### 7. Crear la primera cuenta de administrador

1. Ve a `/registro` y date de alta con el correo que pusiste en
   `admin_bootstrap_email`.
2. Necesitarás una CURP con formato válido (18 caracteres, dígito verificador
   correcto). El sistema la valida de verdad.
3. Al crearse la cuenta, el trigger `manejar_usuario_nuevo` detecta ese correo y
   le asigna el rol `admin`.
4. Entra a `/admin`.

> Si te registraste antes de configurar `admin_bootstrap_email`, promueve tu
> cuenta a mano desde el SQL Editor:
>
> ```sql
> update perfiles set rol = 'admin' where correo = 'tu@correo.mx';
> ```

### 8. Configurar Auth

En **Authentication → URL Configuration** del panel de Supabase:

- **Site URL**: `http://localhost:4321` (en producción, tu dominio real)
- **Redirect URLs**: añade `http://localhost:4321/**` y el dominio de producción

En **Authentication → Providers → Email**, para desarrollo puedes desactivar
**Confirm email** y ahorrarte confirmar cada cuenta de prueba.

> **En producción, la confirmación de correo debe estar ACTIVADA.** Sin ella
> cualquiera puede registrarse con un correo ajeno.

---

## Camino B · Supabase local con la CLI

Útil para desarrollar sin internet y para probar migraciones sin ensuciar la
base compartida.

```bash
npm install -g supabase        # o: npx supabase
cd impulsa-
supabase start                 # levanta Postgres, Auth y Storage en Docker
supabase db reset              # aplica migraciones + seed
```

`supabase start` imprime las credenciales locales. Cópialas a tu `.env`:

```
PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
PUBLIC_SUPABASE_ANON_KEY="<la anon key que imprimió>"
SUPABASE_SERVICE_ROLE_KEY="<la service_role key que imprimió>"
```

Herramientas locales:

- **Supabase Studio**: <http://localhost:54323>
- **Bandeja de correo** (los correos de confirmación se capturan aquí, no se
  envían): <http://localhost:54324>

### Crear una migración nueva

```bash
supabase migration new nombre_descriptivo
# escribe el SQL en el archivo generado
supabase db reset            # lo prueba desde cero en local
supabase db push             # lo aplica al proyecto en la nube
```

---

## Verificar que todo quedó bien

Recorre esta lista. Si algo falla, el error suele estar en la migración
correspondiente.

- [ ] `/` muestra los productos de crédito y los testimonios del seed
- [ ] `/simulador` calcula y la tabla de amortización cuadra
- [ ] `/creditos` lista los cinco productos con sus requisitos
- [ ] `/blog` muestra los cuatro artículos del seed
- [ ] `/registro` valida la CURP y rechaza una inválida
- [ ] Tras registrarte, `/portal` te recibe y pide completar el expediente
- [ ] Puedes subir una foto como INE y aparece en `/portal/documentos`
- [ ] Con la cuenta admin, `/admin` muestra los indicadores sin errores
- [ ] En `/admin/socios` aparece tu propio expediente
- [ ] En `/admin/productos` puedes cambiar una tasa y se refleja en `/simulador`

## Problemas comunes

**«Supabase no está configurado»** al entrar a `/portal` o `/admin`
El archivo `.env` no existe o le faltan variables. Cópialo de `.env.example` y
reinicia `npm run dev` (las variables se leen al arrancar).

**Al registrarte: «No pudimos crear tu cuenta»**
Revisa que la confirmación de correo esté configurada como esperas y que la
`Site URL` de Supabase coincida con la URL desde la que estás entrando.

**`/admin` te redirige a `/portal?error=sin_permiso`**
Tu perfil tiene rol `socio`. Promuévelo con el `update` de la sección 7.

**Los documentos no suben**
Comprueba que la migración `20260809100900_storage.sql` corrió y que los tres
buckets existen en **Storage** del panel de Supabase.

**El panel muestra «No pudimos calcular los indicadores»**
Falta la migración `20260809101000_vistas_y_reportes.sql`, que crea la función
`kpis_panel()`.

**`ERROR: 42P17: functions in index expression must be marked IMMUTABLE`**

Afectaba a versiones anteriores de la migración `20260809100200`, que usaba
`unaccent()` dentro de un índice. `unaccent()` es `STABLE`, no `IMMUTABLE`
(depende de un diccionario reconfigurable), y PostgreSQL no admite funciones no
inmutables en expresiones de índice.

Ya está corregido en el repositorio: ahora se usan índices de trigramas
(`pg_trgm`), que además son los correctos porque el panel busca con
`ILIKE '%texto%'`.

Si te topaste con el error, ejecuta
[`../supabase/reparaciones/001_indices_busqueda_socios.sql`](../supabase/reparaciones/001_indices_busqueda_socios.sql)
en el SQL Editor. El script diagnostica en qué punto quedó la instalación y te
dice si basta con crear los índices o si hay que repetir la migración completa.

### Regla general cuando una migración falla

El SQL Editor de Supabase envuelve cada ejecución en una transacción, así que un
error normalmente **revierte todo el archivo**. Corrige la causa y vuelve a
ejecutar ese archivo completo antes de pasar al siguiente.

Para confirmar hasta dónde llegó la instalación:

```sql
select tablename from pg_tables
where schemaname = 'public'
order by tablename;
```

Deben existir 26 tablas. Si faltan, retoma desde la migración que las crea.
