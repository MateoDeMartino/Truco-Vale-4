import { TrucoEngine as E } from '../engine/engine';
// Partidas en equipo (4 o 6): las maneja team.ts; acá solo se le pasa lo que necesita.
import { TrucoTeamUI as Team } from './team';
import * as Log from './log';
import * as Room from './room';
import { esc } from './esc';
import { isGameState } from '../engine/validate';
import { Sound } from './sound';
import { SoundSnap, snapGame, soundsBetween } from './sound-events';
import * as Tanteador from './tanteador';
import { Action, Card, EnvidoValue, GameState } from '../types/truco';

declare function acquireVsCodeApi(): {
  getState(): any;
  setState(state: any): void;
  postMessage(message: any): void;
};

declare const Peer: any;

export function startUI() {
  const vscode = acquireVsCodeApi();
  Log.init((m) => vscode.postMessage(m));
  const ICON: Record<string, string> = { espada: '🗡️', basto: '🪵', oro: '🪙', copa: '🍷' };
  const CPU_DELAY = 900;
  const JOIN_TIMEOUT = 15000;
  const CODE_LEN = Room.CODE_LEN;

  const saved = vscode.getState();
  if (saved && saved.v === 1 && isGameState(saved.S)) E.load(saved.S);
  else E.newGame(15);

  let timer: any = null;
  let chosenTarget: number | null = null;

  // mode: quién maneja el estado del motor. 'local' = contra la CPU,
  // 'host' = partida online creada acá, 'guest' = unido a la partida de otro.
  let mode: 'local' | 'host' | 'guest' = 'local';
  let screen: 'game' | 'online' = 'game';
  let localGame: GameState | null = null; // partida contra la CPU guardada mientras se juega online
  const net = {
    phase: 'menu',
    code: '',
    joinInput: '',
    error: '',
    peer: null as any,
    conn: null as any,
    gotState: false,
    joinTimer: null as any,
  };

  let playerName = (saved && saved.name) || '';
  if (saved && typeof saved.muted === 'boolean') Sound.setMuted(saved.muted);
  if (saved && saved.style === 'criollo') Tanteador.setCriollo(true);
  Team.init({
    name: playerName,
    btn,
    cardHtml,
    render,
    copy: (text: string) => vscode.postMessage({ type: 'copy', text }),
    saveName: (n: string) => {
      playerName = n;
      save();
    },
    onExit: (msg: string) => {
      net.phase = 'menu';
      net.error = msg;
      screen = 'online';
      update();
    },
  });

  const name = (w: string) => (w === 'p' ? 'Vos' : mode === 'local' ? 'CPU' : 'Rival');
  const oppLabel = () => (mode === 'local' ? 'la CPU' : 'tu rival');
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  function save() {
    vscode.setState({ v: 1, S: mode === 'local' ? E.state() : localGame, name: playerName,
      muted: Sound.getMuted(),
      style: Tanteador.isCriollo() ? 'criollo' : 'clasico',
    });
  }

  function update() {
    save();
    if (mode === 'host') sendState();
    render();
    clearTimeout(timer);
    if (mode === 'local' && !Team.active() && E.actor() === 'c') {
      timer = setTimeout(() => {
        E.aiAct('c');
        update();
      }, CPU_DELAY);
    }
  }

  // ---------- Red ----------

  function send(msg: any) {
    if (net.conn && net.conn.open) net.conn.send(msg);
  }

  function sendState() {
    send({ type: 'state', S: E.rivalView() });
  }

  function closePeer() {
    clearTimeout(net.joinTimer);
    const p = net.peer;
    net.peer = null;
    net.conn = null;
    net.gotState = false;
    if (p) {
      try {
        p.destroy();
      } catch (e) {
        /* ya cerrado */
      }
    }
  }

  function enterOnline(m: 'host' | 'guest') {
    clearTimeout(timer);
    if (mode === 'local') localGame = E.state();
    mode = m;
    net.phase = 'playing';
    net.error = '';
    screen = 'game';
  }

  function leaveOnline(error?: string) {
    closePeer();
    net.phase = 'menu';
    net.error = error || '';
    if (mode !== 'local') {
      if (localGame) E.load(localGame);
      localGame = null;
      mode = 'local';
    }
  }

  function peerError(err: any) {
    const t = err && err.type;
    // Si ya están conectados, una caída del servidor de presentación no corta el juego.
    if (net.phase === 'playing' && ['network', 'server-error', 'socket-error', 'disconnected'].includes(t)) return;
    if (t === 'unavailable-id' && net.phase === 'hosting') {
      startHost();
      return;
    }
    const msg =
      ({
        'peer-unavailable': 'No hay ninguna partida con ese código.',
        'connect-timeout':
          'La partida existe pero no se pudo conectar con tu rival. Suele ser la red (firewall, VPN o wifi corporativo): probá desde otra red.',
        'browser-incompatible': 'Este VS Code no soporta conexiones WebRTC.',
        network: 'No se pudo conectar al servidor. Revisá tu conexión.',
        'server-error': 'El servidor de conexión no responde. Probá de nuevo en un rato.',
        'socket-error': 'No se pudo conectar al servidor. Revisá tu conexión.',
      } as Record<string, string>)[t] || 'Error de conexión' + (t ? ` (${t})` : '') + '.';
    leaveOnline(msg);
    screen = 'online';
    update();
  }

  function watchConn(conn: any, onData: (msg: any) => void) {
    conn.on('data', (msg: any) => {
      if (conn !== net.conn || !msg || typeof msg !== 'object') return;
      onData(msg);
    });
    conn.on('close', () => {
      if (conn !== net.conn) return;
      if (net.phase === 'joining') return peerError({ type: 'connect-timeout' });
      leaveOnline('Se cortó la conexión con tu rival.');
      screen = 'online';
      update();
    });
  }

  function startHost() {
    if (typeof Peer === 'undefined' || !Peer) return peerError({ type: 'browser-incompatible' });
    closePeer();
    net.phase = 'hosting';
    net.error = '';
    const code = (net.code = Room.genCode());
    Room.peerId(code).then((id) => {
      // Mientras se calculaba el hash, el usuario pudo cancelar o pedir otro código.
      if (net.phase !== 'hosting' || net.code !== code || net.peer) return;
      const peer = new Peer(id, Log.peerOptions());
      net.peer = peer;
      Log.watchPeer(peer, 'anfitrión');
      peer.on('open', () => render());
      peer.on('error', peerError);
      peer.on('connection', (conn: any) => {
        Log.watchConn(conn, 'anfitrión');
        // Nadie entra hasta mandar el código. Ya con un rival adentro, no entra nadie más.
        conn.on('open', () =>
          Room.awaitJoin(
            conn,
            code,
            () => {
              if (net.conn || net.peer !== peer) return conn.close();
              net.conn = conn;
              watchConn(conn, onHostData);
              enterOnline('host');
              E.newGame(chosenTarget || (localGame && localGame.target) || 15);
              update();
            },
            'anfitrión',
            Log.warn,
          ),
        );
      });
    });
    render();
  }

  function startJoin() {
    if (typeof Peer === 'undefined' || !Peer) return peerError({ type: 'browser-incompatible' });
    const code = net.joinInput.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) {
      net.error = 'Escribí el código que te pasó tu rival.';
      render();
      return;
    }
    closePeer();
    net.phase = 'joining';
    net.error = '';
    net.code = code;
    const peer = new Peer(Log.peerOptions());
    net.peer = peer;
    Log.watchPeer(peer, 'invitado');
    peer.on('error', peerError);
    peer.on('open', () => {
      Room.peerId(code).then((id) => {
        if (net.peer !== peer || net.phase !== 'joining') return;
        const conn = peer.connect(id, { reliable: true });
        net.conn = conn;
        Log.watchConn(conn, 'invitado');
        watchConn(conn, onGuestData);
        conn.on('open', () => {
          clearTimeout(net.joinTimer);
          // Primero el código: sin eso el anfitrión corta la conexión.
          conn.send(Room.joinMsg(code, playerName));
          enterOnline('guest');
          render();
        });
      });
    });
    net.joinTimer = setTimeout(() => {
      // Si el código no existiera, el servidor avisa 'peer-unavailable' en menos de un segundo.
      // Llegar acá significa que la partida existe pero WebRTC no pudo abrir el canal (NAT/firewall).
      if (net.phase === 'joining') peerError({ type: 'connect-timeout' });
    }, JOIN_TIMEOUT);
    render();
  }

  function onHostData(msg: any) {
    const S = E.state();
    if (msg.type === 'act' && msg.a && typeof msg.a.t === 'string') {
      const a: any = { t: msg.a.t };
      if (typeof msg.a.i === 'number') a.i = msg.a.i;
      if (typeof msg.a.v === 'string') a.v = msg.a.v;
      E.act('c', a);
    } else if (msg.type === 'next' && S.handOver && !S.over) {
      E.newHand();
    } else if (msg.type === 'new' && S.over) {
      E.newGame(S.target);
    }
    update();
  }

  function onGuestData(msg: any) {
    // Del otro lado hay una partida en equipo: la conexión pasa a team.ts.
    if (msg.type === 'lobby' || msg.type === 'full') {
      const { peer, conn, code } = net;
      clearTimeout(net.joinTimer);
      net.peer = null;
      net.conn = null;
      net.phase = 'menu';
      net.gotState = false;
      mode = 'local';
      localGame = null;
      Team.adoptGuest(peer, conn, code, msg);
      return;
    }
    if (msg.type === 'state' && msg.S) {
      // El estado viene del rival: si no tiene la forma esperada se corta la partida.
      if (!isGameState(msg.S)) {
        Log.error('estado inválido recibido del anfitrión');
        leaveOnline('Tu rival mandó datos inválidos y se cortó la partida.');
        screen = 'online';
        update();
        return;
      }
      E.load(msg.S);
      net.gotState = true;
      render();
    }
  }

  // ---------- Render ----------

  function cardHtml(c: Card | null, cls?: string, attrs?: string): string {
    if (!c) return `<div class="card slot ${cls || ''}"></div>`;
    // La carta puede venir del estado que manda el rival: se escapa antes de armar el HTML.
    const suit = esc(c.s);
    const num = esc(c.n);
    return (
      `<div class="card s-${suit} ${cls || ''}" ${attrs || ''} title="${num} de ${suit}">` +
      `<span class="num">${num}</span><span class="ico">${ICON[c.s] || ''}</span><span class="num b">${num}</span></div>`
    );
  }

  function btn(label: string, a: string, extra?: string, cls?: string): string {
    return `<button class="${cls || ''}" data-a="${a}" ${extra || ''}>${label}</button>`;
  }

  function statusText(S: GameState, act: string | null): string {
    const opp = oppLabel();
    if (S.over) return S.over === 'p' ? '🎉 ¡Ganaste el partido!' : `${cap(opp)} ganó el partido.`;
    if (S.handOver) return 'Mano terminada.';
    const P = S.pending;
    if (act === 'p' && P) {
      if (P.kind === 'truco') return `${cap(opp)} canta ${E.TRUCO_CALL[P.level].toLowerCase()}. ¿Querés?`;
      return `${cap(opp)} canta ${P.chain.map((v) => E.ENV_NAME[v].toLowerCase()).join(' + ')}. ¿Querés?`;
    }
    if (act === 'p') return 'Tu turno: jugá una carta o cantá.';
    if (mode === 'local') return P ? 'Esperando la respuesta de la CPU…' : 'La CPU está pensando…';
    return P ? 'Esperando la respuesta de tu rival…' : 'Juega tu rival…';
  }

  // Resumen al final de la mano: cuántos puntos se lleva cada uno y por qué.
  function summaryHtml(S: GameState): string {
    const items = S.handItems.map((it) => `<li><span>${esc(cap(it.reason))}</span><b>+${esc(it.pts)} ${name(it.w)}</b></li>`).join('');
    return `<div class="summary">
      <div class="sum-title">${S.over ? statusText(S, null) : `Fin de la mano ${S.handNo}`}</div>
      <div class="sum-score"><span>${name('p')}</span><b>${S.handPts.p}</b><span class="dash">–</span><b>${S.handPts.c}</b><span>${name('c')}</span></div>
      <ul>${items}</ul>
    </div>`;
  }

  function tabsHtml(): string {
    const playing = mode !== 'local' || Team.active();
    const online = screen === 'online' || playing;
    const muted = Sound.getMuted();
    const criollo = Tanteador.isCriollo();
    return `<div class="tabs">
      <div class="tabs-group">
        <button class="tab ${online ? '' : 'active'}" data-a="tab-local">Contra la CPU</button>
        <button class="tab ${online ? 'active' : ''}" data-a="tab-online">Online${playing ? ' ●' : ''}</button>
      </div>
      <div class="tabs-tools">
        <button class="sound-toggle style-toggle${criollo ? ' on' : ''}" data-a="toggle-style" title="${criollo ? 'Volver al marcador clásico' : 'Usar el tanteador criollo'}">🪵</button>
        <button class="sound-toggle" data-a="toggle-sound" title="${muted ? 'Activar sonido' : 'Silenciar'}">${muted ? '🔇' : '🔊'}</button>
      </div>
    </div>`;
  }

  function onlineMenuHtml(): string {
    let h = '<div class="online">';
    if (net.phase === 'hosting') {
      h += `<div class="lbl">Tu código de partida</div>
        <div class="code">${net.peer && net.peer.open ? net.code : '·'.repeat(CODE_LEN)}</div>
        <div class="hint">${net.peer && net.peer.open ? 'Pasáselo a tu rival. Esperando que se una…' : 'Conectando…'}</div>
        <div class="actions">${btn('Copiar código', 'copy', '', 'secondary')}${btn('Cancelar', 'cancel', '', 'secondary')}</div>`;
    } else if (net.phase === 'joining') {
      h += `<div class="hint">Conectando a la partida <b>${esc(net.code)}</b>…</div>
        <div class="actions">${btn('Cancelar', 'cancel', '', 'secondary')}</div>`;
    } else {
      h += `<div class="lbl">Jugá contra alguien en otra PC</div>
        <div class="actions">${btn('1 vs 1', 'host', '', 'call')}${btn('En equipo (4 o 6)', 't-host', '', 'call')}</div>
        <div class="or">o unite con un código</div>
        <div class="join">
          <input id="code" type="text" maxlength="8" placeholder="CÓDIGO" value="${esc(net.joinInput)}" autocomplete="off" spellcheck="false">
          ${btn('Unirse', 'join')}
        </div>`;
      if (localGame === null && mode === 'local') h += '<div class="hint small">Tu partida contra la CPU queda guardada.</div>';
    }
    if (net.error) h += `<div class="error">${esc(net.error)}</div>`;
    h += '</div>';
    return h;
  }

  function gameHtml(): string {
    const S = E.state();
    const act = E.actor();
    const opts = E.options('p');
    const has = (t: string, v?: string) => opts.some((o: any) => o.t === t && (v === undefined || o.v === v));
    const target = chosenTarget || S.target;
    let h = '';

    if (mode !== 'local') {
      h += `<div class="netbar"><span>🌐 Online · ${mode === 'host' ? 'creaste la partida' : 'partida ' + esc(net.code)}</span>${btn('Salir', 'leave', '', 'secondary')}</div>`;
    }

    if (Tanteador.isCriollo()) {
      h += Tanteador.tanteadorHtml({
        scoreUs: S.score.p,
        scoreThem: S.score.c,
        target: S.target,
        vale: E.TRUCO_PTS[S.truco.level],
        nameUs: name('p'),
        nameThem: name('c'),
      });
    } else {
      h += `<div class="score">
      <div class="side ${S.mano === 'p' ? 'is-mano' : ''}"><span>${name('p')}</span><b>${esc(S.score.p)}</b></div>
      <div class="mid">a ${esc(S.target)}<br><small>vale ${E.TRUCO_PTS[S.truco.level]}</small></div>
      <div class="side ${S.mano === 'c' ? 'is-mano' : ''}"><span>${name('c')}</span><b>${esc(S.score.c)}</b></div>
    </div>`;
    }

    h += '<div class="cpu-row"><div class="hand cpu">';
    if (S.handOver) S.hand.c.forEach((c) => { h += cardHtml(c, 'small'); });
    else S.hand.c.forEach(() => { h += '<div class="card back small"></div>'; });
    h += '</div>';
    if (S.env.result) h += `<div class="env-badge" title="Envido de ${oppLabel()}">Envido<b>${S.env.result.c}</b></div>`;
    h += '</div>';

    const sayCls = S.say ? `from-${esc(S.say.w)}${S.say.tone ? ' tone-' + esc(S.say.tone) : ''}` : 'empty';
    h += `<div class="bubble ${sayCls}">${S.say ? name(S.say.w) + ': ' + esc(S.say.msg) : '&nbsp;'}</div>`;

    h += '<div class="table">';
    for (let i = 0; i < 3; i++) {
      const done = S.bazas[i];
      const b = done || (i === S.bazas.length ? S.cur : null);
      const w = done ? done.winner : null;
      const cls = (side: string) => (!w ? '' : w === 'tie' ? 'tie' : w === side ? 'win' : 'lose');
      h += `<div class="col">${cardHtml(b && b.c, cls('c'))}${cardHtml(b && b.p, cls('p'))}</div>`;
    }
    h += '</div>';

    if (S.handOver) h += summaryHtml(S);
    else h += `<div class="status ${act === 'p' ? 'mine' : ''}">${statusText(S, act)}</div>`;

    h += '<div class="hand me">';
    S.hand.p.forEach((c, i) => {
      const playable = has('play');
      h += cardHtml(c, playable ? 'playable' : '', playable ? `data-a="play" data-i="${i}"` : '');
    });
    h += '</div>';

    const infoParts: string[] = [];
    if (S.mano === 'p') infoParts.push('<span>Sos mano</span>');
    if (S.env.done && S.env.winner) {
      const won = S.env.winner === 'p';
      const detail = S.env.accepted
        ? won ? `+${esc(S.env.pts)}` : `${name('c')} +${esc(S.env.pts)}`
        : won ? `no quiso · +${esc(S.env.pts)}` : 'no quisiste';
      infoParts.push(`<span class="env-result ${won ? 'won' : 'lost'}">Envido <b>${won ? 'ganado' : 'perdido'}</b> · ${detail}</span>`);
    }
    if (infoParts.length) h += `<div class="info">${infoParts.join('')}</div>`;

    h += '<div class="actions">';
    if (S.over) {
      h += btn('Nuevo partido', 'new');
    } else if (S.handOver) {
      h += btn('Repartir', 'next');
    } else if (act === 'p') {
      if (S.pending) {
        h += btn('Quiero', 'quiero', '', 'yes') + btn('No quiero', 'noquiero', '', 'no');
        if (has('raise') && S.pending.kind === 'truco') h += btn(E.TRUCO_CALL[S.pending.level + 1], 'raise', '', 'call');
      } else if (has('truco')) {
        h += btn(E.TRUCO_CALL[S.truco.level + 1], 'truco', '', 'call');
      }
      (['envido', 'real', 'falta'] as EnvidoValue[]).forEach((v) => {
        if (has('env', v)) h += btn(E.ENV_NAME[v], 'env', `data-v="${v}"`, 'env');
      });
      if (has('mazo')) h += btn('Irse al mazo', 'mazo', '', 'secondary');
    }
    h += '</div>';

    if (mode === 'local') {
      h += `<div class="footer">
        <label>Partido a
          <select id="target">
            <option value="15" ${target === 15 ? 'selected' : ''}>15</option>
            <option value="30" ${target === 30 ? 'selected' : ''}>30</option>
          </select>
        </label>
        ${btn('Nuevo partido', 'new', '', 'secondary')}
      </div>`;
    }
    return h;
  }

  function buildHtml(): string {
    let h = tabsHtml();
    if (Team.active()) h += Team.html();
    else if (screen === 'online' && mode === 'local') h += onlineMenuHtml();
    else if (mode === 'guest' && !net.gotState)
      h += '<div class="online"><div class="hint">Conectado. Esperando que arranque la partida…</div></div>';
    else h += gameHtml();
    return h;
  }

  // ---------- Sonidos ----------

  // Última foto de la mesa que se mostró. Se compara con la actual en cada render: así suena lo
  // que cambió, venga de un click, de la CPU o del rival, y una sola vez.
  let lastSound: { key: string; snap: SoundSnap } | null = null;

  function currentSoundSnap(): { key: string; snap: SoundSnap } | null {
    if (Team.active()) return Team.soundSnap();
    if (screen === 'online' && mode === 'local') return null; // menú online
    if (mode === 'guest' && !net.gotState) return null;
    return { key: mode === 'local' ? 'local' : `${mode}:${net.code}`, snap: snapGame(E.state()) };
  }

  function playSounds() {
    let cur: { key: string; snap: SoundSnap } | null = null;
    try {
      cur = currentSoundSnap();
    } catch (e) {
      cur = null;
    }
    // Al cambiar de partida (otra sala, volver a la CPU) no se compara con la anterior.
    const prev = cur && lastSound && lastSound.key === cur.key ? lastSound.snap : null;
    lastSound = cur;
    if (!cur) return;
    for (const ev of soundsBetween(prev, cur.snap)) {
      if (ev === 'card') Sound.playCard();
      else if (ev === 'truco') Sound.playTruco(cur.snap.trucoLevel + 1);
      else if (ev === 'envido') Sound.playEnvido();
      else if (ev === 'quiero') Sound.playQuiero();
      else if (ev === 'noquiero' || ev === 'loseMatch') Sound.playNoQuiero();
      else if (ev === 'winHand') Sound.playWinHand();
      else if (ev === 'winMatch') Sound.playWinMatch();
    }
  }

  function render() {
    let h: string;
    try {
      h = buildHtml();
    } catch (e) {
      // Red de seguridad: si algo no se puede dibujar, se sale de la partida en vez de dejar el panel colgado.
      Log.error('error al dibujar la partida', e);
      const wasOnline = Team.active() || mode !== 'local';
      Team.leave();
      leaveOnline(wasOnline ? 'Hubo un problema con la partida online y se cerró.' : '');
      if (wasOnline) screen = 'online';
      else E.newGame(15);
      h = buildHtml();
    }
    playSounds();

    // Si estabas escribiendo (por ejemplo tu nombre) y llega una actualización, no perdés el foco.
    const focused = document.activeElement as HTMLElement | null;
    const focusId = focused && focused.id;
    const caret = focused instanceof HTMLInputElement ? focused.selectionStart : null;
    const appEl = document.getElementById('app');
    if (appEl) appEl.innerHTML = h;
    if (focusId) {
      const el = document.getElementById(focusId) as HTMLInputElement | null;
      if (el) {
        el.focus();
        try {
          if (caret !== null) el.setSelectionRange(caret, caret);
        } catch (e) {
          /* no es un campo de texto */
        }
      }
    }
  }

  // ---------- Eventos ----------

  function newGame() {
    E.newGame(chosenTarget || E.state().target);
    chosenTarget = null;
  }

  function gameAction(a: string, el: HTMLElement) {
    if (mode === 'guest') {
      if (a === 'next' || a === 'new') send({ type: a });
      else {
        const o: any = { t: a };
        if (el.dataset.i !== undefined) o.i = Number(el.dataset.i);
        if (el.dataset.v) o.v = el.dataset.v;
        send({ type: 'act', a: o });
      }
      return;
    }
    if (a === 'next') E.newHand();
    else if (a === 'new') newGame();
    else {
      const o: any = { t: a };
      if (el.dataset.i !== undefined) o.i = Number(el.dataset.i);
      if (el.dataset.v) o.v = el.dataset.v;
      E.act('p', o as Action);
    }
    update();
  }

  // El tablero criollo se redibuja en cada jugada: se recuerda si estaba abierto.
  // 'toggle' no burbujea, por eso se escucha en la fase de captura.
  document.addEventListener(
    'toggle',
    (e) => {
      const el = e.target as HTMLElement;
      if (el instanceof HTMLDetailsElement && el.classList.contains('criollo-tanteador-details')) Tanteador.setBoardOpen(el.open);
    },
    true,
  );

  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
    if (!el) return;
    const a = el.dataset.a!;
    if (a.startsWith('t-')) {
      Team.click(a, el);
      return;
    }
    switch (a) {
      case 'toggle-sound':
        Sound.toggleMute();
        save();
        render();
        break;
      case 'toggle-style':
        Tanteador.setCriollo(!Tanteador.isCriollo());
        save();
        render();
        break;
      case 'tab-local':
        Team.leave();
        leaveOnline();
        screen = 'game';
        update();
        break;
      case 'tab-online':
        screen = 'online';
        render();
        break;
      case 'host':
        startHost();
        break;
      case 'join':
        startJoin();
        break;
      case 'copy':
        vscode.postMessage({ type: 'copy', text: net.code });
        break;
      case 'cancel':
        leaveOnline();
        render();
        break;
      case 'leave':
        leaveOnline();
        screen = 'online';
        update();
        break;
      default:
        gameAction(a, el);
    }
  });

  document.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.id === 'code') net.joinInput = target.value;
  });

  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.id === 'code' && e.key === 'Enter') startJoin();
    if (target.id === 't-name' && e.key === 'Enter') Team.commitName(target.value);
  });

  document.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    if (target.id === 'target') chosenTarget = Number(target.value);
    if (target.id === 't-name') Team.commitName(target.value);
  });

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'newGame' && mode === 'local' && !Team.active()) {
      newGame();
      screen = 'game';
      update();
    }
  });

  update();
}
