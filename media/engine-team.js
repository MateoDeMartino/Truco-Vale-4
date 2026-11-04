// Motor del truco en equipos: 4 o 6 jugadores, dos equipos intercalados (sin flor).
// Los asientos van de 0 a n-1 en orden de juego; el equipo de un asiento es asiento % 2.
(function (root) {
  'use strict';

  const B = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.TrucoEngine;
  const { rank, envidoOf, TRUCO_PTS, TRUCO_CALL, ENV_NAME } = B;
  const ENV_PTS = { envido: 2, real: 3 };
  const SUITS = ['espada', 'basto', 'oro', 'copa'];
  const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

  const teamOf = (seat) => seat % 2;
  const otherTeam = (t) => 1 - t;

  function deck() {
    const d = [];
    for (const s of SUITS) for (const n of NUMBERS) d.push({ n, s });
    return d;
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Igual que en 1 vs 1, pero con equipos 0 / 1 en vez de 'p' / 'c'.
  function handWinner(res, manoTeam) {
    const wins = [0, 0];
    res.forEach((r) => { if (r !== 'tie') wins[r]++; });
    if (wins[0] >= 2) return 0;
    if (wins[1] >= 2) return 1;
    if (res.length >= 2) {
      if (res[0] === 'tie' && res[1] !== 'tie') return res[1];
      if (res[0] !== 'tie' && res[1] === 'tie') return res[0];
    }
    if (res.length === 3) {
      if (res[2] !== 'tie') return res[2];
      return res[0] !== 'tie' ? res[0] : manoTeam;
    }
    return null;
  }

  let S = null;

  const next = (seat) => (seat + 1) % S.n;
  const seatsOf = (t) => [...Array(S.n).keys()].filter((s) => teamOf(s) === t);

  // En el historial: {sN} = jugador del asiento N, {tN} = equipo N. La interfaz pone los nombres.
  function log(msg) {
    S.log.unshift(msg);
    if (S.log.length > 50) S.log.length = 50;
  }

  function say(seat, msg, tone) {
    S.say = { seat, msg, tone: tone || null };
    log(`{s${seat}}: ${msg}`);
  }

  function newGame(n, names, target) {
    S = { n, names: names.slice(), target: target || 15, score: [0, 0], nextMano: 0, over: null, handNo: 0, log: [] };
    newHand();
    return S;
  }

  function newHand() {
    if (S.over !== null) return;
    const d = shuffle(deck());
    S.mano = S.nextMano;
    S.nextMano = next(S.mano);
    S.orig = [];
    for (let i = 0; i < S.n; i++) S.orig.push(d.slice(i * 3, i * 3 + 3));
    S.hands = S.orig.map((h) => h.slice());
    S.bazas = [];
    S.cur = { cards: Array(S.n).fill(null), leader: S.mano };
    S.last = null;
    S.turn = S.mano;
    S.truco = { level: 0, owner: null };
    S.env = { done: false };
    S.pending = null;
    S.suspended = null;
    S.handOver = false;
    S.say = null;
    S.handPts = [0, 0];
    S.handItems = [];
    S.handNo++;
    log(`— Mano ${S.handNo} · mano: {s${S.mano}} —`);
  }

  // Asientos que pueden actuar ahora: el del turno, o cualquiera del equipo que tiene que responder.
  function actorSeats() {
    if (!S || S.over !== null || S.handOver) return [];
    if (S.pending) return seatsOf(otherTeam(S.pending.by));
    return [S.turn];
  }

  function canEnvido(seat) {
    return !S.handOver && !S.env.done && S.bazas.length === 0 && S.cur.cards[seat] === null && S.truco.level === 0;
  }

  function canTruco(seat) {
    return S.truco.level < 3 && (S.truco.owner === null || S.truco.owner === teamOf(seat));
  }

  function envRaises(chain) {
    if (chain.includes('falta')) return [];
    const r = [];
    if (!chain.includes('real') && chain.filter((x) => x === 'envido').length < 2) r.push('envido');
    if (!chain.includes('real')) r.push('real');
    r.push('falta');
    return r;
  }

  function envPoints(chain, accepted) {
    if (!accepted) {
      if (chain.length === 1) return 1;
      return chain.slice(0, -1).reduce((s, v) => s + ENV_PTS[v], 0);
    }
    if (chain.includes('falta')) return S.target - Math.max(...S.score);
    return chain.reduce((s, v) => s + ENV_PTS[v], 0);
  }

  function options(seat) {
    const o = [];
    if (!actorSeats().includes(seat)) return o;
    const P = S.pending;
    if (P) {
      o.push({ t: 'quiero' }, { t: 'noquiero' });
      if (P.kind === 'truco') {
        if (P.level < 3) o.push({ t: 'raise' });
        if (P.level === 1 && canEnvido(seat)) ['envido', 'real', 'falta'].forEach((v) => o.push({ t: 'env', v }));
      } else {
        envRaises(P.chain).forEach((v) => o.push({ t: 'env', v }));
      }
      return o;
    }
    S.hands[seat].forEach((_, i) => o.push({ t: 'play', i }));
    if (canEnvido(seat)) ['envido', 'real', 'falta'].forEach((v) => o.push({ t: 'env', v }));
    if (canTruco(seat)) o.push({ t: 'truco' });
    o.push({ t: 'mazo' });
    return o;
  }

  function legal(seat, a) {
    return options(seat).some((o) => o.t === a.t && o.i === a.i && o.v === a.v);
  }

  // Los puntos se anotan durante la mano y pasan al marcador recién cuando termina.
  function addPts(t, pts, reason) {
    S.handItems.push({ t, pts, reason });
    S.handPts[t] += pts;
  }

  function endHand(t, pts, reason) {
    S.handOver = true;
    S.pending = null;
    S.suspended = null;
    addPts(t, pts, reason);
    for (const it of S.handItems) {
      S.score[it.t] = Math.min(S.target, S.score[it.t] + it.pts);
      log(`+${it.pts} para {t${it.t}} (${it.reason})`);
      if (S.score[it.t] >= S.target) {
        S.over = it.t;
        log(`Partido para {t${it.t}}.`);
        break;
      }
    }
  }

  function play(seat, i) {
    S.cur.cards[seat] = S.hands[seat].splice(i, 1)[0];
    if (S.cur.cards.some((c) => c === null)) {
      S.turn = next(seat);
      return;
    }
    // Gana la carta más alta; si empatan cartas de los dos equipos, es parda.
    let best = -1;
    let winners = [];
    for (let k = 0; k < S.n; k++) {
      const s = (S.cur.leader + k) % S.n;
      const r = rank(S.cur.cards[s]);
      if (r > best) { best = r; winners = [s]; } else if (r === best) winners.push(s);
    }
    const teams = new Set(winners.map(teamOf));
    const win = teams.size === 1 ? teamOf(winners[0]) : 'tie';
    const baza = { cards: S.cur.cards, winner: win, winSeat: win === 'tie' ? null : winners[0], leader: S.cur.leader };
    S.bazas.push(baza);
    S.last = baza;
    const hw = handWinner(S.bazas.map((b) => b.winner), teamOf(S.mano));
    if (hw !== null) {
      S.cur = { cards: Array(S.n).fill(null), leader: null };
      endHand(hw, TRUCO_PTS[S.truco.level], S.truco.level ? TRUCO_CALL[S.truco.level].toLowerCase() : 'mano ganada');
      return;
    }
    const leader = win === 'tie' ? S.cur.leader : baza.winSeat;
    S.cur = { cards: Array(S.n).fill(null), leader };
    S.turn = leader;
  }

  // Cuenta el mejor envido de cada equipo; si empatan, gana el que está más cerca del mano.
  function resolveEnvido(accepted) {
    const P = S.pending;
    S.pending = null;
    S.env.done = true;
    S.env.accepted = accepted;
    if (accepted) {
      const best = [null, null];
      for (let k = 0; k < S.n; k++) {
        const s = (S.mano + k) % S.n;
        const v = envidoOf(S.orig[s]);
        const t = teamOf(s);
        if (!best[t] || v > best[t].v) best[t] = { v, seat: s, order: k };
      }
      S.env.winner = best[0].v > best[1].v ? 0 : best[1].v > best[0].v ? 1 : best[0].order < best[1].order ? 0 : 1;
      S.env.best = best.map((b) => ({ v: b.v, seat: b.seat }));
      S.env.pts = envPoints(P.chain, true);
      log(`Envido: {t0} ${best[0].v} ({s${best[0].seat}}), {t1} ${best[1].v} ({s${best[1].seat}})`);
      addPts(S.env.winner, S.env.pts, 'envido');
    } else {
      S.env.winner = P.by;
      S.env.pts = envPoints(P.chain, false);
      addPts(P.by, S.env.pts, 'envido no querido');
    }
    if (S.suspended) S.pending = S.suspended;
    S.suspended = null;
  }

  function act(seat, a) {
    if (!legal(seat, a)) return false;
    const P = S.pending;
    const team = teamOf(seat);
    switch (a.t) {
      case 'play':
        play(seat, a.i);
        break;
      case 'truco':
        S.pending = { kind: 'truco', level: S.truco.level + 1, by: team, bySeat: seat };
        say(seat, '¡' + TRUCO_CALL[S.pending.level] + '!');
        break;
      case 'raise':
        S.truco.level = P.level;
        S.pending = { kind: 'truco', level: P.level + 1, by: team, bySeat: seat };
        say(seat, '¡Quiero ' + TRUCO_CALL[P.level + 1].toLowerCase() + '!');
        break;
      case 'env':
        if (P && P.kind === 'envido') {
          P.chain.push(a.v);
          P.by = team;
          P.bySeat = seat;
        } else {
          if (P) S.suspended = P;
          S.pending = { kind: 'envido', chain: [a.v], by: team, bySeat: seat };
        }
        say(seat, (P && P.kind === 'truco' ? 'El envido está primero. ' : '') + '¡' + ENV_NAME[a.v] + '!');
        break;
      case 'quiero':
        say(seat, '¡Quiero!', 'yes');
        if (P.kind === 'truco') {
          S.truco.level = P.level;
          S.truco.owner = team;
          S.pending = null;
        } else {
          resolveEnvido(true);
        }
        break;
      case 'noquiero':
        say(seat, 'No quiero.', 'no');
        if (P.kind === 'truco') endHand(P.by, TRUCO_PTS[P.level - 1], 'truco no querido');
        else resolveEnvido(false);
        break;
      case 'mazo': {
        say(seat, 'Nos vamos al mazo.');
        const pts = TRUCO_PTS[S.truco.level] + (S.bazas.length === 0 && !S.env.done ? 1 : 0);
        endHand(otherTeam(team), pts, 'se fueron al mazo');
        break;
      }
    }
    return true;
  }

  // Copia del estado para el jugador de `seat`: solo ve sus propias cartas (y las de todos al terminar la mano).
  function viewFor(seat) {
    const v = JSON.parse(JSON.stringify(S));
    v.me = seat;
    for (let s = 0; s < v.n; s++) {
      if (s === seat) continue;
      v.orig[s] = null;
      if (!v.handOver) v.hands[s] = v.hands[s].map(() => null);
    }
    return v;
  }

  const api = {
    newGame,
    newHand,
    actorSeats,
    options,
    act,
    viewFor,
    teamOf,
    envidoOf,
    handWinner,
    state: () => S,
    load: (s) => { S = s; },
    TRUCO_CALL,
    TRUCO_PTS,
    ENV_NAME,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TrucoTeam = api;
})(this);
