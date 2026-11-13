import * as crypto from 'crypto';
import * as vscode from 'vscode';

export class TrucoViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | null = null;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly log: vscode.LogOutputChannel
  ) {}

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'dist', 'media'),
        vscode.Uri.joinPath(this.extensionUri, 'media'),
      ],
    };
    view.webview.html = this.getHtml(view.webview);
    view.webview.onDidReceiveMessage((msg) => {
      if (msg && msg.type === 'copy' && typeof msg.text === 'string' && /^[A-Z0-9]{4,8}$/.test(msg.text)) {
        // Solo se copian códigos de sala: nada de textos arbitrarios al portapapeles.
        vscode.env.clipboard.writeText(msg.text);
        vscode.window.showInformationMessage(`Código ${msg.text} copiado. Pasáselo a tu rival.`);
      } else if (msg && msg.type === 'log' && typeof msg.text === 'string' && msg.text.length <= 2000) {
        // Líneas del log de conexión del webview (ver src/webview/log.ts).
        if (msg.level === 'error') this.log.error(msg.text);
        else if (msg.level === 'warn') this.log.warn(msg.text);
        else this.log.info(msg.text);
      }
    });
  }

  newGame() {
    if (this.view) {
      this.view.webview.postMessage({ type: 'newGame' });
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const mediaUri = (f: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', f));
    const distUri = (f: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'media', f));
    const nonce = crypto.randomBytes(16).toString('hex');
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; connect-src https://0.peerjs.com wss://0.peerjs.com https://*.metered.ca wss://*.metered.ca;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${mediaUri('truco.css')}">
  <title>Truco</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${mediaUri('peerjs.min.js')}"></script>
  <script nonce="${nonce}" src="${distUri('webview.js')}"></script>
</body>
</html>`;
  }
}

export function activate(context: vscode.ExtensionContext) {
  const log = vscode.window.createOutputChannel('Truco Vale 4', { log: true });
  const provider = new TrucoViewProvider(context.extensionUri, log);
  context.subscriptions.push(
    log,
    vscode.window.registerWebviewViewProvider('trucovale4.view', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('trucovale4.newGame', () => provider.newGame())
  );
}

export function deactivate() {}
