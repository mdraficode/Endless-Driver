interface LegacyFullscreenDocument extends Document {
  readonly webkitFullscreenElement?: Element | null;
}

interface LegacyFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

const gestureRequestByEvent = new WeakMap<Event, Promise<boolean>>();

/** Attempt native landscape lock after fullscreen entry; unsupported/denied locks are harmless. */
function requestLandscapeLockBestEffort(documentRef: Document): void {
  const screen = documentRef.defaultView?.screen as
    | (Screen & {
        readonly orientation?: { lock?: (orientation: string) => Promise<void> };
      })
    | undefined;
  const orientation = screen?.orientation;
  if (typeof orientation?.lock !== 'function') return;
  try {
    void orientation.lock('landscape').catch(() => undefined);
  } catch {
    // Browser gesture policy, OS settings, and unsupported devices keep the page fallback.
  }
}

function getActiveFullscreenElement(documentRef: Document): Element | null {
  const legacyDocument = documentRef as LegacyFullscreenDocument;
  return documentRef.fullscreenElement ?? legacyDocument.webkitFullscreenElement ?? null;
}

/** Best-effort fullscreen request plus a native landscape-lock attempt where supported. */
export function requestFullscreenBestEffort(
  documentRef: Document = document,
  gestureEvent?: Event,
): Promise<boolean> {
  if (getActiveFullscreenElement(documentRef) !== null) {
    requestLandscapeLockBestEffort(documentRef);
    return Promise.resolve(true);
  }

  if (gestureEvent !== undefined) {
    const pending = gestureRequestByEvent.get(gestureEvent);
    if (pending !== undefined) {
      return pending;
    }
  }

  const root = documentRef.documentElement as LegacyFullscreenElement;
  let request: Promise<void> | void;
  try {
    if (typeof root.requestFullscreen === 'function') {
      request = root.requestFullscreen({ navigationUI: 'hide' });
    } else if (typeof root.webkitRequestFullscreen === 'function') {
      request = root.webkitRequestFullscreen();
    } else {
      return Promise.resolve(false);
    }
  } catch {
    return Promise.resolve(false);
  }

  const attempt = Promise.resolve(request)
    .then(() => {
      // Do not disarm gesture retries merely because a legacy or browser-specific API resolved;
      // confirm that the browser actually exposed an active fullscreen element first.
      if (getActiveFullscreenElement(documentRef) === null) return false;
      requestLandscapeLockBestEffort(documentRef);
      return true;
    })
    .catch(() => false);
  if (gestureEvent !== undefined) {
    const event = gestureEvent;
    gestureRequestByEvent.set(event, attempt);
    void attempt.then(() => {
      if (gestureRequestByEvent.get(event) === attempt) {
        gestureRequestByEvent.delete(event);
      }
    });
  }
  return attempt;
}

/**
 * Attempts fullscreen when a game session starts, then retries on activation-capable page input if
 * the browser rejected startup. Mouse input uses click rather than pointerdown so the request is
 * made on the completed activation; touch and pen prefer pointerup, with click as a fallback.
 * Successful entry also requests landscape orientation where native screen-orientation locking is
 * supported. Gesture listeners stay dormant while fullscreen is active and re-arm after an exit, so
 * the exit gesture itself is not intercepted but a later page interaction can retry.
 */
export class FullscreenOnStart {
  readonly #document: Document;
  readonly #hasPointerEvents: boolean;
  #listenersAttached = false;
  #disposed = false;

  readonly #handleGesture = (event: Event): void => {
    void this.request(event);
  };

  readonly #handlePointerUp = (event: Event): void => {
    if ((event as PointerEvent).pointerType !== 'mouse') {
      this.#handleGesture(event);
    }
  };

  readonly #handleClick = (event: Event): void => {
    // Retry for pointer clicks as well as keyboard/screen-reader clicks if earlier activation failed.
    this.#handleGesture(event);
  };

  readonly #handleFullscreenChange = (): void => {
    if (getActiveFullscreenElement(this.#document) === null) {
      // Keep the next real page interaction eligible after a browser or user exits fullscreen.
      this.#attachListeners();
    }
  };

  constructor(documentRef: Document = document) {
    this.#document = documentRef;
    const view = documentRef.defaultView;
    this.#hasPointerEvents = view !== null && 'PointerEvent' in view;
    this.#document.addEventListener('fullscreenchange', this.#handleFullscreenChange);
    this.#document.addEventListener('webkitfullscreenchange', this.#handleFullscreenChange);
    this.#attachListeners();
  }

  /** Retry fullscreen on a game start or from a trusted user-activation event. */
  request(event?: Event): Promise<boolean> {
    if (this.#disposed) {
      return Promise.resolve(false);
    }
    const attempt = requestFullscreenBestEffort(this.#document, event);
    void attempt.then((entered) => {
      if (entered) {
        this.#removeListeners();
      } else if (event === undefined) {
        // A later in-page restart should get the same silent gesture fallback if it was exited.
        this.#attachListeners();
      }
    });
    return attempt;
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#document.removeEventListener('fullscreenchange', this.#handleFullscreenChange);
    this.#document.removeEventListener('webkitfullscreenchange', this.#handleFullscreenChange);
    this.#removeListeners();
  }

  #attachListeners(): void {
    if (this.#disposed || this.#listenersAttached) {
      return;
    }
    this.#listenersAttached = true;
    if (this.#hasPointerEvents) {
      this.#document.addEventListener('pointerup', this.#handlePointerUp, {
        capture: true,
        passive: true,
      });
    } else {
      this.#document.addEventListener('touchend', this.#handleGesture, {
        capture: true,
        passive: true,
      });
    }
    this.#document.addEventListener('click', this.#handleClick, true);
    this.#document.addEventListener('keydown', this.#handleGesture, true);
  }

  #removeListeners(): void {
    if (!this.#listenersAttached) {
      return;
    }
    this.#listenersAttached = false;
    if (this.#hasPointerEvents) {
      this.#document.removeEventListener('pointerup', this.#handlePointerUp, true);
    } else {
      this.#document.removeEventListener('touchend', this.#handleGesture, true);
    }
    this.#document.removeEventListener('click', this.#handleClick, true);
    this.#document.removeEventListener('keydown', this.#handleGesture, true);
  }
}
