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

/** The fake of `renderer._pipelines`: per-kind Maps of code string → stage. */
const pipelinesOf = (entries: Array<[code: string, stage: FakeStage]>): unknown => {
  const programs: Record<'vertex' | 'fragment' | 'compute', Map<string, FakeStage>> = {
    vertex: new Map(),
    fragment: new Map(),
    compute: new Map(),
  };
  for (const [code, stage] of entries) {
    programs[stage.stage as 'vertex' | 'fragment' | 'compute'].set(code, stage);
  }
  return { programs };
};

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
    const pipelines = pipelinesOf([
      ['v1', vertex('aohara-facade')],
      ['v2', vertex('traffic-body')],
      [
        'f1',
        fragment('aohara-facade', 'directPointLight(a); directPointLight(b); clearcoat envMap'),
      ],
      [
        'f2',
        fragment(
          'aohara-facade',
          'directPointLight(a); directPointLight(b); directPointLight(c); directPointLight(d); clearcoat',
        ),
      ],
      ['f3', fragment('traffic-body', 'directPointLight(p) clearcoat')],
    ]);

    const inventory = analyzeProgramInventory(pipelines);
    expect(inventory).not.toBeNull();
    expect(inventory?.totalStages).toBe(5);
    expect(inventory?.fragmentStages).toBe(3);
    expect(inventory?.groups).toEqual([
      { name: 'aohara-facade', count: 2, signature: 'pl2·cc·env' },
      { name: 'traffic-body', count: 1, signature: 'pl1·cc' },
    ]);
  });

  it('counts vertex and compute stages in the total without grouping them', () => {
    const pipelines = pipelinesOf([
      ['v1', vertex('a')],
      ['v2', vertex('b')],
      ['c1', { stage: 'compute', code: 'cs main() {}', name: 'ao' }],
      ['f1', fragment('a', 'plain-ish code')],
    ]);
    const inventory = analyzeProgramInventory(pipelines);
    expect(inventory?.totalStages).toBe(4);
    expect(inventory?.fragmentStages).toBe(1);
    expect(inventory?.groups).toEqual([{ name: 'a', count: 1, signature: 'plain' }]);
  });

  it('returns null when the renderer does not expose the registry', () => {
    expect(analyzeProgramInventory(null)).toBeNull();
    expect(analyzeProgramInventory(42)).toBeNull();
    expect(analyzeProgramInventory({})).toBeNull();
    expect(analyzeProgramInventory({ programs: {} })).toBeNull();
    expect(analyzeProgramInventory({ programs: { fragment: new Set() } })).toBeNull();
  });
});

describe('formatProgramInventory', () => {
  it('formats total plus the top three groups', () => {
    const inventory = analyzeProgramInventory(
      pipelinesOf([
        ['v1', vertex('a')],
        ['v2', vertex('b')],
        ['v3', vertex('c')],
        ['f1', fragment('a', 'directPointLight(x) clearcoat envMap')],
        ['f2', fragment('b', 'directPointLight(x) directPointLight(y)')],
        ['f3', fragment('c', 'directPointLight(x) directPointLight(y)')],
      ]),
    );
    expect(formatProgramInventory(inventory)).toBe(
      '6 · 1× a [pl1·cc·env] · 1× b [pl2] · 1× c [pl2]',
    );
  });

  it('says n/a for a missing inventory', () => {
    expect(formatProgramInventory(null)).toBe('n/a');
  });
});
