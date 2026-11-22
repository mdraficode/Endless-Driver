import { afterEach, describe, expect, it, vi } from 'vitest';

import { garageView, initialCollection, markChampion } from '../../src/cars/carCollection';
import { MainMenu } from '../../src/ui/MainMenu';

/**
 * Minimal DOM stub for the node test environment (mirrors the DiagnosticsOverlay test). The
 * `textContent` setter clears children to match the real DOM, which the menu relies on to clear
 * the car list on each render.
 */
class FakeElement {
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  readonly style: Record<string, string> = {};
  hidden = false;
  removed = false;
  #text = '';

  constructor(readonly tagName: string) {}

  set textContent(value: string) {
    this.#text = value;
    this.children.length = 0;
  }
  get textContent(): string {
    return this.#text;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }
  appendChild(node: FakeElement): void {
    this.children.push(node);
  }
  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }
  remove(): void {
    this.removed = true;
  }
  click(): void {
    this.listeners.get('click')?.();
  }
}

function installFakeDocument(): void {
  vi.stubGlobal('document', {
    createElement: (tagName: string) => new FakeElement(tagName) as unknown as HTMLElement,
  });
}

function find(node: FakeElement, pred: (n: FakeElement) => boolean): FakeElement | null {
  if (pred(node)) return node;
  for (const child of node.children) {
    const found = find(child, pred);
    if (found !== null) return found;
  }
  return null;
}

function driveButton(menu: MainMenu): FakeElement {
  const found = find(
    menu.root as unknown as FakeElement,
    (n) => n.tagName === 'button' && n.textContent === 'DRIVE',
  );
  if (found === null) throw new Error('expected a DRIVE button');
  return found;
}

function rowFor(menu: MainMenu, carId: string): FakeElement | null {
  return find(menu.root as unknown as FakeElement, (n) => n.getAttribute('data-car-id') === carId);
}

function makeMenu(onDrive: (carId: string) => void): MainMenu {
  const menu = new MainMenu(new FakeElement('app') as unknown as HTMLElement, onDrive);
  menu.update(garageView(initialCollection()));
  return menu;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Phase 17 — main menu (pre-drive car select)', () => {
  it('mounts the collection with the active car present and a DRIVE button', () => {
    installFakeDocument();
    const onDrive = vi.fn();
    const parent = new FakeElement('app');
    const menu = new MainMenu(parent as unknown as HTMLElement, onDrive);
    menu.update(garageView(initialCollection()));

    expect(parent.children).toHaveLength(1);
    expect(
      find(menu.root as unknown as FakeElement, (n) => n.textContent === 'ENDLESS DRIVER'),
    ).not.toBeNull();
    // All four starter cars are owned and therefore selectable.
    for (const id of ['kaminari-gt', 'falcon-s', 'blackwood-m8', 'meridian-4door']) {
      const row = rowFor(menu, id);
      expect(row).not.toBeNull();
      expect(row!.listeners.has('click')).toBe(true);
    }
    expect(driveButton(menu).textContent).toBe('DRIVE');
    expect(onDrive).not.toHaveBeenCalled();
  });

  it('pressing DRIVE drives the currently selected (active) car', () => {
    installFakeDocument();
    const onDrive = vi.fn();
    const menu = makeMenu(onDrive);
    driveButton(menu).click();
    expect(onDrive).toHaveBeenCalledTimes(1);
    expect(onDrive).toHaveBeenCalledWith('kaminari-gt');
  });

  it('selecting another owned car and driving launches that car', () => {
    installFakeDocument();
    const onDrive = vi.fn();
    const menu = makeMenu(onDrive);
    rowFor(menu, 'falcon-s')!.click(); // pick the supercar
    driveButton(menu).click();
    expect(onDrive).toHaveBeenCalledTimes(1);
    expect(onDrive).toHaveBeenCalledWith('falcon-s');
  });

  it('does not let a locked Blacklist car be selected or driven', () => {
    installFakeDocument();
    const onDrive = vi.fn();
    const menu = makeMenu(onDrive);
    const locked = rowFor(menu, 'mw-car-15');
    expect(locked).not.toBeNull();
    expect(locked!.listeners.has('click')).toBe(false); // no select handler
    locked!.click(); // no-op
    driveButton(menu).click(); // still the active starter
    expect(onDrive).toHaveBeenCalledTimes(1);
    expect(onDrive).toHaveBeenCalledWith('kaminari-gt');
  });

  it('shows the champion chip only when the campaign is complete', () => {
    installFakeDocument();
    const menu = makeMenu(vi.fn());
    const chipOf = () =>
      find(
        menu.root as unknown as FakeElement,
        (n) =>
          (n.style.cssText ?? '').includes('margin-top:8px') &&
          (n.style.cssText ?? '').includes('font-weight:700'),
      );
    const state = initialCollection();
    menu.update(garageView(state));
    expect(chipOf()!.style.display).toBe('none');
    menu.update(garageView(markChampion(state)));
    const chip = chipOf()!;
    expect(chip.style.display).toBe('block');
    expect(chip.textContent).toBe('🏆 Champion of Aohara');
  });
});
