/**
 * Vitest setup — runs before every test file.  Registers jest-dom matchers
 * (`.toBeInTheDocument()`, `.toHaveTextContent()`, etc.) and polyfills
 * `matchMedia` / `IntersectionObserver` (jsdom doesn't implement them).
 */
import '@testing-library/jest-dom/vitest';

// matchMedia polyfill (jsdom doesn't implement it).
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // deprecated but some libs still call it
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// IntersectionObserver polyfill (jsdom doesn't implement it).
class MockIntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: number[] = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});
