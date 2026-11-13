// Motor del truco argentino (2 jugadores, sin flor). 'p' = vos, 'c' = CPU.
import {
  Action,
  Baza,
  BazaWinner,
  Card,
  CardNumber,
  EnvidoValue,
  GameState,
  HandWinner,
  PlayerSide,
  Suit,
} from '../types/truco';

export const SUITS: Suit[] = ['espada', 'basto', 'oro', 'copa'];
export const NUMBERS: CardNumber[] = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
export const TRUCO_PTS = [1, 2, 3, 4];
export const TRUCO_CALL = ['', 'Truco', 'Retruco', 'Vale cuatro'];
export const ENV_NAME: Record<EnvidoValue, string> = {
  envido: 'Envido',
  real: 'Real envido',
  falta: 'Falta envido',
};
export const ENV_PTS: Record<'envido' | 'real', number> = { envido: 2, real: 3 };

// En el historial los jugadores se guardan como {p} / {c}; la interfaz pone los nombres.
export const other = (w: PlayerSide): PlayerSide => (w === 'p' ? 'c' : 'p');
const key = (c: Card): string => `${c.n}${c.s}`;

export function rank(c: Card): number {
  const { n, s } = c;
  if (n === 1 && s === 'espada') return 14;
  if (n === 1 && s === 'basto') return 13;
  if (n === 7 && s === 'espada') return 12;
  if (n === 7 && s === 'oro') return 11;
  if (n === 3) return 10;
  if (n === 2) return 9;
  if (n === 1) return 8;
  if (n === 12) return 7;
  if (n === 11) return 6;
  if (n === 10) return 5;
  if (n === 7) return 4;
  if (n === 6) return 3;
  if (n === 5) return 2;
  return 1;
}

export function envidoOf(cards: Card[]): number {
  const v = (c: Card) => (c.n >= 10 ? 0 : c.n);
  let best = 0;
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (cards[i].s === cards[j].s) best = Math.max(best, 20 + v(cards[i]) + v(cards[j]));
    }
  }
  if (!best) best = Math.max(...cards.map(v));
  return best;
}

export function deck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) for (const n of NUMBERS) d.push({ n, s });
  return d;
}

export function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Resultado de la mano a partir de los resultados de cada baza ('p' | 'c' | 'tie').
export function handWinner(res: BazaWinner[], mano: PlayerSide): HandWinner {
  const wins: Record<PlayerSide, number> = { p: 0, c: 0 };
  res.forEach((r) => {
    if (r !== 'tie') wins[r]++;
  });
  if (wins.p >= 2) return 'p';
  if (wins.c >= 2) return 'c';
  if (res.length >= 2) {
    if (res[0] === 'tie' && res[1] !== 'tie') return res[1];
    if (res[0] !== 'tie' && res[1] === 'tie') return res[0];
  }
  if (res.length === 3) {
    if (res[2] !== 'tie') return res[2];
    return res[0] !== 'tie' ? res[0] : mano;
  }
  return null;
}

export function bazaWinner(cur: { p: Card; c: Card }): BazaWinner {
  const rp = rank(cur.p);
  const rc = rank(cur.c);
  return rp > rc ? 'p' : rc > rp ? 'c' : 'tie';
}

let S: GameState;

function log(msg: string): void {
  S.log.unshift(msg);
  if (S.log.length > 40) S.log.length = 40;
}

function say(w: PlayerSide, msg: string, tone?: string | null): void {
  S.say = { w, msg, tone: tone || null };
  log(`{${w}}: ${msg}`);
}

export function newGame(target?: number): GameState {
  S = {
    target: target || 15,
    score: { p: 0, c: 0 },
    nextMano: Math.random() < 0.5 ? 'p' : 'c',
    mano: 'p',
    orig: { p: [], c: [] },
    hand: { p: [], c: [] },
    bazas: [],
    cur: { p: null, c: null, leader: null },
    turn: null,
    truco: { level: 0, owner: null },
    env: { done: false, result: null },
    pending: null,
    suspended: null,
    handOver: false,
    say: null,
    aiEnvChecked: { p: false, c: false },
    handPts: { p: 0, c: 0 },
    handItems: [],
    handNo: 0,
    over: null,
    log: [],
  };
  newHand();
  return S;
}

export function newHand(): void {
  if (S.over) return;
  const d = shuffle(deck());
  S.mano = S.nextMano;
  S.nextMano = other(S.mano);
  S.orig = { p: d.slice(0, 3), c: d.slice(3, 6) };
  S.hand = { p: S.orig.p.slice(), c: S.orig.c ? S.orig.c.slice() : [] };
  S.bazas = [];
  S.cur = { p: null, c: null, leader: S.mano };
  S.turn = S.mano;
  S.truco = { level: 0, owner: null };
  S.env = { done: false, result: null };
  S.pending = null;
  S.suspended = null;
  S.handOver = false;
  S.say = null;
  S.aiEnvChecked = { p: false, c: false };
  S.handPts = { p: 0, c: 0 };
  S.handItems = [];
  S.handNo++;
  log(`— Mano ${S.handNo} · mano: {${S.mano}} —`);
}

export function actor(): PlayerSide | null {
  if (!S || S.over || S.handOver) return null;
  if (S.pending) return other(S.pending.by);
  return S.turn;
}

export function canEnvido(w: PlayerSide): boolean {
  return !S.handOver && !S.env.done && S.bazas.length === 0 && S.cur[w] === null && S.truco.level === 0;
}

export function canTruco(w: PlayerSide): boolean {
  return !S.handOver && S.truco.level < 3 && (S.truco.owner === null || S.truco.owner === w);
}

export function envRaises(chain: EnvidoValue[]): EnvidoValue[] {
  if (chain.includes('falta')) return [];
  const r: EnvidoValue[] = [];
  if (!chain.includes('real') && chain.filter((x) => x === 'envido').length < 2) r.push('envido');
  if (!chain.includes('real')) r.push('real');
  r.push('falta');
  return r;
}

export function faltaPts(): number {
  return S.target - Math.max(S.score.p, S.score.c);
}

export function envPoints(chain: EnvidoValue[], accepted: boolean): number {
  if (!accepted) {
    if (chain.length === 1) return 1;
    return chain.slice(0, -1).reduce((s, v) => s + (v === 'falta' ? 0 : ENV_PTS[v]), 0);
  }
  if (chain.includes('falta')) return faltaPts();
  return chain.reduce((s, v) => s + (v === 'falta' ? 0 : ENV_PTS[v]), 0);
}

export function options(w: PlayerSide): Action[] {
  const o: Action[] = [];
  if (actor() !== w) return o;
  const P = S.pending;
  if (P) {
    o.push({ t: 'quiero' }, { t: 'noquiero' });
    if (P.kind === 'truco') {
      if (P.level < 3) o.push({ t: 'raise' });
      if (P.level === 1 && canEnvido(w)) (['envido', 'real', 'falta'] as EnvidoValue[]).forEach((v) => o.push({ t: 'env', v }));
    } else {
      envRaises(P.chain).forEach((v) => o.push({ t: 'env', v }));
    }
    return o;
  }
  S.hand[w].forEach((_, i) => o.push({ t: 'play', i }));
  if (canEnvido(w)) (['envido', 'real', 'falta'] as EnvidoValue[]).forEach((v) => o.push({ t: 'env', v }));
  if (canTruco(w)) o.push({ t: 'truco' });
  o.push({ t: 'mazo' });
  return o;
}

export function legal(w: PlayerSide, a: Action): boolean {
  return options(w).some((o) => o.t === a.t && (o as any).i === (a as any).i && (o as any).v === (a as any).v);
}

// Los puntos se anotan durante la mano y pasan al marcador recién cuando termina.
function addPts(w: PlayerSide, pts: number, reason: string): void {
  S.handItems.push({ w, pts, reason });
  S.handPts[w] += pts;
}

function endHand(w: PlayerSide, pts: number, reason: string): void {
  S.handOver = true;
  S.pending = null;
  S.suspended = null;
  addPts(w, pts, reason);
  // En orden: el envido se cuenta antes que el truco, y si alguien llega gana ahí.
  for (const it of S.handItems) {
    S.score[it.w] = Math.min(S.target, S.score[it.w] + it.pts);
    log(`+${it.pts} para {${it.w}} (${it.reason})`);
    if (S.score[it.w] >= S.target) {
      S.over = it.w;
      log(`Partido para {${it.w}}.`);
      break;
    }
  }
}

// Puntos que tendría w si la mano terminara ahora (para las decisiones de la IA).
const projected = (w: PlayerSide) => S.score[w] + S.handPts[w];

function play(w: PlayerSide, i: number): void {
  S.cur[w] = (S.hand[w].splice(i, 1)[0] as Card) || null;
  if (S.cur[other(w)] === null) {
    S.turn = other(w);
    return;
  }
  const win = bazaWinner({ p: S.cur.p!, c: S.cur.c! });
  S.bazas.push({ p: S.cur.p, c: S.cur.c, winner: win });
  const hw = handWinner(S.bazas.map((b) => b.winner), S.mano);
  if (hw) {
    S.cur = { p: null, c: null, leader: null };
    endHand(hw, TRUCO_PTS[S.truco.level], S.truco.level ? TRUCO_CALL[S.truco.level].toLowerCase() : 'mano ganada');
    return;
  }
  const leader = win === 'tie' ? S.cur.leader : win;
  S.cur = { p: null, c: null, leader };
  S.turn = leader;
}

function resolveEnvido(accepted: boolean): void {
  const P = S.pending;
  if (!P || P.kind !== 'envido') return;
  S.pending = null;
  S.env.done = true;
  S.env.accepted = accepted;
  if (accepted) {
    const ep = envidoOf(S.orig.p);
    const ec = envidoOf(S.orig.c || []);
    S.env.winner = ep > ec ? 'p' : ec > ep ? 'c' : S.mano;
    S.env.pts = envPoints(P.chain, true);
    S.env.result = { p: ep, c: ec };
    log(`Envido: {p} ${ep}, {c} ${ec}${ep === ec ? ' (gana el mano)' : ''}`);
    addPts(S.env.winner, S.env.pts, 'envido');
  } else {
    S.env.winner = P.by;
    S.env.pts = envPoints(P.chain, false);
    addPts(P.by, S.env.pts, 'envido no querido');
  }
  if (S.suspended) S.pending = S.suspended;
  S.suspended = null;
}

export function act(w: PlayerSide, a: Action): boolean {
  if (!legal(w, a)) return false;
  const P = S.pending;
  switch (a.t) {
    case 'play':
      play(w, a.i);
      break;
    case 'truco':
      S.pending = { kind: 'truco', level: S.truco.level + 1, by: w };
      say(w, '¡' + TRUCO_CALL[S.pending.level] + '!');
      break;
    case 'raise':
      if (P && P.kind === 'truco') {
        S.truco.level = P.level;
        S.pending = { kind: 'truco', level: P.level + 1, by: w };
        say(w, '¡Quiero ' + TRUCO_CALL[P.level + 1].toLowerCase() + '!');
      }
      break;
    case 'env':
      if (P && P.kind === 'envido') {
        P.chain.push(a.v);
        P.by = w;
      } else {
        if (P) S.suspended = P;
        S.pending = { kind: 'envido', chain: [a.v], by: w };
      }
      say(w, (P && P.kind === 'truco' ? 'El envido está primero. ' : '') + '¡' + ENV_NAME[a.v] + '!');
      break;
    case 'quiero':
      say(w, '¡Quiero!', 'yes');
      if (P && P.kind === 'truco') {
        S.truco.level = P.level;
        S.truco.owner = w;
        S.pending = null;
      } else {
        resolveEnvido(true);
      }
      break;
    case 'noquiero':
      say(w, 'No quiero.', 'no');
      if (P && P.kind === 'truco') endHand(P.by, TRUCO_PTS[P.level - 1], 'truco no querido');
      else resolveEnvido(false);
      break;
    case 'mazo': {
      say(w, 'Me voy al mazo.');
      const pts = TRUCO_PTS[S.truco.level] + (S.bazas.length === 0 && !S.env.done ? 1 : 0);
      endHand(other(w), pts, 'se fue al mazo');
      break;
    }
  }
  return true;
}

// ---------- CPU ----------

// Política simple de juego de cartas, usada por la CPU y por las simulaciones.
function chooseIdx(hand: Card[], opp: Card | null, bazaIdx: number, wonFirst: boolean): number {
  const idx = hand.map((_, i) => i).sort((a, b) => rank(hand[a]) - rank(hand[b]));
  if (opp) {
    const r = rank(opp);
    const beat = idx.find((i) => rank(hand[i]) > r);
    if (beat !== undefined) return beat;
    if (wonFirst) {
      const tie = idx.find((i) => rank(hand[i]) === r);
      if (tie !== undefined) return tie;
    }
    return idx[0];
  }
  if (bazaIdx === 0 && idx.length === 3) return idx[1];
  return idx[idx.length - 1];
}

function simulate(me: PlayerSide, oppHand: Card[]): PlayerSide {
  const opp = other(me);
  const hands: Record<PlayerSide, Card[]> = {
    p: me === 'p' ? (S.hand.p.filter(Boolean) as Card[]).slice() : oppHand.slice(),
    c: me === 'c' ? (S.hand.c.filter(Boolean) as Card[]).slice() : oppHand.slice(),
  };
  const res: BazaWinner[] = S.bazas.map((b) => b.winner);
  let cur = { p: S.cur.p, c: S.cur.c, leader: S.cur.leader };
  for (;;) {
    const order: PlayerSide[] = cur.leader ? [cur.leader, other(cur.leader)] : ['p', 'c'];
    for (const w of order) {
      if (cur[w] === null) {
        if (!hands[w].length) return S.mano;
        const i = chooseIdx(hands[w], cur[other(w)], res.length, res[0] === w);
        cur[w] = hands[w].splice(i, 1)[0];
      }
    }
    const win = bazaWinner({ p: cur.p!, c: cur.c! });
    res.push(win);
    const hw = handWinner(res, S.mano);
    if (hw) return hw;
    cur = { p: null, c: null, leader: win === 'tie' ? cur.leader : win };
  }
}

// Probabilidad estimada de ganar la mano (Monte Carlo sobre las cartas que no se ven).
function winEstimate(me: PlayerSide, n?: number): number {
  n = n || 160;
  const opp = other(me);
  const oppPlayed = S.bazas.map((b) => b[opp]).concat(S.cur[opp] ? [S.cur[opp]] : []).filter(Boolean) as Card[];
  const myCards = (S.orig[me] || []).concat(oppPlayed);
  const known = new Set(myCards.map(key));
  const unknown = deck().filter((c) => !known.has(key(c)));
  const need = S.hand[opp].length;
  const envTarget = S.env.result ? S.env.result[opp] : null;
  let wins = 0;
  for (let k = 0; k < n; k++) {
    let oh: Card[] = [];
    for (let t = 0; t < 30; t++) {
      shuffle(unknown);
      oh = unknown.slice(0, need);
      if (envTarget === null || envidoOf(oppPlayed.concat(oh)) === envTarget) break;
    }
    if (simulate(me, oh) === me) wins++;
  }
  return wins / n;
}

function aiEnvido(me: PlayerSide, P: { kind: 'envido'; chain: EnvidoValue[]; by: PlayerSide }): Action {
  const e = envidoOf(S.orig[me] || []) + (S.mano === me ? 0.5 : 0);
  const raises = envRaises(P.chain);
  if (raises.includes('falta') && e >= 32.5 && Math.random() < 0.5) return { t: 'env', v: 'falta' };
  if (raises.includes('real') && e >= 30.5 && Math.random() < 0.6) return { t: 'env', v: 'real' };
  if (raises.includes('envido') && e >= 29 && Math.random() < 0.4) return { t: 'env', v: 'envido' };
  if (projected(other(me)) + envPoints(P.chain, false) >= S.target) return { t: 'quiero' };
  const need = P.chain.includes('falta') ? 30 : P.chain.length > 1 ? 28 : 26;
  return e >= need || Math.random() < 0.04 ? { t: 'quiero' } : { t: 'noquiero' };
}

function aiTruco(me: PlayerSide, P: { kind: 'truco'; level: number; by: PlayerSide }): Action {
  if (P.level === 1 && canEnvido(me)) {
    const e = envidoOf(S.orig[me] || []);
    if (e >= 27) return { t: 'env', v: e >= 31 ? 'real' : 'envido' };
  }
  const est = winEstimate(me);
  if (projected(other(me)) + TRUCO_PTS[P.level - 1] >= S.target) {
    return P.level < 3 && est > 0.7 ? { t: 'raise' } : { t: 'quiero' };
  }
  if (P.level < 3 && est > 0.8) return { t: 'raise' };
  return est > 0.36 + 0.06 * P.level || Math.random() < 0.05 ? { t: 'quiero' } : { t: 'noquiero' };
}

function aiTurn(me: PlayerSide): Action {
  if (canEnvido(me) && !S.aiEnvChecked[me]) {
    S.aiEnvChecked[me] = true;
    const e = envidoOf(S.orig[me] || []);
    if (e >= 31) return { t: 'env', v: Math.random() < 0.5 ? 'real' : 'envido' };
    if (e >= 26 && Math.random() < 0.85) return { t: 'env', v: 'envido' };
    if (e <= 21 && Math.random() < 0.07) return { t: 'env', v: 'envido' };
  }
  if (canTruco(me)) {
    const est = winEstimate(me);
    const th = [0, 0.62, 0.74, 0.84][S.truco.level + 1];
    if (est > th || (est > 0.3 && Math.random() < 0.05)) return { t: 'truco' };
  }
  const opp = other(me);
  const first = S.bazas[0] && S.bazas[0].winner === me;
  return { t: 'play', i: chooseIdx(S.hand[me] as Card[], S.cur[opp], S.bazas.length, !!first) };
}

export function aiAct(me: PlayerSide): boolean {
  if (actor() !== me) return false;
  const P = S.pending;
  const a = P ? (P.kind === 'truco' ? aiTruco(me, P) : aiEnvido(me, P)) : aiTurn(me);
  return act(me, a) || act(me, options(me)[0]);
}

// Copia del estado vista desde 'c' (el rival online): se intercambian los lados
// para que su interfaz lo muestre como 'p', y se ocultan las cartas que no debe ver.
export function rivalView(): GameState {
  const v: GameState = JSON.parse(JSON.stringify(S));
  const sw = (x: any) => (x === 'p' ? 'c' : x === 'c' ? 'p' : x);
  const swap = (o: any) => {
    if (o) [o.p, o.c] = [o.c, o.p];
  };
  [v.score, v.orig, v.hand, v.env.result, v.aiEnvChecked, v.cur].forEach(swap);
  v.cur.leader = sw(v.cur.leader);
  v.bazas.forEach((b) => {
    swap(b);
    b.winner = sw(b.winner);
  });
  (['mano', 'nextMano', 'turn', 'over'] as const).forEach((k) => {
    (v as any)[k] = sw((v as any)[k]);
  });
  v.truco.owner = sw(v.truco.owner);
  if (v.pending) v.pending.by = sw(v.pending.by);
  if (v.suspended) v.suspended.by = sw(v.suspended.by);
  if (v.say) v.say.w = sw(v.say.w);
  swap(v.handPts);
  v.handItems.forEach((it) => {
    it.w = sw(it.w);
  });
  if (v.env.winner) v.env.winner = sw(v.env.winner);
  v.log = v.log.map((l) => l.replace(/\{(p|c)\}/g, (_, x) => `{${sw(x)}}`));
  v.orig.c = null;
  if (!v.handOver) v.hand.c = v.hand.c.map(() => null);
  return v;
}

export const state = (): GameState => S;

export function isValidGameState(s: unknown): s is GameState {
  if (!s || typeof s !== 'object') return false;
  const o = s as any;
  if (typeof o.target !== 'number' || (o.target !== 15 && o.target !== 30)) return false;
  if (!o.score || typeof o.score.p !== 'number' || typeof o.score.c !== 'number') return false;
  if (o.mano !== 'p' && o.mano !== 'c') return false;
  if (o.nextMano !== 'p' && o.nextMano !== 'c') return false;
  if (!o.orig || !Array.isArray(o.orig.p)) return false;
  if (!o.hand || !Array.isArray(o.hand.p) || !Array.isArray(o.hand.c)) return false;
  if (!Array.isArray(o.bazas)) return false;
  if (!o.cur || typeof o.cur !== 'object') return false;
  if (!o.truco || typeof o.truco.level !== 'number') return false;
  if (!o.env || typeof o.env.done !== 'boolean') return false;
  if (typeof o.handOver !== 'boolean') return false;
  if (typeof o.handNo !== 'number') return false;
  if (!Array.isArray(o.log)) return false;
  return true;
}

export function load(s: unknown): boolean {
  if (!isValidGameState(s)) return false;
  S = s;
  // Partidas guardadas por versiones anteriores (sumaban los puntos al momento).
  if (!S.handItems) {
    S.handItems = [];
    S.handPts = { p: 0, c: 0 };
  }
  return true;
}

export const TrucoEngine = {
  newGame,
  newHand,
  actor,
  options,
  act,
  aiAct,
  envidoOf,
  handWinner,
  rank,
  rivalView,
  state,
  load,
  isValidGameState,
  TRUCO_CALL,
  TRUCO_PTS,
  ENV_NAME,
  envPoints,
};
