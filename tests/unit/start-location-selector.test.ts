import { describe, expect, it } from 'vitest';

import { urlForSpawn } from '../../src/ui/StartLocationSelector';

describe('start-location selector URL', () => {
  it('switches the selected spawn without dropping render and debug query options', () => {
    expect(
      urlForSpawn(
        'https://game.example/?debug=1&backend=webgl&spawn=Kiri-cedar#drive',
        'hinode-touge',
        'aohara-city',
      ),
    ).toBe('https://game.example/?debug=1&backend=webgl&spawn=hinode-touge#drive');
  });

  it('returns the default start to the clean, unspecified URL', () => {
    expect(
      urlForSpawn('https://game.example/?spawn=hinode-touge&map=0', 'aohara-city', 'aohara-city'),
    ).toBe('https://game.example/?map=0');
  });

  it('keeps an explicit random-start choice opt-in', () => {
    expect(urlForSpawn('https://game.example/', 'random', 'aohara-city')).toBe(
      'https://game.example/?spawn=random',
    );
  });
});
