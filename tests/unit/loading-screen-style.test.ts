import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const ACTIVE_TRACK_SELECTORS =
  String.raw`\.loading-screen\[data-progress-phase='animating'\]\s+\.loading-progress-track,\s*` +
  String.raw`\.loading-screen\[data-progress-phase='finalizing'\]\s+\.loading-progress-track,\s*` +
  String.raw`\.loading-screen\[data-progress-phase='waiting'\]\s+\.loading-progress-track`;
const ACTIVE_TRACK_AFTER_SELECTORS =
  String.raw`\.loading-screen\[data-progress-phase='animating'\]\s+\.loading-progress-track::after,\s*` +
  String.raw`\.loading-screen\[data-progress-phase='finalizing'\]\s+\.loading-progress-track::after,\s*` +
  String.raw`\.loading-screen\[data-progress-phase='waiting'\]\s+\.loading-progress-track::after`;
const ACTIVE_FILL_SELECTORS =
  String.raw`\.loading-screen\[data-progress-phase='animating'\]\s+\.loading-progress-fill,\s*` +
  String.raw`\.loading-screen\[data-progress-phase='finalizing'\]\s+\.loading-progress-fill,\s*` +
  String.raw`\.loading-screen\[data-progress-phase='waiting'\]\s+\.loading-progress-fill`;

describe('loading progress breathing style', () => {
  it('keeps the bar glow alive: static paint plus compositor-only opacity animation', async () => {
    const css = await readFile(new URL('../../src/style.css', import.meta.url), 'utf8');

    const rule = (selector: string, inCss = css): string =>
      inCss.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    // Keyframes end at the first top-level `}` (inner stops are indented).
    const keyframes = (name: string): string => {
      const start = css.indexOf(`@keyframes ${name} {`);
      if (start < 0) return '';
      const end = css.indexOf('\n}', start);
      return end < 0 ? css.slice(start) : css.slice(start, end + 2);
    };

    const reducedMotionStart = css.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(reducedMotionStart).toBeGreaterThanOrEqual(0);
    const reducedMotionEnd = css.indexOf('@media', reducedMotionStart + 10);
    const reducedMotionCss = css.slice(reducedMotionStart, reducedMotionEnd);

    // The track outline keeps its approved border/background/glow pulse.
    expect(rule(ACTIVE_TRACK_SELECTORS)).toMatch(
      /animation:\s*loading-progress-track-breathe\s+3\.2s\s+ease-in-out\s+infinite;/,
    );
    expect(keyframes('loading-progress-track-breathe')).toMatch(
      /50%\s*\{[^}]*border-color:\s*rgb\(84 224 199 \/ 100%\);/,
    );
    expect(rule(ACTIVE_TRACK_SELECTORS, reducedMotionCss)).toMatch(
      /animation:\s*loading-progress-track-breathe-reduced\s+5\.4s\s+ease-in-out\s+infinite;/,
    );
    expect(keyframes('loading-progress-track-breathe-reduced')).toMatch(
      /50%\s*\{[^}]*border-color:\s*rgb\(84 224 199 \/ 90%\);/,
    );
    expect(rule('\\.loading-progress-track::before', reducedMotionCss)).toMatch(
      /animation:\s*loading-progress-glow-reduced\s+5\.4s\s+ease-in-out\s+infinite;/,
    );
    expect(keyframes('loading-progress-glow-reduced')).toMatch(/50%\s*\{[^}]*opacity:\s*0\.82;/);

    // The fill's glow is static paint on the fill itself, so the bar is never unglowed.
    expect(rule('\\.loading-progress-fill')).toMatch(
      /box-shadow:\s*0 0 24px rgb\(84 224 199 \/ 70%\);/,
    );

    // The extra glow is a width-mirrored layer on the track (its width follows the fill via
    // --loading-fill-width, which the JS keeps in sync with the bar width).
    const fillGlowLayer = rule('\\.loading-progress-track::after');
    expect(fillGlowLayer).toMatch(/width:\s*var\(--loading-fill-width, 0%\);/);
    expect(fillGlowLayer).toMatch(/box-shadow:\s*0 0 34px 4px rgb\(84 224 199 \/ 90%\);/);
    expect(fillGlowLayer).toMatch(/opacity:\s*0\.35;/);

    // Animations modulate opacity only: box-shadow and filter are painted statically, never
    // animated. This is what survived the owner-reported glow loss after the auto-fullscreen
    // transition (animated shadow/filter layers get dropped when the compositor re-rasterises).
    const fillBreathe = keyframes('loading-progress-breathe');
    expect(fillBreathe).toMatch(/0%,\s*100%\s*\{[^}]*opacity:\s*0\.55;/);
    expect(fillBreathe).toMatch(/50%\s*\{[^}]*opacity:\s*1;/);
    expect(fillBreathe).not.toMatch(/filter:|box-shadow:/);

    const fillGlow = keyframes('loading-progress-fill-glow');
    expect(fillGlow).toMatch(/0%,\s*100%\s*\{[^}]*opacity:\s*0\.12;/);
    expect(fillGlow).toMatch(/50%\s*\{[^}]*opacity:\s*1;/);
    expect(fillGlow).not.toMatch(/filter:|box-shadow:/);

    expect(rule(ACTIVE_FILL_SELECTORS)).toMatch(
      /animation:\s*loading-progress-breathe\s+3\.2s\s+ease-in-out\s+infinite;/,
    );
    expect(rule(ACTIVE_TRACK_AFTER_SELECTORS)).toMatch(
      /animation:\s*loading-progress-fill-glow\s+3\.2s\s+ease-in-out\s+infinite;/,
    );

    // Reduced motion gets the same contract with gentler ranges.
    expect(rule(ACTIVE_FILL_SELECTORS, reducedMotionCss)).toMatch(
      /animation:\s*loading-progress-breathe-reduced\s+5\.4s\s+ease-in-out\s+infinite;/,
    );
    const reducedBreathe = keyframes('loading-progress-breathe-reduced');
    expect(reducedBreathe).toMatch(/0%,\s*100%\s*\{[^}]*opacity:\s*0\.7;/);
    expect(reducedBreathe).toMatch(/50%\s*\{[^}]*opacity:\s*1;/);
    expect(reducedBreathe).not.toMatch(/filter:|box-shadow:/);
    expect(rule('\\.loading-progress-track::after', reducedMotionCss)).toMatch(
      /animation:\s*loading-progress-fill-glow-reduced\s+5\.4s\s+ease-in-out\s+infinite;/,
    );
    const reducedGlow = keyframes('loading-progress-fill-glow-reduced');
    expect(reducedGlow).toMatch(/0%,\s*100%\s*\{[^}]*opacity:\s*0\.3;/);
    expect(reducedGlow).toMatch(/50%\s*\{[^}]*opacity:\s*0\.85;/);
    expect(reducedGlow).not.toMatch(/filter:|box-shadow:/);

    // The error state keeps the same static-paint glow in red.
    expect(rule("\\.loading-screen\\[data-state='error'\\] \\.loading-progress-fill")).toMatch(
      /box-shadow:\s*0 0 24px rgb\(248 113 113 \/ 70%\);/,
    );
    expect(
      rule("\\.loading-screen\\[data-state='error'\\] \\.loading-progress-track::after"),
    ).toMatch(/box-shadow:\s*0 0 34px 4px rgb\(248 113 113 \/ 90%\);/);
  });
});
