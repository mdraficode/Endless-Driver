#!/usr/bin/env node
/**
 * Guard: no classic GLSL material APIs may be added to `src/`.
 *
 * ADR 0004 moved the project to `WebGPURenderer` with TSL node materials. `ShaderMaterial`,
 * `RawShaderMaterial`, and `onBeforeCompile`/`customProgramCacheKey` patches do not run on the WebGPU
 * backend, so allowing them back in would silently fork the rendering path. This check makes that
 * impossible to do by accident; the Phase 3 migration removed the last of them.
 *
 * Comments and string literals are stripped before scanning, so documenting the ban (as the shader
 * modules do) does not trip it.
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

/**
 * Replaces comments and the contents of string/template literals with spaces, keeping every
 * newline so reported line numbers stay correct.
 */
function stripCommentsAndStrings(source) {
  const output = source.split('');
  let index = 0;
  let state = 'code';
  let quote = '';

  const blank = (from, to) => {
    for (let position = from; position < to; position += 1) {
      if (output[position] !== '\n') {
        output[position] = ' ';
      }
    }
  };

  while (index < source.length) {
    const character = source[index];
    const next = source[index + 1];

    if (state === 'code') {
      if (character === '/' && next === '/') {
        const end = source.indexOf('\n', index);
        const stop = end === -1 ? source.length : end;
        blank(index, stop);
        index = stop;
        continue;
      }
      if (character === '/' && next === '*') {
        const end = source.indexOf('*/', index + 2);
        const stop = end === -1 ? source.length : end + 2;
        blank(index, stop);
        index = stop;
        continue;
      }
      if (character === '"' || character === "'" || character === '`') {
        state = 'string';
        quote = character;
        index += 1;
        continue;
      }
    } else if (character === '\\') {
      index += 2;
      continue;
    } else if (character === quote) {
      state = 'code';
      index += 1;
      continue;
    } else {
      blank(index, index + 1);
    }

    index += 1;
  }

  return output.join('');
}

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
  const source = await readFile(file, 'utf8');
  const scanned = stripCommentsAndStrings(source);
  scanned.split('\n').forEach((line, index) => {
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

console.log(
  'GLSL material guard passed: src/ contains no ShaderMaterial, RawShaderMaterial, or onBeforeCompile',
);
