# 05 · Identidad corporativa

Cómo se llevó el *Catálogo de Identidad Corporativa* de Cooperativa Impulsa al
código. Las referencias entre paréntesis remiten a las secciones del manual.

## Colores

Los valores marcados **(manual)** son institucionales y **no deben alterarse**
(norma 1.2.5, usos incorrectos). Los intermedios se interpolaron solo para
completar escalas de interfaz que el manual no cubre.

Están definidos como tokens de Tailwind 4 en
[`../src/styles/global.css`](../src/styles/global.css), bloque `@theme`.

### Morado corporativo — color principal (1.4.1)

| Token          | Hex       | Origen                            |
| -------------- | --------- | --------------------------------- |
| `primary-50`   | `#f8f4fa` | interpolado                       |
| `primary-100`  | `#f0e6f3` | interpolado                       |
| `primary-200`  | `#ddc7e4` | interpolado                       |
| `primary-300`  | `#cca8d3` | **(manual)** complementario       |
| `primary-400`  | `#a878b6` | interpolado                       |
| `primary-500`  | `#844494` | **(manual)** complementario       |
| `primary-600`  | `#6e4186` | **(manual) COLOR PRINCIPAL**      |
| `primary-700`  | `#5c146c` | **(manual)**                      |
| `primary-800`  | `#4e354e` | **(manual)**                      |
| `primary-900`  | `#3a1145` | interpolado                       |
| `primary-950`  | `#251029` | interpolado                       |

### Lila corporativo (1.4.1)

`lila-100` `#e9e4eb` · `lila-300` `#c9b0c9` **(manual)** ·
`lila-500` `#977da2` **(manual)** · `lila-700` `#6b5a73`

### Oro corporativo — acento (1.4.1, 1.4.2)

`oro-100` `#fbf3d0` · `oro-200` `#eed07e` **(manual)** ·
`oro-300` `#f3d93a` **(manual, Impulsaurio)** · `oro-400` `#eecc2c` **(manual)** ·
`oro-500` `#d49031` **(manual, ámbar)** · `oro-600` `#8c770c` **(manual)** ·
`oro-700` `#79670a` **(manual)** · `oro-800` `#876711` **(manual)**

### Verde corporativo — crecimiento y estados positivos (1.4.1)

`campo-100` `#c4dcb4` · `campo-200` `#b7dca2` · `campo-300` `#84bc64` ·
`campo-400` `#44a41a` · `campo-500` `#359b06` **(COLOR CORPORATIVO)** ·
`campo-600` `#349c04` · `campo-700` `#319503` · `campo-800` `#256d02`
(todos del manual salvo el 800)

### Tierra corporativo (1.4.2)

`tierra-100` `#c3bcac` · `tierra-200` `#c6c0b2` · `tierra-400` `#94846c` ·
`tierra-500` `#93866b` · `tierra-700` `#4c4638` — todos del manual.

### Neutros

Derivados de la tinta corporativa `#141210`, manteniendo un matiz cálido para
que convivan con la gama tierra sin saltos de croma.

`neutral-200` `#e6dfde` **(manual)** · `neutral-900` `#1d1e17`
**(manual, tinta Impulsaurio)** · `neutral-950` `#141210` **(manual, TINTA
CORPORATIVA)**. Los demás son interpolados.

### Cómo usarlos

```html
<button class="bg-primary-600 text-white">Solicitar</button>
<span class="text-campo-600">Al corriente</span>
<span class="bg-oro-400 text-neutral-950">Pendiente</span>
```

No escribas hex a mano en los componentes. Si necesitas un tono que no existe,
añádelo al bloque `@theme` documentando de dónde sale.

## Tipografía

El manual distingue tres usos (1.3). Un sitio web es medio **publicitario y
editorial**, así que se adoptó el juego de la sección 1.3.3:

| Familia               | Uso                             | Token           |
| --------------------- | ------------------------------- | --------------- |
| **Playfair Display**  | Títulos y encabezados           | `font-headings` |
| **Poppins**           | Texto corrido, formularios, UI  | `font-body`     |
| **Archivo Black**     | Cifras destacadas, KPIs, logotipo | `font-display` |

Se cargan desde Google Fonts en
[`../src/components/blocks/head/Header.astro`](../src/components/blocks/head/Header.astro),
con `preconnect` y `display=swap`.

### Autohospedar las fuentes

Si la cooperativa prefiere no depender de Google (privacidad o disponibilidad):

1. Descarga las familias de [fonts.google.com](https://fonts.google.com).
2. Colócalas en `public/fonts/playfair/`, `public/fonts/poppins/`,
   `public/fonts/archivo/`.
3. Quita el `<link>` de `Header.astro` y añade en `global.css`:

```css
@font-face {
	font-family: 'Poppins';
	src: url('/fonts/poppins/Poppins-Regular.woff2') format('woff2');
	font-weight: 400;
	font-display: swap;
}
/* repite para cada peso y familia */
```

Las variables `--font-headings`, `--font-body` y `--font-display` no cambian.

### Tipografías del logotipo

El manual (1.1.1) indica **Rouben Regular** para «Cooperativa» y **Gemanticus
Bold** para «Impulsa». Son fuentes comerciales que hay que licenciar. El
componente `MarcaImpulsa.astro` usa Poppins Light y Archivo Black como
sustitutos visualmente cercanos.

**Cuando la cooperativa adquiera las licencias**, autohospédalas y cambia las
familias en las clases `.marca__cooperativa` y `.marca__impulsa` de
[`../src/components/ui/MarcaImpulsa.astro`](../src/components/ui/MarcaImpulsa.astro).

## La marca

### El componente

[`MarcaImpulsa.astro`](../src/components/ui/MarcaImpulsa.astro) resuelve isotipo
y logotipo:

```astro
<MarcaImpulsa tamano="lg" />                    <!-- sm | base | lg -->
<MarcaImpulsa soloIsotipo enlace="/admin" />
<MarcaImpulsa enlace={null} />                  <!-- sin envolver en <a> -->
```

El isotipo es SVG **inline y puramente geométrico**: tres barras ascendentes en
morado, oro y verde corporativos que representan crecimiento. Al ser geométrico
no depende de ninguna fuente y se ve idéntico en cualquier equipo.

El logotipo se compone con **texto HTML real**, no con `<text>` dentro del SVG.
Así usa las fuentes web cargadas, sigue siendo seleccionable, lo lee un lector
de pantalla y escala sin perder nitidez.

### ⚠️ El isotipo es provisional

El manual describe la marca gráfica y el Impulsaurio, pero el proyecto no
incluyó los archivos vectoriales originales. **Reemplaza el isotipo por el
oficial antes de salir a producción.**

Archivos a sustituir:

| Archivo                                                                            | Uso                                  |
| ---------------------------------------------------------------------------------- | ------------------------------------ |
| [`../public/favicon.svg`](../public/favicon.svg)                                    | Icono de pestaña                     |
| [`../public/logo-light.svg`](../public/logo-light.svg)                              | Metadatos, fondo claro               |
| [`../public/logo-dark.svg`](../public/logo-dark.svg)                                | Metadatos, fondo oscuro              |
| `<svg>` dentro de [`MarcaImpulsa.astro`](../src/components/ui/MarcaImpulsa.astro)   | Navegación, pie, portal y panel      |
| [`../public/og.jpg`](../public/og.jpg)                                              | Imagen para redes sociales           |

Al hacerlo, respeta la zona de protección y el tamaño mínimo (1.2.1) y usa la
versión en positivo salvo que el fondo obligue a la negativa (1.1.2).

### Normas de uso que el código ya respeta

- **1.2.2** — Sobre fondo morado corporativo, la marca va en blanco.
  `MarcaImpulsa` cambia los rellenos en modo oscuro.
- **1.2.5** — No se alteran las proporciones: el `viewBox` es fijo y el escalado
  es uniforme.
- **1.2.4** — El isotipo nunca se coloca sobre fondos que comprometan su
  visibilidad; los layouts usan blanco, `neutral-50` o `neutral-950`.

## Componentes de interfaz

La capa de aplicación de `global.css` define los patrones reutilizables. Úsalos
en lugar de improvisar clases nuevas:

| Clase                                        | Para qué                                        |
| -------------------------------------------- | ----------------------------------------------- |
| `.campo`                                      | Grupo etiqueta + control + ayuda + error        |
| `.campo--fila`                                | Dos campos lado a lado en escritorio            |
| `.btn` + `.btn--primario` / `--oro` / `--contorno` / `--peligro` / `--fantasma` | Botones |
| `.panel`, `.panel__titulo`                    | Tarjetas de contenido                           |
| `.kpi__valor`, `.kpi__etiqueta`               | Indicadores numéricos                           |
| `.tabla-datos`, `.tabla-scroll`, `.num`       | Tablas de datos                                 |
| `.estado`, `.estado--<valor>`                 | Etiquetas de estado                             |
| `.aviso` + `--info` / `--exito` / `--alerta` / `--error` | Mensajes                             |
| `.deslizador`                                 | Controles de rango del simulador                |

Los sufijos de `.estado` **coinciden con los valores de los ENUM de
PostgreSQL**, así que se puede escribir directamente:

```astro
<span class={`estado estado--${credito.estado}`}>
  {ETIQUETAS_ESTADO_CREDITO[credito.estado]}
</span>
```

## Voz y tono

El manual describe una cooperativa comprometida con la educación financiera y
las comunidades rurales. Los textos del sitio siguen estos criterios:

- **Se tutea.** «Tu crédito», no «su crédito».
- **Se explica antes de vender.** El simulador dedica una sección a explicar el
  sistema francés y el CAT.
- **Se dice lo incómodo.** Los motivos de rechazo se muestran completos; la
  advertencia de capacidad de pago aparece aunque desanime la solicitud.
- **Sin jerga innecesaria.** «Lo que realmente debes» antes que «saldo
  insoluto», y cuando se usa el término técnico, se explica.
- **Cifras siempre en contexto.** Nunca una tasa suelta sin su CAT y su ejemplo.

## Modo oscuro

Todo el sistema lo soporta. Cada color tiene su variante `dark:`. La preferencia
se guarda en `localStorage` y el conmutador está en la navegación (heredado del
tema base).

Al añadir componentes, incluye siempre la variante oscura:

```html
<div class="bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
```
