// Códigos de sala y handshake de entrada, compartidos por las partidas 1 contra 1 y en equipo.
//
// El código que se pasan los jugadores nunca viaja al servidor público de PeerJS: ahí la sala se
// registra con un hash del código. Quien vea el ID en el servidor no puede deducir el código, y el
// anfitrión solo acepta a quien le mande el código correcto apenas se conecta (mensaje 'join').

// v2: el ID ahora es un hash. Las versiones viejas no encuentran estas salas (y al revés).
const PEER_PREFIX = 'quiero-re-truco-v2-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 símbolos, sin 0/O ni 1/I
export const CODE_LEN = 7; // 32^7 ≈ 34 mil millones de salas posibles: no se adivinan probando
// Tiempo que tiene un invitado recién conectado para mandar el código antes de que se lo corte.
export const JOIN_TIMEOUT = 10000;

// Código aleatorio con crypto (Math.random es predecible). 256 es múltiplo de 32: no hay sesgo.
export function genCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

// ID con el que la sala se registra en el servidor de PeerJS.
export async function peerId(code: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('truco-vale-4:' + code));
  const hex = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
  return PEER_PREFIX + hex.slice(0, 32);
}

// Primer mensaje que manda un invitado.
export function joinMsg(code: string, name: string) {
  return { type: 'join', code, name };
}

// ¿El primer mensaje del invitado trae el código de esta sala?
export function isValidJoin(msg: any, code: string): boolean {
  return !!msg && typeof msg === 'object' && msg.type === 'join' && msg.code === code;
}

// Espera el 'join' de una conexión recién abierta. Si no llega a tiempo o el código no coincide,
// la corta; si está bien, llama a onJoin con ese primer mensaje (una sola vez).
export function awaitJoin(conn: any, code: string, onJoin: (msg: any) => void, label: string, log: (m: string) => void): void {
  let done = false;
  const reject = (why: string) => {
    if (done) return;
    done = true;
    log(`[${label}] conexión rechazada: ${why}`);
    try {
      conn.close();
    } catch (e) {
      /* ya cerrada */
    }
  };
  const timer = setTimeout(() => reject('no mandó el código a tiempo'), JOIN_TIMEOUT);
  conn.on('data', function first(msg: any) {
    if (done) return;
    clearTimeout(timer);
    if (!isValidJoin(msg, code)) return reject('código incorrecto');
    done = true;
    onJoin(msg);
  });
  conn.on('close', () => clearTimeout(timer));
}
