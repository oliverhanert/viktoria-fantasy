/**
 * Delt månedskalender til admin (træning + kampe).
 * resolveDay(iso) returnerer modifiers, interaktivitet og evt. badge-indhold.
 */

import { calendarCells, DAYS_DA, MONTHS_DA } from './admin-squad.js';

/**
 * @param {HTMLElement} container
 * @param {{
 *   year: number,
 *   month: number,
 *   bounds: { minYear: number, minMonth: number, maxYear: number, maxMonth: number },
 *   todayIso: string,
 *   selectedIso?: string|null,
 *   resolveDay: (iso: string) => {
 *     modifiers?: string[],
 *     interactive?: boolean,
 *     extra?: string,
 *     ariaLabel?: string,
 *   },
 *   onSelect?: (iso: string) => void,
 * }} opts
 */
export function renderAdminCalendar(container, opts) {
  const { year, month, bounds, todayIso, selectedIso, resolveDay, onSelect } = opts;
  if (!container) return { title: '', canPrev: false, canNext: false };

  const minKey = bounds.minYear * 12 + bounds.minMonth;
  const maxKey = bounds.maxYear * 12 + bounds.maxMonth;
  const curKey = year * 12 + month;

  const cells = calendarCells(year, month);
  container.innerHTML =
    DAYS_DA.map((d) => `<div class="training-cal__dow">${d}</div>`).join('') +
    cells
      .map((iso) => {
        if (!iso) return '<div class="training-cal__cell training-cal__cell--empty"></div>';

        const day = +iso.slice(8, 10);
        const resolved = resolveDay(iso) || {};
        const mods = [...(resolved.modifiers || [])];
        if (iso === todayIso) mods.push('training-cal__cell--today');
        if (selectedIso && iso === selectedIso) mods.push('training-cal__cell--selected');

        const cls = ['training-cal__cell', ...mods].filter(Boolean).join(' ');
        const inner = `<span class="training-cal__day">${day}</span>${resolved.extra || ''}`;

        if (resolved.interactive) {
          const label = resolved.ariaLabel ? ` aria-label="${resolved.ariaLabel}"` : '';
          return `<button type="button" class="${cls}" data-date="${iso}"${label}>${inner}</button>`;
        }
        return `<span class="${cls}">${inner}</span>`;
      })
      .join('');

  if (onSelect) {
    container.querySelectorAll('[data-date]').forEach((btn) => {
      btn.addEventListener('click', () => onSelect(btn.dataset.date));
    });
  }

  return {
    title: `${MONTHS_DA[month - 1]} ${year}`,
    canPrev: curKey > minKey,
    canNext: curKey < maxKey,
  };
}

/** @param {{ canPrev: boolean, canNext: boolean, title: string }} navState */
export function applyCalendarNav(navState, { prevEl, nextEl, titleEl } = {}) {
  if (titleEl) titleEl.textContent = navState.title;
  prevEl?.toggleAttribute('disabled', !navState.canPrev);
  nextEl?.toggleAttribute('disabled', !navState.canNext);
}

export { MONTHS_DA, DAYS_DA };
