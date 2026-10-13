import './style.css';
import { Application, type ApplicationOptions } from './core/Application';
import { RENDER_CONFIG } from './config/render';
import type { DiagnosticsSnapshot } from './ui/DiagnosticsOverlay';

export interface EndlessDriverDebugHandle {
  getDiagnostics(): DiagnosticsSnapshot;
  pause(): void;
  resume(): void;
}

declare global {
  interface Window {
    __ENDLESS_DRIVER__?: EndlessDriverDebugHandle;
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#viewport-canvas');
const overlayRoot = document.querySelector<HTMLElement>('#diagnostics-overlay');
const statusElement = document.querySelector<HTMLElement>('#scene-status');

function reportStartupFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  if (statusElement) {
    statusElement.textContent = `Unable to start the 3D scene: ${message}`;
    statusElement.dataset['tone'] = 'error';
  }
  console.error('Endless Driver failed to start.', error);
}

function isDebugEnabled(): boolean {
  if (!RENDER_CONFIG.diagnostics.exposeDebugHandle) {
    return false;
  }
  return import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug');
}

function start(): void {
  if (!canvas) {
    reportStartupFailure(new Error('missing #viewport-canvas element'));
    return;
  }

  const options: ApplicationOptions = {
    canvas,
    overlayRoot,
    statusElement,
    config: RENDER_CONFIG,
  };

  let application: Application;
  try {
    application = new Application(options);
    application.start();
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
        application.start();
      },
    };
  }
}

start();
