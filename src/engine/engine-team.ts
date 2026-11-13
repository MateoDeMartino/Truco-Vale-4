// Motor del truco en equipos: 4 o 6 jugadores, dos equipos intercalados (sin flor).
// Los asientos van de 0 a n-1 en orden de juego; el equipo de un asiento es asiento % 2.
import {
  Card,
  CardNumber,
  EnvidoValue,
  Suit,
} from '../types/truco';
import {
  TeamAction,
  TeamBaza,
  TeamBazaWinner,
  TeamGameState,
  TeamHandWinner,
  TeamId,
} from '../types/team';
import {
  deck,
  ENV_NAME,
  envidoOf,
  rank,
  shuffle,
  TRUCO_CALL,
  TRUCO_PTS,
} from './engine';

const ENV_PTS: Record<'envido' | 'real', number> = { envido: 2, real: 3 };

export const teamOf = (seat: number): TeamId => (seat % 2 as TeamId);
export const otherTeam = (t: TeamId): TeamId => ((1 - t) as TeamId);

// Igual que en 1 vs 1, pero con equipos 0 / 1 en vez de 'p' / 'c'.
export function handWinner(res: TeamBazaWinner[], manoTeam: TeamId): TeamHandWinner {
  const wins: [number, number] = [0, 0];
  res.forEach((r) => {
    if (r !== 'tie') wins[r]++;
  });
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

let S: TeamGameState;

const next = (seat: number) => (seat + 1) % S.n;
const seatsOf = (t: TeamId) => [...Array(S.n).keys()].filter((s) => teamOf(s) === t);

// En el historial: {sN} = jugador del asiento N, {tN} = equipo N. La interfaz pone los nombres.
function log(msg: string): void {
  S.log.unshift(msg);
  if (S.log.length > 50) S.log.length = 50;
}

function say(seat: number, msg: string, tone?: string | null): void {
  S.say = { seat, msg, tone: tone || null };
  log(`{s${seat}}: ${msg}`);
}

export function newGame(n: number, names: string[], target?: number): TeamGameState {
  S = {
    n,
    names: names.slice(),
    target: target || 15,
    score: [0, 0],
    nextMano: 0,
    mano: 0,
    orig: [],
    hands: [],
    bazas: [],
    cur: { cards: Array(n).fill(null), leader: 0 },
    last: null,
    turn: 0,
    truco: { level: 0, owner: null },
    env: { done: false },
    pending: null,
    suspended: null,
    handOver: false,
    say: null,
    handPts: [0, 0],
    handItems: [],
    handNo: 0,
    over: null,
    log: [],
  };
  newHand();
  return S;
}

export function newHand(): void {
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
export function actorSeats(): number[] {
  if (!S || S.over !== null || S.handOver) return [];
  if (S.pending) return seatsOf(otherTeam(S.pending.by));
  return [S.turn];
}

export function canEnvido(seat: number): boolean {
  return !S.handOver && !S.env.done && S.bazas.length === 0 && S.cur.cards[seat] === null && S.truco.level === 0;
}

export function canTruco(seat: number): boolean {
  return S.truco.level < 3 && (S.truco.owner === null || S.truco.owner === teamOf(seat));
}

export function envRaises(chain: EnvidoValue[]): EnvidoValue[] {
  if (chain.includes('falta')) return [];
  const r: EnvidoValue[] = [];
  if (!chain.includes('real') && chain.filter((x) => x === 'envido').length < 2) r.push('envido');
  if (!chain.includes('real')) r.push('real');
  r.push('falta');
  return r;
}

export function envPoints(chain: EnvidoValue[], accepted: boolean): number {
  if (!accepted) {
    if (chain.length === 1) return 1;
    return chain.slice(0, -1).reduce((s, v) => s + (v === 'falta' ? 0 : ENV_PTS[v]), 0);
  }
  if (chain.includes('falta')) return S.target - Math.max(...S.score);
  return chain.reduce((s, v) => s + (v === 'falta' ? 0 : ENV_PTS[v]), 0);
}

export function options(seat: number): TeamAction[] {
  const o: TeamAction[] = [];
  if (!actorSeats().includes(seat)) return o;
  const P = S.pending;
  if (P) {
    o.push({ t: 'quiero' }, { t: 'noquiero' });
    if (P.kind === 'truco') {
      if (P.level < 3) o.push({ t: 'raise' });
      if (P.level === 1 && canEnvido(seat)) (['envido', 'real', 'falta'] as EnvidoValue[]).forEach((v) => o.push({ t: 'env', v }));
    } else {
      envRaises(P.chain).forEach((v) => o.push({ t: 'env', v }));
    }
    return o;
  }
  (S.hands[seat] || []).forEach((_, i) => o.push({ t: 'play', i }));
  if (canEnvido(seat)) (['envido', 'real', 'falta'] as EnvidoValue[]).forEach((v) => o.push({ t: 'env', v }));
  if (canTruco(seat)) o.push({ t: 'truco' });
  o.push({ t: 'mazo' });
  return o;
}

export function legal(seat: number, a: TeamAction): boolean {
  return options(seat).some((o) => o.t === a.t && (o as any).i === (a as any).i && (o as any).v === (a as any).v);
}

// Los puntos se anotan durante la mano y pasan al marcador recién cuando termina.
function addPts(t: TeamId, pts: number, reason: string): void {
  S.handItems.push({ t, pts, reason });
  S.handPts[t] += pts;
}

function endHand(t: TeamId, pts: number, reason: string): void {
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

function play(seat: number, i: number): void {
  S.cur.cards[seat] = S.hands[seat].splice(i, 1)[0];
  if (S.cur.cards.some((c) => c === null)) {
    S.turn = next(seat);
    return;
  }
  // Gana la carta más alta; si empatan cartas de los dos equipos, es parda.
  let best = -1;
  let winners: number[] = [];
  for (let k = 0; k < S.n; k++) {
    const s = (S.cur.leader! + k) % S.n;
    const r = rank(S.cur.cards[s]!);
    if (r > best) {
      best = r;
      winners = [s];
    } else if (r === best) {
      winners.push(s);
    }
  }
  const teams = new Set(winners.map(teamOf));
  const win: TeamBazaWinner = teams.size === 1 ? teamOf(winners[0]) : 'tie';
  const baza: TeamBaza = {
    cards: S.cur.cards.slice(),
    winner: win,
    winSeat: win === 'tie' ? null : winners[0],
    leader: S.cur.leader!,
  };
  S.bazas.push(baza);
  S.last = baza;
  const hw = handWinner(S.bazas.map((b) => b.winner), teamOf(S.mano));
  if (hw !== null) {
    S.cur = { cards: Array(S.n).fill(null), leader: null };
    endHand(hw, TRUCO_PTS[S.truco.level], S.truco.level ? TRUCO_CALL[S.truco.level].toLowerCase() : 'mano ganada');
    return;
  }
  const leader = win === 'tie' ? S.cur.leader! : baza.winSeat!;
  S.cur = { cards: Array(S.n).fill(null), leader };
  S.turn = leader;
}

// Cuenta el mejor envido de cada equipo; si empatan, gana el que está más cerca del mano.
function resolveEnvido(accepted: boolean): void {
  const P = S.pending;
  if (!P || P.kind !== 'envido') return;
  S.pending = null;
  S.env.done = true;
  S.env.accepted = accepted;
  if (accepted) {
    const scores = S.orig.map(envidoOf);
    const bestOf = (t: TeamId) => {
      let b = -1,
        seat = -1;
      for (const s of seatsOf(t)) {
        if (scores[s] > b) {
          b = scores[s];
          seat = s;
        }
      }
      return { seat, v: b };
    };
    const b0 = bestOf(0),
      b1 = bestOf(1);
    const manoTeam = teamOf(S.mano);
    const win: TeamId = b0.v > b1.v ? 0 : b1.v > b0.v ? 1 : manoTeam;
    S.env.winner = win;
    S.env.pts = envPoints(P.chain, true);
    S.env.best = [b0, b1];
    log(`Envido: {s${b0.seat}} ${b0.v}, {s${b1.seat}} ${b1.v}${b0.v === b1.v ? ' (gana el mano)' : ''}`);
    addPts(win, S.env.pts, 'envido');
  } else {
    S.env.winner = P.by;
    S.env.pts = envPoints(P.chain, false);
    addPts(P.by, S.env.pts, 'envido no querido');
  }
  if (S.suspended) S.pending = S.suspended;
  S.suspended = null;
}

export function act(seat: number, a: TeamAction): boolean {
  if (!legal(seat, a)) return false;
  const P = S.pending;
  const t = teamOf(seat);
  switch (a.t) {
    case 'play':
      play(seat, a.i);
      break;
    case 'truco':
      S.pending = { kind: 'truco', level: S.truco.level + 1, by: t, bySeat: seat };
      say(seat, '¡' + TRUCO_CALL[S.pending.level] + '!');
      break;
    case 'raise':
      if (P && P.kind === 'truco') {
        S.truco.level = P.level;
        S.pending = { kind: 'truco', level: P.level + 1, by: t, bySeat: seat };
        say(seat, '¡Quiero ' + TRUCO_CALL[P.level + 1].toLowerCase() + '!');
      }
      break;
    case 'env':
      if (P && P.kind === 'envido') {
        P.chain.push(a.v);
        P.by = t;
        P.bySeat = seat;
      } else {
        if (P) S.suspended = P;
        S.pending = { kind: 'envido', chain: [a.v], by: t, bySeat: seat };
      }
      say(seat, (P && P.kind === 'truco' ? 'El envido está primero. ' : '') + '¡' + ENV_NAME[a.v] + '!');
      break;
    case 'quiero':
      say(seat, '¡Quiero!', 'yes');
      if (P && P.kind === 'truco') {
        S.truco.level = P.level;
        S.truco.owner = t;
        S.pending = null;
      } else {
        resolveEnvido(true);
      }
      break;
    case 'noquiero':
      say(seat, 'No quiero.', 'no');
      if (P && P.kind === 'truco') endHand(P.by, TRUCO_PTS[P.level - 1], 'truco no querido');
      else resolveEnvido(false);
      break;
    case 'mazo': {
      say(seat, 'Me voy al mazo.');
      const pts = TRUCO_PTS[S.truco.level] + (S.bazas.length === 0 && !S.env.done ? 1 : 0);
      endHand(otherTeam(t), pts, 'se fue al mazo');
      break;
    }
  }
  return true;
}

// Vista para el jugador del asiento `seat`: oculta las cartas de los demás mientras dura la mano.
// Copia del estado para el jugador de `seat`: solo ve sus propias cartas (y las de todos al terminar la mano).
export function viewFor(seat: number): TeamGameState {
  const v: TeamGameState = JSON.parse(JSON.stringify(S));
  v.me = seat;
  if (!v.handOver) {
    v.orig = v.orig.map((h, s) => (s === seat ? h : []));
    v.hands = v.hands.map((h, s) => (s === seat ? h : h.map(() => null)));
  }
  return v;
}

export const state = (): TeamGameState => S;

export function isValidTeamGameState(s: unknown): s is TeamGameState {
  if (!s || typeof s !== 'object') return false;
  const o = s as any;
  if (o.n !== 4 && o.n !== 6) return false;
  if (!Array.isArray(o.names) || o.names.length !== o.n) return false;
  if (typeof o.target !== 'number' || (o.target !== 15 && o.target !== 30)) return false;
  if (!Array.isArray(o.score) || o.score.length !== 2 || typeof o.score[0] !== 'number' || typeof o.score[1] !== 'number') return false;
  if (typeof o.mano !== 'number' || typeof o.nextMano !== 'number') return false;
  if (!Array.isArray(o.orig) || !Array.isArray(o.hands)) return false;
  if (!Array.isArray(o.bazas)) return false;
  if (!o.cur || !Array.isArray(o.cur.cards)) return false;
  if (!o.truco || typeof o.truco.level !== 'number') return false;
  if (!o.env || typeof o.env.done !== 'boolean') return false;
  if (typeof o.handOver !== 'boolean') return false;
  if (!Array.isArray(o.handPts) || o.handPts.length !== 2) return false;
  if (!Array.isArray(o.handItems)) return false;
  if (typeof o.handNo !== 'number') return false;
  if (!Array.isArray(o.log)) return false;
  return true;
}

export function load(s: unknown): boolean {
  if (!isValidTeamGameState(s)) return false;
  S = s;
  return true;
}

export const TrucoTeam = {
  newGame,
  newHand,
  actorSeats,
  options,
  act,
  viewFor,
  state,
  load,
  isValidTeamGameState,
  handWinner,
  rank,
  envidoOf,
  TRUCO_CALL,
  TRUCO_PTS,
  ENV_NAME,
};
