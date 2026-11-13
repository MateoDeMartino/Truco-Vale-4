// Corre partidos CPU vs CPU y chequea reglas básicas: node dist/test/engine.test.js
import assert from 'assert';
import { TrucoEngine as E } from '../src/engine/engine';
import { Card, CardNumber, Suit } from '../src/types/truco';

const c = (n: CardNumber, s: Suit): Card => ({ n, s });
assert.strictEqual(E.envidoOf([c(7, 'oro'), c(6, 'oro'), c(1, 'espada')]), 33);
assert.strictEqual(E.envidoOf([c(12, 'oro'), c(11, 'oro'), c(1, 'espada')]), 20);
assert.strictEqual(E.envidoOf([c(12, 'oro'), c(5, 'copa'), c(3, 'espada')]), 5);
assert.strictEqual(E.handWinner(['tie', 'p'], 'c'), 'p');
assert.strictEqual(E.handWinner(['c', 'tie'], 'p'), 'c');
assert.strictEqual(E.handWinner(['p', 'c', 'tie'], 'c'), 'p');
assert.strictEqual(E.handWinner(['tie', 'tie', 'tie'], 'c'), 'c');
assert.strictEqual(E.handWinner(['p', 'c'], 'c'), null);
assert.strictEqual(E.envPoints(['envido'], false), 1);
assert.strictEqual(E.envPoints(['envido', 'envido', 'real'], false), 4);
assert.strictEqual(E.envPoints(['envido', 'real'], true), 5);
assert(E.rank(c(1, 'espada')) > E.rank(c(1, 'basto')) && E.rank(c(3, 'copa')) > E.rank(c(1, 'oro')));

// La vista del rival intercambia los lados y oculta las cartas del anfitrión.
E.newGame(15);
const real = E.state();
const rv = E.rivalView();
assert.deepStrictEqual(rv.hand.p, real.hand.c);
assert(rv.hand.c.every((x) => x === null) && rv.orig.c === null);
assert.strictEqual(rv.mano, real.mano === 'p' ? 'c' : 'p');
assert(rv.log[0].includes(`{${rv.mano}}`));
// Validación de esquema (Issue #5)
assert.strictEqual(E.isValidGameState(null), false);
assert.strictEqual(E.isValidGameState({}), false);
assert.strictEqual(E.isValidGameState({ ...real, target: 45 }), false);
assert.strictEqual(E.isValidGameState({ ...real, score: null }), false);
assert.strictEqual(E.isValidGameState({ ...real, bazas: 'invalid' }), false);
assert.strictEqual(E.isValidGameState(real), true);
assert.strictEqual(E.isValidGameState(rv), true);
assert.strictEqual(E.load({ corrupted: true }), false);
assert.strictEqual(E.load(rv), true);
assert.strictEqual(E.actor(), rv.mano);
if (rv.mano === 'p') assert.strictEqual(E.options('p').filter((o) => o.t === 'play').length, 3);

const wins = { p: 0, c: 0 };
let hands = 0;
for (let g = 0; g < 300; g++) {
  E.newGame(g % 2 ? 30 : 15);
  let steps = 0;
  let start = { ...E.state().score };
  while (!E.state().over) {
    const a = E.actor();
    if (a === null) {
      E.newHand();
      hands++;
      start = { ...E.state().score };
      continue;
    }
    assert(E.aiAct(a), 'acción ilegal de la IA');
    const S = E.state();
    if (!S.handOver) assert.deepStrictEqual(S.score, start, 'el marcador cambió en medio de la mano');
    else if (!S.over) {
      const sum = (w: 'p' | 'c') => S.handItems.filter((it) => it.w === w).reduce((t, it) => t + it.pts, 0);
      assert.deepStrictEqual(S.score, { p: start.p + sum('p'), c: start.c + sum('c') });
    }
    assert(++steps < 5000, 'partido trabado');
  }
  const S = E.state();
  assert.strictEqual(S.score[S.over!], S.target);
  wins[S.over!]++;
}
console.log('OK', { wins, hands });
