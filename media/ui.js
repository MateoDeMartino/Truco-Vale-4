(function () {
  'use strict';
  const vscode = acquireVsCodeApi();
  const E = window.TrucoEngine;
  const Peer = window.Peer;
  const ICON = { espada: '🗡️', basto: '🪵', oro: '🪙', copa: '🍷' };
  const CPU_DELAY = 900;
  const PEER_PREFIX = 'quiero-re-truco-';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const JOIN_TIMEOUT = 15000;

  const saved = vscode.getState();
  if (saved && saved.v === 1 && saved.S) E.load(saved.S);
  else E.newGame(15);

  let timer = null;
  let chosenTarget = null;

  // mode: quién maneja el estado del motor. 'local' = contra la CPU,
  // 'host' = partida online creada acá, 'guest' = unido a la partida de otro.
  let mode = 'local';
  let screen = 'game'; // 'game' | 'online'
  let localGame = null; // partida contra la CPU guardada mientras se juega online
  const net = { phase: 'menu', code: '', joinInput: '', error: '', peer: null, conn: null, gotState: false, joinTimer: null };

  // Partidas en equipo (4 o 6): las maneja team.js; acá solo se le pasa lo que necesita.
  const Team = window.TrucoTeamUI;
  let playerName = (saved && saved.name) || '';
  Team.init({
    name: playerName,
    btn,
    cardHtml,
    render,
    copy: (text) => vscode.postMessage({ type: 'copy', text }),
    saveName: (n) => { playerName = n; save(); },
    onExit: (msg) => {
      net.phase = 'menu';
      net.error = msg;
      screen = 'online';
      update();
    },
  });

  const name = (w) => (w === 'p' ? 'Vos' : mode === 'local' ? 'CPU' : 'Rival');
  const oppLabel = () => (mode === 'local' ? 'la CPU' : 'tu rival');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const names = (s) => s.replace(/\{(p|c)\}/g, (_, x) => name(x));

  function save() {
    vscode.setState({ v: 1, S: mode === 'local' ? E.state() : localGame, name: playerName });
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

  function genCode() {
    let c = '';
    for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return c;
  }

  function send(msg) {
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
      try { p.destroy(); } catch (e) { /* ya cerrado */ }
    }
  }

  function enterOnline(m) {
    clearTimeout(timer);
    if (mode === 'local') localGame = E.state();
    mode = m;
    net.phase = 'playing';
    net.error = '';
    screen = 'game';
  }

  function leaveOnline(error) {
    closePeer();
    net.phase = 'menu';
    net.error = error || '';
    if (mode !== 'local') {
      if (localGame) E.load(localGame);
      localGame = null;
      mode = 'local';
    }
  }

  function peerError(err) {
    const t = err && err.type;
    // Si ya están conectados, una caída del servidor de presentación no corta el juego.
    if (net.phase === 'playing' && ['network', 'server-error', 'socket-error', 'disconnected'].includes(t)) return;
    if (t === 'unavailable-id' && net.phase === 'hosting') {
      startHost();
      return;
    }
    const msg = {
      'peer-unavailable': 'No hay ninguna partida con ese código.',
      'connect-timeout': 'La partida existe pero no se pudo conectar con tu rival. Suele ser la red (firewall, VPN o wifi corporativo): probá desde otra red.',
      'browser-incompatible': 'Este VS Code no soporta conexiones WebRTC.',
      network: 'No se pudo conectar al servidor. Revisá tu conexión.',
      'server-error': 'El servidor de conexión no responde. Probá de nuevo en un rato.',
      'socket-error': 'No se pudo conectar al servidor. Revisá tu conexión.',
    }[t] || 'Error de conexión' + (t ? ` (${t})` : '') + '.';
    leaveOnline(msg);
    screen = 'online';
    update();
  }

  function watchConn(conn, onData) {
    conn.on('data', (msg) => {
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
    if (!Peer) return peerError({ type: 'browser-incompatible' });
    closePeer();
    net.phase = 'hosting';
    net.error = '';
    net.code = genCode();
    const peer = new Peer(PEER_PREFIX + net.code, { debug: 0 });
    net.peer = peer;
    peer.on('open', () => render());
    peer.on('error', peerError);
    peer.on('connection', (conn) => {
      if (net.conn) {
        conn.on('open', () => conn.close());
        return;
      }
      net.conn = conn;
      watchConn(conn, onHostData);
      conn.on('open', () => {
        enterOnline('host');
        E.newGame(chosenTarget || (localGame && localGame.target) || 15);
        update();
      });
    });
    render();
  }

  function startJoin() {
    if (!Peer) return peerError({ type: 'browser-incompatible' });
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
    const peer = new Peer({ debug: 0 });
    net.peer = peer;
    peer.on('error', peerError);
    peer.on('open', () => {
      const conn = peer.connect(PEER_PREFIX + code, { reliable: true });
      net.conn = conn;
      watchConn(conn, onGuestData);
      conn.on('open', () => {
        clearTimeout(net.joinTimer);
        enterOnline('guest');
        render();
      });
    });
    net.joinTimer = setTimeout(() => {
      // Si el código no existiera, el servidor avisa 'peer-unavailable' en menos de un segundo.
      // Llegar acá significa que la partida existe pero WebRTC no pudo abrir el canal (NAT/firewall).
      if (net.phase === 'joining') peerError({ type: 'connect-timeout' });
    }, JOIN_TIMEOUT);
    render();
  }

  function onHostData(msg) {
    const S = E.state();
    if (msg.type === 'act' && msg.a && typeof msg.a.t === 'string') {
      const a = { t: msg.a.t };
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

  function onGuestData(msg) {
    // Del otro lado hay una partida en equipo: la conexión pasa a team.js.
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
      E.load(msg.S);
      net.gotState = true;
      render();
    }
  }

  // ---------- Render ----------

  function cardHtml(c, cls, attrs) {
    if (!c) return `<div class="card slot ${cls || ''}"></div>`;
    return `<div class="card s-${c.s} ${cls || ''}" ${attrs || ''} title="${c.n} de ${c.s}">` +
      `<span class="num">${c.n}</span><span class="ico">${ICON[c.s]}</span><span class="num b">${c.n}</span></div>`;
  }

  function btn(label, a, extra, cls) {
    return `<button class="${cls || ''}" data-a="${a}" ${extra || ''}>${label}</button>`;
  }

  function statusText(S, act) {
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
  function summaryHtml(S) {
    const items = S.handItems.map((it) => `<li><span>${cap(it.reason)}</span><b>+${it.pts} ${name(it.w)}</b></li>`).join('');
    return `<div class="summary">
      <div class="sum-title">${S.over ? statusText(S, null) : `Fin de la mano ${S.handNo}`}</div>
      <div class="sum-score"><span>${name('p')}</span><b>${S.handPts.p}</b><span class="dash">–</span><b>${S.handPts.c}</b><span>${name('c')}</span></div>
      <ul>${items}</ul>
    </div>`;
  }

  function tabsHtml() {
    const playing = mode !== 'local' || Team.active();
    const online = screen === 'online' || playing;
    return `<div class="tabs">
      <button class="tab ${online ? '' : 'active'}" data-a="tab-local">Contra la CPU</button>
      <button class="tab ${online ? 'active' : ''}" data-a="tab-online">Online${playing ? ' ●' : ''}</button>
    </div>`;
  }

  function onlineMenuHtml() {
    let h = '<div class="online">';
    if (net.phase === 'hosting') {
      h += `<div class="lbl">Tu código de partida</div>
        <div class="code">${net.peer && net.peer.open ? net.code : '·····'}</div>
        <div class="hint">${net.peer && net.peer.open ? 'Pasáselo a tu rival. Esperando que se una…' : 'Conectando…'}</div>
        <div class="actions">${btn('Copiar código', 'copy', '', 'secondary')}${btn('Cancelar', 'cancel', '', 'secondary')}</div>`;
    } else if (net.phase === 'joining') {
      h += `<div class="hint">Conectando a la partida <b>${net.code}</b>…</div>
        <div class="actions">${btn('Cancelar', 'cancel', '', 'secondary')}</div>`;
    } else {
      h += `<div class="lbl">Jugá contra alguien en otra PC</div>
        <div class="actions">${btn('1 vs 1', 'host', '', 'call')}${btn('En equipo (4 o 6)', 't-host', '', 'call')}</div>
        <div class="or">o unite con un código</div>
        <div class="join">
          <input id="code" type="text" maxlength="8" placeholder="CÓDIGO" value="${net.joinInput}" autocomplete="off" spellcheck="false">
          ${btn('Unirse', 'join')}
        </div>`;
      if (localGame === null && mode === 'local') h += '<div class="hint small">Tu partida contra la CPU queda guardada.</div>';
    }
    if (net.error) h += `<div class="error">${net.error}</div>`;
    h += '</div>';
    return h;
  }

  function gameHtml() {
    const S = E.state();
    const act = E.actor();
    const opts = E.options('p');
    const has = (t, v) => opts.some((o) => o.t === t && (v === undefined || o.v === v));
    const target = chosenTarget || S.target;
    let h = '';

    if (mode !== 'local') {
      h += `<div class="netbar"><span>🌐 Online · ${mode === 'host' ? 'creaste la partida' : 'partida ' + net.code}</span>${btn('Salir', 'leave', '', 'secondary')}</div>`;
    }

    h += `<div class="score">
      <div class="side ${S.mano === 'p' ? 'is-mano' : ''}"><span>${name('p')}</span><b>${S.score.p}</b></div>
      <div class="mid">a ${S.target}<br><small>vale ${E.TRUCO_PTS[S.truco.level]}</small></div>
      <div class="side ${S.mano === 'c' ? 'is-mano' : ''}"><span>${name('c')}</span><b>${S.score.c}</b></div>
    </div>`;

    h += '<div class="cpu-row"><div class="hand cpu">';
    if (S.handOver) S.hand.c.forEach((c) => { h += cardHtml(c, 'small'); });
    else S.hand.c.forEach(() => { h += '<div class="card back small"></div>'; });
    h += '</div>';
    if (S.env.result) h += `<div class="env-badge" title="Envido de ${oppLabel()}">Envido<b>${S.env.result.c}</b></div>`;
    h += '</div>';

    const sayCls = S.say ? `from-${S.say.w}${S.say.tone ? ' tone-' + S.say.tone : ''}` : 'empty';
    h += `<div class="bubble ${sayCls}">${S.say ? name(S.say.w) + ': ' + S.say.msg : '&nbsp;'}</div>`;

    h += '<div class="table">';
    for (let i = 0; i < 3; i++) {
      const done = S.bazas[i];
      const b = done || (i === S.bazas.length ? S.cur : null);
      const w = done ? done.winner : null;
      const cls = (side) => (!w ? '' : w === 'tie' ? 'tie' : w === side ? 'win' : 'lose');
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

    h += `<div class="info"><span>Tu envido: <b>${E.envidoOf(S.orig.p)}</b>${S.mano === 'p' ? ' · sos mano' : ''}</span>`;
    if (S.env.done && S.env.winner) {
      const won = S.env.winner === 'p';
      const detail = S.env.accepted
        ? (won ? `+${S.env.pts}` : `${name('c')} +${S.env.pts}`)
        : (won ? `no quiso · +${S.env.pts}` : 'no quisiste');
      h += `<span class="env-result ${won ? 'won' : 'lost'}">Envido <b>${won ? 'ganado' : 'perdido'}</b> · ${detail}</span>`;
    }
    h += '</div>';

    h += '<div class="actions">';
    if (S.over) {
      h += btn('Nuevo partido', 'new');
    } else if (S.handOver) {
      h += btn('Repartir', 'next');
    } else if (act === 'p') {
      if (S.pending) {
        h += btn('Quiero', 'quiero', '', 'yes') + btn('No quiero', 'noquiero', '', 'no');
        if (has('raise')) h += btn(E.TRUCO_CALL[S.pending.level + 1], 'raise', '', 'call');
      } else if (has('truco')) {
        h += btn(E.TRUCO_CALL[S.truco.level + 1], 'truco', '', 'call');
      }
      ['envido', 'real', 'falta'].forEach((v) => {
        if (has('env', v)) h += btn(E.ENV_NAME[v], 'env', `data-v="${v}"`, 'env');
      });
      if (has('mazo')) h += btn('Irse al mazo', 'mazo', '', 'secondary');
    }
    h += '</div>';

    h += `<details class="log" open><summary>Historial</summary><ul>${S.log.map((l) => `<li>${names(l)}</li>`).join('')}</ul></details>`;

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

  function render() {
    let h = tabsHtml();
    if (Team.active()) h += Team.html();
    else if (screen === 'online' && mode === 'local') h += onlineMenuHtml();
    else if (mode === 'guest' && !net.gotState) h += '<div class="online"><div class="hint">Conectado. Esperando que arranque la partida…</div></div>';
    else h += gameHtml();

    // Si estabas escribiendo (por ejemplo tu nombre) y llega una actualización, no perdés el foco.
    const focused = document.activeElement;
    const focusId = focused && focused.id;
    const caret = focusId && focused.selectionStart;
    document.getElementById('app').innerHTML = h;
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) {
        el.focus();
        try { el.setSelectionRange(caret, caret); } catch (e) { /* no es un campo de texto */ }
      }
    }
  }

  // ---------- Eventos ----------

  function newGame() {
    E.newGame(chosenTarget || E.state().target);
    chosenTarget = null;
  }

  function gameAction(a, el) {
    if (mode === 'guest') {
      if (a === 'next' || a === 'new') send({ type: a });
      else {
        const o = { t: a };
        if (el.dataset.i !== undefined) o.i = Number(el.dataset.i);
        if (el.dataset.v) o.v = el.dataset.v;
        send({ type: 'act', a: o });
      }
      return;
    }
    if (a === 'next') E.newHand();
    else if (a === 'new') newGame();
    else {
      const o = { t: a };
      if (el.dataset.i !== undefined) o.i = Number(el.dataset.i);
      if (el.dataset.v) o.v = el.dataset.v;
      E.act('p', o);
    }
    update();
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (!el) return;
    const a = el.dataset.a;
    if (a.startsWith('t-')) {
      Team.click(a, el);
      return;
    }
    switch (a) {
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
    if (e.target.id === 'code') net.joinInput = e.target.value;
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'code' && e.key === 'Enter') startJoin();
    if (e.target.id === 't-name' && e.key === 'Enter') Team.commitName(e.target.value);
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'target') chosenTarget = Number(e.target.value);
    if (e.target.id === 't-name') Team.commitName(e.target.value);
  });

  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'newGame' && mode === 'local' && !Team.active()) {
      newGame();
      screen = 'game';
      update();
    }
  });

  update();
})();
