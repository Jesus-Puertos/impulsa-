// =============================================================================
// Validaciones de documentos de identidad mexicanos
// -----------------------------------------------------------------------------
// Se aplican en el navegador para dar respuesta inmediata, y de nuevo en el
// servidor antes de escribir. La base de datos repite las comprobaciones de
// formato con restricciones CHECK.
// =============================================================================

export interface Resultado {
	valido: boolean
	mensaje?: string
}

const OK: Resultado = { valido: true }

// --- CURP --------------------------------------------------------------------

const CURP_PATRON = /^[A-Z][AEIOUX][A-Z]{2}\d{6}[HM](?:AS|B[CS]|C[CLMSH]|D[FG]|G[TR]|HG|JC|M[CNS]|N[ETL]|OC|PL|Q[TR]|S[PLR]|T[CSL]|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/

/** Palabras que el Registro Nacional de Población sustituye por XXXX. */
const PALABRAS_INCONVENIENTES = new Set([
	'BACA', 'BAKA', 'BUEI', 'BUEY', 'CACA', 'CACO', 'CAGA', 'CAGO', 'CAKA', 'CAKO',
	'COGE', 'COGI', 'COJA', 'COJE', 'COJI', 'COJO', 'COLA', 'CULO', 'FALO', 'FETO',
	'GETA', 'GUEI', 'GUEY', 'JETA', 'JOTO', 'KACA', 'KACO', 'KAGA', 'KAGO', 'KAKA',
	'KAKO', 'KOGE', 'KOGI', 'KOJA', 'KOJE', 'KOJI', 'KOJO', 'KOLA', 'KULO', 'LILO',
	'LOCA', 'LOCO', 'LOKA', 'LOKO', 'MAME', 'MAMO', 'MEAR', 'MEAS', 'MEON', 'MIAR',
	'MION', 'MOCO', 'MOKO', 'MULA', 'MULO', 'NACA', 'NACO', 'PEDA', 'PEDO', 'PENE',
	'PIPI', 'PITO', 'POPO', 'PUTA', 'PUTO', 'QULO', 'RATA', 'ROBA', 'ROBE', 'ROBO',
	'RUIN', 'SENO', 'TETA', 'VAGA', 'VAGO', 'VAKA', 'VUEI', 'VUEY', 'WUEI', 'WUEY'
])

/**
 * Valida una CURP: formato, entidad de nacimiento, fecha real y dígito
 * verificador.
 *
 * El dígito verificador se calcula con el algoritmo oficial: se convierte cada
 * carácter a su valor en el alfabeto "0-9A-Z" (con Ñ = 24), se pondera por la
 * posición descendente 18..2, y el verificador es (10 - suma % 10) % 10.
 */
export function validarCurp(valor: string): Resultado {
	const curp = valor.trim().toUpperCase()

	if (!curp) return { valido: false, mensaje: 'La CURP es obligatoria.' }
	if (curp.length !== 18) {
		return { valido: false, mensaje: 'La CURP debe tener exactamente 18 caracteres.' }
	}
	if (!CURP_PATRON.test(curp)) {
		return {
			valido: false,
			mensaje: 'El formato de la CURP no es válido. Revisa que la copiaste tal cual.'
		}
	}
	if (PALABRAS_INCONVENIENTES.has(curp.slice(0, 4))) {
		return {
			valido: false,
			mensaje: 'Las primeras cuatro letras no son válidas; en tu CURP oficial aparecen como XXXX.'
		}
	}
	if (!fechaCurpValida(curp)) {
		return { valido: false, mensaje: 'La fecha de nacimiento contenida en la CURP no existe.' }
	}
	if (curp[17] !== digitoVerificadorCurp(curp)) {
		return {
			valido: false,
			mensaje: 'El dígito verificador no coincide. Revisa el último carácter.'
		}
	}

	return OK
}

function digitoVerificadorCurp(curp: string): string {
	const alfabeto = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'
	let suma = 0

	for (let i = 0; i < 17; i++) {
		const valor = alfabeto.indexOf(curp[i])
		if (valor < 0) return ''
		suma += valor * (18 - i)
	}

	return String((10 - (suma % 10)) % 10)
}

function fechaCurpValida(curp: string): boolean {
	const aa = Number(curp.slice(4, 6))
	const mm = Number(curp.slice(6, 8))
	const dd = Number(curp.slice(8, 10))

	// La posición 16 distingue el siglo: dígito para el siglo XX, letra para el XXI.
	const siglo = /\d/.test(curp[16]) ? 1900 : 2000
	const fecha = new Date(siglo + aa, mm - 1, dd)

	return (
		fecha.getFullYear() === siglo + aa &&
		fecha.getMonth() === mm - 1 &&
		fecha.getDate() === dd &&
		fecha <= new Date()
	)
}

/** Extrae la fecha de nacimiento (YYYY-MM-DD) codificada en la CURP. */
export function fechaNacimientoDesdeCurp(curp: string): string | null {
	const limpia = curp.trim().toUpperCase()
	if (limpia.length !== 18) return null

	const aa = limpia.slice(4, 6)
	const mm = limpia.slice(6, 8)
	const dd = limpia.slice(8, 10)
	const siglo = /\d/.test(limpia[16]) ? '19' : '20'

	return `${siglo}${aa}-${mm}-${dd}`
}

/** Extrae el sexo codificado en la CURP. */
export function generoDesdeCurp(curp: string): 'masculino' | 'femenino' | null {
	const c = curp.trim().toUpperCase()[10]
	if (c === 'H') return 'masculino'
	if (c === 'M') return 'femenino'
	return null
}

// --- RFC ---------------------------------------------------------------------

const RFC_FISICA = /^[A-ZÑ&]{4}\d{6}[A-Z\d]{3}$/

/** Valida el RFC de una persona física (13 caracteres). Es opcional para socios. */
export function validarRfc(valor: string, obligatorio = false): Resultado {
	const rfc = valor.trim().toUpperCase()

	if (!rfc) {
		return obligatorio ? { valido: false, mensaje: 'El RFC es obligatorio.' } : OK
	}
	if (!RFC_FISICA.test(rfc)) {
		return {
			valido: false,
			mensaje: 'El RFC debe tener 13 caracteres: 4 letras, 6 dígitos de fecha y 3 de homoclave.'
		}
	}

	const aa = Number(rfc.slice(4, 6))
	const mm = Number(rfc.slice(6, 8))
	const dd = Number(rfc.slice(8, 10))
	if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || Number.isNaN(aa)) {
		return { valido: false, mensaje: 'La fecha contenida en el RFC no es válida.' }
	}

	return OK
}

/** Comprueba que RFC y CURP describan a la misma persona (mismas 10 posiciones). */
export function rfcCoincideConCurp(rfc: string, curp: string): boolean {
	const r = rfc.trim().toUpperCase()
	const c = curp.trim().toUpperCase()
	if (r.length !== 13 || c.length !== 18) return false
	return r.slice(0, 10) === c.slice(0, 10)
}

// --- CLABE -------------------------------------------------------------------

/**
 * Valida una CLABE interbancaria de 18 dígitos.
 *
 * El dígito de control se obtiene ponderando los primeros 17 dígitos con el
 * ciclo 3-7-1, tomando el módulo 10 de cada producto.
 */
export function validarClabe(valor: string, obligatorio = false): Resultado {
	const clabe = valor.replace(/\s/g, '')

	if (!clabe) {
		return obligatorio ? { valido: false, mensaje: 'La CLABE es obligatoria.' } : OK
	}
	if (!/^\d{18}$/.test(clabe)) {
		return { valido: false, mensaje: 'La CLABE debe tener exactamente 18 dígitos.' }
	}

	const pesos = [3, 7, 1]
	let suma = 0
	for (let i = 0; i < 17; i++) {
		suma += (Number(clabe[i]) * pesos[i % 3]) % 10
	}

	const control = (10 - (suma % 10)) % 10
	if (control !== Number(clabe[17])) {
		return { valido: false, mensaje: 'La CLABE no es válida: el dígito de control no coincide.' }
	}

	return OK
}

// --- Otros campos ------------------------------------------------------------

export function validarCorreo(valor: string): Resultado {
	const correo = valor.trim()
	if (!correo) return { valido: false, mensaje: 'El correo es obligatorio.' }
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) {
		return { valido: false, mensaje: 'Escribe un correo válido, por ejemplo nombre@dominio.com.' }
	}
	return OK
}

/** Teléfono mexicano: 10 dígitos, admitiendo espacios, guiones y lada +52. */
export function validarTelefono(valor: string, obligatorio = true): Resultado {
	const digitos = valor.replace(/\D/g, '').replace(/^52/, '')

	if (!digitos) {
		return obligatorio ? { valido: false, mensaje: 'El teléfono es obligatorio.' } : OK
	}
	if (digitos.length !== 10) {
		return { valido: false, mensaje: 'El teléfono debe tener 10 dígitos.' }
	}
	return OK
}

export function validarCodigoPostal(valor: string, obligatorio = true): Resultado {
	const cp = valor.trim()
	if (!cp) {
		return obligatorio ? { valido: false, mensaje: 'El código postal es obligatorio.' } : OK
	}
	if (!/^\d{5}$/.test(cp)) {
		return { valido: false, mensaje: 'El código postal debe tener 5 dígitos.' }
	}
	return OK
}

/** Verifica que la persona sea mayor de edad a la fecha de hoy. */
export function validarMayorDeEdad(fechaNacimiento: string): Resultado {
	if (!fechaNacimiento) return { valido: false, mensaje: 'La fecha de nacimiento es obligatoria.' }

	const nacimiento = new Date(fechaNacimiento)
	if (Number.isNaN(nacimiento.getTime())) {
		return { valido: false, mensaje: 'La fecha de nacimiento no es válida.' }
	}

	if (nacimiento > new Date()) {
		return { valido: false, mensaje: 'La fecha de nacimiento no puede estar en el futuro.' }
	}

	if (calcularEdad(fechaNacimiento) < 18) {
		return { valido: false, mensaje: 'Para asociarte debes ser mayor de edad.' }
	}

	return OK
}

export function calcularEdad(fechaNacimiento: string): number {
	const nacimiento = new Date(fechaNacimiento)
	const hoy = new Date()

	let edad = hoy.getFullYear() - nacimiento.getFullYear()
	const mes = hoy.getMonth() - nacimiento.getMonth()

	if (mes < 0 || (mes === 0 && hoy.getDate() < nacimiento.getDate())) edad--

	return edad
}

/** Ejecuta varias validaciones y devuelve el primer error, o null si todo pasa. */
export function primerError(...resultados: [string, Resultado][]): { campo: string; mensaje: string } | null {
	for (const [campo, resultado] of resultados) {
		if (!resultado.valido) return { campo, mensaje: resultado.mensaje ?? 'Valor no válido.' }
	}
	return null
}
