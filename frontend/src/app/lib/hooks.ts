"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Fetches on mount, then every `intervalMs` while the tab is visible (and on `refreshOn` events). */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  { intervalMs, enabled = true, refreshOn }: { intervalMs: number; enabled?: boolean; refreshOn?: string }
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const fetcherRef = useRef(fetcher);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await fetcherRef.current());
      setError(null);
      setUpdatedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, state set after await
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (!document.hidden) refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, refresh]);

  useEffect(() => {
    if (!refreshOn) return;
    window.addEventListener(refreshOn, refresh);
    return () => window.removeEventListener(refreshOn, refresh);
  }, [refreshOn, refresh]);

  return { data, error, isLoading, updatedAt, refresh };
}

/** Eases from the previous value to `target` (easeOutCubic). */
export function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const v = from + (target - from) * (1 - Math.pow(1 - t, 3));
      fromRef.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}

/** Current time, ticking every `intervalMs`; null until mounted (avoids hydration mismatches). */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    const first = setTimeout(update, 0);
    const id = setInterval(update, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [intervalMs]);
  return now;
}

export function timeAgo(timestamp: number | null, now: Date | null): string {
  if (!timestamp || !now) return "—";
  const s = Math.max(0, Math.round((now.getTime() - timestamp) / 1000));
  if (s < 5) return "à l'instant";
  if (s < 60) return `il y a ${s} s`;
  return `il y a ${Math.floor(s / 60)} min`;
}
