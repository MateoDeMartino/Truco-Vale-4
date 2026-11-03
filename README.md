# Truco Vale 4

Truco, juego de cartas argentino, para jugar desde VS Code: contra la CPU o online contra un amigo.

Aparece como la sección **Truco** en el Explorador.

## Reglas incluidas

- Truco / Retruco / Vale cuatro
- Envido / Real envido / Falta envido (y "el envido está primero")
- Pardas, irse al mazo, partidas a 15 o 30. Sin flor.
- Los puntos de cada mano se suman al terminarla, con un resumen de lo que se llevó cada uno.

## Jugar online

1. En la pestaña **Online**, tocá **Crear partida** y pasale el código a tu rival.
2. Tu rival, desde su VS Code (con la misma versión de la extensión), escribe el código y toca **Unirse**.

La conexión es directa entre las dos PCs (WebRTC con [PeerJS](https://peerjs.com), licencia MIT). El servidor público de PeerJS solo se usa para que se encuentren.

## Desarrollo

```bash
npm test          # partidos simulados CPU vs CPU para chequear las reglas
npm run package   # genera trucovale4-<versión>.vsix
```

Para instalar el paquete local: `code --install-extension trucovale4-<versión>.vsix`.

- `media/engine.js`: reglas del juego y la CPU
- `media/ui.js`, `media/truco.css`: interfaz y modo online
- `extension.js`: registra la vista en VS Code
