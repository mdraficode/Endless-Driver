/**
 * The program inventory: who is making the device compile, and how many times.
 *
 * The Programs row counts the shader stages the backend has created; this module answers the
 * question the count alone cannot — WHAT is multiplying them. The backend keeps every live
 * programmable stage (the full generated GLSL plus the material name it was built for) in
 * `renderer.info.memoryMap`, so an inventory groups the fragment stages by material name and
 * extracts the features that differ between a material's programs: how many point/directional/
 * spot lights are inlined into the code, clearcoat, transmission, instancing, shadows, fog.
 *
 * On the owner's phone (WebGL2 fallback, 742 stages) the top groups are the fix list: a material
 * with 40 programs where one would do is a context multiplying it (usually the light set inlined
 * per code, or instanced vs plain rendering of the same material).
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
}

export interface ProgramInventory {
  /** All live shader stages (vertex + fragment), the Programs row's number. */
  readonly totalStages: number;
  /** Fragment stages among them. */
  readonly fragmentStages: number;
  /** Groups sorted by count, descending. */
  readonly groups: readonly ProgramGroup[];
}

interface ProgrammableStageLike {
  readonly stage?: string;
  readonly code?: string;
  readonly name?: string;
}

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

/**
 * Groups the live fragment stages by material name. `memoryMap` is the renderer Info's internal
 * `Map<ProgrammableStage, bytes>` — an engine detail this module tolerates rather than types,
 * because the fallback backend does not publish it as API.
 */
export function analyzeProgramInventory(memoryMap: unknown): ProgramInventory | null {
  if (memoryMap === null || typeof memoryMap !== 'object') {
    return null;
  }
  const map = memoryMap as { keys?: () => Iterable<ProgrammableStageLike> };
  if (typeof map.keys !== 'function') {
    return null;
  }

  const byName = new Map<string, Map<string, number>>(); // name -> signature -> count
  let totalStages = 0;
  let fragmentStages = 0;
  for (const stage of map.keys()) {
    if (stage === null || typeof stage !== 'object') {
      continue;
    }
    totalStages += 1;
    if (stage.stage !== 'fragment' || typeof stage.code !== 'string') {
      continue;
    }
    fragmentStages += 1;
    const name = stage.name ?? '';
    const signature = fragmentSignature(stage.code);
    const signatures = byName.get(name) ?? new Map<string, number>();
    signatures.set(signature, (signatures.get(signature) ?? 0) + 1);
    byName.set(name, signatures);
  }

  if (totalStages === 0) {
    return null;
  }

  const groups: ProgramGroup[] = [];
  for (const [name, signatures] of byName) {
    let count = 0;
    let topSignature = 'plain';
    let topCount = -1;
    for (const [signature, signatureCount] of signatures) {
      count += signatureCount;
      if (signatureCount > topCount) {
        topCount = signatureCount;
        topSignature = signature;
      }
    }
    groups.push({ name, count, signature: topSignature });
  }
  groups.sort((a, b) => b.count - a.count);
  return {
    totalStages,
    fragmentStages,
    groups: groups.slice(0, 24),
  };
}

/**
 * The compact form for the diagnostics row: total, then the top groups with their counts —
 * "742 · 42× aohara-facade [pl2·cc·env·sh] · 28× traffic-body [pl4·env·cc]".
 */
export function formatProgramInventory(inventory: ProgramInventory | null): string {
  if (inventory === null) {
    return 'n/a';
  }
  const parts = inventory.groups
    .slice(0, 3)
    .map((group) => `${group.count}× ${group.name || '(unnamed)'} [${group.signature}]`);
  return parts.length > 0
    ? `${inventory.totalStages} · ${parts.join(' · ')}`
    : `${inventory.totalStages}`;
}
