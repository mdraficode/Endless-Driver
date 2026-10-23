interface LegacyFullscreenDocument extends Document {
  readonly webkitFullscreenElement?: Element | null;
}

interface LegacyFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

const pendingGestureRequests = new WeakMap<Document, Promise<boolean>>();

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

/** Best-effort fullscreen request plus a native landscape-lock attempt where supported. */
export function requestFullscreenBestEffort(
  documentRef: Document = document,
  gestureEvent?: Event,
): Promise<boolean> {
  const legacyDocument = documentRef as LegacyFullscreenDocument;
  const activeElement =
    documentRef.fullscreenElement ?? legacyDocument.webkitFullscreenElement ?? null;
  if (activeElement !== null) {
    requestLandscapeLockBestEffort(documentRef);
    return Promise.resolve(true);
  }

  if (gestureEvent !== undefined) {
    const pending = pendingGestureRequests.get(documentRef);
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
      requestLandscapeLockBestEffort(documentRef);
      return true;
    })
    .catch(() => false);
  if (gestureEvent !== undefined) {
    pendingGestureRequests.set(documentRef, attempt);
    void attempt.then(() => {
      if (pendingGestureRequests.get(documentRef) === attempt) {
        pendingGestureRequests.delete(documentRef);
      }
    });
  }
  return attempt;
}

/**
 * Attempts fullscreen when a game session starts, then silently retries on the first trusted
 * pointer/key gesture if the browser rejected startup. Successful entry also requests landscape
 * orientation where the browser allows native screen-orientation locking.
 */
export class FullscreenOnStart {
  readonly #document: Document;
  readonly #needsTouchFallback: boolean;
  #listenersAttached = false;
  #disposed = false;

  readonly #handleGesture = (event: Event): void => {
    void this.request(event);
  };

  constructor(documentRef: Document = document) {
    this.#document = documentRef;
    const view = documentRef.defaultView;
    this.#needsTouchFallback = view === null || !('PointerEvent' in view);
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
    this.#removeListeners();
  }

  #attachListeners(): void {
    if (this.#disposed || this.#listenersAttached) {
      return;
    }
    this.#listenersAttached = true;
    this.#document.addEventListener('pointerdown', this.#handleGesture, {
      capture: true,
      passive: true,
    });
    this.#document.addEventListener('click', this.#handleGesture, true);
    this.#document.addEventListener('keydown', this.#handleGesture, true);
    if (this.#needsTouchFallback) {
      this.#document.addEventListener('touchstart', this.#handleGesture, {
        capture: true,
        passive: true,
      });
    }
  }

  #removeListeners(): void {
    if (!this.#listenersAttached) {
      return;
    }
    this.#listenersAttached = false;
    this.#document.removeEventListener('pointerdown', this.#handleGesture, true);
    this.#document.removeEventListener('click', this.#handleGesture, true);
    this.#document.removeEventListener('keydown', this.#handleGesture, true);
    if (this.#needsTouchFallback) {
      this.#document.removeEventListener('touchstart', this.#handleGesture, true);
    }
  }
}
