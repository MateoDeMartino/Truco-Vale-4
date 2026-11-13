// Qué sonido corresponde entre dos momentos de la partida.
//
// En vez de disparar un sonido por cada acción (que en online suena dos veces: al hacer click y
// cuando vuelve el estado), se compara una foto del estado que se está mostrando con la anterior.
// Así suena igual contra la CPU, como anfitrión o como invitado, y una jugada rechazada no suena.
import { GameState } from '../types/truco';
import { TeamGameState } from '../types/team';

export type SoundEvent = 'card' | 'truco' | 'envido' | 'quiero' | 'noquiero' | 'winHand' | 'winMatch' | 'loseMatch';

// Foto con valores simples: copiarlos evita el problema de comparar un objeto consigo mismo
// (el motor modifica su estado en el lugar).
export interface SoundSnap {
  handNo: number;
  plays: number; // cartas jugadas en la mano
  pending: string | null; // canto pendiente, p. ej. 'truco:2' o 'envido:envido,real'
  pendingKind: 'truco' | 'envido' | null;
  trucoLevel: number;
  envAccepted: boolean | null;
  handOver: boolean;
  wonHand: boolean;
  over: boolean;
  wonMatch: boolean;
}

type Pending = { kind: 'truco' | 'envido'; level?: number; chain?: string[] } | null | undefined;
const pendingKey = (P: Pending) => (P ? (P.kind === 'truco' ? `truco:${P.level}` : `envido:${(P.chain || []).join(',')}`) : null);

// Partida 1 contra 1, vista desde 'p' (el invitado recibe la vista ya dada vuelta).
export function snapGame(S: GameState): SoundSnap {
  return {
    handNo: S.handNo,
    plays: S.bazas.length * 2 + (S.cur.p ? 1 : 0) + (S.cur.c ? 1 : 0),
    pending: pendingKey(S.pending),
    pendingKind: S.pending ? S.pending.kind : null,
    trucoLevel: S.truco.level,
    envAccepted: S.env.accepted ?? null,
    handOver: S.handOver,
    wonHand: !!S.handPts && S.handPts.p > S.handPts.c,
    over: !!S.over,
    wonMatch: S.over === 'p',
  };
}

// Partida en equipo, vista desde el asiento `me` (mi equipo es me % 2).
export function snapTeam(V: TeamGameState, me: number): SoundSnap {
  const mine = me % 2;
  return {
    handNo: V.handNo,
    plays: V.bazas.length * V.n + V.cur.cards.filter((c) => c !== null).length,
    pending: pendingKey(V.pending),
    pendingKind: V.pending ? V.pending.kind : null,
    trucoLevel: V.truco.level,
    envAccepted: V.env.accepted ?? null,
    handOver: V.handOver,
    wonHand: V.handPts[mine] > V.handPts[1 - mine],
    over: V.over !== null && V.over !== undefined,
    wonMatch: V.over === mine,
  };
}

// Sonidos a tocar al pasar de `prev` a `next`. Sin foto anterior o en otra mano, no suena nada.
export function soundsBetween(prev: SoundSnap | null, next: SoundSnap): SoundEvent[] {
  if (!prev || prev.handNo !== next.handNo) return [];
  const out: SoundEvent[] = [];

  if (next.plays > prev.plays) out.push('card');

  // Respuesta a un canto. Subir la apuesta (retruco, real envido) no cuenta: suena el canto nuevo.
  const envidoAnswered = prev.pendingKind === 'envido' && next.pendingKind !== 'envido';
  const trucoAnswered = prev.pendingKind === 'truco' && !next.pending;
  if (envidoAnswered) out.push(next.envAccepted ? 'quiero' : 'noquiero');
  else if (trucoAnswered) out.push(next.trucoLevel > prev.trucoLevel ? 'quiero' : 'noquiero');

  // Canto nuevo. Si se vuelve al truco que esperaba por el envido, no se canta de nuevo.
  const resumed = envidoAnswered && next.pendingKind === 'truco';
  if (next.pending && next.pending !== prev.pending && !resumed) out.push(next.pendingKind === 'truco' ? 'truco' : 'envido');

  if (next.over && !prev.over) out.push(next.wonMatch ? 'winMatch' : 'loseMatch');
  else if (next.handOver && !prev.handOver) {
    if (next.wonHand) out.push('winHand');
    else if (!out.length) out.push('noquiero'); // perdida sin carta ni respuesta: se fueron al mazo
  }
  return out;
}
