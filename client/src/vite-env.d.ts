/// <reference types="vite/client" />

// Asset imports handled by Vite
declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.jpg" {
  const src: string;
  export default src;
}

declare module "*.svg" {
  const src: string;
  export default src;
}

declare module "*.css" {
  const css: string;
  export default css;
}

// Leaflet asset imports
declare module "leaflet/dist/images/*.png" {
  const src: string;
  export default src;
}

declare module "leaflet/dist/leaflet.css" {
  const css: string;
  export default css;
}
