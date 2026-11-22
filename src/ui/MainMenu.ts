import type { GarageEntry } from '../cars/carCollection';
import type { CarBody } from '../cars/types';

/**
 * Phase 17 — the main menu: the pre-drive screen the game boots into. A full-screen overlay
 * (self-contained DOM, inline styles) that lets the player pick which car to drive before the
 * drive scene starts. It is a plain render of the pure `garageView()` output, so no game state
 * lives here: owned cars are selectable, locked Blacklist cars are dimmed, and the champion
 * title shows once the campaign is complete. Selecting a car + pressing DRIVE calls back with
 * the chosen car id; the composition root (main.ts) persists it and starts the drive.
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

function paintHex(paint: number): string {
  return `#${paint.toString(16).padStart(6, '0')}`;
}

/** The view model the menu renders — exactly `garageView()`'s shape. */
export interface MainMenuData {
  readonly activeId: string;
  readonly champion: boolean;
  readonly cars: readonly GarageEntry[];
}

export class MainMenu {
  readonly root: HTMLElement;
  readonly #list: HTMLElement;
  readonly #meta: HTMLElement;
  readonly #championChip: HTMLElement;
  readonly #onDrive: (carId: string) => void;
  #data: MainMenuData | null = null;
  #selectedId: string = '';

  constructor(parent: HTMLElement, onDrive: (carId: string) => void) {
    this.#onDrive = onDrive;

    const root = el(
      'div',
      'position:absolute; inset:0; z-index:60; display:flex; flex-direction:column; ' +
        'align-items:center; justify-content:center; gap:20px; padding:24px; overflow:auto; ' +
        'background:radial-gradient(130% 120% at 50% 0%, #0d1626 0%, #060910 58%, #04050a 100%); ' +
        'color:#f4f1e8; font:15px/1.5 system-ui, sans-serif;',
    );

    const header = el(
      'div',
      'display:flex; flex-direction:column; align-items:center; text-align:center;',
    );
    const title = el(
      'h1',
      'margin:0; font-size:42px; font-weight:900; letter-spacing:0.18em; color:#7cc8ff; ' +
        'text-shadow:0 0 26px rgba(124,200,255,0.35);',
    );
    title.textContent = 'ENDLESS DRIVER';
    const subtitle = el(
      'div',
      'margin-top:2px; font-size:13px; font-weight:600; letter-spacing:0.6em; opacity:0.7;',
    );
    subtitle.textContent = 'A O H A R A';
    header.append(title, subtitle);

    const panel = el(
      'div',
      'width:min(680px, 94vw); max-height:54vh; overflow:auto; padding:16px 18px; border-radius:14px; ' +
        'background:rgba(8,10,16,0.82); border:1px solid rgba(120,200,255,0.35); ' +
        'box-shadow:0 12px 44px rgba(0,0,0,0.62);',
    );
    const panelTitle = el(
      'div',
      'font-size:13px; font-weight:800; letter-spacing:0.16em; color:#7cc8ff; margin-bottom:12px; ' +
        'text-align:center;',
    );
    panelTitle.textContent = 'CHOOSE YOUR CAR';
    this.#list = el('div', 'display:flex; flex-direction:column; gap:8px;');
    this.#meta = el('div', 'margin-top:12px; text-align:center; font-size:12px; opacity:0.82;');
    this.#championChip = el(
      'div',
      'display:none; margin-top:8px; text-align:center; font-size:12px; font-weight:700; color:#ffd43c;',
    );
    panel.append(panelTitle, this.#list, this.#meta, this.#championChip);

    const driveButton = el(
      'button',
      'padding:12px 48px; font-size:16px; font-weight:900; letter-spacing:0.14em; color:#06121a; ' +
        'background:#7cc8ff; border:none; border-radius:10px; cursor:pointer; ' +
        'box-shadow:0 6px 26px rgba(124,200,255,0.4);',
    );
    driveButton.textContent = 'DRIVE';
    driveButton.addEventListener('click', () => this.#onDrive(this.#selectedId));

    const controls = el(
      'div',
      'font-size:11px; opacity:0.6; text-align:center; letter-spacing:0.02em; max-width:640px;',
    );
    controls.textContent =
      'WASD / Arrows drive · Space handbrake · G garage · L Blacklist · P menu · M mute';

    root.append(header, panel, driveButton, controls);
    this.root = root;
    parent.appendChild(root);
  }

  /** Render the menu from the collection's `garageView()` output (idempotent). */
  update(data: MainMenuData): void {
    this.#data = data;
    // Keep the current selection if it's still an owned car; otherwise seed with the active car.
    if (!data.cars.some((c) => c.owned && c.spec.id === this.#selectedId)) {
      this.#selectedId = data.activeId;
    }
    this.root.style.display = 'flex';
    this.#renderList();
    const ownedCount = data.cars.filter((c) => c.owned).length;
    this.#meta.textContent = `${ownedCount} car${ownedCount === 1 ? '' : 's'} in your collection`;
    if (data.champion) {
      this.#championChip.style.display = 'block';
      this.#championChip.textContent = '🏆 Champion of Aohara';
    } else {
      this.#championChip.style.display = 'none';
      this.#championChip.textContent = '';
    }
  }

  #renderList(): void {
    const data = this.#data;
    if (data === null) return;
    this.#list.textContent = '';
    let dividerAdded = false;
    for (const entry of data.cars) {
      if (entry.spec.source === 'blacklist' && !dividerAdded) {
        const divider = el(
          'div',
          'font-size:11px; font-weight:800; letter-spacing:0.08em; color:#ffd43c; margin:6px 0 2px; ' +
            'opacity:0.85;',
        );
        divider.textContent = 'BLACKLIST';
        this.#list.appendChild(divider);
        dividerAdded = true;
      }
      this.#list.appendChild(this.#row(entry));
    }
  }

  #row(entry: GarageEntry): HTMLElement {
    const { spec, owned } = entry;
    const selected = owned && spec.id === this.#selectedId;
    const row = el(
      'div',
      'display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:9px; ' +
        `background:${selected ? 'rgba(124,200,255,0.16)' : 'rgba(255,255,255,0.05)'}; ` +
        `border-left:3px solid ${selected ? '#7cc8ff' : owned ? '#c9c4b6' : '#4a4a4a'}; ` +
        (owned ? 'cursor:pointer;' : 'cursor:default; opacity:0.62;'),
    );
    row.setAttribute('data-car-id', spec.id);
    // A small paint swatch so the collection reads as distinct cars at a glance.
    const swatch = el(
      'div',
      `flex:0 0 auto; width:16px; height:16px; border-radius:4px; ` +
        `background:${paintHex(spec.paint)}; border:1px solid rgba(255,255,255,0.25);`,
    );
    const name = el('div', 'flex:1; min-width:0; font-weight:700;');
    name.textContent = spec.name;
    const bodyTag = el(
      'span',
      'font-weight:600; opacity:0.8; font-size:11px; margin-left:8px; white-space:nowrap;',
    );
    bodyTag.textContent = BODY_LABEL[spec.body];
    name.appendChild(bodyTag);
    row.append(swatch, name);

    if (owned) {
      const stats = el('div', 'font-size:10px; opacity:0.82; white-space:nowrap;');
      stats.textContent =
        `${spec.stats.topSpeed} km/h · ${spec.stats.acceleration} acc · ` +
        `${spec.stats.handling} han · ${spec.stats.braking} brk`;
      row.appendChild(stats);
      row.addEventListener('click', () => {
        if (this.#selectedId === spec.id) return;
        this.#selectedId = spec.id;
        this.#renderList();
      });
    } else {
      const lock = el(
        'div',
        'font-size:10px; font-weight:700; letter-spacing:0.05em; color:#ffd43c; white-space:nowrap;',
      );
      lock.textContent = `RANK ${spec.blacklistRank}`;
      row.appendChild(lock);
    }
    return row;
  }

  dispose(): void {
    this.root.remove();
  }
}
