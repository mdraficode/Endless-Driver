import { describe, expect, it } from 'vitest';
import {
  analyzeProgramInventory,
  fragmentSignature,
  formatProgramInventory,
} from '../../src/core/program-inventory';

interface FakeStage {
  readonly stage: string;
  readonly code: string;
  readonly name: string;
}

const vertex = (name: string): FakeStage => ({
  stage: 'vertex',
  code: `void main_vertex() { gl_Position = vec4(instanceMatrix * modelViewMatrix * position); }`,
  name,
});
const fragment = (name: string, code: string): FakeStage => ({
  stage: 'fragment',
  code,
  name,
});

/** The fake of renderer.info.memoryMap: Map<stage, bytes>. */
const memoryMapOf = (...stages: FakeStage[]): Map<FakeStage, number> =>
  stages.reduce((map, stage) => map.set(stage, stage.code.length), new Map<FakeStage, number>());

describe('fragmentSignature', () => {
  it('counts the inlined point lights', () => {
    expect(fragmentSignature('directPointLight(a); directPointLight(b);')).toBe('pl2');
  });

  it('counts point and directional lights together', () => {
    expect(fragmentSignature('directPointLight(x) directDirectionalLight(y)')).toBe('pl1·dl1');
  });

  it('extracts the feature flags in a stable order', () => {
    expect(fragmentSignature('clearcoat instanceMatrix fog envMap discard')).toBe(
      'cc·inst·fog·env·at',
    );
  });

  it('returns plain for code with none of the markers', () => {
    expect(fragmentSignature('void main() { gl_FragColor = vec4(1.0); }')).toBe('plain');
  });
});

describe('analyzeProgramInventory', () => {
  it('groups fragment stages by material name and keeps the dominant signature', () => {
    const facadeA = fragment(
      'aohara-facade',
      'directPointLight(a); directPointLight(b); clearcoat envMap',
    );
    const facadeB = fragment(
      'aohara-facade',
      'directPointLight(a); directPointLight(b); directPointLight(c); directPointLight(d); clearcoat',
    );
    const car = fragment('traffic-body', 'directPointLight(p) clearcoat');
    const map = memoryMapOf(
      facadeA,
      facadeB,
      vertex('aohara-facade'),
      vertex('aohara-facade'),
      vertex('traffic-body'),
      car,
    );

    const inventory = analyzeProgramInventory(map);
    expect(inventory).not.toBeNull();
    expect(inventory?.totalStages).toBe(6);
    expect(inventory?.fragmentStages).toBe(3);
    expect(inventory?.groups).toEqual([
      { name: 'aohara-facade', count: 2, signature: 'pl2·cc·env' },
      { name: 'traffic-body', count: 1, signature: 'pl1·cc' },
    ]);
  });

  it('returns null when the backend exposes no stage map', () => {
    expect(analyzeProgramInventory(null)).toBeNull();
    expect(analyzeProgramInventory(42)).toBeNull();
    expect(analyzeProgramInventory({})).toBeNull();
    expect(analyzeProgramInventory(new Map())).toBeNull();
  });
});

describe('formatProgramInventory', () => {
  it('formats total plus the top three groups', () => {
    const inventory = analyzeProgramInventory(
      memoryMapOf(
        fragment('a', 'directPointLight(x) clearcoat envMap'),
        fragment('a', 'directPointLight(x) clearcoat envMap'),
        fragment('b', 'directPointLight(x) directPointLight(y)'),
      ),
    );
    expect(formatProgramInventory(inventory)).toBe('3 · 2× a [pl1·cc·env] · 1× b [pl2]');
  });

  it('says n/a for a missing inventory', () => {
    expect(formatProgramInventory(null)).toBe('n/a');
  });
});
