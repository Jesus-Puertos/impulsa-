import { defineConfig } from "astro/config";
import partytown from "@astrojs/partytown";
import tailwindcss from "@tailwindcss/vite";
import icon from "astro-icon";
import lottie from "astro-integration-lottie";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";
import markdoc from "@astrojs/markdoc";
import netlify from "@astrojs/netlify";

// https://astro.build/config
export default defineConfig({
  site: "https://cooperativaimpulsa.mx",
  // El sitio publico se pre-renderiza (estatico). Las rutas que necesitan
  // sesion o base de datos (/acceso, /registro, /portal, /admin, /api) se
  // marcan individualmente con `export const prerender = false`.
  output: "static",
  integrations: [
    icon(),
    sitemap({
      filter: (page) =>
        !page.includes("/admin") && !page.includes("/portal") && !page.includes("/acceso"),
    }),
    lottie(),
    partytown({
      config: {
        forward: ["dataLayer.push"],
      },
    }),
    react(),
    markdoc(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: netlify(),
});
