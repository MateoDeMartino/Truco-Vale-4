// Chat de texto de las partidas online (1 contra 1 y en equipo).
//
// En 1 contra 1 cada mensaje va directo al rival. En equipo el anfitrión es el que reenvía: el
// invitado le manda solo el texto y el anfitrión le pone el nombre que tiene en la sala, así nadie
// puede escribir haciéndose pasar por otro. Todo texto que llega se limpia (cleanText) y se escapa
// al dibujarlo.
import { esc } from './esc';

export const TEXT_MAX = 200; // largo máximo de un mensaje
export const HISTORY = 50; // mensajes que se guardan; los más viejos se descartan
export const MIN_GAP = 400; // ms mínimos entre mensajes de un mismo jugador (anti-spam)
const FROM_MAX = 16;

export interface ChatLine {
  from: string;
  text: string;
  mine: boolean;
}

let lines: ChatLine[] = [];
let draft = '';
let open = true;
let unread = 0;
let lastFrom = new Map<string, number>();

// Deja el texto en una sola línea, sin caracteres de control, recortado. '' si no queda nada.
export function cleanText(s: unknown, max = TEXT_MAX): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export const cleanFrom = (s: unknown): string => cleanText(s, FROM_MAX);

// ¿Se acepta otro mensaje de `key` ahora? Corta a quien manda mensajes demasiado seguido.
export function allow(key: string, now = Date.now()): boolean {
  const last = lastFrom.get(key);
  if (last !== undefined && now - last < MIN_GAP) return false;
  lastFrom.set(key, now);
  return true;
}

// Empieza un chat vacío (al entrar a otra partida).
export function reset(): void {
  lines = [];
  draft = '';
  unread = 0;
  lastFrom = new Map();
}

export function add(from: string, text: string, mine: boolean): void {
  lines.push({ from: from || '?', text, mine });
  if (lines.length > HISTORY) lines = lines.slice(-HISTORY);
  if (!mine && !open) unread++;
}

export const getLines = (): readonly ChatLine[] => lines;

export function setDraft(s: string): void {
  draft = s;
}

// Saca el borrador para mandarlo. Devuelve el texto limpio, o '' si no hay nada que mandar.
export function takeDraft(): string {
  const text = cleanText(draft);
  if (text) draft = '';
  return text;
}

// El panel se abrió o cerró. Devuelve true si cambió algo que haya que redibujar (el contador de
// no leídos): el 'toggle' también salta al recrear el panel, y ahí no hay que redibujar de nuevo.
export function setOpenChanged(on: boolean): boolean {
  if (on === open) return false;
  open = on;
  const hadUnread = unread > 0;
  if (on) unread = 0;
  return hadUnread;
}

export function html(): string {
  const items = lines
    .map((l) => `<li class="${l.mine ? 'mine' : ''}"><b>${esc(l.mine ? 'Vos' : l.from)}:</b> ${esc(l.text)}</li>`)
    .join('');
  const badge = unread ? ` <span class="chat-unread">${unread}</span>` : '';
  return `<details class="chat"${open ? ' open' : ''}>
    <summary>💬 Chat${badge}</summary>
    <ul id="chat-list">${items || '<li class="empty">Todavía no hay mensajes.</li>'}</ul>
    <div class="chat-form">
      <input id="chat-input" type="text" maxlength="${TEXT_MAX}" placeholder="Escribí un mensaje…" value="${esc(draft)}" autocomplete="off">
      <button data-a="chat-send">Enviar</button>
    </div>
  </details>`;
}

// Después de redibujar: la lista queda mostrando el último mensaje.
export function afterRender(): void {
  const list = document.getElementById('chat-list');
  if (list) list.scrollTop = list.scrollHeight;
}
