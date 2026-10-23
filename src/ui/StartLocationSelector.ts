import type { SpawnPoint } from '../config/spawns';

/** Builds a reload URL that preserves debug/render switches while selecting a start point. */
export function urlForSpawn(currentHref: string, spawnId: string, defaultSpawnId: string): string {
  const url = new URL(currentHref);
  if (spawnId === defaultSpawnId) {
    url.searchParams.delete('spawn');
  } else {
    url.searchParams.set('spawn', spawnId);
  }
  return url.toString();
}

/**
 * Accessible start-location picker. Choosing a location reloads the page with the existing
 * query switches intact; the game still auto-starts as soon as the chosen scene is ready.
 */
export class StartLocationSelector {
  readonly #select: HTMLSelectElement;
  readonly #defaultSpawnId: string;
  readonly #points: readonly SpawnPoint[];
  readonly #onChange = (): void => {
    const spawnId = this.#select.value;
    if (spawnId !== 'random' && !this.#points.some((point) => point.id === spawnId)) {
      return;
    }
    window.location.assign(urlForSpawn(window.location.href, spawnId, this.#defaultSpawnId));
  };

  constructor(select: HTMLSelectElement, points: readonly SpawnPoint[], defaultSpawnId: string) {
    this.#select = select;
    this.#points = points;
    this.#defaultSpawnId = defaultSpawnId;

    const defaultPoint = points.find((point) => point.id === defaultSpawnId);
    const preferredIds = [defaultSpawnId, 'hinode-touge'];
    const orderedPoints = [
      ...preferredIds
        .map((id) => points.find((point) => point.id === id))
        .filter((point): point is SpawnPoint => point !== undefined),
      ...points.filter((point) => !preferredIds.includes(point.id)),
    ];
    const options = orderedPoints.map((point) => {
      const option = document.createElement('option');
      option.value = point.id;
      option.textContent = point.label;
      return option;
    });
    const randomOption = document.createElement('option');
    randomOption.value = 'random';
    randomOption.textContent = 'Random district';
    options.splice(defaultPoint === undefined ? 0 : 1, 0, randomOption);
    select.replaceChildren(...options);

    const requested = new URLSearchParams(window.location.search).get('spawn');
    const valid = requested === 'random' || points.some((point) => point.id === requested);
    select.value = valid ? requested! : defaultSpawnId;
    select.addEventListener('change', this.#onChange);
  }

  dispose(): void {
    this.#select.removeEventListener('change', this.#onChange);
  }
}
