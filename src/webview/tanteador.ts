// Componente Tanteador Criollo con fósforos / porotos (Malas y Buenas)
// Diseñado para renderizarse en un menú desplegable interactivo (<details>)

import { esc } from './esc';

export interface ScoreBoardProps {
  scoreUs: number;
  scoreThem: number;
  target: number; // 15 o 30
  vale: number; // puntos que vale la mano ahora
  nameUs?: string;
  nameThem?: string;
}

// ---------- Preferencias ----------
// El tanteador es opcional: por defecto se ve el marcador clásico y el botón 🪵 lo cambia.

let criollo = false;
// Si el tablero estaba abierto. Cada actualización vuelve a armar el HTML, así que sin esto
// el <details> se cerraría solo cada vez que alguien juega.
let boardOpen = false;

export const isCriollo = () => criollo;
export function setCriollo(on: boolean): void {
  criollo = on;
}
export function setBoardOpen(open: boolean): void {
  boardOpen = open;
}

/**
 * Calcula el estado de Buenas / Malas para un puntaje dado según el objetivo (15 o 30).
 * En partido a 30:
 * - 0 a 15: son "Malas" (1 a 15 malas).
 * - 16 a 30: son "Buenas" (score - 15 buenas).
 * En partido a 15:
 * - Se juegan directamente 15 puntos (comúnmente se le dice a 15 o malas).
 */
export function getScoreBreakdown(score: number, target: number) {
  if (target === 30) {
    if (score <= 15) {
      return {
        label: `${score} Malas`,
        stage: 'malas' as const,
        pts: score,
        isBuenas: false,
      };
    } else {
      const buenas = score - 15;
      return {
        label: `${buenas} Buenas`,
        stage: 'buenas' as const,
        pts: buenas,
        isBuenas: true,
      };
    }
  } else {
    return {
      label: `${score} / 15`,
      stage: 'malas' as const,
      pts: score,
      isBuenas: score > 7,
    };
  }
}

/**
 * Genera el SVG de un grupo de hasta 5 fósforos formando el clásico cuadrado con diagonal.
 * 1: palo izquierdo |
 * 2: palo superior ‾
 * 3: palo derecho |
 * 4: palo inferior _
 * 5: diagonal cruzada /
 */
export function renderMatchstickGroupSvg(count: number): string {
  if (count <= 0) return '';
  const c = Math.min(Math.max(count, 0), 5);

  let elements = '';

  // Palo 1: Izquierda (vertical)
  if (c >= 1) {
    elements += `
      <!-- 1: Izquierda -->
      <line x1="8" y1="10" x2="8" y2="46" stroke="#e0c18d" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="8" y1="10" x2="8" y2="46" stroke="#caa66a" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="8" cy="8" r="4.2" fill="#c62828"/>
      <circle cx="7" cy="7" r="1.5" fill="#ef5350"/>
    `;
  }

  // Palo 2: Superior (horizontal)
  if (c >= 2) {
    elements += `
      <!-- 2: Arriba -->
      <line x1="10" y1="8" x2="46" y2="8" stroke="#e0c18d" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="10" y1="8" x2="46" y2="8" stroke="#caa66a" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="48" cy="8" r="4.2" fill="#c62828"/>
      <circle cx="47" cy="7" r="1.5" fill="#ef5350"/>
    `;
  }

  // Palo 3: Derecha (vertical)
  if (c >= 3) {
    elements += `
      <!-- 3: Derecha -->
      <line x1="48" y1="10" x2="48" y2="46" stroke="#e0c18d" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="48" y1="10" x2="48" y2="46" stroke="#caa66a" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="48" cy="48" r="4.2" fill="#c62828"/>
      <circle cx="47" cy="47" r="1.5" fill="#ef5350"/>
    `;
  }

  // Palo 4: Abajo (horizontal)
  if (c >= 4) {
    elements += `
      <!-- 4: Abajo -->
      <line x1="46" y1="48" x2="10" y2="48" stroke="#e0c18d" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="46" y1="48" x2="10" y2="48" stroke="#caa66a" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="8" cy="48" r="4.2" fill="#c62828"/>
      <circle cx="7" cy="47" r="1.5" fill="#ef5350"/>
    `;
  }

  // Palo 5: Diagonal (cruzando de abajo-izq a arriba-der)
  if (c >= 5) {
    elements += `
      <!-- 5: Diagonal cruzada -->
      <line x1="10" y1="46" x2="46" y2="10" stroke="#f0d3a2" stroke-width="4.5" stroke-linecap="round"/>
      <line x1="10" y1="46" x2="46" y2="10" stroke="#caa66a" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="48" cy="8" r="4.2" fill="#d32f2f"/>
      <circle cx="47" cy="7" r="1.5" fill="#ff7961"/>
    `;
  }

  return `
    <svg class="matchbox-square" viewBox="0 0 56 56" width="52" height="52" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="match-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="1" dy="2" stdDeviation="1.5" flood-color="#000" flood-opacity="0.6"/>
        </filter>
      </defs>
      <g filter="url(#match-shadow)">
        ${elements}
      </g>
    </svg>
  `;
}

/**
 * Renderiza la columna de fósforos de un lado (Nosotros o Ellos)
 * Divide los puntos en grupos de 5 fósforos.
 */
function renderMatchesColumn(points: number, maxPoints: number = 30): string {
  const numGroups = Math.ceil(maxPoints / 5); // ej. 6 grupos de 5 para 30 pts (o 3 para 15)
  let remaining = points;
  let html = '<div class="matches-column">';

  for (let i = 0; i < numGroups; i++) {
    const countInGroup = Math.min(Math.max(remaining, 0), 5);
    remaining -= countInGroup;

    if (countInGroup > 0) {
      html += `<div class="match-group filled">${renderMatchstickGroupSvg(countInGroup)}</div>`;
    } else {
      // Grupo vacío/marcador sutil de guía
      html += `<div class="match-group empty-placeholder"></div>`;
    }
  }

  html += '</div>';
  return html;
}

/**
 * Genera el componente completo del Tanteador Criollo con estilo de madera y cinta patria.
 */
export function tanteadorHtml(props: ScoreBoardProps, isOpen: boolean = boardOpen): string {
  const { scoreUs, scoreThem, target, vale, nameUs = 'Nosotros', nameThem = 'Ellos' } = props;

  const us = getScoreBreakdown(scoreUs, target);
  const them = getScoreBreakdown(scoreThem, target);

  const totalMatchesAvailable = 10; // fósforos de reserva decorativos abajo

  return `
    <details class="criollo-tanteador-details" ${isOpen ? 'open' : ''}>
      <summary class="criollo-summary">
        <div class="criollo-summary-bar">
          <div class="criollo-sum-team us">
            <span class="team-lbl">${esc(nameUs)}</span>
            <span class="badge ${us.isBuenas ? 'buenas' : 'malas'}">${esc(us.label)} (${scoreUs})</span>
          </div>
          <div class="criollo-target-gem">
            <b>${esc(target)}</b>
            <span class="tanteador-icon">vale ${esc(vale)}</span>
          </div>
          <div class="criollo-sum-team them">
            <span class="team-lbl">${esc(nameThem)}</span>
            <span class="badge ${them.isBuenas ? 'buenas' : 'malas'}">${esc(them.label)} (${scoreThem})</span>
          </div>
        </div>
      </summary>

      <div class="criollo-board-wood">
        <!-- Cabecera de cartel de madera -->
        <div class="wood-header">
          <div class="wood-team us">
            <div class="wood-title">${esc(nameUs).toUpperCase()}</div>
            <div class="ribbon ${us.isBuenas ? 'buenas' : 'malas'}">${esc(us.label)}</div>
          </div>
          <div class="wood-target-plaque">
            <span>${esc(target)}</span>
          </div>
          <div class="wood-team them">
            <div class="wood-title">${esc(nameThem).toUpperCase()}</div>
            <div class="ribbon ${them.isBuenas ? 'buenas' : 'malas'}">${esc(them.label)}</div>
          </div>
        </div>

        <!-- Mesa con cinta patria divisoria y fósforos de cada lado -->
        <div class="wood-playfield">
          <!-- Columna Nosotros -->
          <div class="wood-side us-side">
            ${renderMatchesColumn(scoreUs, target)}
          </div>

          <!-- Separador Central: Cinta Argentina Celeste y Blanca -->
          <div class="wood-divider">
            <div class="argentina-ribbon">
              <div class="ribbon-wave"></div>
              <div class="ribbon-wave"></div>
              <div class="ribbon-wave"></div>
              <div class="ribbon-wave"></div>
            </div>
          </div>

          <!-- Columna Ellos -->
          <div class="wood-side them-side">
            ${renderMatchesColumn(scoreThem, target)}
          </div>
        </div>

        <!-- Fósforos de reserva en la base de madera -->
        <div class="wood-footer-matches">
          <div class="match-bundle">
            ${'<div class="loose-match"></div>'.repeat(totalMatchesAvailable)}
          </div>
        </div>
      </div>
    </details>
  `;
}
