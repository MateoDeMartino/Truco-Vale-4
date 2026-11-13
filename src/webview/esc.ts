// Escapa texto antes de interpolarlo en HTML. Todo lo que llega de otro jugador
// (nombres, estado de la partida online) pasa por acá antes de ir a innerHTML.
export const esc = (s: unknown): string =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c)
  );
