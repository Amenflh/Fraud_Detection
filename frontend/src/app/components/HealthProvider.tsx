"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

import { getHealth } from "../lib/api";
import { usePolling } from "../lib/hooks";
import { HealthStatus } from "../lib/types";

type HealthContextValue = {
  health: HealthStatus | null;
  online: boolean | null;
  latencyMs: number | null;
  checkedAt: number | null;
};

const HealthContext = createContext<HealthContextValue>({
  health: null,
  online: null,
  latencyMs: null,
  checkedAt: null,
});

/** Polls the public /health endpoint once for the whole app (header + footer share it). */
export function HealthProvider({ children }: { children: ReactNode }) {
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const startedRef = useRef(0);

  const fetcher = useCallback(async () => {
    startedRef.current = performance.now();
    const health = await getHealth();
    setLatencyMs(Math.round(performance.now() - startedRef.current));
    return health;
  }, []);

  const { data, error, updatedAt, isLoading } = usePolling(fetcher, { intervalMs: 20000 });
  const online = data === null && isLoading ? null : !error;

  return (
    <HealthContext.Provider value={{ health: data, online, latencyMs, checkedAt: updatedAt }}>
      {children}
    </HealthContext.Provider>
  );
}

export function useHealth() {
  return useContext(HealthContext);
}
