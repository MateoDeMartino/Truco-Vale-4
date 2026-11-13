// Partidos en equipo (4 y 6 jugadores) con jugadas al azar: node dist/test/team.test.js
import assert from 'assert';
import { TrucoTeam as T } from '../src/engine/engine-team';
import { isTeamView } from '../src/engine/validate';
import { TeamAction } from '../src/types/team';

assert.strictEqual(T.handWinner([0, 'tie'], 1), 0);
assert.strictEqual(T.handWinner(['tie', 'tie', 'tie'], 1), 1);
assert.strictEqual(T.handWinner([0, 1], 0), null);

// Elige una jugada legal al azar, casi siempre tirar una carta para que el partido avance.
function randomMove(seat: number): TeamAction {
  const opts = T.options(seat);
  const plays = opts.filter((o) => o.t === 'play');
  if (plays.length && Math.random() < 0.8) return plays[Math.floor(Math.random() * plays.length)];
  const rest = opts.filter((o) => o.t !== 'mazo' || Math.random() < 0.05);
  return rest[Math.floor(Math.random() * rest.length)] || opts[0];
}

for (const n of [4, 6]) {
  const wins = [0, 0];
  let hands = 0;
  for (let g = 0; g < 200; g++) {
    T.newGame(n, Array.from({ length: n }, (_, i) => 'J' + i), g % 2 ? 30 : 15);
    let steps = 0;
    let start = T.state().score.slice();
    while (T.state().over === null) {
      const seats = T.actorSeats();
      if (!seats.length) {
        T.newHand();
        hands++;
        start = T.state().score.slice();
        continue;
      }
      const seat = seats[Math.floor(Math.random() * seats.length)];
      assert(T.act(seat, randomMove(seat)), 'jugada ilegal');
      assert(++steps < 20000, 'partido trabado');
      const S = T.state();
      if (!S.handOver) assert.deepStrictEqual(S.score, start, 'el marcador cambió en medio de la mano');
      // El validador de estados remotos tiene que aceptar todas las vistas que arma el motor.
      assert(isTeamView(T.viewFor(steps % n)), 'el validador rechazó una vista real');

      // Cada jugador ve solo sus cartas mientras dura la mano.
      if (!S.handOver && steps % 7 === 0) {
        const v = T.viewFor(1);
        assert.deepStrictEqual(v.hands[1], S.hands[1]);
        assert(v.hands[0].every((c) => c === null) && v.orig[0].length === 0);
      }
    }
    const S = T.state();
    assert.strictEqual(S.score[S.over!], S.target);
    wins[S.over!]++;
  }
  console.log(`OK ${n} jugadores`, { wins, hands });
}

// Vistas rotas (como las que podría mandar un anfitrión malicioso) se rechazan.
T.newGame(4, ['A', 'B', 'C', 'D'], 15);
const good = T.viewFor(2);
const bad = (f: (v: any) => void) => {
  const v = JSON.parse(JSON.stringify(good));
  f(v);
  return v;
};
assert(isTeamView(good));
assert(!isTeamView(null) && !isTeamView({}) && !isTeamView(T.state()), 'sin `me` no es una vista');
assert(!isTeamView(bad((v) => (v.n = 5))));
assert(!isTeamView(bad((v) => (v.me = 7))));
assert(!isTeamView(bad((v) => v.names.pop())));
assert(!isTeamView(bad((v) => (v.hands = undefined))));
assert(!isTeamView(bad((v) => (v.score = [1]))));
assert(!isTeamView(bad((v) => (v.say = { seat: 0, msg: 5, tone: null }))));
console.log('OK validación de vistas');
