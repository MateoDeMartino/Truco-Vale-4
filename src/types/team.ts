import { Card, EnvidoValue } from './truco';

export type TeamId = 0 | 1;

export type TeamBazaWinner = TeamId | 'tie';

export type TeamHandWinner = TeamId | null;

export type TeamPendingAction =
  | { kind: 'truco'; level: number; by: TeamId; bySeat: number; chain?: never }
  | { kind: 'envido'; chain: EnvidoValue[]; by: TeamId; bySeat: number; level?: never };

export type TeamAction =
  | { t: 'play'; i: number; v?: never }
  | { t: 'truco'; i?: never; v?: never }
  | { t: 'raise'; i?: never; v?: never }
  | { t: 'env'; v: EnvidoValue; i?: never }
  | { t: 'quiero'; i?: never; v?: never }
  | { t: 'noquiero'; i?: never; v?: never }
  | { t: 'mazo'; i?: never; v?: never };

export interface TeamBaza {
  cards: (Card | null)[];
  winner: TeamBazaWinner;
  winSeat: number | null;
  leader: number;
}

export interface TeamHandItem {
  t: TeamId;
  pts: number;
  reason: string;
}

export interface TeamEnvidoBest {
  seat: number;
  v: number;
}

export interface TeamEnvidoState {
  done: boolean;
  accepted?: boolean;
  winner?: TeamId;
  pts?: number;
  best?: [TeamEnvidoBest, TeamEnvidoBest];
}

export interface TeamGameState {
  n: number;
  names: string[];
  target: number;
  score: [number, number];
  nextMano: number;
  mano: number;
  orig: Card[][];
  hands: (Card | null)[][];
  bazas: TeamBaza[];
  cur: { cards: (Card | null)[]; leader: number | null };
  last: TeamBaza | null;
  turn: number;
  truco: { level: number; owner: TeamId | null };
  env: TeamEnvidoState;
  pending: TeamPendingAction | null;
  suspended: TeamPendingAction | null;
  handOver: boolean;
  say: { seat: number; msg: string; tone: string | null } | null;
  handPts: [number, number];
  handItems: TeamHandItem[];
  handNo: number;
  over: TeamId | null;
  log: string[];
  me?: number;
}

export interface LobbyPlayer {
  id: string;
  name: string;
  team: TeamId | null;
}

export interface LobbyState {
  n: number;
  target: number;
  players: LobbyPlayer[];
}
