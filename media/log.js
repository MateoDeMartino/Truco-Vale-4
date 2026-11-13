// Log de conexión: manda cada línea a la extensión, que la escribe en el panel Output ("Truco Vale 4").
// Sirve para diagnosticar por qué no conecta una partida online (servidor, NAT, firewall, etc.).
(function () {
  'use strict';
  let post = () => {};

  const fmt = (args) => args.map((a) => {
    if (a instanceof Error) return `${a.name}: ${a.message}`;
    if (a && typeof a === 'object') {
      if (a.type && a.message) return `[${a.type}] ${a.message}`;
      try { return JSON.stringify(a); } catch (e) { return String(a); }
    }
    return String(a);
  }).join(' ');

  function write(level, args) {
    const text = fmt(args);
    try { post({ type: 'log', level, text }); } catch (e) { /* sin extensión */ }
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)('[Truco]', text);
  }

  const L = {
    init(postMessage) { post = postMessage; },
    info: (...a) => write('info', a),
    warn: (...a) => write('warn', a),
    error: (...a) => write('error', a),
    // Opciones para new Peer(): errores y advertencias internas de PeerJS van al log.
    peerOptions() {
      return {
        debug: 2,
        logFunction: (lvl, ...a) => write(lvl <= 1 ? 'error' : lvl === 2 ? 'warn' : 'info', ['PeerJS:', ...a]),
      };
    },
    // Engancha los eventos de un Peer (servidor de presentación).
    watchPeer(peer, label) {
      peer.on('open', (id) => L.info(`[${label}] conectado al servidor como ${id}`));
      peer.on('disconnected', () => L.warn(`[${label}] desconectado del servidor de presentación`));
      peer.on('close', () => L.info(`[${label}] peer cerrado`));
      peer.on('error', (err) => L.error(`[${label}] error de peer`, err));
    },
    // Engancha una DataConnection: estados ICE y tipos de candidatos (host/srflx/relay).
    // Si nunca aparece un candidato 'relay', el servidor TURN no es alcanzable desde esta red.
    watchConn(conn, label) {
      const tag = `[${label} ↔ ${conn.peer}]`;
      L.info(`${tag} abriendo canal de datos`);
      conn.on('open', () => L.info(`${tag} canal abierto`));
      conn.on('close', () => L.info(`${tag} canal cerrado`));
      conn.on('error', (err) => L.error(`${tag} error de conexión`, err));
      const pc = conn.peerConnection;
      if (!pc || !pc.addEventListener) return L.warn(`${tag} sin RTCPeerConnection para observar`);
      const seen = {};
      let hasRelay = false;
      pc.addEventListener('icecandidate', (ev) => {
        const c = ev.candidate;
        if (!c) {
          const kinds = Object.keys(seen).map((k) => `${k}×${seen[k]}`).join(', ') || 'ninguno';
          L.info(`${tag} candidatos locales: ${kinds}${hasRelay ? '' : ' (sin relay: TURN no alcanzable)'}`);
          return;
        }
        const type = c.type || (/ typ (\w+)/.exec(c.candidate) || [])[1] || '?';
        const proto = c.protocol || (/ (udp|tcp) /i.exec(c.candidate) || [])[1] || '?';
        const key = `${type}/${proto}`;
        seen[key] = (seen[key] || 0) + 1;
        if (type === 'relay') hasRelay = true;
      });
      pc.addEventListener('icecandidateerror', (ev) => {
        L.warn(`${tag} error al juntar candidatos: ${ev.url || ''} ${ev.errorCode || ''} ${ev.errorText || ''}`.trim());
      });
      pc.addEventListener('icegatheringstatechange', () => L.info(`${tag} ICE gathering: ${pc.iceGatheringState}`));
      pc.addEventListener('iceconnectionstatechange', () => {
        const s = pc.iceConnectionState;
        (s === 'failed' || s === 'disconnected' ? L.warn : L.info)(`${tag} ICE: ${s}`);
        if (s === 'connected' || s === 'completed' || s === 'failed') logPair(pc, tag);
      });
      pc.addEventListener('connectionstatechange', () => {
        const s = pc.connectionState;
        (s === 'failed' ? L.error : L.info)(`${tag} conexión WebRTC: ${s}`);
      });
    },
  };

  // Muestra qué par de candidatos se eligió (o se intentó) para saber si fue directo o por relay.
  function logPair(pc, tag) {
    if (!pc.getStats) return;
    pc.getStats().then((stats) => {
      const byId = {};
      stats.forEach((r) => { byId[r.id] = r; });
      const pairs = [];
      stats.forEach((r) => { if (r.type === 'candidate-pair') pairs.push(r); });
      const sel = pairs.find((p) => p.selected || p.nominated && p.state === 'succeeded');
      const desc = (id) => {
        const c = byId[id];
        return c ? `${c.candidateType}/${c.protocol}` : '?';
      };
      if (sel) {
        L.info(`${tag} par elegido: local ${desc(sel.localCandidateId)} → remoto ${desc(sel.remoteCandidateId)}`);
      } else {
        L.warn(`${tag} ningún par de candidatos funcionó (${pairs.length} probados): ` +
          pairs.map((p) => `${desc(p.localCandidateId)}→${desc(p.remoteCandidateId)}:${p.state}`).join(', '));
      }
    }).catch((e) => L.warn(`${tag} no se pudieron leer stats`, e));
  }

  window.addEventListener('error', (ev) => L.error('Error de JS:', ev.message, `${ev.filename || ''}:${ev.lineno || ''}`));
  window.addEventListener('unhandledrejection', (ev) => L.error('Promesa rechazada:', ev.reason));

  window.TrucoLog = L;
})();
