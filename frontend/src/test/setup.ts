import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// jsdom implements neither Element.scrollTo nor ResizeObserver. Components that
// keep a list pinned to the newest item or refit on resize are correct in a
// browser and would otherwise throw here, so provide inert stand-ins.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

if (!('ResizeObserver' in globalThis)) {
  class NoopResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = NoopResizeObserver;
}
