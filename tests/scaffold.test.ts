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

describe('initial project scaffold — not gameplay coverage', () => {
  it('uses private ESM project metadata and the selected rendering/physics stack', () => {
    const metadata = JSON.parse(read('package.json')) as ProjectMetadata;
    expect(metadata.name).toBe('endless-driver');
    expect(metadata.private).toBe(true);
    expect(metadata.type).toBe('module');
    expect(metadata.license).toBe('UNLICENSED');
    expect(metadata.dependencies['@babylonjs/core']).toBeTruthy();
    expect(metadata.dependencies['@dimforge/rapier3d-compat']).toBeTruthy();
  });

  it('tracks all required module boundaries', () => {
    const modules = [
      'app',
      'engine',
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
  });

  it('preserves the documented initial phase gate', () => {
    // Replace this scaffold-only guard with runtime lifecycle tests when Phase 1 is authorized.
    expect(read('src/main.ts').trim()).toBe("import './style.css';");
    expect(read('index.html')).not.toContain('<canvas');
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
