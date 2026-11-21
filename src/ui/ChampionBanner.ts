/**
 * The campaign finale: a centered "Champion of Aohara" banner that appears once when the player
 * busts the last Blacklist rival. Self-contained DOM (inline styles); shown for a few seconds
 * (or on click) and removes itself.
 */

function el(tag: string, css: string): HTMLElement {
  const node = document.createElement(tag);
  if (css !== '') node.style.cssText = css;
  return node;
}

export class ChampionBanner {
  readonly root: HTMLElement;
  #timer: number | null = null;

  constructor(parent: HTMLElement) {
    const root = el(
      'div',
      'position:absolute; inset:0; display:none; align-items:center; justify-content:center; ' +
        'background:rgba(4,6,10,0.72); z-index:60; cursor:pointer;',
    );
    const card = el(
      'div',
      'text-align:center; padding:34px 52px; border-radius:16px; background:rgba(10,14,20,0.95); ' +
        'border:1px solid rgba(252,211,77,0.6); box-shadow:0 0 60px rgba(252,211,77,0.35); ' +
        'color:#f4f1e8; font:system-ui, sans-serif;',
    );
    const crown = el('div', 'font-size:44px;');
    crown.textContent = '🏆';
    const title = el(
      'div',
      'font-size:30px; font-weight:900; letter-spacing:0.04em; color:#fcd34d; margin-top:8px;',
    );
    title.textContent = 'CHAMPION OF AOHARA';
    const sub = el('div', 'font-size:14px; opacity:0.85; margin-top:10px; max-width:340px;');
    sub.textContent =
      'Every one of the 15 Blacklist rivals is in your hands. The city has a new king of the streets.';
    const dismiss = el(
      'div',
      'font-size:11px; opacity:0.5; margin-top:18px; letter-spacing:0.08em;',
    );
    dismiss.textContent = 'TAP TO CONTINUE';
    card.append(crown, title, sub, dismiss);
    root.appendChild(card);
    root.addEventListener('click', () => this.hide());
    this.root = root;
    parent.appendChild(root);
  }

  /** Show the banner; auto-dismisses after `ms` (default 7 s). */
  show(ms = 7000): void {
    this.root.style.display = 'flex';
    this.hide(); // clear any prior timer
    this.#timer = window.setTimeout(() => this.hide(), ms);
  }

  hide(): void {
    if (this.#timer !== null) {
      window.clearTimeout(this.#timer);
      this.#timer = null;
    }
    this.root.style.display = 'none';
  }

  dispose(): void {
    this.hide();
    this.root.remove();
  }
}
