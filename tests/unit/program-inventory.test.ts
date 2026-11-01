import { describe, expect, it } from 'vitest';
import {
  analyzeProgramInventory,
  buildProgramReport,
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
  it('groups fragment stages by material name and counts distinct signatures', () => {
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
      { name: 'aohara-facade', count: 2, signature: 'pl2·cc·env', signatureVariants: 2 },
      { name: 'traffic-body', count: 1, signature: 'pl1·cc', signatureVariants: 1 },
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
    expect(inventory?.groups).toEqual([
      { name: 'a', count: 1, signature: 'plain', signatureVariants: 1 },
    ]);
  });

  it('returns null when the renderer does not expose the registry', () => {
    expect(analyzeProgramInventory(null)).toBeNull();
    expect(analyzeProgramInventory(42)).toBeNull();
    expect(analyzeProgramInventory({})).toBeNull();
    expect(analyzeProgramInventory({ programs: {} })).toBeNull();
    expect(analyzeProgramInventory({ programs: { fragment: new Set() } })).toBeNull();
  });
});

describe('buildProgramReport', () => {
  it('lists every group and samples one code per distinct signature of the biggest groups', () => {
    const pipelines = pipelinesOf([
      ['f1', fragment('shadow', 'code A: nodeUniform0')],
      ['f2', fragment('shadow', 'code B: nodeUniform1')],
      ['f3', fragment('other', 'code C')],
      ['v1', vertex('shadow')],
    ]);

    const report = buildProgramReport(pipelines);
    // The two shadow codes differ (uniform indices) but share one signature — the
    // single-signature case the second sample exists for.
    expect(report?.groups).toEqual([
      { name: 'shadow', count: 2, signature: 'plain', signatureVariants: 1 },
      { name: 'other', count: 1, signature: 'plain', signatureVariants: 1 },
    ]);
    // shadow's two codes share one signature, so the sampler takes both (the diff is the
    // point); other contributes one.
    expect(report?.samples).toHaveLength(3);
    expect(report?.samples.map((sample) => sample.code)).toEqual([
      'code A: nodeUniform0',
      'code B: nodeUniform1',
      'code C',
    ]);
  });

  it('truncates oversized sample codes and says so', () => {
    const long = `x`.repeat(50_000);
    const report = buildProgramReport(pipelinesOf([['f1', fragment('big', long)]]));
    const sample = report?.samples[0];
    expect(sample).toBeDefined();
    expect(sample?.truncated).toBe(true);
    expect(sample?.code.length).toBe(20_000);
  });

  it('returns null when the renderer does not expose the registry', () => {
    expect(buildProgramReport(null)).toBeNull();
    expect(buildProgramReport({})).toBeNull();
  });

  it('reports the vertex stage count and groups vertex programs by material name', () => {
    const pipelines = pipelinesOf([
      ['v1', vertex('aohara-facade')],
      ['v2', { ...vertex('aohara-facade'), code: 'void main_vertex() { /* longer variant */ }' }],
      ['v3', vertex('terrain-splat-far')],
      ['f1', fragment('aohara-facade', 'plain-ish')],
    ]);
    const report = buildProgramReport(pipelines);
    expect(report?.totalStages).toBe(4);
    expect(report?.fragmentStages).toBe(1);
    expect(report?.vertexStages).toBe(3);
    expect(report?.vertexGroups).toEqual([
      { name: 'aohara-facade', count: 2, codeLengths: [87, 43] },
      { name: 'terrain-splat-far', count: 1, codeLengths: [87] },
    ]);
  });

  it('samples distinct vertex codes for the biggest vertex groups, truncated to the budget', () => {
    const long = `void main_vertex() { ${'x'.repeat(30_000)} }`;
    const pipelines = pipelinesOf([
      ['v1', { ...vertex('terrain-splat-far'), code: long }],
      ['v2', { ...vertex('terrain-splat-far'), code: 'void main_vertex() { short }' }],
      ['f1', fragment('terrain-splat-far', 'plain-ish')],
    ]);
    const report = buildProgramReport(pipelines);
    expect(report?.vertexSamples).toHaveLength(2);
    const [first, second] = report?.vertexSamples ?? [];
    expect(first?.truncated).toBe(true);
    expect(first?.code.length).toBe(12_000);
    expect(second?.truncated).toBe(false);
    // Sorted longest first, so the diff against the shorter variant is the interesting one.
    expect(first?.code.startsWith(long.slice(0, 20))).toBe(true);
  });

  it('keeps the report bounded when the vertex registry is huge', () => {
    const entries: Array<[string, FakeStage]> = [];
    for (let i = 0; i < 40; i += 1) {
      entries.push([`v${i}`, vertex(`mat-${i}`)]);
    }
    const report = buildProgramReport(pipelinesOf(entries));
    expect(report?.vertexGroups).toHaveLength(30);
    // Samples stay bounded to the biggest four groups, two codes each; these groups
    // own one code apiece, so four.
    expect(report?.vertexSamples).toHaveLength(4);
  });
});

describe('formatProgramInventory', () => {
  it('formats total plus the top groups with the signature-variant fingerprint', () => {
    const inventory = analyzeProgramInventory(
      pipelinesOf([
        ['f1', fragment('a', 'directPointLight(x) clearcoat envMap')],
        ['f2', fragment('a', 'directPointLight(x) directPointLight(y) clearcoat envMap')],
        ['f3', fragment('b', 'directPointLight(x) directPointLight(y)')],
        ['v1', vertex('a')],
      ]),
    );
    // Group a: 2 programs with 2 distinct signatures → the ×2sig suffix is what a fixer needs.
    expect(formatProgramInventory(inventory)).toBe('4 · 2× a [pl1·cc·env] ×2sig · 1× b [pl2]');
  });

  it('says n/a for a missing inventory', () => {
    expect(formatProgramInventory(null)).toBe('n/a');
  });
});
