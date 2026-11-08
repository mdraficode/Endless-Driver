import { describe, expect, it } from 'vitest';
import { SEASONS } from '../../src/environment/seasons';
import {
  PAUSE_MENU_ITEMS,
  RESTART_REQUIRED_PREFERENCE_KEYS,
  SEASON_LABELS,
  WEATHER_CHOICES,
  WORLD_SEASON_CHOICE,
} from '../../src/ui/PauseMenu';

describe('pause menu navigation model', () => {
  it('keeps resume/restart first, all requested customization pages together, and credits last', () => {
    expect(PAUSE_MENU_ITEMS.map((item) => item.id)).toEqual([
      'resume',
      'restart',
      'overview',
      'spawn',
      'gameplay',
      'graphics',
      'vehicle',
      'controls',
      'credits',
    ]);
    expect(PAUSE_MENU_ITEMS.at(-1)).toMatchObject({ id: 'credits', kind: 'credits' });
  });
});

describe('pause menu live car selection', () => {
  it('does not require a full renderer restart for a car-model change', () => {
    expect(RESTART_REQUIRED_PREFERENCE_KEYS).not.toContain('carModel');
    expect(RESTART_REQUIRED_PREFERENCE_KEYS).toContain('graphicsTier');
  });
});

describe('pause menu weather setting', () => {
  it('names every weather condition in driving order and keeps it off the restart list', () => {
    expect(WEATHER_CHOICES.map((choice) => choice.value)).toEqual(['clear', 'rain', 'storm']);
    for (const choice of WEATHER_CHOICES) {
      expect(choice.label.length).toBeGreaterThan(0);
    }
    // Weather applies live through the dynamics ramp: it must never sit behind a restart.
    expect(RESTART_REQUIRED_PREFERENCE_KEYS).not.toContain('weather');
  });
});

describe('pause menu season switch', () => {
  it('names every season, keeps the world default as its own choice, and persists nothing', () => {
    // The panel offers the world's seeded season plus each of the four named seasons.
    expect(Object.keys(SEASON_LABELS).sort()).toEqual([...SEASONS].sort());
    for (const season of SEASONS) {
      expect(SEASON_LABELS[season].length).toBeGreaterThan(0);
    }
    // "World default" is a menu sentinel, not a season id — resolving it back to a real
    // season is the model's job (the panel maps it to the world's own season).
    expect(WORLD_SEASON_CHOICE).not.toBe(SEASONS[0]);
    expect(SEASONS).not.toContain(WORLD_SEASON_CHOICE as (typeof SEASONS)[number]);
    // A season preview is session-scoped: it is never a saved preference, so it can never
    // sit behind a restart or survive a relaunch.
    expect(RESTART_REQUIRED_PREFERENCE_KEYS).not.toContain('season');
  });
});
