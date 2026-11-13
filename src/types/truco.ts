export type Suit = 'espada' | 'basto' | 'oro' | 'copa';

export type CardNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 11 | 12;

export interface Card {
  n: CardNumber;
  s: Suit;
}

export type PlayerSide = 'p' | 'c';

export type BazaWinner = 'p' | 'c' | 'tie';

export type HandWinner = 'p' | 'c' | null;

export type EnvidoValue = 'envido' | 'real' | 'falta';

export type Action =
  | { t: 'play'; i: number; v?: never }
  | { t: 'truco'; i?: never; v?: never }
  | { t: 'raise'; i?: never; v?: never }
  | { t: 'env'; v: EnvidoValue; i?: never }
  | { t: 'quiero'; i?: never; v?: never }
  | { t: 'noquiero'; i?: never; v?: never }
  | { t: 'mazo'; i?: never; v?: never };

export type PendingAction =
  | { kind: 'truco'; level: number; by: PlayerSide; chain?: never }
  | { kind: 'envido'; chain: EnvidoValue[]; by: PlayerSide; level?: never };

export interface Baza {
  p: Card | null;
  c: Card | null;
  winner: BazaWinner;
}

export interface HandItem {
  w: PlayerSide;
  pts: number;
  reason: string;
}

export interface SayState {
  w: PlayerSide;
  msg: string;
  tone: string | null;
}

export interface EnvidoState {
  done: boolean;
  accepted?: boolean;
  winner?: PlayerSide;
  pts?: number;
  result?: { p: number; c: number } | null;
}

export interface GameState {
  target: number;
  score: { p: number; c: number };
  nextMano: PlayerSide;
  mano: PlayerSide;
  orig: { p: Card[]; c: Card[] | null };
  hand: { p: Card[]; c: (Card | null)[] };
  bazas: Baza[];
  cur: { p: Card | null; c: Card | null; leader: PlayerSide | null };
  turn: PlayerSide | null;
  truco: { level: number; owner: PlayerSide | null };
  env: EnvidoState;
  pending: PendingAction | null;
  suspended: PendingAction | null;
  handOver: boolean;
  say: SayState | null;
  aiEnvChecked: { p: boolean; c: boolean };
  handPts: { p: number; c: number };
  handItems: HandItem[];
  handNo: number;
  over: PlayerSide | null;
  log: string[];
}
