import type { BlacklistRosterData } from '../most-wanted/types';

/**
 * The Blacklist campaign menu (M5c): a right-side panel listing all 15 rivals (rank, name, Pink
 * Slip car, bounty threshold) with each one's status — BUSTED (Pink Slip taken), UP NEXT
 * (challengeable), or LOCKED (threshold not met) — plus a button to challenge the next rival.
 * Self-contained DOM (inline styles); the Application's `blacklistRoster()` is the single source
 * of truth, so this is a pure render of that data.
 */
function el(tag: string, css: string): HTMLElement {
  const node = document.createElement(tag);
  if (css !== '') node.style.cssText = css;
  return node;
}

export class BlacklistRoster {
  readonly root: HTMLElement;
  readonly #career: HTMLElement;
  readonly #list: HTMLElement;
  readonly #button: HTMLButtonElement;

  constructor(parent: HTMLElement, onChallenge: () => void) {
    const root = el(
      'div',
      'position:absolute; right:16px; top:16px; width:304px; max-height:78vh; overflow:auto; ' +
        'padding:14px 16px; border-radius:12px; background:rgba(8,10,16,0.93); ' +
        'border:1px solid rgba(255,205,60,0.45); color:#f4f1e8; font:13px/1.4 system-ui, sans-serif; ' +
        'display:none; z-index:40; box-shadow:0 8px 30px rgba(0,0,0,0.6);',
    );
    const title = el(
      'div',
      'font-size:18px; font-weight:800; letter-spacing:0.1em; color:#ffd43c; text-align:center;',
    );
    title.textContent = 'BLACKLIST';
    this.#career = el('div', 'text-align:center; margin:4px 0 10px; font-size:12px; opacity:0.85;');
    this.#list = el('div', 'display:flex; flex-direction:column; gap:5px;');
    this.#button = el(
      'button',
      'margin-top:12px; width:100%; padding:9px; border:none; border-radius:8px; background:#ffd43c; ' +
        'color:#1a1200; font-weight:800; font-size:14px; cursor:pointer;',
    ) as HTMLButtonElement;
    this.#button.addEventListener('click', () => {
      if (this.#button.disabled) return;
      onChallenge();
    });
    root.appendChild(title);
    root.appendChild(this.#career);
    root.appendChild(this.#list);
    root.appendChild(this.#button);
    this.root = root;
    parent.appendChild(root);
  }

  /** Render the roster, or hide the panel on `null`. */
  update(data: BlacklistRosterData | null): void {
    if (data === null) {
      this.root.style.display = 'none';
      return;
    }
    this.root.style.display = 'block';
    this.#career.textContent = `Career bounty: ${data.careerTotal.toLocaleString()}`;
    this.#list.textContent = '';
    for (const entry of data.entries) {
      const { config, status } = entry;
      const accent =
        status === 'busted' ? '#7dff9b' : status === 'unlocked' ? '#ffd43c' : '#555555';
      const row = el(
        'div',
        'display:flex; align-items:center; gap:8px; padding:5px 8px; border-radius:7px; ' +
          `background:rgba(255,255,255,0.05); border-left:3px solid ${accent};`,
      );
      const rank = el('div', 'width:34px; font-weight:800; font-size:14px; color:#ffd43c;');
      rank.textContent = `#${config.rank}`;
      const name = el('div', 'flex:1; min-width:0;');
      const bold = el('div', 'font-weight:700;');
      bold.textContent = config.name;
      const sub = el('div', 'font-size:11px; opacity:0.7;');
      sub.textContent = `${config.pinkSlipCar} · needs ${config.challengeThreshold.toLocaleString()}`;
      name.appendChild(bold);
      name.appendChild(sub);
      const badge = el(
        'div',
        `font-size:10px; font-weight:800; letter-spacing:0.06em; padding:2px 7px; border-radius:10px; ` +
          `background:${accent}; color:#141000;`,
      );
      badge.textContent =
        status === 'busted' ? 'BUSTED' : status === 'unlocked' ? 'UP NEXT' : 'LOCKED';
      row.appendChild(rank);
      row.appendChild(name);
      row.appendChild(badge);
      this.#list.appendChild(row);
    }
    this.#button.textContent =
      data.next !== null
        ? `Challenge ${data.next.name} (Rank ${data.next.rank})`
        : 'No rivals available';
    this.#button.disabled = data.next === null;
    this.#button.style.opacity = data.next === null ? '0.5' : '1';
  }

  dispose(): void {
    this.root.remove();
  }
}
