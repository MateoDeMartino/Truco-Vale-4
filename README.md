# Truco Vale 4

Truco, juego de cartas argentino, para jugar desde VS Code: contra la CPU u online, 1 contra 1 o en equipos de 4 y 6.

Aparece como la sección **Truco** en el Explorador.

## Reglas incluidas

- Truco / Retruco / Vale cuatro
- Envido / Real envido / Falta envido (y "el envido está primero")
- Pardas, irse al mazo, partidas a 15 o 30. Sin flor.
- Los puntos de cada mano se suman al terminarla, con un resumen de lo que se llevó cada uno.

## Opciones

Los botones de arriba a la derecha cambian cómo se ve la partida (la elección queda guardada):

- 🧹 **Modo minimalista:** sin la ayuda "Tu envido" ni el historial de jugadas.
- 🪵 **Tanteador criollo:** marcador de madera con fósforos, malas y buenas, en vez del marcador clásico.
- 🔊 **Sonido:** activa o silencia los efectos.

## Jugar online

1. En la pestaña **Online**, tocá **Crear partida** y pasale el código a tu rival.
2. Tu rival, desde su VS Code (con la misma versión de la extensión), escribe el código y toca **Unirse**.

### En equipo (4 o 6 jugadores)

1. En **Online**, tocá **En equipo (4 o 6)**. Elegí cuántos jugadores y a cuántos puntos.
2. Pasá el código: tus amigos lo ponen en **Unirse**, escriben su nombre y eligen equipo.
3. Cuando los dos equipos están completos, el que creó la partida toca **Empezar partida**.

Los equipos se sientan intercalados en la mesa y cada uno ve el suyo como **Nosotros** y al otro como **Ellos**. El envido cuenta el mejor de cada equipo, y a un canto puede responder cualquiera del equipo rival.

La conexión es directa entre las PCs (WebRTC con [PeerJS](https://peerjs.com), licencia MIT). El servidor público de PeerJS solo se usa para que se encuentren: ahí la sala se registra con un hash del código, y el anfitrión solo deja entrar a quien le manda el código correcto. En las partidas en equipo, el anfitrión puede sacar a alguien de la sala con ✕.

### Si no conecta

- Revisá que los dos tengan la misma versión de la extensión. Desde la 0.6.0 las salas no son compatibles con versiones anteriores.
- Si el código no existe, avisa enseguida. Si dice que la partida existe pero no se pudo conectar, casi siempre es la red (firewall, VPN o wifi corporativo): probá desde otra red.
- Para ver el detalle, abrí **Ver → Salida** y elegí **Truco Vale 4**: ahí queda el log de la conexión. Si reportás un problema, pegá ese log en el issue.

## Desarrollo

```bash
pnpm install
pnpm run build        # compila el código TypeScript con esbuild hacia dist/
pnpm run check-types  # valida tipos con tsc
pnpm test             # reglas (partidos simulados), códigos de sala y sonidos
pnpm run package      # genera trucovale4-<versión>.vsix
```

Para instalar el paquete local: `code --install-extension trucovale4-<versión>.vsix`.

- `src/engine/engine.ts`: reglas del juego 1v1 y CPU (Monte Carlo)
- `src/engine/engine-team.ts`: reglas para partidas en equipo (4 y 6 jugadores)
- `src/engine/validate.ts`: revisa la forma de los datos que llegan del otro jugador antes de usarlos
- `src/webview/ui.ts`, `src/webview/team.ts`, `media/truco.css`: interfaz y modo online
- `src/webview/room.ts`: códigos de sala y handshake de entrada
- `src/webview/sound.ts`, `src/webview/sound-events.ts`: efectos de sonido y cuándo suena cada uno
- `src/webview/tanteador.ts`: tanteador criollo
- `src/webview/prefs.ts`: opciones de la interfaz (minimalista, tanteador)
- `src/webview/log.ts`: log de conexión, que la extensión muestra en el panel Salida
- `src/webview/esc.ts`: escapado de texto antes de armar el HTML
- `src/extension.ts`: registra la vista en VS Code
