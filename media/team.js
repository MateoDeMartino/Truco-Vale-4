// Partidas online en equipo (4 o 6 jugadores): sala de espera, mesa y conexiones.
// El anfitrión corre el motor (TrucoTeam) y le manda a cada jugador su vista del juego.
(function () {
  'use strict';
  const T = window.TrucoTeam;
  const Peer = window.Peer;
  const PEER_PREFIX = 'quiero-re-truco-';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const NAME_MAX = 16;
  // Ubicación de cada jugador en la mesa según su distancia (en turnos) a vos.
  const POSITIONS = { 4: ['b', 'r', 't', 'l'], 6: ['b', 'br', 'tr', 't', 'tl', 'bl'] };

  let o = null; // opciones que pasa ui.js
  let tm = null; // partida en equipo activa
  let myName = '';

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function genCode() {
    let c = '';
    for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return c;
  }

  function init(opts) {
    o = opts;
    myName = cleanName(opts.name) || 'Jugador';
  }

  // ---------- Anfitrión ----------

  function host() {
    if (!Peer) return o.onExit('Este VS Code no soporta conexiones WebRTC.');
    leave();
    const code = genCode();
    const peer = new Peer(PEER_PREFIX + code, { debug: 0 });
    tm = {
      role: 'host', phase: 'lobby', code, peer, ready: false, conns: new Map(), seq: 0, myId: 'h', notice: '',
      lobby: { n: 4, target: 15, players: [{ id: 'h', name: myName, team: null }] },
    };
    peer.on('open', () => { tm.ready = true; o.render(); });
    peer.on('error', (err) => {
      if (err && err.type === 'unavailable-id' && tm && tm.phase === 'lobby' && !tm.ready) return host();
      if (tm && tm.ready && ['network', 'server-error', 'socket-error', 'disconnected'].includes(err && err.type)) return;
      exit('Error de conexión' + (err && err.type ? ` (${err.type})` : '') + '.');
    });
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        if (!tm || tm.phase !== 'lobby' || tm.lobby.players.length >= tm.lobby.n) {
          conn.send({ type: 'full' });
          setTimeout(() => conn.close(), 500);
          return;
        }
        const id = 'g' + ++tm.seq;
        tm.conns.set(id, conn);
        tm.lobby.players.push({ id, name: 'Jugador ' + (tm.lobby.players.length + 1), team: null });
        conn.on('data', (msg) => { if (tm && tm.conns.get(id) === conn && msg && typeof msg === 'object') hostData(id, msg); });
        conn.on('close', () => { if (tm && tm.conns.get(id) === conn) playerLeft(id); });
        broadcastLobby();
      });
    });
    o.render();
  }

  function player(id) {
    return tm.lobby.players.find((p) => p.id === id);
  }

  function broadcastLobby() {
    for (const [id, conn] of tm.conns) {
      if (conn.open) conn.send({ type: 'lobby', lobby: tm.lobby, you: id, code: tm.code, notice: tm.notice });
    }
    o.render();
  }

  function broadcastState() {
    tm.conns.forEach((conn, id) => {
      if (conn.open) conn.send({ type: 'state', S: T.viewFor(tm.seats.indexOf(id)) });
    });
    o.render();
  }

  function setTeam(id, team) {
    const p = player(id);
    if (!p || tm.phase !== 'lobby') return;
    if (team === 0 || team === 1) {
      const count = tm.lobby.players.filter((x) => x.team === team && x.id !== id).length;
      if (count >= tm.lobby.n / 2) return;
      p.team = team;
    } else {
      p.team = null;
    }
    broadcastLobby();
  }

  function hostData(id, msg) {
    const p = player(id);
    if (msg.type === 'hello' || msg.type === 'name') {
      const nm = cleanName(msg.name);
      if (p && nm) p.name = nm;
      broadcastLobby();
    } else if (msg.type === 'team') {
      setTeam(id, msg.team);
    } else if (msg.type === 'act' && tm.phase === 'game' && msg.a && typeof msg.a.t === 'string') {
      const a = { t: msg.a.t };
      if (typeof msg.a.i === 'number') a.i = msg.a.i;
      if (typeof msg.a.v === 'string') a.v = msg.a.v;
      if (T.act(tm.seats.indexOf(id), a)) broadcastState();
    } else if (msg.type === 'next') {
      nextHand();
    } else if (msg.type === 'new') {
      newMatch();
    }
  }

  function playerLeft(id) {
    const p = player(id);
    tm.conns.delete(id);
    tm.lobby.players = tm.lobby.players.filter((x) => x.id !== id);
    if (tm.phase === 'game') {
      tm.phase = 'lobby';
      tm.notice = `${p ? p.name : 'Un jugador'} se fue. La partida se cortó.`;
    }
    broadcastLobby();
  }

  function canStart() {
    const L = tm.lobby;
    return L.players.length === L.n && [0, 1].every((t) => L.players.filter((p) => p.team === t).length === L.n / 2);
  }

  // Sienta a los equipos intercalados: equipo 0 en los asientos pares, equipo 1 en los impares.
  function start() {
    if (tm.role !== 'host' || !canStart()) return;
    const L = tm.lobby;
    const byTeam = [0, 1].map((t) => L.players.filter((p) => p.team === t));
    tm.seats = [];
    for (let k = 0; k < L.n / 2; k++) tm.seats.push(byTeam[0][k].id, byTeam[1][k].id);
    T.newGame(L.n, tm.seats.map((id) => player(id).name), L.target);
    tm.phase = 'game';
    tm.notice = '';
    broadcastState();
  }

  function nextHand() {
    const S = T.state();
    if (tm.phase === 'game' && S.handOver && S.over === null) {
      T.newHand();
      broadcastState();
    }
  }

  function newMatch() {
    const S = T.state();
    if (tm.phase === 'game' && S.over !== null) {
      T.newGame(S.n, S.names, S.target);
      broadcastState();
    }
  }

  // ---------- Invitado ----------

  // ui.js abre la conexión con el código; si del otro lado hay una partida en equipo, nos la pasa.
  function adoptGuest(peer, conn, code, firstMsg) {
    leave();
    tm = { role: 'guest', phase: 'lobby', code, peer, conn, myId: null, lobby: null, view: null, notice: '' };
    peer.on('error', (err) => {
      if (['network', 'server-error', 'socket-error', 'disconnected'].includes(err && err.type)) return;
      exit('Error de conexión' + (err && err.type ? ` (${err.type})` : '') + '.');
    });
    conn.on('data', (msg) => { if (tm && tm.conn === conn && msg && typeof msg === 'object') guestData(msg); });
    conn.on('close', () => { if (tm && tm.conn === conn) exit('Se cortó la conexión con el anfitrión.'); });
    conn.send({ type: 'hello', name: myName });
    guestData(firstMsg);
  }

  function guestData(msg) {
    if (msg.type === 'lobby') {
      tm.lobby = msg.lobby;
      tm.myId = msg.you;
      tm.notice = msg.notice || '';
      tm.phase = 'lobby';
      tm.view = null;
      o.render();
    } else if (msg.type === 'state' && msg.S) {
      tm.view = msg.S;
      tm.phase = 'game';
      o.render();
    } else if (msg.type === 'full') {
      exit('Esa partida ya está llena o ya empezó.');
    } else if (msg.type === 'end') {
      exit(msg.reason || 'El anfitrión cerró la partida.');
    }
  }

  function send(msg) {
    if (tm && tm.conn && tm.conn.open) tm.conn.send(msg);
  }

  // ---------- Salir ----------

  function leave() {
    if (!tm) return;
    const t = tm;
    tm = null;
    if (t.role === 'host') {
      t.conns.forEach((conn) => { if (conn.open) conn.send({ type: 'end', reason: 'El anfitrión cerró la partida.' }); });
    }
    setTimeout(() => { try { t.peer.destroy(); } catch (e) { /* ya cerrado */ } }, 300);
  }

  function exit(reason) {
    leave();
    o.onExit(reason || '');
  }

  // ---------- Vista ----------

  // Estado visto por este jugador (el anfitrión arma el suyo; el invitado usa el que le llega).
  function view() {
    if (tm.role === 'host') return T.viewFor(tm.seats.indexOf('h'));
    T.load(tm.view);
    return tm.view;
  }

  function lobbyHtml() {
    const L = tm.lobby;
    const isHost = tm.role === 'host';
    let h = `<div class="netbar"><span>👥 Partida en equipo</span>${o.btn('Salir', 't-leave', '', 'secondary')}</div>`;
    h += '<div class="online">';
    if (isHost && !tm.ready) return h + '<div class="hint">Conectando…</div></div>';
    if (!L) return h + '<div class="hint">Entrando a la partida…</div></div>';

    const me = L.players.find((p) => p.id === tm.myId);
    const myTeam = me ? me.team : null;
    const label = (t) => (myTeam === null ? `Equipo ${t + 1}` : t === myTeam ? 'Nosotros' : 'Ellos');

    h += `<div class="lbl">Código de la partida</div><div class="code">${tm.code}</div>`;
    h += `<div class="actions">${o.btn('Copiar código', 't-copy', '', 'secondary')}</div>`;

    h += `<label class="field">Tu nombre <input id="t-name" type="text" maxlength="${NAME_MAX}" value="${esc(myName)}" autocomplete="off" spellcheck="false"></label>`;

    if (isHost) {
      const seg = (a, vals, cur, fmt) => vals.map((v) => o.btn(fmt(v), a, `data-v="${v}"`, v === cur ? 'seg on' : 'seg')).join('');
      h += `<div class="setting">Jugadores ${seg('t-n', [4, 6], L.n, (v) => v)}</div>`;
      h += `<div class="setting">Partido a ${seg('t-target', [15, 30], L.target, (v) => v)}</div>`;
    } else {
      h += `<div class="hint small">${L.n} jugadores · partido a ${L.target}</div>`;
    }

    h += '<div class="teams">';
    [0, 1].forEach((t) => {
      const members = L.players.filter((p) => p.team === t);
      const cls = myTeam === null ? `t${t}` : t === myTeam ? 'us' : 'them';
      h += `<div class="team-col ${cls}"><div class="team-name">${label(t)} <small>${members.length}/${L.n / 2}</small></div><ul>`;
      members.forEach((p) => { h += `<li>${esc(p.name)}${p.id === tm.myId ? ' <small>(vos)</small>' : ''}${p.id === 'h' ? ' ★' : ''}</li>`; });
      for (let k = members.length; k < L.n / 2; k++) h += '<li class="empty">libre</li>';
      h += '</ul>';
      if (myTeam !== t && members.length < L.n / 2) h += o.btn('Unirme', 't-team', `data-v="${t}"`);
      h += '</div>';
    });
    h += '</div>';

    const loose = L.players.filter((p) => p.team === null);
    if (loose.length) h += `<div class="hint small">Sin equipo: ${loose.map((p) => esc(p.name)).join(', ')}</div>`;

    if (isHost) {
      const missing = L.n - L.players.length;
      if (canStart()) h += `<div class="actions">${o.btn('Empezar partida', 't-start', '', 'call')}</div>`;
      else h += `<div class="hint">${missing > 0 ? `Faltan ${missing} jugador${missing > 1 ? 'es' : ''}. ` : ''}Cada equipo necesita ${L.n / 2}.</div>`;
    } else {
      h += '<div class="hint">Esperando que el anfitrión empiece la partida…</div>';
    }
    if (tm.notice) h += `<div class="error">${esc(tm.notice)}</div>`;
    h += '</div>';
    return h;
  }

  function gameHtml() {
    const V = view();
    const me = V.me;
    const myTeam = me % 2;
    const n = V.n;
    const actors = T.actorSeats();
    const opts = T.options(me);
    const has = (t, v) => opts.some((x) => x.t === t && (v === undefined || x.v === v));
    const seatName = (s) => (s === me ? 'Vos' : esc(V.names[s]));
    const teamName = (t) => (t === myTeam ? 'Nosotros' : 'Ellos');
    const teamCls = (t) => (t === myTeam ? 'us' : 'them');
    const names = (l) => l.replace(/\{s(\d+)\}/g, (_, s) => seatName(+s)).replace(/\{t(\d)\}/g, (_, t) => teamName(+t));
    let h = '';

    h += `<div class="netbar"><span>👥 ${n} jugadores · ${tm.code}</span>${o.btn('Salir', 't-leave', '', 'secondary')}</div>`;

    h += `<div class="score team-score">
      <div class="side us"><span>Nosotros</span><b>${V.score[myTeam]}</b></div>
      <div class="mid">a ${V.target}<br><small>vale ${T.TRUCO_PTS[V.truco.level]}</small></div>
      <div class="side them"><span>Ellos</span><b>${V.score[1 - myTeam]}</b></div>
    </div>`;

    const sayCls = V.say ? `from-${V.say.seat === me ? 'p' : 'c'}${V.say.tone ? ' tone-' + V.say.tone : ''}` : 'empty';
    h += `<div class="bubble ${sayCls}">${V.say ? seatName(V.say.seat) + ': ' + V.say.msg : '&nbsp;'}</div>`;

    // Cartas de la baza en curso; si todavía nadie tiró, se ve la baza anterior.
    const showing = V.cur.cards.some((c) => c) ? { cards: V.cur.cards, done: null } : V.last ? { cards: V.last.cards, done: V.last } : null;
    h += `<div class="tt n${n}">`;
    for (let s = 0; s < n; s++) {
      const pos = POSITIONS[n][(s - me + n) % n];
      const card = showing ? showing.cards[s] : null;
      let cardCls = 'small';
      if (showing && showing.done) {
        cardCls += showing.done.winSeat === s ? ' win' : showing.done.winner === 'tie' ? '' : ' lose';
      }
      const turn = !V.pending && actors.includes(s) ? ' turn' : V.pending && actors.includes(s) ? ' answer' : '';
      const left = V.hands[s].length;
      h += `<div class="seat pos-${pos} ${teamCls(s % 2)}${turn}">
        <div class="seat-name">${seatName(s)}${V.mano === s ? '<span class="mano-tag">MANO</span>' : ''}</div>
        ${o.cardHtml(card, cardCls)}
        <div class="left">${'▮'.repeat(left)}${'▯'.repeat(3 - left)}</div>
      </div>`;
    }
    h += '<div class="felt"><div class="bazas">';
    for (let i = 0; i < 3; i++) {
      const b = V.bazas[i];
      const cls = !b ? '' : b.winner === 'tie' ? 'tie' : teamCls(b.winner);
      const txt = !b ? `${i + 1}ª` : b.winner === 'tie' ? 'parda' : teamName(b.winner);
      h += `<span class="baza ${cls}">${txt}</span>`;
    }
    h += '</div>';
    if (V.env.done && V.env.accepted) {
      h += `<div class="env-line">Envido: ${teamName(0)} ${V.env.best[0].v} · ${teamName(1)} ${V.env.best[1].v}</div>`;
    }
    h += '</div></div>';

    if (V.handOver) {
      const items = V.handItems.map((it) => `<li><span>${cap(it.reason)}</span><b>+${it.pts} ${teamName(it.t)}</b></li>`).join('');
      const title = V.over !== null ? (V.over === myTeam ? '🎉 ¡Ganamos el partido!' : 'Ganaron ellos el partido.') : `Fin de la mano ${V.handNo}`;
      h += `<div class="summary"><div class="sum-title">${title}</div>
        <div class="sum-score"><span>Nosotros</span><b>${V.handPts[myTeam]}</b><span class="dash">–</span><b>${V.handPts[1 - myTeam]}</b><span>Ellos</span></div>
        <ul>${items}</ul></div>`;
    } else {
      h += `<div class="status ${actors.includes(me) ? 'mine' : ''}">${statusText(V, actors, seatName, teamName)}</div>`;
    }

    h += '<div class="hand me">';
    V.hands[me].forEach((c, i) => {
      const playable = has('play');
      h += o.cardHtml(c, playable ? 'playable' : '', playable ? `data-a="t-act" data-t="play" data-i="${i}"` : '');
    });
    h += '</div>';

    h += `<div class="info"><span>Tu envido: <b>${T.envidoOf(V.orig[me])}</b>${V.mano === me ? ' · sos mano' : ''}</span>`;
    if (V.env.done) {
      const won = V.env.winner === myTeam;
      const detail = V.env.accepted ? `${won ? 'Nosotros' : 'Ellos'} +${V.env.pts}` : 'no querido';
      h += `<span class="env-result ${won ? 'won' : 'lost'}">Envido <b>${won ? 'ganado' : 'perdido'}</b> · ${detail}</span>`;
    }
    h += '</div>';

    h += '<div class="actions">';
    const act = (label, t, extra, cls) => o.btn(label, 't-act', `data-t="${t}" ${extra || ''}`, cls);
    if (V.over !== null) {
      if (tm.role === 'host') h += o.btn('Nuevo partido', 't-new');
      else h += '<span class="hint small">El anfitrión puede empezar otro partido.</span>';
    } else if (V.handOver) {
      h += o.btn('Repartir', 't-next');
    } else if (opts.length) {
      if (V.pending) {
        h += act('Quiero', 'quiero', '', 'yes') + act('No quiero', 'noquiero', '', 'no');
        if (has('raise')) h += act(T.TRUCO_CALL[V.pending.level + 1], 'raise', '', 'call');
      } else if (has('truco')) {
        h += act(T.TRUCO_CALL[V.truco.level + 1], 'truco', '', 'call');
      }
      ['envido', 'real', 'falta'].forEach((v) => {
        if (has('env', v)) h += act(T.ENV_NAME[v], 'env', `data-v="${v}"`, 'env');
      });
      if (has('mazo')) h += act('Irse al mazo', 'mazo', '', 'secondary');
    }
    h += '</div>';

    h += `<details class="log" open><summary>Historial</summary><ul>${V.log.map((l) => `<li>${names(l)}</li>`).join('')}</ul></details>`;
    return h;
  }

  function statusText(V, actors, seatName, teamName) {
    const me = V.me;
    const P = V.pending;
    if (P) {
      const what = P.kind === 'truco' ? T.TRUCO_CALL[P.level].toLowerCase() : P.chain.map((v) => T.ENV_NAME[v].toLowerCase()).join(' + ');
      if (actors.includes(me)) return `${seatName(P.bySeat)} canta ${what}. ¿Quieren?`;
      return `${teamName(1 - P.by)} tienen que responder ${what}…`;
    }
    if (V.turn === me) return 'Tu turno: jugá una carta o cantá.';
    return `Juega ${seatName(V.turn)}…`;
  }

  function html() {
    return tm.phase === 'lobby' ? lobbyHtml() : gameHtml();
  }

  // ---------- Eventos ----------

  function myAction(a) {
    if (tm.role === 'host') {
      if (T.act(tm.seats.indexOf('h'), a)) broadcastState();
    } else {
      send({ type: 'act', a });
    }
  }

  function click(a, el) {
    switch (a) {
      case 't-host':
        host();
        break;
      case 't-leave':
        exit('');
        break;
      case 't-copy':
        o.copy(tm.code);
        break;
      case 't-team': {
        const team = Number(el.dataset.v);
        if (tm.role === 'host') setTeam('h', team);
        else send({ type: 'team', team });
        break;
      }
      case 't-n':
        if (tm.role === 'host' && tm.phase === 'lobby') {
          const n = Number(el.dataset.v);
          if (tm.lobby.players.length > n) {
            tm.notice = `Hay ${tm.lobby.players.length} jugadores; no se puede bajar a ${n}.`;
          } else {
            tm.lobby.n = n;
            tm.notice = '';
            // Si un equipo quedó con más gente de la que entra, los que sobran quedan sin equipo.
            [0, 1].forEach((t) => {
              tm.lobby.players.filter((p) => p.team === t).slice(n / 2).forEach((p) => { p.team = null; });
            });
          }
          broadcastLobby();
        }
        break;
      case 't-target':
        if (tm.role === 'host' && tm.phase === 'lobby') {
          tm.lobby.target = Number(el.dataset.v);
          broadcastLobby();
        }
        break;
      case 't-start':
        start();
        break;
      case 't-next':
        if (tm.role === 'host') nextHand();
        else send({ type: 'next' });
        break;
      case 't-new':
        if (tm.role === 'host') newMatch();
        break;
      case 't-act': {
        const x = { t: el.dataset.t };
        if (el.dataset.i !== undefined) x.i = Number(el.dataset.i);
        if (el.dataset.v) x.v = el.dataset.v;
        myAction(x);
        break;
      }
    }
  }

  function commitName(value) {
    const nm = cleanName(value);
    if (!nm || nm === myName) return;
    myName = nm;
    o.saveName(nm);
    if (!tm || tm.phase !== 'lobby') return;
    if (tm.role === 'host') {
      player('h').name = nm;
      broadcastLobby();
    } else {
      send({ type: 'name', name: nm });
    }
  }

  window.TrucoTeamUI = {
    init,
    host,
    adoptGuest,
    leave,
    html,
    click,
    commitName,
    active: () => tm !== null,
  };
})();
