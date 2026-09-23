# 09 · Despliegue

El proyecto está configurado con el adaptador **Netlify**
(`astro.config.mjs`). Abajo está también el cambio para Vercel, que requiere
tres líneas.

## Antes de publicar

- [ ] Migraciones aplicadas en el proyecto de Supabase de producción
- [ ] `seed.sql` ejecutado y **condiciones reales** capturadas en `/admin/productos`
- [ ] Confirmación de correo **activada** en Supabase Auth
- [ ] `Site URL` y `Redirect URLs` apuntando al dominio real
- [ ] Datos institucionales capturados en `/admin/configuracion`
- [ ] Isotipo oficial reemplazado (ver [05](05-identidad-corporativa.md))
- [ ] Aviso de privacidad y términos revisados por jurídico
- [ ] `site` actualizado en `astro.config.mjs` con el dominio real
- [ ] Copias de seguridad automáticas activadas en Supabase

---

## Netlify

### Desde la interfaz

1. Sube el repositorio a GitHub, GitLab o Bitbucket.
2. En Netlify: **Add new site → Import an existing project**.
3. Netlify detecta Astro. Confirma:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
4. En **Site settings → Environment variables**, añade:

| Variable                      | Ámbito              |
| ----------------------------- | ------------------- |
| `PUBLIC_SUPABASE_URL`         | Todos               |
| `PUBLIC_SUPABASE_ANON_KEY`    | Todos               |
| `SUPABASE_SERVICE_ROLE_KEY`   | **Solo producción** |
| `PUBLIC_SITE_URL`             | Todos               |
| `ADMIN_BOOTSTRAP_EMAIL`       | Todos               |

5. **Deploy site**.

> Marca `SUPABASE_SERVICE_ROLE_KEY` como *secret* en Netlify para que no aparezca
> en los registros de build. **Nunca** la pongas en una variable `PUBLIC_`.

### Desde la CLI

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify env:set PUBLIC_SUPABASE_URL "https://xxx.supabase.co"
netlify env:set PUBLIC_SUPABASE_ANON_KEY "eyJ..."
netlify env:set SUPABASE_SERVICE_ROLE_KEY "eyJ..." --secret
netlify env:set PUBLIC_SITE_URL "https://cooperativaimpulsa.mx"
netlify deploy --prod
```

El adaptador genera automáticamente la función SSR y el archivo `_redirects`.

---

## Vercel

El paquete `@astrojs/vercel` ya está instalado. Cambia el adaptador:

```js
// astro.config.mjs
import vercel from '@astrojs/vercel'   // en lugar de netlify

export default defineConfig({
  // …
  adapter: vercel()
})
```

```bash
npm install -g vercel
vercel login
vercel link
vercel env add PUBLIC_SUPABASE_URL
vercel env add PUBLIC_SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY     # marcar como Sensitive
vercel env add PUBLIC_SITE_URL
vercel --prod
```

---

## Dominio propio

1. Añade el dominio en el panel de tu proveedor de hosting.
2. Configura los registros DNS que te indique (normalmente un `CNAME` para
   `www` y un `A` o `ALIAS` para el dominio raíz).
3. Espera la emisión del certificado TLS (automática, unos minutos).
4. Actualiza en tres lugares:
   - `site` en `astro.config.mjs`
   - `PUBLIC_SITE_URL` en las variables de entorno
   - `Site URL` y `Redirect URLs` en Supabase Auth

> Si olvidas el último paso, los enlaces de confirmación y de recuperación de
> contraseña llevarán a `localhost` y no funcionarán para nadie.

---

## Supabase en producción

### Copias de seguridad

En **Database → Backups**. El plan gratuito conserva 7 días; los planes de pago
permiten restaurar a un punto en el tiempo.

**Para una entidad financiera, las copias no son opcional.** Considera el plan
Pro desde el arranque.

Volcado manual antes de un cambio grande:

```bash
supabase db dump --db-url "postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres" \
  -f respaldo-$(date +%Y%m%d).sql
```

### Programar el cálculo de mora

`actualizar_mora()` debe correr a diario. La forma más simple es con `pg_cron`,
desde el SQL Editor:

```sql
create extension if not exists pg_cron;

-- Todos los días a las 03:00 UTC (21:00 hora del centro de México)
select cron.schedule(
  'actualizar-mora-diaria',
  '0 3 * * *',
  $$ select actualizar_mora(); $$
);

-- Verificar que quedó programada
select * from cron.job;
```

Alternativas: una Edge Function con schedule, o un cron externo que llame a un
endpoint protegido.

> **Mientras esto no corra, la mora no se acumula.** Los créditos atrasados no
> aparecerán en cobranza y los moratorios no se cobrarán.

### Límites de conexión

El pooler de Supabase basta para el tráfico de una cooperativa. Si aparecen
errores de «too many connections», usa la cadena del **Connection Pooler** en
modo Transaction en lugar de la conexión directa.

---

## Después de publicar

Recorre este flujo completo en producción, con datos de prueba, y bórralos
después:

1. Simular un crédito y comprobar que la tabla de amortización cuadra
2. Registrarse como socio y subir un documento
3. Recibir y confirmar el correo de verificación
4. Validar ese documento desde el panel
5. Aprobar el expediente
6. Solicitar un crédito
7. Dictaminarlo y desembolsarlo
8. Registrar un pago y verificar que los saldos bajan correctamente
9. Comprobar que el socio ve todo lo anterior en su portal
10. Ejecutar las tres consultas de verificación de
    [07 · Motor de crédito](07-motor-de-credito.md)

## Actualizar el sistema

```bash
git pull
npm install                 # por si cambiaron dependencias
npx supabase db push        # si hay migraciones nuevas
npm run build               # verificar que compila
git push                    # el hosting despliega solo
```

**Aplica siempre las migraciones antes de que el código nuevo esté en línea.**
Si el código espera una columna que aún no existe, el sitio falla.

## Monitoreo

| Qué vigilar                | Dónde                                   |
| -------------------------- | --------------------------------------- |
| Errores del servidor       | Registros de funciones en Netlify/Vercel |
| Consultas lentas           | Supabase → Reports → Query Performance   |
| Tamaño de la base          | Supabase → Settings → Usage              |
| Almacenamiento de KYC      | Supabase → Storage                       |
| Intentos de acceso fallidos| Supabase → Authentication → Logs         |

Los documentos KYC son lo que más crece: 5 documentos por socio a ~2 MB son
~10 MB por socio. Con 1,000 socios, unos 10 GB. Tenlo en cuenta al elegir plan.
