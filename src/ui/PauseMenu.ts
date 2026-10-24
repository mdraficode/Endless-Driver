import type { CameraMode } from '../config/camera';
import type {
  GamePreferences,
  GraphicsTierPreference,
  PlayerCarModel,
  SteeringSensitivity,
  TrafficIntensity,
} from '../config/game-preferences';
import type { SpawnPoint } from '../config/spawns';
import type { TierId } from '../config/tiers';

export type PauseMenuPage = 'overview' | 'spawn' | 'gameplay' | 'graphics' | 'vehicle' | 'controls';
export type PauseMenuItemId = 'resume' | 'restart' | PauseMenuPage | 'credits';

export const PAUSE_MENU_ITEMS = [
  { id: 'resume', label: 'Resume', kind: 'action', icon: '▶' },
  { id: 'restart', label: 'Restart', kind: 'action', icon: '↻' },
  { id: 'overview', label: 'Overview', kind: 'page', icon: '⌂' },
  { id: 'spawn', label: 'Spawn Location', kind: 'page', icon: '⌖' },
  { id: 'gameplay', label: 'Gameplay Options', kind: 'page', icon: '⚙' },
  { id: 'graphics', label: 'Graphics', kind: 'page', icon: '◈' },
  { id: 'vehicle', label: 'Car Model', kind: 'page', icon: '▰' },
  { id: 'controls', label: 'Controls & Help', kind: 'page', icon: '?' },
  { id: 'credits', label: 'Credits', kind: 'credits', icon: '©' },
] as const;

export interface PauseMenuOptions {
  readonly root: HTMLElement;
  readonly triggerButton: HTMLButtonElement;
  /** Effective graphics choice for this boot (a URL tier override takes precedence). */
  readonly preferences: GamePreferences;
  readonly spawnPoints: readonly SpawnPoint[];
  readonly currentSpawnId: string;
  readonly defaultSpawnId: string;
  readonly activeTier: TierId;
  readonly activeRenderer: string;
  readonly activeTrafficVehicleCount: number;
  readonly onPause: () => void;
  readonly onResume: () => void;
  /** Clears a URL tier override only when the graphics selection was explicitly changed. */
  readonly onRestart: (clearGraphicsOverride: boolean) => void;
  readonly onApplySpawn: (spawnId: string, clearGraphicsOverride: boolean) => void;
  readonly onPreferenceChange: <K extends keyof GamePreferences>(
    key: K,
    value: GamePreferences[K],
  ) => boolean;
  readonly onOpenCredits: (returnFocus: HTMLElement) => void;
  readonly isCreditsOpen: () => boolean;
  readonly onFullscreen: (event: Event) => Promise<boolean>;
}

const PREFERENCE_KEYS: readonly (keyof GamePreferences)[] = [
  'graphicsTier',
  'trafficIntensity',
  'carModel',
  'cameraMode',
  'steeringSensitivity',
];

const GRAPHICS_CHOICES: readonly { value: GraphicsTierPreference; label: string }[] = [
  { value: 'auto', label: 'Auto — recommended for this device' },
  { value: 'C', label: 'Performance — tier C' },
  { value: 'B', label: 'Balanced — tier B' },
  { value: 'A', label: 'High — tier A' },
];

const TRAFFIC_CHOICES: readonly { value: TrafficIntensity; label: string }[] = [
  { value: 'off', label: 'Off — no moving city traffic' },
  { value: 'light', label: 'Light — fewer vehicles' },
  { value: 'standard', label: 'Standard — default amount' },
  { value: 'busy', label: 'Busy — about 50% more vehicles' },
];

const CAMERA_CHOICES: readonly { value: CameraMode; label: string }[] = [
  { value: 'chase', label: 'Chase camera' },
  { value: 'cockpit', label: 'Cockpit camera' },
  { value: 'orbit', label: 'Orbit / look camera' },
];

const STEERING_CHOICES: readonly { value: SteeringSensitivity; label: string }[] = [
  { value: 'relaxed', label: 'Relaxed — smoother, less sensitive' },
  { value: 'standard', label: 'Standard' },
  { value: 'responsive', label: 'Responsive — quicker steering' },
];

const CAR_CHOICES: readonly {
  readonly value: PlayerCarModel;
  readonly title: string;
  readonly description: string;
  readonly tag: string;
}[] = [
  {
    value: 'generic-sport-coupe',
    title: 'Generic Sport Coupé',
    description:
      'High-detail imported sports coupé with a detailed cabin. The mesh is loaded from the project asset manifest.',
    tag: 'Detailed model',
  },
  {
    value: 'kaminari-gt-roadster',
    title: 'Kaminari GT Roadster',
    description:
      'Project-authored, unbadged open-top grand tourer with a visible interior and its own paint finish.',
    tag: 'Open-top',
  },
];

/** In-game pause/home menu. All selections are persisted and take effect on restart. */
export class PauseMenu {
  readonly #options: PauseMenuOptions;
  readonly #root: HTMLElement;
  readonly #triggerButton: HTMLButtonElement;
  readonly #dialog: HTMLElement;
  readonly #nav: HTMLElement;
  readonly #content: HTMLElement;
  readonly #footerStatus: HTMLElement;
  readonly #applyButton: HTMLButtonElement;
  readonly #resumeButton: HTMLButtonElement;
  readonly #initialPreferences: GamePreferences;
  #preferences: GamePreferences;
  readonly #keyDown = (event: KeyboardEvent): void => {
    if (this.#options.isCreditsOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.#root.hidden) this.open();
      else this.#resume();
      return;
    }
    if (
      event.code === 'KeyP' &&
      !event.repeat &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      if (this.#root.hidden) this.open();
      else this.#resume();
      return;
    }
    if (event.key === 'Tab' && !this.#root.hidden) this.#trapFocus(event);
  };
  readonly #triggerClick = (): void => {
    if (this.#root.hidden) this.open();
    else this.#resume();
  };
  readonly #resumeClick = (): void => this.#resume();
  readonly #rootClick = (event: MouseEvent): void => {
    if (event.target === this.#root) this.#resume();
  };
  #activePage: PauseMenuPage = 'overview';
  #storageAvailable = true;

  constructor(options: PauseMenuOptions) {
    this.#options = options;
    this.#root = options.root;
    this.#triggerButton = options.triggerButton;
    this.#initialPreferences = { ...options.preferences };
    this.#preferences = { ...options.preferences };
    this.#root.replaceChildren();
    this.#root.classList.add('pause-menu-overlay');
    this.#root.hidden = true;
    this.#root.setAttribute('role', 'dialog');
    this.#root.setAttribute('aria-modal', 'true');
    this.#root.setAttribute('aria-label', 'Driving menu');

    const shell = document.createElement('section');
    shell.className = 'pause-menu-shell';
    shell.setAttribute('aria-labelledby', 'pause-menu-title');
    this.#dialog = shell;

    const header = document.createElement('header');
    header.className = 'pause-menu-header';
    const brand = document.createElement('div');
    brand.className = 'pause-menu-brand';
    const mark = document.createElement('span');
    mark.className = 'pause-menu-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = 'ED';
    const brandCopy = document.createElement('div');
    const brandName = document.createElement('p');
    brandName.className = 'pause-menu-brand-name';
    brandName.textContent = 'ENDLESS DRIVER';
    const brandSubline = document.createElement('p');
    brandSubline.className = 'pause-menu-brand-subline';
    brandSubline.textContent = 'AOHARA · OPEN ROAD';
    brandCopy.append(brandName, brandSubline);
    brand.append(mark, brandCopy);

    const pausedLabel = document.createElement('span');
    pausedLabel.className = 'pause-menu-paused-label';
    pausedLabel.textContent = 'PAUSED';
    this.#resumeButton = document.createElement('button');
    this.#resumeButton.className = 'pause-menu-resume-button';
    this.#resumeButton.type = 'button';
    this.#resumeButton.textContent = 'Resume drive';
    this.#resumeButton.addEventListener('click', this.#resumeClick);
    header.append(brand, pausedLabel, this.#resumeButton);

    const layout = document.createElement('div');
    layout.className = 'pause-menu-layout';
    const nav = document.createElement('nav');
    nav.className = 'pause-menu-nav';
    nav.setAttribute('aria-label', 'Pause menu');
    this.#nav = nav;
    this.#buildNav();

    const main = document.createElement('main');
    main.className = 'pause-menu-main';
    const pageHeader = document.createElement('div');
    pageHeader.className = 'pause-menu-page-header';
    const pageHeaderCopy = document.createElement('div');
    const kicker = document.createElement('p');
    kicker.className = 'pause-menu-eyebrow';
    kicker.textContent = 'SESSION CONTROL';
    const title = document.createElement('h1');
    title.id = 'pause-menu-title';
    title.className = 'pause-menu-title';
    title.textContent = 'Take a breather.';
    pageHeaderCopy.append(kicker, title);
    pageHeader.append(pageHeaderCopy);

    const pageContent = document.createElement('div');
    pageContent.className = 'pause-menu-content';
    pageContent.setAttribute('aria-live', 'polite');
    this.#content = pageContent;

    const footer = document.createElement('footer');
    footer.className = 'pause-menu-footer';
    this.#footerStatus = document.createElement('p');
    this.#footerStatus.className = 'pause-menu-footer-status';
    this.#footerStatus.setAttribute('role', 'status');
    this.#applyButton = document.createElement('button');
    this.#applyButton.className = 'pause-menu-apply-button';
    this.#applyButton.type = 'button';
    this.#applyButton.textContent = 'Apply changes & restart';
    this.#applyButton.hidden = true;
    this.#applyButton.addEventListener('click', () => this.#applyAndRestart());
    footer.append(this.#footerStatus, this.#applyButton);

    main.append(pageHeader, pageContent, footer);
    layout.append(nav, main);
    shell.append(header, layout);
    this.#root.append(shell);

    this.#triggerButton.type = 'button';
    this.#triggerButton.hidden = false;
    this.#triggerButton.setAttribute('aria-controls', 'pause-menu-root');
    this.#triggerButton.setAttribute('aria-haspopup', 'dialog');
    this.#triggerButton.setAttribute('aria-expanded', 'false');
    this.#triggerButton.addEventListener('click', this.#triggerClick);
    this.#root.addEventListener('click', this.#rootClick);
    document.addEventListener('keydown', this.#keyDown, true);
    this.#renderPage();
    this.#updateFooter();
  }

  open(): void {
    if (!this.#root.hidden) return;
    this.#root.hidden = false;
    this.#triggerButton.setAttribute('aria-expanded', 'true');
    this.#triggerButton.setAttribute('aria-label', 'Close pause menu');
    this.#options.onPause();
    this.#renderPage();
    this.#resumeButton.focus();
  }

  close(): void {
    this.#resume();
  }

  dispose(): void {
    document.removeEventListener('keydown', this.#keyDown, true);
    this.#triggerButton.removeEventListener('click', this.#triggerClick);
    this.#root.removeEventListener('click', this.#rootClick);
    this.#root.hidden = true;
    this.#root.replaceChildren();
    this.#root.classList.remove('pause-menu-overlay');
    this.#root.removeAttribute('role');
    this.#root.removeAttribute('aria-modal');
    this.#root.removeAttribute('aria-label');
    this.#triggerButton.hidden = true;
    this.#triggerButton.setAttribute('aria-expanded', 'false');
    this.#triggerButton.setAttribute('aria-label', 'Open pause menu');
  }

  #buildNav(): void {
    for (const [index, item] of PAUSE_MENU_ITEMS.entries()) {
      if (index === 2 || index === PAUSE_MENU_ITEMS.length - 1) {
        const separator = document.createElement('span');
        separator.className = 'pause-menu-nav-separator';
        separator.setAttribute('aria-hidden', 'true');
        this.#nav.append(separator);
      }
      const button = document.createElement('button');
      button.className = `pause-menu-nav-item${item.kind === 'action' ? ' is-action' : ''}${item.kind === 'credits' ? ' is-credits' : ''}`;
      button.type = 'button';
      button.dataset['menuId'] = item.id;
      if (item.kind === 'credits') button.setAttribute('aria-haspopup', 'dialog');
      const icon = document.createElement('span');
      icon.className = 'pause-menu-nav-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = item.icon;
      const label = document.createElement('span');
      label.className = 'pause-menu-nav-label';
      label.textContent = item.label;
      button.append(icon, label);
      button.addEventListener('click', () => this.#activateItem(item.id, button));
      this.#nav.append(button);
    }
  }

  #activateItem(id: PauseMenuItemId, source: HTMLButtonElement): void {
    if (id === 'resume') {
      this.#resume();
    } else if (id === 'restart') {
      this.#root.hidden = true;
      this.#options.onRestart(this.#graphicsSelectionChanged());
    } else if (id === 'credits') {
      this.#options.onOpenCredits(source);
    } else {
      this.#activePage = id;
      this.#updateNav();
      this.#renderPage();
    }
  }

  #renderPage(): void {
    this.#content.replaceChildren();
    const page = this.#createPage();
    switch (this.#activePage) {
      case 'overview':
        this.#renderOverview(page);
        break;
      case 'spawn':
        this.#renderSpawn(page);
        break;
      case 'gameplay':
        this.#renderGameplay(page);
        break;
      case 'graphics':
        this.#renderGraphics(page);
        break;
      case 'vehicle':
        this.#renderVehicle(page);
        break;
      case 'controls':
        this.#renderControls(page);
        break;
    }
    this.#content.append(page);
    this.#updateNav();
    this.#updateFooter();
  }

  #createPage(): HTMLElement {
    const page = document.createElement('section');
    page.className = 'pause-menu-page';
    page.tabIndex = -1;
    return page;
  }

  #renderOverview(page: HTMLElement): void {
    const heading = this.#sectionHeading('WELCOME BACK', 'Your drive is paused');
    const intro = document.createElement('p');
    intro.className = 'pause-menu-copy';
    intro.textContent =
      'Take a moment to choose where to go next or tune your drive. The world starts automatically again after you resume.';
    const statusGrid = document.createElement('div');
    statusGrid.className = 'pause-menu-stat-grid';
    const spawn = this.#options.spawnPoints.find(
      (point) => point.id === this.#options.currentSpawnId,
    );
    this.#appendStat(statusGrid, 'CURRENT LOCATION', spawn?.label ?? this.#options.currentSpawnId);
    this.#appendStat(statusGrid, 'ACTIVE GRAPHICS', `Tier ${this.#options.activeTier}`);
    this.#appendStat(statusGrid, 'RENDERER', this.#options.activeRenderer.toUpperCase());
    this.#appendStat(
      statusGrid,
      'CITY TRAFFIC',
      `${this.#options.activeTrafficVehicleCount} vehicles · ${this.#trafficLabel(this.#initialPreferences.trafficIntensity)}`,
    );
    const callout = document.createElement('div');
    callout.className = 'pause-menu-callout';
    const calloutTitle = document.createElement('strong');
    calloutTitle.textContent = 'Your options are remembered';
    const calloutText = document.createElement('span');
    calloutText.textContent =
      'Changes are saved as you make them. Restart the drive to apply new gameplay, car, traffic or graphics settings.';
    callout.append(calloutTitle, calloutText);
    page.append(heading, intro, statusGrid, callout);
  }

  #renderSpawn(page: HTMLElement): void {
    page.append(
      this.#sectionHeading('PICK YOUR ROUTE', 'Spawn Location'),
      this.#paragraph('Choose a starting point. The selected place loads into a fresh drive.'),
    );
    const field = this.#field('Start location', 'Choose a starting district or route.');
    const select = document.createElement('select');
    select.className = 'pause-menu-select';
    select.setAttribute('aria-label', 'Start location');
    const orderedPoints = [
      ...this.#options.spawnPoints.filter((point) => point.id === this.#options.defaultSpawnId),
      ...this.#options.spawnPoints.filter(
        (point) => point.id !== this.#options.defaultSpawnId && point.id === 'hinode-touge',
      ),
      ...this.#options.spawnPoints.filter(
        (point) => point.id !== this.#options.defaultSpawnId && point.id !== 'hinode-touge',
      ),
    ];
    for (const point of orderedPoints) {
      const option = document.createElement('option');
      option.value = point.id;
      option.textContent = point.label;
      select.append(option);
    }
    const random = document.createElement('option');
    random.value = 'random';
    random.textContent = 'Random district';
    const defaultPosition = orderedPoints.findIndex(
      (point) => point.id === this.#options.defaultSpawnId,
    );
    select.insertBefore(random, select.children[Math.max(0, defaultPosition + 1)] ?? null);
    select.value = this.#options.currentSpawnId;
    const apply = document.createElement('button');
    apply.className = 'pause-menu-primary-button pause-menu-spawn-button';
    apply.type = 'button';
    apply.textContent = 'Start drive here';
    apply.addEventListener('click', () => {
      this.#root.hidden = true;
      this.#options.onApplySpawn(select.value, this.#graphicsSelectionChanged());
    });
    field.append(select);
    page.append(field, apply);
  }

  #renderGameplay(page: HTMLElement): void {
    page.append(
      this.#sectionHeading('MAKE IT YOURS', 'Gameplay Options'),
      this.#paragraph('These settings are applied when you restart the drive.'),
    );
    page.append(
      this.#preferenceSelect('Traffic intensity', 'trafficIntensity', TRAFFIC_CHOICES),
      this.#preferenceSelect('Camera at start', 'cameraMode', CAMERA_CHOICES),
      this.#preferenceSelect('Steering response', 'steeringSensitivity', STEERING_CHOICES),
    );
    const trafficHint = this.#paragraph(
      'Traffic Off removes moving Aohara traffic; Light, Standard and Busy scale the city vehicle count. Pedestrians and the road network are unchanged.',
    );
    trafficHint.classList.add('pause-menu-subtle-copy');
    page.append(trafficHint);
  }

  #renderGraphics(page: HTMLElement): void {
    page.append(
      this.#sectionHeading('DISPLAY & PERFORMANCE', 'Graphics'),
      this.#paragraph(
        `Currently running tier ${this.#options.activeTier} on ${this.#options.activeRenderer.toUpperCase()}. Graphics changes apply after restart.`,
      ),
      this.#preferenceSelect('Quality profile', 'graphicsTier', GRAPHICS_CHOICES),
    );
    const hint = this.#paragraph(
      'Auto chooses a device-appropriate profile. Tier A has the highest visual budget and may run slowly on some devices.',
    );
    hint.classList.add('pause-menu-subtle-copy');
    const fullscreenRow = document.createElement('div');
    fullscreenRow.className = 'pause-menu-action-row';
    const fullscreenCopy = document.createElement('div');
    const fullscreenTitle = document.createElement('strong');
    fullscreenTitle.textContent = 'Fullscreen';
    const fullscreenDescription = document.createElement('span');
    fullscreenDescription.textContent =
      'Request fullscreen and landscape orientation where the browser allows it.';
    fullscreenCopy.append(fullscreenTitle, fullscreenDescription);
    const fullscreenStatus = document.createElement('span');
    fullscreenStatus.className = 'pause-menu-inline-status';
    fullscreenStatus.setAttribute('role', 'status');
    const fullscreenButton = document.createElement('button');
    fullscreenButton.className = 'pause-menu-secondary-button';
    fullscreenButton.type = 'button';
    fullscreenButton.textContent = 'Enter fullscreen';
    fullscreenButton.addEventListener('click', async (event) => {
      fullscreenButton.disabled = true;
      try {
        const entered = await this.#options.onFullscreen(event);
        fullscreenStatus.textContent = entered
          ? 'Fullscreen active; landscape orientation is best-effort.'
          : 'Fullscreen needs browser permission or a supported gesture.';
      } catch {
        fullscreenStatus.textContent = 'Fullscreen is unavailable in this browser context.';
      } finally {
        fullscreenButton.disabled = false;
      }
    });
    fullscreenRow.append(fullscreenCopy, fullscreenButton);
    page.append(hint, fullscreenRow, fullscreenStatus);
  }

  #renderVehicle(page: HTMLElement): void {
    page.append(
      this.#sectionHeading('CHOOSE YOUR CAR', 'Car Model'),
      this.#paragraph('Your chosen model loads the next time you restart the drive.'),
    );
    const cards = document.createElement('div');
    cards.className = 'pause-menu-car-cards';
    for (const choice of CAR_CHOICES) {
      const selected = this.#preferences.carModel === choice.value;
      const card = document.createElement('button');
      card.className = `pause-menu-car-card${selected ? ' is-selected' : ''}`;
      card.type = 'button';
      card.dataset['carModel'] = choice.value;
      card.setAttribute('aria-pressed', String(selected));
      const swatch = document.createElement('span');
      swatch.className = `pause-menu-car-swatch is-${choice.value}`;
      swatch.setAttribute('aria-hidden', 'true');
      const tag = document.createElement('span');
      tag.className = 'pause-menu-car-tag';
      tag.textContent = choice.tag;
      const title = document.createElement('strong');
      title.textContent = choice.title;
      const description = document.createElement('span');
      description.textContent = choice.description;
      const selectedLabel = document.createElement('span');
      selectedLabel.className = 'pause-menu-car-selected';
      selectedLabel.textContent = selected ? 'SELECTED' : 'SELECT';
      card.append(swatch, tag, title, description, selectedLabel);
      card.addEventListener('click', () => {
        this.#setPreference('carModel', choice.value);
        this.#renderPage();
        this.#content
          .querySelector<HTMLButtonElement>(`[data-car-model="${choice.value}"]`)
          ?.focus();
      });
      cards.append(card);
    }
    const note = this.#paragraph(
      'If the imported model cannot be loaded, the project-authored roadster is used as a fail-soft visual fallback.',
    );
    note.classList.add('pause-menu-subtle-copy');
    page.append(cards, note);
  }

  #renderControls(page: HTMLElement): void {
    page.append(
      this.#sectionHeading('HOW TO DRIVE', 'Controls & Help'),
      this.#paragraph('Desktop controls and touch controls feed the same driving inputs.'),
    );
    const grid = document.createElement('div');
    grid.className = 'pause-menu-help-grid';
    this.#appendHelpCard(grid, 'KEYBOARD', [
      'W / ↑ — accelerate',
      'S / ↓ — brake and reverse',
      'A / D or ← / → — steer',
      'Space — handbrake · R — reset car',
      'C — switch camera · P or Esc — pause',
    ]);
    this.#appendHelpCard(grid, 'TOUCH', [
      'Left stick — steer',
      'Right-side pedals — gas and brake',
      'HB — handbrake',
      'Camera and reset are in the utility row',
      'Pause button stays at the upper-right',
    ]);
    this.#appendHelpCard(grid, 'GAMEPAD', [
      'Left stick — steer',
      'Right trigger — accelerate',
      'Left trigger — brake',
      'A / Cross — handbrake · Y / Triangle — reset',
      'X / Square — switch camera',
    ]);
    page.append(grid);
  }

  #sectionHeading(eyebrowText: string, titleText: string): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'pause-menu-section-heading';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'pause-menu-eyebrow';
    eyebrow.textContent = eyebrowText;
    const title = document.createElement('h2');
    title.className = 'pause-menu-section-title';
    title.textContent = titleText;
    wrapper.append(eyebrow, title);
    return wrapper;
  }

  #paragraph(text: string): HTMLParagraphElement {
    const paragraph = document.createElement('p');
    paragraph.className = 'pause-menu-copy';
    paragraph.textContent = text;
    return paragraph;
  }

  #appendStat(parent: HTMLElement, labelText: string, valueText: string): void {
    const stat = document.createElement('div');
    stat.className = 'pause-menu-stat';
    const label = document.createElement('span');
    label.textContent = labelText;
    const value = document.createElement('strong');
    value.textContent = valueText;
    stat.append(label, value);
    parent.append(stat);
  }

  #field(labelText: string, hintText: string): HTMLElement {
    const field = document.createElement('label');
    field.className = 'pause-menu-field';
    const label = document.createElement('span');
    label.className = 'pause-menu-field-label';
    label.textContent = labelText;
    const hint = document.createElement('span');
    hint.className = 'pause-menu-field-hint';
    hint.textContent = hintText;
    field.append(label, hint);
    return field;
  }

  #preferenceSelect<K extends keyof GamePreferences>(
    labelText: string,
    key: K,
    choices: readonly { readonly value: GamePreferences[K]; readonly label: string }[],
  ): HTMLElement {
    const field = this.#field(labelText, 'Saved automatically; restart to apply.');
    const select = document.createElement('select');
    select.className = 'pause-menu-select';
    select.setAttribute('aria-label', labelText);
    for (const choice of choices) {
      const option = document.createElement('option');
      option.value = String(choice.value);
      option.textContent = choice.label;
      select.append(option);
    }
    select.value = String(this.#preferences[key]);
    select.addEventListener('change', () => {
      const selected = choices.find((choice) => String(choice.value) === select.value);
      if (selected !== undefined) this.#setPreference(key, selected.value);
    });
    field.append(select);
    return field;
  }

  #appendHelpCard(parent: HTMLElement, titleText: string, rows: readonly string[]): void {
    const card = document.createElement('section');
    card.className = 'pause-menu-help-card';
    const title = document.createElement('h3');
    title.textContent = titleText;
    const list = document.createElement('ul');
    for (const row of rows) {
      const item = document.createElement('li');
      item.textContent = row;
      list.append(item);
    }
    card.append(title, list);
    parent.append(card);
  }

  #setPreference<K extends keyof GamePreferences>(key: K, value: GamePreferences[K]): void {
    if (this.#preferences[key] === value) return;
    this.#preferences = { ...this.#preferences, [key]: value };
    this.#storageAvailable = this.#options.onPreferenceChange(key, value);
    this.#updateFooter();
  }

  #isDirty(): boolean {
    return PREFERENCE_KEYS.some((key) => this.#preferences[key] !== this.#initialPreferences[key]);
  }

  #graphicsSelectionChanged(): boolean {
    return this.#preferences.graphicsTier !== this.#initialPreferences.graphicsTier;
  }

  #updateFooter(): void {
    const dirty = this.#isDirty();
    this.#applyButton.hidden = !dirty;
    this.#applyButton.disabled = !this.#storageAvailable;
    this.#footerStatus.textContent = !this.#storageAvailable
      ? 'Browser storage is unavailable; these changes cannot be saved for restart.'
      : dirty
        ? 'Options saved · restart to apply your changes.'
        : 'Drive is paused · choose Resume when you are ready.';
  }

  #applyAndRestart(): void {
    this.#root.hidden = true;
    this.#options.onRestart(this.#graphicsSelectionChanged());
  }

  #resume(): void {
    if (this.#root.hidden) return;
    this.#root.hidden = true;
    this.#triggerButton.setAttribute('aria-expanded', 'false');
    this.#triggerButton.setAttribute('aria-label', 'Open pause menu');
    this.#options.onResume();
    this.#triggerButton.focus();
  }

  #updateNav(): void {
    for (const button of this.#nav.querySelectorAll<HTMLButtonElement>('[data-menu-id]')) {
      const id = button.dataset['menuId'];
      const current = id === this.#activePage;
      button.classList.toggle('is-current', current);
      if (current) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  }

  #trapFocus(event: KeyboardEvent): void {
    const focusable = Array.from(
      this.#dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), a[href]',
      ),
    ).filter((element) => element.getClientRects().length > 0);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  #trafficLabel(intensity: TrafficIntensity): string {
    switch (intensity) {
      case 'off':
        return 'Off';
      case 'light':
        return 'Light';
      case 'standard':
        return 'Standard';
      case 'busy':
        return 'Busy';
    }
  }
}
