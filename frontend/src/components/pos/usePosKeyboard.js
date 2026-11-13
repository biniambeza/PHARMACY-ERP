// Keyboard helpers for the POS: hardware barcode scanner (#3) and shortcuts (#29).
import { useEffect, useRef } from 'react';

const isEditable = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

const modalOpen = () => Boolean(document.querySelector('[data-pos-modal="true"]'));

/**
 * USB/Bluetooth scanners type the code very fast and end with Enter. Keystrokes typed
 * into other inputs are ignored (the search box handles its own Enter); everything else
 * is buffered and, when it arrives fast enough, reported as a scan.
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
    const onKeyDown = (e) => {
      if (modalOpen()) return;
      if (isEditable(e.target)) {
        buffer = '';
        return;
      }
      const now = Date.now();
      if (e.key === 'Enter') {
        const fast = buffer.length >= minLength && now - last < 120 && (last - first) / Math.max(1, buffer.length - 1) < maxGapMs;
        if (fast) {
          e.preventDefault();
          const code = buffer;
          buffer = '';
          cb.current?.(code);
        }
        buffer = '';
        return;
      }
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      if (now - last > maxGapMs * 3) {
        buffer = '';
        first = now;
      }
      buffer += e.key;
      last = now;
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
