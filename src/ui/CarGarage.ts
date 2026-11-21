import type { GarageEntry } from '../cars/carCollection';
import type { CarBody } from '../cars/types';

/**
 * Phase 14.4 — the Garage: a left-side panel listing every car in the collection. Owned cars show
 * their stats and a "Drive" button (the active one is marked); locked Blacklist cars are dimmed
 * with the rival + rank that unlocks them. Self-contained DOM (inline styles); a plain render of
 * the pure `garageView()` output, so no game state lives here.
 */

const BODY_LABEL: Record<CarBody, string> = {
  sport: 'Sport',
  muscle: 'Muscle',
  supercar: 'Supercar',
  sedan: 'Sedan',
  suv: 'SUV',
};

function el(tag: string, css: string): HTMLElement {
  const node = document.createElement(tag);
  if (css !== '') node.style.cssText = css;
  return node;
}

export interface GarageData {
  readonly activeId: string;
  readonly cars: readonly GarageEntry[];
}

export class CarGarage {
  readonly root: HTMLElement;
  readonly #list: HTMLElement;
  readonly #onDrive: (carId: string) => void;

  constructor(parent: HTMLElement, onDrive: (carId: string) => void) {
    this.#onDrive = onDrive;
    const root = el(
      'div',
      'position:absolute; left:16px; top:16px; width:330px; max-height:82vh; overflow:auto; ' +
        'padding:14px 16px; border-radius:12px; background:rgba(8,10,16,0.93); ' +
        'border:1px solid rgba(120,200,255,0.4); color:#f4f1e8; font:13px/1.4 system-ui, sans-serif; ' +
        'display:none; z-index:40; box-shadow:0 8px 30px rgba(0,0,0,0.6);',
    );
    const title = el(
      'div',
      'font-size:18px; font-weight:800; letter-spacing:0.12em; color:#7cc8ff; text-align:center;',
    );
    title.textContent = 'GARAGE';
    const subtitle = el(
      'div',
      'text-align:center; margin:4px 0 12px; font-size:11px; opacity:0.75;',
    );
    subtitle.textContent = 'Pick your ride — it takes effect on the next start';
    this.#list = el('div', 'display:flex; flex-direction:column; gap:8px;');
    root.appendChild(title);
    root.appendChild(subtitle);
    root.appendChild(this.#list);
    this.root = root;
    parent.appendChild(root);
  }

  /** Render the garage, or hide the panel on `null`. */
  update(data: GarageData | null): void {
    if (data === null) {
      this.root.style.display = 'none';
      return;
    }
    this.root.style.display = 'block';
    this.#list.textContent = '';
    let dividerAdded = false;
    for (const entry of data.cars) {
      // A single divider between the (owned-first) starters and the Blacklist cars.
      if (entry.spec.source === 'blacklist' && !dividerAdded) {
        const divider = el(
          'div',
          'font-size:11px; font-weight:800; letter-spacing:0.08em; color:#ffd43c; margin:6px 0 2px; opacity:0.85;',
        );
        divider.textContent = 'BLACKLIST';
        this.#list.appendChild(divider);
        dividerAdded = true;
      }
      this.#list.appendChild(this.#row(entry));
    }
  }

  #row(entry: GarageEntry): HTMLElement {
    const { spec, owned, active } = entry;
    const accent = active ? '#7cc8ff' : owned ? '#e8e4d8' : '#5a5a5a';
    const row = el(
      'div',
      'padding:8px 10px; border-radius:8px; ' +
        `background:${active ? 'rgba(124,200,255,0.14)' : 'rgba(255,255,255,0.05)'}; ` +
        `border-left:3px solid ${accent};`,
    );
    const top = el('div', 'display:flex; align-items:center; gap:8px;');
    const name = el(
      'div',
      'flex:1; min-width:0; font-weight:700; ' + (owned ? '' : 'opacity:0.6;'),
    );
    const bodyTag = el('span', 'font-weight:600; opacity:0.8; font-size:11px; margin-left:6px;');
    bodyTag.textContent = BODY_LABEL[spec.body];
    name.textContent = spec.name;
    name.appendChild(bodyTag);
    top.appendChild(name);

    if (owned) {
      const stats = el('div', 'font-size:10px; opacity:0.8; white-space:nowrap;');
      stats.textContent = `${spec.stats.topSpeed} km/h · acc ${spec.stats.acceleration} · han ${spec.stats.handling} · brk ${spec.stats.braking}`;
      top.appendChild(stats);
    } else {
      const lock = el(
        'div',
        'font-size:10px; font-weight:700; letter-spacing:0.05em; color:#ffd43c; white-space:nowrap;',
      );
      lock.textContent = `RANK ${spec.blacklistRank}`;
      top.appendChild(lock);
    }
    row.appendChild(top);

    if (owned) {
      const button = el(
        'button',
        'margin-top:7px; width:100%; padding:6px; border-radius:6px; font-weight:800; font-size:12px; ' +
          (active
            ? 'background:transparent; color:#7cc8ff; border:1px solid rgba(124,200,255,0.5); cursor:default;'
            : 'background:#7cc8ff; color:#06121a; border:none; cursor:pointer;'),
      );
      button.textContent = active ? 'DRIVING' : 'Drive';
      if (!active) {
        button.addEventListener('click', () => this.#onDrive(spec.id));
      }
      row.appendChild(button);
    }
    return row;
  }

  dispose(): void {
    this.root.remove();
  }
}
