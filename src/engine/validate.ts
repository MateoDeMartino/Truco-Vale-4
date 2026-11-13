// Validación de lo que llega por la red en una partida online. El otro jugador puede mandar
// cualquier cosa: antes de cargar un estado se revisa que tenga la forma que la interfaz espera,
// para que un estado roto corte la partida con un mensaje en vez de colgar el webview.
import { GameState } from '../types/truco';
import { LobbyState, TeamGameState } from '../types/team';

const MAX_LOG = 2000;
const MAX_TEXT = 300;

const SUITS = ['espada', 'basto', 'oro', 'copa'];
const NUMS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
const ENVIDOS = ['envido', 'real', 'falta'];

type Check = (x: any) => boolean;

const isObj: Check = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum: Check = (x) => typeof x === 'number' && Number.isFinite(x);
const isInt = (x: any, min: number, max: number) => Number.isInteger(x) && x >= min && x <= max;
const isBool: Check = (x) => typeof x === 'boolean';
const isText: Check = (x) => typeof x === 'string' && x.length <= MAX_TEXT;
const none: Check = (x) => x === null || x === undefined;
const opt = (f: Check): Check => (x) => none(x) || f(x);
const arr = (x: any, f: Check, max: number, min = 0) => Array.isArray(x) && x.length >= min && x.length <= max && x.every(f);

const isCard: Check = (c) => isObj(c) && NUMS.includes(c.n) && SUITS.includes(c.s);
const isCards = (x: any, max = 3) => arr(x, isCard, max);
const isSlots = (x: any, max = 3, min = 0) => arr(x, opt(isCard), max, min);
const isLog: Check = (x) => arr(x, isText, MAX_LOG);
const isTarget: Check = (x) => x === 15 || x === 30;
const isLevel: Check = (x) => isInt(x, 0, 3);

const isSide: Check = (x) => x === 'p' || x === 'c';
const isTeam: Check = (x) => x === 0 || x === 1;

// Un canto pendiente (truco o envido); `by` es un lado en 1v1 y un equipo en partidas en equipo.
const isPending = (x: any, isBy: Check) =>
  isObj(x) && isBy(x.by) && (x.kind === 'truco' ? isLevel(x.level) : x.kind === 'envido' && arr(x.chain, (v) => ENVIDOS.includes(v), 8, 1));

const isSay = (x: any, who: Check) => isObj(x) && who(x) && isText(x.msg) && opt(isText)(x.tone);

const isItems = (x: any, who: Check) => arr(x, (it) => isObj(it) && who(it) && isNum(it.pts) && isText(it.reason), 50);

// Estado de una partida 1v1 (el que arma rivalView y el que se guarda entre sesiones).
export function isGameState(S: any): S is GameState {
  const pair = (x: any, f: Check) => isObj(x) && f(x.p) && f(x.c);
  return (
    isObj(S) &&
    isTarget(S.target) &&
    pair(S.score, isNum) &&
    isSide(S.mano) &&
    isSide(S.nextMano) &&
    opt(isSide)(S.turn) &&
    opt(isSide)(S.over) &&
    isObj(S.orig) &&
    isCards(S.orig.p) &&
    opt((x) => isCards(x))(S.orig.c) &&
    isObj(S.hand) &&
    isCards(S.hand.p) &&
    isSlots(S.hand.c) &&
    arr(S.bazas, (b) => pair(b, opt(isCard)) && (isSide(b.winner) || b.winner === 'tie'), 3) &&
    pair(S.cur, opt(isCard)) &&
    opt(isSide)(S.cur.leader) &&
    isObj(S.truco) &&
    isLevel(S.truco.level) &&
    opt(isSide)(S.truco.owner) &&
    isObj(S.env) &&
    isBool(S.env.done) &&
    opt(isBool)(S.env.accepted) &&
    opt(isSide)(S.env.winner) &&
    opt(isNum)(S.env.pts) &&
    opt((r) => pair(r, isNum))(S.env.result) &&
    opt((x) => isPending(x, isSide))(S.pending) &&
    opt((x) => isPending(x, isSide))(S.suspended) &&
    isBool(S.handOver) &&
    opt((x) => isSay(x, (s) => isSide(s.w)))(S.say) &&
    // Las partidas guardadas por versiones viejas no traen handPts ni handItems: load() los completa.
    opt((x) => pair(x, isNum))(S.handPts) &&
    opt((x) => isItems(x, (it) => isSide(it.w)))(S.handItems) &&
    opt(isNum)(S.handNo) &&
    isLog(S.log)
  );
}

// Vista de una partida en equipo tal como la manda el anfitrión a cada invitado (viewFor).
export function isTeamView(V: any): V is TeamGameState {
  if (!isObj(V) || (V.n !== 4 && V.n !== 6)) return false;
  const n: number = V.n;
  const isSeat: Check = (x) => isInt(x, 0, n - 1);
  const pairOf = (x: any, f: Check) => arr(x, f, 2, 2);
  const isBaza: Check = (b) =>
    isObj(b) && isSlots(b.cards, n) && (isTeam(b.winner) || b.winner === 'tie') && opt(isSeat)(b.winSeat) && isSeat(b.leader);
  return (
    isSeat(V.me) &&
    arr(V.names, isText, n, n) &&
    isTarget(V.target) &&
    pairOf(V.score, isNum) &&
    isSeat(V.mano) &&
    isSeat(V.nextMano) &&
    opt(isSeat)(V.turn) &&
    opt(isTeam)(V.over) &&
    arr(V.orig, (h) => isCards(h), n, n) &&
    arr(V.hands, (h) => isSlots(h), n, n) &&
    arr(V.bazas, isBaza, 3) &&
    isObj(V.cur) &&
    isSlots(V.cur.cards, n) &&
    opt(isSeat)(V.cur.leader) &&
    opt(isBaza)(V.last) &&
    isObj(V.truco) &&
    isLevel(V.truco.level) &&
    opt(isTeam)(V.truco.owner) &&
    isObj(V.env) &&
    isBool(V.env.done) &&
    opt(isBool)(V.env.accepted) &&
    opt(isTeam)(V.env.winner) &&
    opt(isNum)(V.env.pts) &&
    opt((b) => pairOf(b, (e) => isObj(e) && isSeat(e.seat) && isNum(e.v)))(V.env.best) &&
    opt((x) => isPending(x, isTeam) && isSeat(x.bySeat))(V.pending) &&
    opt((x) => isPending(x, isTeam) && isSeat(x.bySeat))(V.suspended) &&
    isBool(V.handOver) &&
    opt((x) => isSay(x, (s) => isSeat(s.seat)))(V.say) &&
    pairOf(V.handPts, isNum) &&
    isItems(V.handItems, (it) => isTeam(it.t)) &&
    isNum(V.handNo) &&
    isLog(V.log)
  );
}

// Sala de espera de una partida en equipo.
export function isLobby(L: any): L is LobbyState {
  return (
    isObj(L) &&
    (L.n === 4 || L.n === 6) &&
    isTarget(L.target) &&
    arr(L.players, (p) => isObj(p) && isText(p.id) && isText(p.name) && opt(isTeam)(p.team), 6, 1)
  );
}
