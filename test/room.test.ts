// Códigos de sala y handshake de entrada: node dist/test/room.test.js
import assert from 'assert';
import * as Room from '../src/webview/room';

(async () => {
  // Códigos: largo fijo, solo símbolos permitidos, y no se repiten.
  const codes = new Set<string>();
  for (let i = 0; i < 2000; i++) {
    const c = Room.genCode();
    assert.match(c, new RegExp(`^[A-HJ-NP-Z2-9]{${Room.CODE_LEN}}$`));
    codes.add(c);
  }
  assert.strictEqual(codes.size, 2000);

  // El ID de PeerJS es estable, no contiene el código y cambia con cada código.
  const id = await Room.peerId('ABCDEFG');
  assert.strictEqual(id, await Room.peerId('ABCDEFG'));
  assert.notStrictEqual(id, await Room.peerId('ABCDEFH'));
  assert.ok(!id.includes('ABCDEFG'));
  assert.match(id, /^[a-z0-9-]+$/); // PeerJS solo acepta letras, números, - y _

  // Handshake: solo pasa el 'join' con el código exacto.
  assert.ok(Room.isValidJoin(Room.joinMsg('ABCDEFG', 'Ana'), 'ABCDEFG'));
  assert.ok(!Room.isValidJoin(Room.joinMsg('ABCDEFH', 'Ana'), 'ABCDEFG'));
  assert.ok(!Room.isValidJoin({ type: 'hello', name: 'Ana' }, 'ABCDEFG'));
  assert.ok(!Room.isValidJoin({ type: 'join' }, 'ABCDEFG'));
  assert.ok(!Room.isValidJoin(null, 'ABCDEFG'));

  // awaitJoin con una conexión falsa.
  function fakeConn() {
    const handlers: Record<string, ((x?: any) => void)[]> = {};
    return {
      closed: false,
      on(ev: string, fn: (x?: any) => void) {
        (handlers[ev] = handlers[ev] || []).push(fn);
      },
      emit(ev: string, x?: any) {
        (handlers[ev] || []).forEach((fn) => fn(x));
      },
      close() {
        this.closed = true;
      },
    };
  }
  const quiet = () => {};

  const ok = fakeConn();
  let joined: any = null;
  Room.awaitJoin(ok, 'ABCDEFG', (m) => (joined = m), 'test', quiet);
  ok.emit('data', Room.joinMsg('ABCDEFG', 'Ana'));
  ok.emit('data', Room.joinMsg('ABCDEFG', 'Otra vez')); // un segundo join no se procesa de nuevo
  assert.strictEqual(joined && joined.name, 'Ana');
  assert.ok(!ok.closed);

  const bad = fakeConn();
  let badJoined = false;
  Room.awaitJoin(bad, 'ABCDEFG', () => (badJoined = true), 'test', quiet);
  bad.emit('data', { type: 'act', a: { t: 'play', i: 0 } }); // se saltea el handshake
  bad.emit('data', Room.joinMsg('ABCDEFG', 'Tarde')); // ya fue rechazada
  assert.ok(bad.closed);
  assert.ok(!badJoined);

  console.log('OK códigos de sala y handshake');
  process.exit(0); // no esperar los timers de JOIN_TIMEOUT
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
