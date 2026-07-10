import {useEffect, useRef, type MutableRefObject} from 'react';

/**
 * Keeps WebGL-only motion in step with the CSS reduced-motion mode without
 * forcing React to re-render the scene when the operating-system setting
 * changes.
 */
export function useReducedMotionRef(): MutableRefObject<boolean> {
  const reducedMotion = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      reducedMotion.current = query.matches;
    };
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  return reducedMotion;
}
