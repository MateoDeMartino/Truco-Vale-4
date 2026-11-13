// Preferencias de la interfaz que se cambian con los botones de la barra de pestañas.
// ui.ts las guarda con el resto del estado del webview.

// Tanteador criollo (botón 🪵) en vez del marcador clásico.
let criollo = false;
// Modo minimalista (botón 🧹): sin "Tu envido: XX" ni historial de jugadas.
let minimal = false;

export const isCriollo = () => criollo;
export function setCriollo(on: boolean): void {
  criollo = on;
}

export const isMinimal = () => minimal;
export function setMinimal(on: boolean): void {
  minimal = on;
}
