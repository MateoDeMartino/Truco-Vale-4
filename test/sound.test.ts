// Qué sonidos tocan entre dos estados de la partida: node dist/test/sound.test.js
import assert from 'assert';
import { TrucoEngine as E } from '../src/engine/engine';
import { TrucoTeam as T } from '../src/engine/engine-team';
import { snapGame, snapTeam, soundsBetween, SoundEvent } from '../src/webview/sound-events';
import { Action } from '../src/types/truco';

// Hace una acción y devuelve los sonidos que tocaría (foto antes y después: el motor muta su estado).
function step(who: 'p' | 'c', a: Action): SoundEvent[] {
  const before = snapGame(E.state());
  assert(E.act(who, a), `acción rechazada: ${JSON.stringify(a)}`);
  return soundsBetween(before, snapGame(E.state()));
}

const opt = (who: 'p' | 'c', t: string) => E.options(who).find((o) => o.t === t) as Action | undefined;

// Sin foto anterior no suena nada (primer render, otra partida).
E.newGame(15);
assert.deepStrictEqual(soundsBetween(null, snapGame(E.state())), []);

// Una jugada rechazada no cambia nada y no suena.
{
  const s = snapGame(E.state());
  const notMe = E.actor() === 'p' ? 'c' : 'p';
  E.act(notMe, { t: 'play', i: 0 });
  assert.deepStrictEqual(soundsBetween(s, snapGame(E.state())), []);
}

// Jugar una carta suena una vez.
{
  const who = E.actor()!;
  assert.deepStrictEqual(step(who, opt(who, 'play')!), ['card']);
}

// Truco, quiero y retruco.
let trucoTested = 0;
for (let tries = 0; tries < 50; tries++) {
  E.newGame(15);
  const a = E.actor()!;
  const b = a === 'p' ? 'c' : 'p';
  const truco = opt(a, 'truco');
  if (!truco) continue;
  assert.deepStrictEqual(step(a, truco), ['truco']);
  assert.deepStrictEqual(step(b, opt(b, 'raise')!), ['truco']); // retruco
  assert.deepStrictEqual(step(a, opt(a, 'quiero')!), ['quiero']);
  assert.strictEqual(E.state().truco.level, 2);
  trucoTested++;
  break;
}

// Truco y no quiero: termina la mano.
for (let tries = 0; tries < 50; tries++) {
  E.newGame(15);
  const a = E.actor()!;
  const b = a === 'p' ? 'c' : 'p';
  const truco = opt(a, 'truco');
  if (!truco) continue;
  step(a, truco);
  const ev = step(b, opt(b, 'noquiero')!);
  assert.strictEqual(ev[0], 'noquiero');
  assert.strictEqual(E.state().handOver, true);
  // Si el que cantó fue 'p', ganó la mano.
  assert.strictEqual(ev.includes('winHand'), a === 'p');
  trucoTested++;
  break;
}
assert.strictEqual(trucoTested, 2, 'no se pudo cantar truco');

// Envido querido y no querido.
for (const answer of ['quiero', 'noquiero'] as const) {
  let done = false;
  for (let tries = 0; tries < 50 && !done; tries++) {
    E.newGame(15);
    const a = E.actor()!;
    const b = a === 'p' ? 'c' : 'p';
    const env = E.options(a).find((o) => o.t === 'env') as Action | undefined;
    if (!env) continue;
    assert.deepStrictEqual(step(a, env), ['envido']);
    assert.deepStrictEqual(step(b, opt(b, answer)!), [answer]);
    done = true;
  }
  assert(done, 'no se pudo cantar envido');
}

// Al mazo: pierde la mano y no suena ninguna carta.
{
  E.newGame(15);
  const who = E.actor()!;
  const mazo = opt(who, 'mazo');
  if (mazo) {
    const ev = step(who, mazo);
    assert.strictEqual(E.state().handOver, true);
    assert.deepStrictEqual(ev, who === 'p' ? ['noquiero'] : ['winHand']);
  }
}

// Partidos completos CPU vs CPU: siempre termina con un sonido de fin de partido, y nunca
// suena nada al cambiar de mano.
for (let g = 0; g < 50; g++) {
  E.newGame(15);
  let ended: SoundEvent[] = [];
  for (let steps = 0; steps < 5000 && !E.state().over; steps++) {
    const before = snapGame(E.state());
    if (E.state().handOver) E.newHand();
    else E.aiAct(E.actor()!);
    const ev = soundsBetween(before, snapGame(E.state()));
    if (before.handOver && !E.state().handOver) assert.deepStrictEqual(ev, [], 'sonó algo al repartir');
    if (E.state().over) ended = ev;
  }
  assert(E.state().over);
  assert.ok(ended.includes(E.state().over === 'p' ? 'winMatch' : 'loseMatch'), JSON.stringify(ended));
}

// En equipo: cada jugador escucha lo mismo desde su asiento, salvo ganar o perder.
T.newGame(4, ['A', 'B', 'C', 'D'], 15);
{
  const s0 = snapTeam(T.viewFor(0), 0);
  const s1 = snapTeam(T.viewFor(1), 1);
  const turn = T.actorSeats()[0];
  const play = T.options(turn).find((o) => o.t === 'play')!;
  assert(T.act(turn, play));
  assert.deepStrictEqual(soundsBetween(s0, snapTeam(T.viewFor(0), 0)), ['card']);
  assert.deepStrictEqual(soundsBetween(s1, snapTeam(T.viewFor(1), 1)), ['card']);
}

console.log('OK sonidos');
