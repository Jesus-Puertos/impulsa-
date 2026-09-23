// =============================================================================
// Conversión de Markdown a HTML para el contenido del CMS
// -----------------------------------------------------------------------------
// El contenido lo escribe personal autenticado de la cooperativa, no visitantes
// anónimos. Aun así, el HTML crudo se escapa ANTES de interpretar el Markdown:
// una cuenta de promotor comprometida no debe poder inyectar un <script> en el
// sitio público. El Markdown sigue funcionando; lo que se pierde es la
// posibilidad de incrustar HTML a mano, que no necesitamos.
// =============================================================================

import { marked } from 'marked'

marked.setOptions({
	gfm: true,
	breaks: false
})

function escaparHtml(texto: string): string {
	return texto
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
}

/** Convierte Markdown a HTML seguro para insertar con `set:html`. */
export function markdownAHtml(markdown: string | null | undefined): string {
	if (!markdown) return ''
	return marked.parse(escaparHtml(markdown), { async: false })
}

/** Estima los minutos de lectura a 200 palabras por minuto. */
export function minutosDeLectura(texto: string | null | undefined): number {
	if (!texto) return 1
	return Math.max(1, Math.round(texto.trim().split(/\s+/).length / 200))
}
