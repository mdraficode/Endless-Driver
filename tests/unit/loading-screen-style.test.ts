import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const ACTIVE_TRACK_SELECTORS =
  String.raw`\.loading-screen\[data-progress-phase='animating'\]\s+\.loading-progress-track,\s*` +
  String.raw`\.loading-screen\[data-progress-phase='finalizing'\]\s+\.loading-progress-track,\s*` +
  String.raw`\.loading-screen\[data-progress-phase='waiting'\]\s+\.loading-progress-track`;
const ACTIVE_FILL_SELECTORS =
  String.raw`\.loading-screen\[data-progress-phase='animating'\]\s+\.loading-progress-fill,\s*` +
  String.raw`\.loading-screen\[data-progress-phase='finalizing'\]\s+\.loading-progress-fill,\s*` +
  String.raw`\.loading-screen\[data-progress-phase='waiting'\]\s+\.loading-progress-fill`;

describe('loading progress breathing style', () => {
  it('visibly breathes across the full track and fill, including with reduced motion enabled', async () => {
    const css = await readFile(new URL('../../src/style.css', import.meta.url), 'utf8');
    const activeTrackRule =
      css.match(new RegExp(`${ACTIVE_TRACK_SELECTORS}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    const activeFillRule =
      css.match(new RegExp(`${ACTIVE_FILL_SELECTORS}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    const reducedMotionStart = css.indexOf('@media (prefers-reduced-motion: reduce)');
    const reducedMotionCss = reducedMotionStart < 0 ? '' : css.slice(reducedMotionStart);
    const reducedTrackRule =
      reducedMotionCss.match(new RegExp(`${ACTIVE_TRACK_SELECTORS}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    const reducedFillRule =
      reducedMotionCss.match(new RegExp(`${ACTIVE_FILL_SELECTORS}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    const reducedTrackGlowRule =
      reducedMotionCss.match(/\.loading-progress-track::before\s*\{([^}]*)\}/)?.[1] ?? '';

    const trackBreatheStart = css.indexOf('@keyframes loading-progress-track-breathe');
    const reducedTrackBreatheStart = css.indexOf(
      '@keyframes loading-progress-track-breathe-reduced',
    );
    const fillBreatheStart = css.indexOf('@keyframes loading-progress-breathe {');
    const reducedFillBreatheStart = css.indexOf('@keyframes loading-progress-breathe-reduced');
    const glowStart = css.indexOf('@keyframes loading-progress-glow');
    const reducedGlowStart = css.indexOf('@keyframes loading-progress-glow-reduced');
    const footnoteStart = css.indexOf('.loading-footnote');
    const trackBreatheKeyframes =
      trackBreatheStart < 0 || reducedTrackBreatheStart < 0
        ? ''
        : css.slice(trackBreatheStart, reducedTrackBreatheStart);
    const reducedTrackBreatheKeyframes =
      reducedTrackBreatheStart < 0 || fillBreatheStart < 0
        ? ''
        : css.slice(reducedTrackBreatheStart, fillBreatheStart);
    const fillBreatheKeyframes =
      fillBreatheStart < 0 || reducedFillBreatheStart < 0
        ? ''
        : css.slice(fillBreatheStart, reducedFillBreatheStart);
    const reducedFillBreatheKeyframes =
      reducedFillBreatheStart < 0 || glowStart < 0
        ? ''
        : css.slice(reducedFillBreatheStart, glowStart);
    const reducedGlowKeyframes =
      reducedGlowStart < 0 || footnoteStart < 0 ? '' : css.slice(reducedGlowStart, footnoteStart);

    expect(activeTrackRule).toMatch(
      /animation:\s*loading-progress-track-breathe\s+3\.2s\s+ease-in-out\s+infinite;/,
    );
    expect(trackBreatheKeyframes).toMatch(
      /50%\s*\{[^}]*border-color:\s*rgb\(84 224 199 \/ 100%\);/,
    );
    expect(activeFillRule).toMatch(
      /animation:\s*loading-progress-breathe\s+3\.2s\s+ease-in-out\s+infinite;/,
    );
    expect(fillBreatheKeyframes).toMatch(/0%,\s*100%\s*\{[^}]*opacity:\s*0\.16;/);
    expect(fillBreatheKeyframes).toMatch(/50%\s*\{[^}]*opacity:\s*1;/);
    expect(fillBreatheKeyframes).toMatch(/filter:\s*brightness\(1\.8\)/);
    expect(reducedTrackRule).toMatch(
      /animation:\s*loading-progress-track-breathe-reduced\s+5\.4s\s+ease-in-out\s+infinite;/,
    );
    expect(reducedTrackBreatheKeyframes).toMatch(
      /50%\s*\{[^}]*border-color:\s*rgb\(84 224 199 \/ 90%\);/,
    );
    expect(reducedFillRule).toMatch(
      /animation:\s*loading-progress-breathe-reduced\s+5\.4s\s+ease-in-out\s+infinite;/,
    );
    expect(reducedFillBreatheKeyframes).toMatch(/0%,\s*100%\s*\{[^}]*opacity:\s*0\.36;/);
    expect(reducedFillBreatheKeyframes).toMatch(/50%\s*\{[^}]*opacity:\s*1;/);
    expect(reducedTrackGlowRule).toMatch(
      /animation:\s*loading-progress-glow-reduced\s+5\.4s\s+ease-in-out\s+infinite;/,
    );
    expect(reducedGlowKeyframes).toMatch(/50%\s*\{[^}]*opacity:\s*0\.82;/);
  });
});
