import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const ACTIVE_FILL_SELECTORS =
  String.raw`\.loading-screen\[data-progress-phase='animating'\]\s+\.loading-progress-fill,\s*` +
  String.raw`\.loading-screen\[data-progress-phase='finalizing'\]\s+\.loading-progress-fill,\s*` +
  String.raw`\.loading-screen\[data-progress-phase='waiting'\]\s+\.loading-progress-fill`;

describe('loading progress breathing style', () => {
  it('gently pulses the fill during every active phase and respects reduced-motion settings', async () => {
    const css = await readFile(new URL('../../src/style.css', import.meta.url), 'utf8');
    const activeRule =
      css.match(new RegExp(`${ACTIVE_FILL_SELECTORS}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    const reducedMotionStart = css.indexOf('@media (prefers-reduced-motion: reduce)');
    const reducedMotionCss = reducedMotionStart < 0 ? '' : css.slice(reducedMotionStart);
    const reducedMotionRule =
      reducedMotionCss.match(new RegExp(`${ACTIVE_FILL_SELECTORS}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    const breatheStart = css.indexOf('@keyframes loading-progress-breathe');
    const reducedBreatheStart = css.indexOf('@keyframes loading-progress-breathe-reduced');
    const reducedBreatheEnd = css.indexOf('@keyframes loading-progress-glow', reducedBreatheStart);
    const breatheKeyframes =
      breatheStart < 0 || reducedBreatheStart < 0
        ? ''
        : css.slice(breatheStart, reducedBreatheStart);
    const reducedBreatheKeyframes =
      reducedBreatheStart < 0 || reducedBreatheEnd < 0
        ? ''
        : css.slice(reducedBreatheStart, reducedBreatheEnd);

    expect(activeRule).toMatch(
      /animation:\s*loading-progress-breathe\s+3\.2s\s+ease-in-out\s+infinite;/,
    );
    expect(breatheKeyframes).toMatch(/0%,\s*100%\s*\{[^}]*opacity:\s*0\.36;/);
    expect(breatheKeyframes).toMatch(/50%\s*\{[^}]*opacity:\s*1;/);
    expect(reducedMotionRule).toMatch(
      /animation:\s*loading-progress-breathe-reduced\s+5\.4s\s+ease-in-out\s+infinite;/,
    );
    expect(reducedBreatheKeyframes).toMatch(/0%,\s*100%\s*\{[^}]*opacity:\s*0\.62;/);
    expect(reducedBreatheKeyframes).toMatch(/50%\s*\{[^}]*opacity:\s*0\.92;/);
  });
});
