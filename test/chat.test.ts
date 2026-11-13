// Chat online: limpieza de texto, anti-spam e historial: node dist/test/chat.test.js
import assert from 'assert';
import * as Chat from '../src/webview/chat';

// Texto: una sola línea, sin caracteres de control, recortado.
assert.strictEqual(Chat.cleanText('  hola\n\tche  '), 'hola che');
assert.strictEqual(Chat.cleanText('a\u0000b\u2028c'), 'a b c');
assert.strictEqual(Chat.cleanText('x'.repeat(500)).length, Chat.TEXT_MAX);
assert.strictEqual(Chat.cleanText('   '), '');
assert.strictEqual(Chat.cleanText(42), '');
assert.strictEqual(Chat.cleanText({ toString: () => 'hack' }), '');
assert.strictEqual(Chat.cleanFrom('Un nombre larguísimo de verdad'), 'Un nombre larguí');

// Anti-spam: un mismo jugador no puede mandar mensajes pegados; otro jugador sí.
Chat.reset();
assert.ok(Chat.allow('g1', 1000));
assert.ok(!Chat.allow('g1', 1000 + Chat.MIN_GAP - 1));
assert.ok(Chat.allow('g2', 1001));
assert.ok(Chat.allow('g1', 1000 + Chat.MIN_GAP));

// Historial acotado: quedan los últimos.
Chat.reset();
for (let i = 0; i < Chat.HISTORY + 10; i++) Chat.add('Ana', 'm' + i, false);
assert.strictEqual(Chat.getLines().length, Chat.HISTORY);
assert.strictEqual(Chat.getLines()[Chat.HISTORY - 1].text, 'm' + (Chat.HISTORY + 9));

// Borrador: se toma limpio y queda vacío; uno vacío no se manda.
Chat.setDraft('  buenas  ');
assert.strictEqual(Chat.takeDraft(), 'buenas');
assert.strictEqual(Chat.takeDraft(), '');

// No leídos: cuentan con el panel cerrado y se borran al abrirlo.
Chat.reset();
assert.strictEqual(Chat.setOpenChanged(true), false); // ya estaba abierto
Chat.setOpenChanged(false);
Chat.add('Ana', 'hola', false);
Chat.add('Vos', 'mío', true);
assert.strictEqual(Chat.setOpenChanged(true), true);

console.log('chat: ok');
