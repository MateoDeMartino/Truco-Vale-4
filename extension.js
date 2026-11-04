const vscode = require('vscode');

class TrucoViewProvider {
  constructor(extensionUri) {
    this.extensionUri = extensionUri;
    this.view = null;
  }

  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    view.webview.html = this.getHtml(view.webview);
    view.webview.onDidReceiveMessage((msg) => {
      if (msg && msg.type === 'copy' && typeof msg.text === 'string') {
        vscode.env.clipboard.writeText(msg.text);
        vscode.window.showInformationMessage(`Código ${msg.text} copiado. Pasáselo a tu rival.`);
      }
    });
  }

  newGame() {
    if (this.view) this.view.webview.postMessage({ type: 'newGame' });
  }

  getHtml(webview) {
    const uri = (f) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', f));
    const nonce = Array.from({ length: 32 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; connect-src https://0.peerjs.com wss://0.peerjs.com;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${uri('truco.css')}">
  <title>Truco</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${uri('peerjs.min.js')}"></script>
  <script nonce="${nonce}" src="${uri('engine.js')}"></script>
  <script nonce="${nonce}" src="${uri('engine-team.js')}"></script>
  <script nonce="${nonce}" src="${uri('team.js')}"></script>
  <script nonce="${nonce}" src="${uri('ui.js')}"></script>
</body>
</html>`;
  }
}

function activate(context) {
  const provider = new TrucoViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('trucovale4.view', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('trucovale4.newGame', () => provider.newGame())
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
