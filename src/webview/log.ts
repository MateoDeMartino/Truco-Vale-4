// Log de conexión: manda cada línea a la extensión, que la escribe en el panel Output ("Truco Vale 4").
// Sirve para diagnosticar por qué no conecta una partida online (servidor, NAT, firewall, etc.).

export type LogLevel = 'info' | 'warn' | 'error';
type Post = (msg: { type: 'log'; level: LogLevel; text: string }) => void;

let post: Post = () => {};

const fmt = (args: unknown[]): string =>
  args
    .map((a: any) => {
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      if (a && typeof a === 'object') {
        if (a.type && a.message) return `[${a.type}] ${a.message}`;
        try {
          return JSON.stringify(a);
        } catch (e) {
          return String(a);
        }
      }
      return String(a);
    })
    .join(' ');

function write(level: LogLevel, args: unknown[]): void {
  const text = fmt(args);
  try {
    post({ type: 'log', level, text });
  } catch (e) {
    /* sin extensión */
  }
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)('[Truco]', text);
}

export const info = (...a: unknown[]) => write('info', a);
export const warn = (...a: unknown[]) => write('warn', a);
export const error = (...a: unknown[]) => write('error', a);

export function init(postMessage: Post): void {
  post = postMessage;
}

// Servidores STUN: le dicen a cada PC cuál es su IP pública para conectarse directo.
// Varios por si alguno no responde. Reemplazan los que trae PeerJS por defecto, cuyo TURN
// (eu-0/us-0.turn.peerjs.com) ya no existe. Todavía no hay TURN de respaldo (issue #3).
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

// Opciones para new Peer(): errores y advertencias internas de PeerJS van al log.
export function peerOptions() {
  return {
    debug: 2,
    logFunction: (lvl: number, ...a: unknown[]) => write(lvl <= 1 ? 'error' : lvl === 2 ? 'warn' : 'info', ['PeerJS:', ...a]),
    config: { iceServers: ICE_SERVERS },
  };
}

// Engancha los eventos de un Peer (servidor de presentación).
export function watchPeer(peer: any, label: string): void {
  peer.on('open', (id: string) => info(`[${label}] conectado al servidor como ${id}`));
  peer.on('disconnected', () => warn(`[${label}] desconectado del servidor de presentación`));
  peer.on('close', () => info(`[${label}] peer cerrado`));
  peer.on('error', (err: any) => error(`[${label}] error de peer`, err));
}

// Engancha una DataConnection: estados ICE y tipos de candidatos (host/srflx/relay).
// Si nunca aparece un candidato 'relay', el servidor TURN no es alcanzable desde esta red.
export function watchConn(conn: any, label: string): void {
  const tag = `[${label} ↔ ${conn.peer}]`;
  info(`${tag} abriendo canal de datos`);
  conn.on('open', () => info(`${tag} canal abierto`));
  conn.on('close', () => info(`${tag} canal cerrado`));
  conn.on('error', (err: any) => error(`${tag} error de conexión`, err));
  const pc: RTCPeerConnection | undefined = conn.peerConnection;
  if (!pc || !pc.addEventListener) {
    warn(`${tag} sin RTCPeerConnection para observar`);
    return;
  }
  const seen: Record<string, number> = {};
  let hasRelay = false;
  pc.addEventListener('icecandidate', (ev) => {
    const c = ev.candidate;
    if (!c) {
      const kinds =
        Object.keys(seen)
          .map((k) => `${k}×${seen[k]}`)
          .join(', ') || 'ninguno';
      info(`${tag} candidatos locales: ${kinds}${hasRelay ? '' : ' (sin relay: TURN no alcanzable)'}`);
      return;
    }
    const type = c.type || (/ typ (\w+)/.exec(c.candidate) || [])[1] || '?';
    const proto = c.protocol || (/ (udp|tcp) /i.exec(c.candidate) || [])[1] || '?';
    const key = `${type}/${proto}`;
    seen[key] = (seen[key] || 0) + 1;
    if (type === 'relay') hasRelay = true;
  });
  pc.addEventListener('icecandidateerror', (ev) => {
    const e = ev as RTCPeerConnectionIceErrorEvent;
    warn(`${tag} error al juntar candidatos: ${e.url || ''} ${e.errorCode || ''} ${e.errorText || ''}`.trim());
  });
  pc.addEventListener('icegatheringstatechange', () => info(`${tag} ICE gathering: ${pc.iceGatheringState}`));
  pc.addEventListener('iceconnectionstatechange', () => {
    const s = pc.iceConnectionState;
    (s === 'failed' || s === 'disconnected' ? warn : info)(`${tag} ICE: ${s}`);
    if (s === 'connected' || s === 'completed' || s === 'failed') logPair(pc, tag);
  });
  pc.addEventListener('connectionstatechange', () => {
    const s = pc.connectionState;
    (s === 'failed' ? error : info)(`${tag} conexión WebRTC: ${s}`);
  });
}

// Muestra qué par de candidatos se eligió (o se intentó) para saber si fue directo o por relay.
function logPair(pc: RTCPeerConnection, tag: string): void {
  if (!pc.getStats) return;
  pc.getStats()
    .then((stats) => {
      const byId: Record<string, any> = {};
      const pairs: any[] = [];
      stats.forEach((r: any) => {
        byId[r.id] = r;
        if (r.type === 'candidate-pair') pairs.push(r);
      });
      const sel = pairs.find((p) => p.selected || (p.nominated && p.state === 'succeeded'));
      const desc = (id: string) => {
        const c = byId[id];
        return c ? `${c.candidateType}/${c.protocol}` : '?';
      };
      if (sel) {
        info(`${tag} par elegido: local ${desc(sel.localCandidateId)} → remoto ${desc(sel.remoteCandidateId)}`);
      } else {
        warn(
          `${tag} ningún par de candidatos funcionó (${pairs.length} probados): ` +
            pairs.map((p) => `${desc(p.localCandidateId)}→${desc(p.remoteCandidateId)}:${p.state}`).join(', ')
        );
      }
    })
    .catch((e) => warn(`${tag} no se pudieron leer stats`, e));
}

window.addEventListener('error', (ev) => error('Error de JS:', ev.message, `${ev.filename || ''}:${ev.lineno || ''}`));
window.addEventListener('unhandledrejection', (ev) => error('Promesa rechazada:', ev.reason));
