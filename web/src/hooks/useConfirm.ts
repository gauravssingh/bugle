import { useState, useRef, useEffect, useCallback } from "react";

/**
 * Two-step confirmation hook for destructive operations.
 * First click arms the action; second click within timeout executes.
 */
export function useConfirm<T = string>(timeoutMs: number = 2500) {
  const [armedId, setArmedId] = useState<T | null>(null);
  const timerRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setArmedId(null);
  }, []);

  const trigger = useCallback(
    (id: T, onConfirmed: () => void | Promise<void>) => {
      if (armedId === id) {
        reset();
        void onConfirmed();
      } else {
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
        }
        setArmedId(id);
        timerRef.current = window.setTimeout(() => {
          setArmedId((curr) => (curr === id ? null : curr));
          timerRef.current = null;
        }, timeoutMs);
      }
    },
    [armedId, timeoutMs, reset]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    armedId,
    isArmed: (id: T) => armedId === id,
    trigger,
    reset,
  };
}
