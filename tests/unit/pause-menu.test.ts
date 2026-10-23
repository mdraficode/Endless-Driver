import { describe, expect, it } from 'vitest';
import { PAUSE_MENU_ITEMS } from '../../src/ui/PauseMenu';

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
