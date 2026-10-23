import { readAssetManifest } from '../assets/AssetManifest';
import { listAssetCredits, type AssetCredit } from '../assets/AssetCredits';

/** Manifest-driven, keyboard-accessible attribution view for the running game. */
export class CreditsPanel {
  readonly #root: HTMLElement;
  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !this.#root.hidden) {
      event.preventDefault();
      this.close();
    }
  };
  #closeButton: HTMLButtonElement | null = null;
  #returnFocus: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    this.#root = root;
    this.#root.classList.add('credits-overlay');
    this.#root.hidden = true;
    this.#render([], 'Loading asset credits…');
    this.#root.addEventListener('click', (event) => {
      if (event.target === this.#root) this.close();
    });
    this.#root.addEventListener('keydown', this.#onKeyDown);
  }

  get isOpen(): boolean {
    return !this.#root.hidden;
  }

  /** Fetches the same-origin manifest; a missing credits file never blocks driving. */
  async load(): Promise<void> {
    let credits: readonly AssetCredit[];
    try {
      credits = listAssetCredits(await readAssetManifest());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('Endless Driver: asset credits could not be loaded.', error);
      this.#render([], `Credits could not be loaded: ${message}`);
      return;
    }
    this.#render(credits);
  }

  open(returnFocus: HTMLElement | null = null): void {
    this.#returnFocus = returnFocus;
    this.#root.hidden = false;
    this.#closeButton?.focus();
  }

  close(): void {
    this.#root.hidden = true;
    const returnFocus = this.#returnFocus;
    this.#returnFocus = null;
    if (returnFocus?.isConnected && returnFocus.getClientRects().length > 0) {
      returnFocus.focus();
    }
  }

  #render(credits: readonly AssetCredit[], errorMessage?: string): void {
    const dialog = document.createElement('section');
    dialog.className = 'credits-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'credits-title');

    const header = document.createElement('div');
    header.className = 'credits-header';
    const title = document.createElement('h2');
    title.id = 'credits-title';
    title.textContent = 'Asset credits';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'credits-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close asset credits');
    close.addEventListener('click', () => this.close());
    this.#closeButton = close;
    header.append(title, close);
    dialog.append(header);

    const intro = document.createElement('p');
    intro.className = 'credits-intro';
    intro.textContent = errorMessage
      ? errorMessage
      : 'Sources and licences for the assets in Endless Driver. Required CC BY attribution is shown verbatim.';
    dialog.append(intro);

    const list = document.createElement('ul');
    list.className = 'credits-list';
    for (const credit of credits) list.append(this.#createEntry(credit));
    dialog.append(list);
    this.#root.replaceChildren(dialog);
  }

  #createEntry(credit: AssetCredit): HTMLLIElement {
    const item = document.createElement('li');
    item.className = 'credits-entry';
    const name = document.createElement('h3');
    name.textContent = credit.name;
    const byline = document.createElement('p');
    byline.className = 'credits-byline';
    byline.textContent = `${credit.creator} · ${credit.licence}`;
    item.append(name, byline);

    const links = document.createElement('div');
    links.className = 'credits-links';
    this.#appendLink(links, 'Source', credit.sourceUrl);
    if (credit.licenceUrl !== null) this.#appendLink(links, 'Licence', credit.licenceUrl);
    item.append(links);

    if (credit.requiredAttribution !== null) {
      const label = document.createElement('p');
      label.className = 'credits-required-label';
      label.textContent = 'Required attribution';
      const attribution = document.createElement('p');
      attribution.className = 'credits-attribution';
      attribution.textContent = credit.requiredAttribution;
      item.append(label, attribution);
    }

    if (credit.files.length > 0) {
      const files = document.createElement('p');
      files.className = 'credits-files';
      files.textContent = `Used file${credit.files.length === 1 ? '' : 's'}: ${credit.files.join(', ')}`;
      item.append(files);
    }
    return item;
  }

  #appendLink(parent: HTMLElement, label: string, target: string): void {
    if (!target.startsWith('https://')) return;
    const link = document.createElement('a');
    link.href = target;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    parent.append(link);
  }
}
