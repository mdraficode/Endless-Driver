import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, root), 'utf8');

interface ProjectMetadata {
  name: string;
  private: boolean;
  type: string;
  license: string;
  dependencies: Record<string, string>;
}

interface AssetManifest {
  schemaVersion: number;
  assets: unknown[];
}

describe('project scaffold — infrastructure, not gameplay coverage', () => {
  it('uses private ESM project metadata and the selected rendering/physics stack', () => {
    const metadata = JSON.parse(read('package.json')) as ProjectMetadata;
    expect(metadata.name).toBe('endless-driver');
    expect(metadata.private).toBe(true);
    expect(metadata.type).toBe('module');
    expect(metadata.license).toBe('UNLICENSED');
    expect(metadata.dependencies['three']).toBeTruthy();
    expect(metadata.dependencies['@dimforge/rapier3d-compat']).toBeTruthy();
    expect(metadata.dependencies['@babylonjs/core']).toBeUndefined();
  });

  it('tracks the module boundaries required by the plan', () => {
    const modules = [
      'core',
      'physics',
      'world',
      'vehicles',
      'input',
      'cameras',
      'ui',
      'environment',
      'shaders',
      'assets',
      'config',
      'shared',
      'workers',
    ];
    for (const module of modules) {
      expect(existsSync(new URL(`src/${module}/README.md`, root))).toBe(true);
    }
    expect(existsSync(new URL('src/app', root))).toBe(false);
    expect(existsSync(new URL('src/engine', root))).toBe(false);
  });

  it('mounts the canvas and starts the composition root from the page entrypoint', () => {
    const html = read('index.html');
    expect(html).toContain('id="viewport-canvas"');
    expect(html).toContain('id="diagnostics-overlay"');
    expect(html).toContain('id="scene-status"');

    const entrypoint = read('src/main.ts');
    expect(entrypoint).toContain("import './style.css'");
    expect(entrypoint).toContain('new Application(');
  });

  it('includes the plan and session-continuity instructions', () => {
    const documents = [
      'AGENTS.md',
      'PROJECT_PLAN.md',
      'README.md',
      'docs/ARCHITECTURE.md',
      'docs/SESSION_HANDOFF.md',
      'docs/GIT_WORKFLOW.md',
      'docs/ASSET_POLICY.md',
      'docs/decisions/0002-renderer-three-js.md',
    ];
    for (const document of documents) {
      expect(existsSync(new URL(document, root))).toBe(true);
    }
  });

  it('provides a versioned asset manifest without assuming assets are already supplied', () => {
    const manifest = JSON.parse(read('public/assets/manifest.json')) as AssetManifest;
    expect(manifest.schemaVersion).toBe(1);
    expect(Array.isArray(manifest.assets)).toBe(true);
  });
});
