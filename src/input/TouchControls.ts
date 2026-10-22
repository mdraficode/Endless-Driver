import { TOUCH_CONTROL_CONFIG } from '../config/input';
import { joystickSteer, TouchStateTracker, type TouchDriveState } from './touch-state';

export type TouchCommand = 'reset' | 'toggleCamera' | 'toggleDiagnostics' | 'toggleCredits';

export interface TouchControlsOptions {
  /** Called with the aggregated driving state whenever any thumb moves. */
  readonly onState: (state: TouchDriveState) => void;
  /** Called when an on-screen utility button is tapped. */
  readonly onCommand: (command: TouchCommand) => void;
  /**
   * Show regardless of pointer detection (captures, kiosk, explicit `?touch=1`).
   * Normally the surface only appears on coarse-pointer/touch devices.
   */
  readonly force?: boolean;
}

/**
 * The on-screen driving surface for phones and tablets.
 *
 * Layout is landscape-first racing-game standard: a steering joystick under the left
 * thumb, BRAKE/GAS pedals under the right, handbrake above the brake, and small
 * credits/diagnostics/camera/reset/fullscreen buttons top-right. Every control tracks its own pointer ids
 * (multi-touch is the whole point: steer and accelerate at the same time), all state
 * funnels through `TouchStateTracker`, and the surface publishes into the same
 * `InputManager` seam the keyboard uses — the car cannot tell thumbs from keys.
 *
 * Visibility: rendered only when the device reports a coarse pointer (or `force`),
 * and a `touch-enabled` class on <body> lets CSS show the rotate-to-landscape prompt
 * in portrait. Fullscreen + orientation lock is attempted on the first touch and from
 * the ⛶ button; where the platform refuses (iOS Safari), the portrait prompt is the
 * fallback, never an error.
 */
export class TouchControls {
  readonly #root: HTMLElement;

  readonly #tracker = new TouchStateTracker();

  readonly #options: TouchControlsOptions;

  #joystickPointer: { id: number; centreX: number; centreY: number } | null = null;

  #orientationAttempted = false;

  #disposed = false;

  readonly #windowListeners: (() => void)[] = [];

  constructor(root: HTMLElement, options: TouchControlsOptions) {
    this.#root = root;
    this.#options = options;
    if (!options.force && !TouchControls.#deviceWantsTouch()) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    root.classList.add('touch-controls');
    document.body.classList.add('touch-enabled');
    this.#build();
  }

  static #deviceWantsTouch(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    return (
      window.matchMedia?.('(pointer: coarse)').matches === true ||
      'ontouchstart' in window ||
      (navigator?.maxTouchPoints ?? 0) > 0
    );
  }

  /**
   * Asks the platform for fullscreen landscape. Must be called from a user gesture;
   * every failure is swallowed — unsupported platforms keep the CSS portrait prompt.
   */
  static async requestLandscape(): Promise<void> {
    try {
      const element = document.documentElement as HTMLElement & {
        requestFullscreen?: () => Promise<void>;
      };
      if (document.fullscreenElement === null && element.requestFullscreen !== undefined) {
        await element.requestFullscreen();
      }
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (orientation: string) => Promise<void>;
      };
      await orientation.lock?.('landscape');
    } catch {
      // iOS Safari and friends: the rotate prompt carries the message instead.
    }
  }

  dispose(): void {
    this.#disposed = true;
    for (const remove of this.#windowListeners) {
      remove();
    }
    this.#windowListeners.length = 0;
    this.#tracker.releaseAll();
    this.#emit();
    this.#root.replaceChildren();
    this.#root.classList.remove('touch-controls');
    document.body.classList.remove('touch-enabled');
  }

  #emit(): void {
    if (!this.#disposed) {
      this.#options.onState(this.#tracker.snapshot());
    }
  }

  #build(): void {
    const make = (className: string, label: string, ariaLabel: string): HTMLButtonElement => {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = className;
      element.textContent = label;
      element.setAttribute('aria-label', ariaLabel);
      element.addEventListener('contextmenu', (event) => event.preventDefault());
      return element;
    };

    // --- Steering joystick (left thumb) ---
    const joystick = document.createElement('div');
    joystick.className = 'touch-joystick';
    joystick.setAttribute('role', 'application');
    joystick.setAttribute('aria-label', 'Steering joystick');
    const knob = document.createElement('div');
    knob.className = 'touch-joystick-knob';
    joystick.append(knob);
    const radius = TOUCH_CONTROL_CONFIG.joystickRadiusPx;

    const updateJoystick = (event: PointerEvent): void => {
      if (this.#joystickPointer === null) {
        return;
      }
      const steer = joystickSteer(
        event.clientX - this.#joystickPointer.centreX,
        radius,
        TOUCH_CONTROL_CONFIG.joystickDeadzone,
      );
      this.#tracker.setJoystick(event.pointerId, steer);
      knob.style.transform = `translate(${steer * radius * 0.62}px, 0px)`;
      this.#emit();
    };
    joystick.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.#maybeLockLandscape();
      const rect = joystick.getBoundingClientRect();
      this.#joystickPointer = {
        id: event.pointerId,
        centreX: rect.left + rect.width / 2,
        centreY: rect.top + rect.height / 2,
      };
      joystick.setPointerCapture?.(event.pointerId);
      joystick.classList.add('is-active');
      updateJoystick(event);
    });
    joystick.addEventListener('pointermove', (event) => {
      if (this.#joystickPointer?.id === event.pointerId) {
        updateJoystick(event);
      }
    });
    const releaseJoystick = (event: PointerEvent): void => {
      if (this.#joystickPointer?.id !== event.pointerId) {
        return;
      }
      this.#joystickPointer = null;
      this.#tracker.releaseJoystick(event.pointerId);
      knob.style.transform = 'translate(0px, 0px)';
      joystick.classList.remove('is-active');
      this.#emit();
    };
    joystick.addEventListener('pointerup', releaseJoystick);
    joystick.addEventListener('pointercancel', releaseJoystick);

    // --- Pedals (right thumb / index) ---
    const pedal = (
      className: string,
      label: string,
      control: 'throttle' | 'brake' | 'handbrake',
    ): HTMLButtonElement => {
      const element = make(className, label, label);
      element.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        this.#maybeLockLandscape();
        element.setPointerCapture?.(event.pointerId);
        element.classList.add('is-active');
        this.#tracker.setPressed(control, event.pointerId, true);
        this.#emit();
      });
      const release = (event: PointerEvent): void => {
        element.classList.remove('is-active');
        this.#tracker.setPressed(control, event.pointerId, false);
        this.#emit();
      };
      element.addEventListener('pointerup', release);
      element.addEventListener('pointercancel', release);
      element.addEventListener('lostpointercapture', release);
      return element;
    };

    const pedals = document.createElement('div');
    pedals.className = 'touch-pedals';
    pedals.append(
      pedal('touch-pedal touch-pedal-brake', 'BRAKE', 'brake'),
      pedal('touch-pedal touch-pedal-gas', 'GAS', 'throttle'),
    );
    const handbrake = pedal('touch-handbrake', 'HB', 'handbrake');

    // --- Utility buttons (top-right) ---
    const utilities = document.createElement('div');
    utilities.className = 'touch-utilities';
    const creditsButton = make('touch-utility', '©', 'Open asset credits');
    creditsButton.addEventListener('click', () => {
      creditsButton.blur();
      this.#options.onCommand('toggleCredits');
    });
    const diagnosticsButton = make('touch-utility', '📊', 'Toggle diagnostics');
    diagnosticsButton.addEventListener('click', () => {
      diagnosticsButton.blur();
      this.#options.onCommand('toggleDiagnostics');
    });
    const cameraButton = make('touch-utility', '📷', 'Toggle camera');
    cameraButton.addEventListener('click', () => {
      cameraButton.blur();
      this.#options.onCommand('toggleCamera');
    });
    const resetButton = make('touch-utility', '↺', 'Reset car');
    resetButton.addEventListener('click', () => {
      resetButton.blur();
      this.#options.onCommand('reset');
    });
    const fullscreenButton = make('touch-utility', '⛶', 'Fullscreen landscape');
    fullscreenButton.addEventListener('click', () => {
      fullscreenButton.blur();
      void TouchControls.requestLandscape();
    });
    utilities.append(creditsButton, diagnosticsButton, cameraButton, resetButton, fullscreenButton);

    this.#root.append(joystick, handbrake, pedals, utilities);

    // Release safety net: if an element ever misses its pointerup (capture quirks,
    // browser gesture interruptions), the window still hears the thumb lift and no
    // pedal can stick on. Element handlers run first; releasing twice is harmless.
    const releasePointer = (event: PointerEvent): void => {
      this.#tracker.setPressed('throttle', event.pointerId, false);
      this.#tracker.setPressed('brake', event.pointerId, false);
      this.#tracker.setPressed('handbrake', event.pointerId, false);
      this.#tracker.releaseJoystick(event.pointerId);
      if (this.#joystickPointer?.id === event.pointerId) {
        this.#joystickPointer = null;
        knob.style.transform = 'translate(0px, 0px)';
      }
      for (const element of this.#root.querySelectorAll('.is-active')) {
        element.classList.remove('is-active');
      }
      this.#emit();
    };
    window.addEventListener('pointerup', releasePointer);
    window.addEventListener('pointercancel', releasePointer);
    this.#windowListeners.push(() => {
      window.removeEventListener('pointerup', releasePointer);
      window.removeEventListener('pointercancel', releasePointer);
    });
    // A hidden tab must never resume with a pedal held down.
    const releaseWhenHidden = (): void => {
      if (document.hidden) {
        this.#joystickPointer = null;
        this.#tracker.releaseAll();
        knob.style.transform = 'translate(0px, 0px)';
        this.#emit();
      }
    };
    document.addEventListener('visibilitychange', releaseWhenHidden);
    this.#windowListeners.push(() => {
      document.removeEventListener('visibilitychange', releaseWhenHidden);
    });
  }

  #maybeLockLandscape(): void {
    if (this.#orientationAttempted) {
      return;
    }
    this.#orientationAttempted = true;
    // Only worth asking when the player is actually holding the phone sideways-wrong;
    // in landscape already, fullscreen alone would be a surprise. Best effort either way.
    if (window.innerHeight > window.innerWidth) {
      void TouchControls.requestLandscape();
    }
  }
}
