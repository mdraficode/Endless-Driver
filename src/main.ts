import './style.css';
import { Application, type ApplicationOptions } from './core/Application';
import { RENDER_CONFIG } from './config/render';
import { WORLD_CONFIG } from './config/world';
import { loadRapier } from './physics/RapierModule';
import {
  applyBackendOverride,
  applyTier,
  describeTierDetail,
  readBackendRequest,
  readTierRequest,
  resolveTier,
  type TierEnvironment,
} from './core/QualityTier';
import type { DiagnosticsSnapshot } from './ui/DiagnosticsOverlay';

export interface EndlessDriverDebugHandle {
  getDiagnostics(): DiagnosticsSnapshot;
  pause(): void;
  resume(): void;
}

/**
 * Describes the device for tier selection.
 *
 * Every signal is optional at runtime — `deviceMemory` is non-standard and absent in several
 * browsers — so the defaults are deliberately conservative rather than optimistic.
 */
function probeEnvironment(): TierEnvironment {
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  const coarsePointer =
    typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)').matches : false;
  const mobileAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  return {
    requested: readTierRequest(window.location.search),
    isMobile: coarsePointer || mobileAgent,
    viewportWidth: window.innerWidth,
    hardwareConcurrency: navigator.hardwareConcurrency ?? CONSTRAINED_CORES_FALLBACK,
    deviceMemory: navigatorWithMemory.deviceMemory ?? null,
  };
}

/** Used when the browser does not report a core count; treats the device as low-end. */
const CONSTRAINED_CORES_FALLBACK = 4;

declare global {
  interface Window {
    __ENDLESS_DRIVER__?: EndlessDriverDebugHandle;
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#viewport-canvas');
const overlayRoot = document.querySelector<HTMLElement>('#diagnostics-overlay');
const statusElement = document.querySelector<HTMLElement>('#scene-status');

function setStatus(message: string | null, tone: 'info' | 'error' = 'info'): void {
  if (!statusElement) {
    return;
  }
  statusElement.textContent = message ?? '';
  statusElement.dataset['tone'] = tone;
}

function reportStartupFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  setStatus(`Unable to start the 3D scene: ${message}`, 'error');
  console.error('Endless Driver failed to start.', error);
}

function isDebugEnabled(): boolean {
  if (!RENDER_CONFIG.diagnostics.exposeDebugHandle) {
    return false;
  }
  return import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
}

async function start(): Promise<void> {
  if (!canvas) {
    reportStartupFailure(new Error('missing #viewport-canvas element'));
    return;
  }

  setStatus('Loading physics engine…', 'info');

  let application: Application;
  try {
    // Two async preconditions before the first frame: Rapier ships as WebAssembly and has to
    // initialise before the vehicle can be wired, and `WebGPURenderer` builds its device and
    // backend asynchronously. `start()` awaits the renderer and the environment HDRI.
    const rapier = await loadRapier();

    // Tier selection happens before the renderer exists: it decides the backend preference, pixel
    // ratio cap, shadow budget, and which backdrop is used.
    const tier = resolveTier(probeEnvironment());
    const backendPreference = readBackendRequest(window.location.search);
    const config = applyBackendOverride(applyTier(RENDER_CONFIG, tier.id), backendPreference);
    console.info(
      `Endless Driver: ${describeTierDetail(tier)}` +
        (backendPreference === null ? '' : `, backend forced to ${backendPreference}`),
    );

    const options: ApplicationOptions = {
      canvas,
      rapier,
      overlayRoot,
      statusElement,
      config,
      worldConfig: WORLD_CONFIG,
      tier,
    };

    application = new Application(options);
    await application.start();
  } catch (error) {
    reportStartupFailure(error);
    return;
  }

  if (isDebugEnabled()) {
    window.__ENDLESS_DRIVER__ = {
      getDiagnostics: () => application.getDiagnostics(),
      pause: () => {
        application.stop();
      },
      resume: () => {
        void application.start();
      },
    };
  }
}

void start();
