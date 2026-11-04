// Partidos en equipo (4 y 6 jugadores) con jugadas al azar: node test/team.test.js
const assert = require('assert');
const T = require('../media/engine-team.js');

assert.strictEqual(T.handWinner([0, 'tie'], 1), 0);
assert.strictEqual(T.handWinner(['tie', 'tie', 'tie'], 1), 1);
assert.strictEqual(T.handWinner([0, 1], 0), null);

// Elige una jugada legal al azar, casi siempre tirar una carta para que el partido avance.
function randomMove(seat) {
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

      // Cada jugador ve solo sus cartas mientras dura la mano.
      if (!S.handOver && steps % 7 === 0) {
        const v = T.viewFor(1);
        assert.deepStrictEqual(v.hands[1], S.hands[1]);
        assert(v.hands[0].every((c) => c === null) && v.orig[0] === null);
      }
    }
    const S = T.state();
    assert.strictEqual(S.score[S.over], S.target);
    wins[S.over]++;
  }
  console.log(`OK ${n} jugadores`, { wins, hands });
}
