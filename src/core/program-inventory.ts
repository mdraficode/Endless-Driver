/**
 * The program inventory: who is making the device compile, and how many times.
 *
 * The Programs row counts the shader stages the backend has created; this module answers the
 * question the count alone cannot — WHAT is multiplying them. In the WebGPU renderer (including
 * the WebGL2 fallback the phones run) the live stage registry is `renderer._pipelines.programs`:
 * one Map per stage kind, keyed by the generated shader code string, value the ProgrammableStage
 * (full GLSL + the material name it was built for). Stages leave the map exactly when
 * `info.destroyProgram` runs, so its size equals the Programs row's number.
 *
 * An inventory groups the fragment stages by material name and extracts the features that
 * differ between a material's programs: how many point/directional/spot lights are inlined into
 * the code, clearcoat, transmission, instancing, shadows, fog. The number of DISTINCT
 * signatures inside a group matters as much as the count: 57 programs with one signature vary
 * in something the signature cannot see (e.g. uniform-slot allocation), 3 programs with 3
 * signatures vary in something it can.
 *
 * This is a read-only diagnostic: it never creates, releases or mutates anything.
 */
export interface ProgramGroup {
  /** The material name the programs were built for (empty for unnamed materials). */
  readonly name: string;
  /** Distinct fragment programs this material owns. */
  readonly count: number;
  /** The features shared by most of its programs: light counts + flags. */
  readonly signature: string;
  /** How many distinct signatures its programs split into (1 = they all match). */
  readonly signatureVariants: number;
}

export interface ProgramInventory {
  /** All live shader stages (vertex + fragment + compute), the Programs row's number. */
  readonly totalStages: number;
  /** Fragment stages among them. */
  readonly fragmentStages: number;
  /** Groups sorted by count, descending. */
  readonly groups: readonly ProgramGroup[];
}

/** One sample of a group's actual generated code, for a full report the owner can attach. */
export interface ProgramCodeSample {
  readonly name: string;
  readonly signature: string;
  /** Truncated if longer than the report's per-code budget. */
  readonly code: string;
  readonly truncated: boolean;
}

export interface ProgramReport {
  readonly totalStages: number;
  readonly fragmentStages: number;
  readonly vertexStages: number;
  readonly groups: readonly ProgramGroup[];
  readonly samples: readonly ProgramCodeSample[];
  /** Vertex stages by material name, top groups first — the vertex side of the count. */
  readonly vertexGroups: readonly ProgramVertexGroup[];
  /** Actual vertex code for the biggest vertex groups, diffable like the fragment samples. */
  readonly vertexSamples: readonly ProgramCodeSample[];
}

/** One vertex-stage group: how many distinct vertex programs a material name owns. */
export interface ProgramVertexGroup {
  readonly name: string;
  readonly count: number;
  /** Code lengths of the distinct programs (a quick fingerprint of what varies). */
  readonly codeLengths: readonly number[];
}

interface ProgrammableStageLike {
  readonly stage?: string;
  readonly code?: string;
  readonly name?: string;
}

/** The Pipelines stage registry: one Map per stage kind, code string → stage. */
interface PipelinePrograms {
  readonly vertex?: unknown;
  readonly fragment?: unknown;
  readonly compute?: unknown;
}

const mapSize = (candidate: unknown): number =>
  candidate !== null &&
  typeof candidate === 'object' &&
  typeof (candidate as { size?: unknown }).size === 'number'
    ? (candidate as { size: number }).size
    : 0;

const countMatches = (code: string, pattern: RegExp): number => (code.match(pattern) ?? []).length;

/**
 * The features that differ between programs of the same material — the signature a fix can be
 * aimed at. `pl`/`dl`/`sl` are the inlined light-call counts: in this renderer the lights are
 * baked into the generated code, so a material drawn under different light sets owns one program
 * per set.
 */
export function fragmentSignature(code: string): string {
  const parts: string[] = [];
  const pl = countMatches(code, /directPointLight\(|pointLightData|POINT_LIGHT/g);
  const dl = countMatches(code, /directDirectionalLight\(|directionalLightData|DIRECTIONAL_LIGHT/g);
  const sl = countMatches(code, /directSpotLight\(|spotLightData|SPOT_LIGHT/g);
  if (pl > 0) parts.push(`pl${pl}`);
  if (dl > 0) parts.push(`dl${dl}`);
  if (sl > 0) parts.push(`sl${sl}`);
  if (/clearcoat/i.test(code)) parts.push('cc');
  if (/transmission/i.test(code)) parts.push('tr');
  if (/instanceMatrix/.test(code)) parts.push('inst');
  if (/shadow/i.test(code)) parts.push('sh');
  if (/\bfog\b/i.test(code)) parts.push('fog');
  if (/envMap|envBrdf|irradiance|IBL/i.test(code)) parts.push('env');
  if (/normalMap/i.test(code)) parts.push('nm');
  if (/\bdiscard\b/.test(code)) parts.push('at');
  return parts.length > 0 ? parts.join('·') : 'plain';
}

const SUMMARY_GROUP_LIMIT = 12;
const REPORT_GROUP_LIMIT = 200;
const SAMPLE_GROUPS = 6;
const SAMPLES_PER_GROUP = 2;
const SAMPLE_CODE_BUDGET = 20_000;
const VERTEX_GROUP_LIMIT = 30;
const VERTEX_SAMPLE_GROUPS = 4;
const VERTEX_SAMPLE_CODE_BUDGET = 12_000;

/**
 * The raw walk of the stage registry, kept separate so the summary and the full report share
 * one traversal.
 */
function walkStageRegistry(pipelines: unknown): {
  totalStages: number;
  fragmentStages: number;
  vertexStages: number;
  byName: Map<string, Map<string, ProgrammableStageLike[]>>; // name -> signature -> stages
  vertexByName: Map<string, ProgrammableStageLike[]>; // name -> stages
} | null {
  if (pipelines === null || typeof pipelines !== 'object') {
    return null;
  }
  const programs = (pipelines as { programs?: unknown }).programs;
  if (programs === null || typeof programs !== 'object') {
    return null;
  }
  const registry = programs as PipelinePrograms;
  const fragmentMap = registry.fragment;
  if (
    fragmentMap === null ||
    typeof fragmentMap !== 'object' ||
    typeof (fragmentMap as { values?: unknown }).values !== 'function'
  ) {
    return null;
  }

  const vertexMap = registry.vertex;
  const computeStages = mapSize(registry.compute);
  const byName = new Map<string, Map<string, ProgrammableStageLike[]>>();
  const vertexByName = new Map<string, ProgrammableStageLike[]>();
  let fragmentStages = 0;
  let vertexStages = 0;
  for (const stage of (fragmentMap as { values(): Iterable<ProgrammableStageLike> }).values()) {
    if (stage === null || typeof stage !== 'object' || typeof stage.code !== 'string') {
      continue;
    }
    fragmentStages += 1;
    const name = stage.name ?? '';
    const signature = fragmentSignature(stage.code);
    const signatures = byName.get(name) ?? new Map<string, ProgrammableStageLike[]>();
    const stages = signatures.get(signature) ?? [];
    stages.push(stage);
    signatures.set(signature, stages);
    byName.set(name, signatures);
  }
  if (
    vertexMap !== null &&
    typeof vertexMap === 'object' &&
    typeof (vertexMap as { values?: unknown }).values === 'function'
  ) {
    for (const stage of (vertexMap as { values(): Iterable<ProgrammableStageLike> }).values()) {
      if (stage === null || typeof stage !== 'object' || typeof stage.code !== 'string') {
        continue;
      }
      vertexStages += 1;
      const name = stage.name ?? '';
      const stages = vertexByName.get(name) ?? [];
      stages.push(stage);
      vertexByName.set(name, stages);
    }
  }

  const totalStages = vertexStages + fragmentStages + computeStages;
  if (totalStages === 0) {
    return null;
  }
  return { totalStages, fragmentStages, vertexStages, byName, vertexByName };
}

function toGroups(
  byName: Map<string, Map<string, ProgrammableStageLike[]>>,
  limit: number,
): ProgramGroup[] {
  const groups: ProgramGroup[] = [];
  for (const [name, signatures] of byName) {
    let count = 0;
    let topSignature = 'plain';
    let topCount = -1;
    for (const [signature, stages] of signatures) {
      count += stages.length;
      if (stages.length > topCount) {
        topCount = stages.length;
        topSignature = signature;
      }
    }
    groups.push({ name, count, signature: topSignature, signatureVariants: signatures.size });
  }
  groups.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return groups.slice(0, limit);
}

/**
 * The summary (the diagnostics Programs row): top groups with counts and dominant signatures.
 * `null` when the renderer does not expose the registry (e.g. the classic backend).
 */
export function analyzeProgramInventory(pipelines: unknown): ProgramInventory | null {
  const walk = walkStageRegistry(pipelines);
  if (walk === null) {
    return null;
  }
  return {
    totalStages: walk.totalStages,
    fragmentStages: walk.fragmentStages,
    groups: toGroups(walk.byName, SUMMARY_GROUP_LIMIT),
  };
}

/**
 * The full report for a downloadable file: every group (bounded) plus samples of the actual
 * generated code for the biggest groups — one per distinct signature, up to two, each
 * truncated to the per-code budget. The samples are what settle questions the counts cannot:
 * two "identical" programs side by side show exactly what varies between them.
 */
export function buildProgramReport(pipelines: unknown): ProgramReport | null {
  const walk = walkStageRegistry(pipelines);
  if (walk === null) {
    return null;
  }
  const groups = toGroups(walk.byName, REPORT_GROUP_LIMIT);

  const samples: ProgramCodeSample[] = [];
  for (const group of groups.slice(0, SAMPLE_GROUPS)) {
    const signatures = walk.byName.get(group.name);
    if (signatures === undefined) {
      continue;
    }
    // One code per distinct signature (the visible differences), most numerous first.
    const bySize = [...signatures.entries()].sort((a, b) => b[1].length - a[1].length);
    const picked: Array<{ signature: string; stage: ProgrammableStageLike }> = [];
    for (const [signature, stages] of bySize.slice(0, SAMPLES_PER_GROUP)) {
      const first = stages[0];
      if (first !== undefined) {
        picked.push({ signature, stage: first });
      }
    }
    // A single-signature group with several codes (e.g. 57 programs that all "look" the same)
    // varies in something the signature cannot see — a second code makes the difference
    // diffable.
    if (picked.length === 1) {
      const dominant = bySize[0];
      const second = dominant === undefined ? undefined : dominant[1][1];
      if (dominant !== undefined && second !== undefined) {
        picked.push({ signature: dominant[0], stage: second });
      }
    }
    for (const { signature, stage } of picked) {
      const code = stage.code as string;
      const truncated = code.length > SAMPLE_CODE_BUDGET;
      samples.push({
        name: group.name,
        signature,
        code: truncated ? code.slice(0, SAMPLE_CODE_BUDGET) : code,
        truncated,
      });
    }
  }

  // The vertex side: groups by name (every vertex program a material owns) + samples for the
  // biggest groups. Registry entries are already distinct code strings, so two samples from a
  // group are two genuinely different vertex programs — diffing them shows what varies
  // (instancing, attributes, uniform-slot allocation).
  const vertexGroups: ProgramVertexGroup[] = [];
  for (const [name, stages] of walk.vertexByName) {
    vertexGroups.push({
      name,
      count: stages.length,
      codeLengths: stages
        .map((stage) => stage.code?.length ?? 0)
        .sort((a, b) => b - a)
        .slice(0, 8),
    });
  }
  vertexGroups.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const vertexSamples: ProgramCodeSample[] = [];
  for (const group of vertexGroups.slice(0, VERTEX_SAMPLE_GROUPS)) {
    const stages = (walk.vertexByName.get(group.name) ?? [])
      .slice()
      .sort((a, b) => (b.code?.length ?? 0) - (a.code?.length ?? 0));
    for (const stage of stages.slice(0, SAMPLES_PER_GROUP)) {
      const code = stage.code ?? '';
      const truncated = code.length > VERTEX_SAMPLE_CODE_BUDGET;
      vertexSamples.push({
        name: group.name,
        signature: `len${code.length}`,
        code: truncated ? code.slice(0, VERTEX_SAMPLE_CODE_BUDGET) : code,
        truncated,
      });
    }
  }

  return {
    totalStages: walk.totalStages,
    fragmentStages: walk.fragmentStages,
    vertexStages: walk.vertexStages,
    groups,
    samples,
    vertexGroups: vertexGroups.slice(0, VERTEX_GROUP_LIMIT),
    vertexSamples,
  };
}

const formatGroup = (group: ProgramGroup): string => {
  const name = group.name || '(unnamed)';
  const variants = group.signatureVariants > 1 ? ` ×${group.signatureVariants}sig` : '';
  return `${group.count}× ${name} [${group.signature}]${variants}`;
};

/**
 * The compact form for the diagnostics row: total, then the top groups with their counts —
 * "742 · 57× ShadowMaterial [sh] ×57sig · 10× (unnamed) [sh·env] ×10sig · …". The `×Nsig`
 * suffix is the multiplier's fingerprint: many programs with one signature vary in something
 * invisible (uniform allocation), many with many signatures vary in the features themselves.
 */
export function formatProgramInventory(inventory: ProgramInventory | null): string {
  if (inventory === null) {
    return 'n/a';
  }
  const parts = inventory.groups.slice(0, SUMMARY_GROUP_LIMIT).map(formatGroup);
  return parts.length > 0
    ? `${inventory.totalStages} · ${parts.join(' · ')}`
    : `${inventory.totalStages}`;
}
