import type { BlacklistRaceHud as BlacklistRaceHudData } from '../most-wanted/types';

/**
 * The Blacklist race HUD banner (M5b-2c): a compact top-centre overlay showing the rival, the race
 * clock, and the player's vs the rival's progress along the route, plus the win/lose result. It
 * builds its own DOM element (no HTML changes) and is styled inline so it is self-contained — the
 * game's wanted meter and pursuit bar stay the source for the *normal* chase; this banner is only
 * visible during a Blacklist hunt-&-destroy race.
 */
function el(tag: string, css: string): HTMLElement {
  const node = document.createElement(tag);
  if (css !== '') node.style.cssText = css;
  return node;
}

function bar(label: string, fillColor: string): { row: HTMLElement; fill: HTMLElement } {
  const row = el('div', 'display:flex; align-items:center; gap:8px;');
  const name = el(
    'div',
    'width:42px; text-align:right; font-size:11px; letter-spacing:0.06em; opacity:0.85;',
  );
  name.textContent = label;
  const track = el(
    'div',
    'flex:1; height:8px; border-radius:4px; background:rgba(255,255,255,0.12); overflow:hidden;',
  );
  const fill = el('div', `height:100%; width:0%; border-radius:4px; background:${fillColor};`);
  track.appendChild(fill);
  row.appendChild(name);
  row.appendChild(track);
  return { row, fill };
}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export class BlacklistRaceHud {
  readonly root: HTMLElement;
  readonly #title: HTMLElement;
  readonly #timer: HTMLElement;
  readonly #youFill: HTMLElement;
  readonly #rivalFill: HTMLElement;
  readonly #status: HTMLElement;

  constructor(parent: HTMLElement) {
    const root = el(
      'div',
      'position:absolute; top:12px; left:50%; transform:translateX(-50%); width:304px; padding:10px 14px; ' +
        'border-radius:10px; background:rgba(10,12,18,0.84); border:1px solid rgba(255,205,60,0.5); ' +
        'color:#f4f1e8; font:13px/1.35 system-ui, sans-serif; text-align:center; pointer-events:none; ' +
        'display:none; z-index:30; box-shadow:0 6px 24px rgba(0,0,0,0.5);',
    );
    this.#title = el(
      'div',
      'font-weight:700; letter-spacing:0.04em; color:#ffd43c; font-size:14px;',
    );
    this.#timer = el(
      'div',
      'margin-top:1px; font-variant-numeric:tabular-nums; font-size:22px; font-weight:800;',
    );
    const bars = el('div', 'margin-top:8px; display:flex; flex-direction:column; gap:5px;');
    const you = bar('YOU', '#4ea8ff');
    const rival = bar('RIVAL', '#ffd43c');
    this.#youFill = you.fill;
    this.#rivalFill = rival.fill;
    bars.appendChild(you.row);
    bars.appendChild(rival.row);
    this.#status = el('div', 'margin-top:7px; font-weight:700; min-height:17px; font-size:13px;');
    root.appendChild(this.#title);
    root.appendChild(this.#timer);
    root.appendChild(bars);
    root.appendChild(this.#status);
    this.root = root;
    parent.appendChild(root);
  }

  /** Show/update the race banner, or hide it on `null`. */
  update(data: BlacklistRaceHudData | null): void {
    if (data === null) {
      this.root.style.display = 'none';
      return;
    }
    this.root.style.display = 'block';
    this.#title.textContent = `BLACKLIST · ${data.rivalName} (Rank ${data.rivalRank})`;
    this.#youFill.style.width = `${Math.round(data.playerProgress * 100)}%`;
    this.#rivalFill.style.width = `${Math.round(data.rivalProgress * 100)}%`;
    if (data.phase === 'countdown') {
      this.#timer.textContent = '—';
      this.#status.textContent = 'GET READY…';
      this.#status.style.color = '#ffd43c';
    } else if (data.phase === 'racing') {
      this.#timer.textContent = formatClock(data.remainingSeconds);
      const leading = data.playerProgress >= data.rivalProgress;
      this.#status.textContent = leading ? 'You are in the lead' : 'Rival is ahead — catch up!';
      this.#status.style.color = leading ? '#7dff9b' : '#ff7a7a';
    } else if (data.phase === 'won') {
      this.#timer.textContent = 'FINISH';
      this.#status.textContent = `WIN — you took ${data.rivalName}'s Pink Slip!`;
      this.#status.style.color = '#7dff9b';
    } else {
      this.#timer.textContent = 'DNF';
      this.#status.textContent = 'LOST — the rival got away';
      this.#status.style.color = '#ff7a7a';
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
