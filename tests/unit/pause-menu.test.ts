import { describe, expect, it } from 'vitest';
import {
  PAUSE_MENU_ITEMS,
  RESTART_REQUIRED_PREFERENCE_KEYS,
  WEATHER_CHOICES,
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
