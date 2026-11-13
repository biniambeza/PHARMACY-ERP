// Keyboard helpers for the POS: hardware barcode scanner (#3) and shortcuts (#29).
import { useEffect, useRef } from 'react';

const isEditable = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

const modalOpen = () => Boolean(document.querySelector('[data-pos-modal="true"]'));

// Numeric fields (cart quantity, payment amounts, discount): a scan while one has focus must
// not end up in its value.
const isNumericInput = (el) =>
  Boolean(el) &&
  el.tagName === 'INPUT' &&
  (el.type === 'number' || el.inputMode === 'numeric' || el.inputMode === 'decimal' || el.dataset?.posNumeric === 'true');

// Sets a React-controlled input's value and fires its onChange.
const restoreInputValue = (el, value) => {
  try {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } catch {
    // input gone (re-rendered): nothing to restore
  }
};

/**
 * USB/Bluetooth scanners type the code very fast and end with Enter. Keystrokes typed
 * into text inputs are ignored (the search box handles its own Enter); everything else
 * is buffered and, when it arrives fast enough, reported as a scan.
 * In a numeric input (quantity, amount) a fast burst ending with Enter is a scan too: it is
 * reported as such and the input gets back the value it had before the burst.
 */
export const useBarcodeScanner = (onScan, { minLength = 4, maxGapMs = 50 } = {}) => {
  const cb = useRef(onScan);
  useEffect(() => {
    cb.current = onScan;
  }, [onScan]);

  useEffect(() => {
    let buffer = '';
    let last = 0;
    let first = 0;
    let target = null; // numeric input the current burst is typed into (null = no input)
    let before = ''; // its value before the burst
    const onKeyDown = (e) => {
      if (modalOpen()) return;
      const numeric = isNumericInput(e.target);
      if (isEditable(e.target) && !numeric) {
        buffer = '';
        return;
      }
      const now = Date.now();
      if (e.key === 'Enter') {
        const fast =
          buffer.length >= minLength &&
          now - last < 120 &&
          (last - first) / Math.max(1, buffer.length - 1) < maxGapMs &&
          (numeric ? target === e.target : target === null);
        if (fast) {
          e.preventDefault();
          // Keep the input's own Enter handler (e.g. blur = commit quantity) from running
          if (numeric) e.stopPropagation();
          const code = buffer;
          const el = target;
          const prev = before;
          buffer = '';
          target = null;
          if (el) restoreInputValue(el, prev);
          cb.current?.(code);
        }
        buffer = '';
        target = null;
        return;
      }
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      const newTarget = numeric ? e.target : null;
      if (now - last > maxGapMs * 3 || newTarget !== target) {
        buffer = '';
        first = now;
        target = newTarget;
        // keydown fires before the character is inserted: this is the value to restore
        before = numeric ? e.target.value : '';
      }
      buffer += e.key;
      last = now;
    };
    // Capture phase: runs before the focused input's own key handlers
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [minLength, maxGapMs]);
};

/**
 * POS shortcuts: F2 search, F4 quantity, F9 checkout, Esc clear.
 * handlers: { onSearch, onQuantity, onCheckout, onEscape }
 */
export const usePosShortcuts = (handlers) => {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  }, [handlers]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (modalOpen()) return;
      const h = ref.current || {};
      if (e.key === 'F2') {
        e.preventDefault();
        h.onSearch?.();
      } else if (e.key === 'F4') {
        e.preventDefault();
        h.onQuantity?.();
      } else if (e.key === 'F9') {
        e.preventDefault();
        h.onCheckout?.();
      } else if (e.key === 'Escape') {
        if (isEditable(e.target)) {
          e.target.blur();
          return;
        }
        h.onEscape?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
};
