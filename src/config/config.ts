// Config
// ------------
// Description: The configuration file for the website.

export interface Logo {
	src: string
	srcDark: string
	alt: string
}

export type Mode = 'auto' | 'light' | 'dark'

export interface Config {
	siteTitle: string
	siteDescription: string
	ogImage: string
	logo: Logo
	canonical: boolean
	noindex: boolean
	mode: Mode
	scrollAnimations: boolean
}

export const configData: Config = {
	siteTitle: 'Cooperativa Impulsa | Crédito responsable, ahorro e inclusión financiera',
	siteDescription:
		'Cooperativa Impulsa promueve el cooperativismo y la educación financiera con crédito responsable, inversiones éticas y ahorro accesible para fortalecer a las comunidades rurales y a nuestros socios.',
	ogImage: '/og.jpg',
	logo: {
		src: '/logo-light.png',
		srcDark: '/logo-dark.png',
		alt: 'Cooperativa Impulsa'
	},
	canonical: true,
	noindex: false,
	mode: 'auto',
	scrollAnimations: true
}
