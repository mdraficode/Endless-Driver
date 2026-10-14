#!/usr/bin/env node
/**
 * Guard: no classic GLSL material APIs may be added to `src/`.
 *
 * ADR 0004 moved the project to `WebGPURenderer` with TSL node materials. `ShaderMaterial`,
 * `RawShaderMaterial`, and `onBeforeCompile`/`customProgramCacheKey` patches do not run on the WebGPU
 * backend, so allowing them back in would silently fork the rendering path. This check makes that
 * impossible to do by accident; the Phase 3 migration removed the last of them.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const FORBIDDEN = [
  ['ShaderMaterial', /\bShaderMaterial\b/],
  ['RawShaderMaterial', /\bRawShaderMaterial\b/],
  ['onBeforeCompile', /\bonBeforeCompile\b/],
  ['glsl template tag', /\/\* glsl \*\//],
];

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      yield path;
    }
  }
}

const problems = [];
for await (const file of walk(SRC)) {
  const text = await readFile(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    for (const [label, pattern] of FORBIDDEN) {
      if (pattern.test(line)) {
        problems.push(`${relative(ROOT, file)}:${index + 1} uses ${label}: ${line.trim()}`);
      }
    }
  });
}

if (problems.length > 0) {
  console.error('GLSL material guard failed — use TSL node materials instead (ADR 0004):');
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

console.log('GLSL material guard passed: src/ contains no ShaderMaterial, RawShaderMaterial, or onBeforeCompile');
