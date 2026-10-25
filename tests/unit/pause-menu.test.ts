import { describe, expect, it } from 'vitest';
import {
  PAUSE_MENU_ITEMS,
  RESTART_REQUIRED_PREFERENCE_KEYS,
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
