"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  STUDIO_PRIMARY_SERVICE_KEYS,
  STUDIO_PRIMARY_SERVICES,
  type StudioPrimaryServiceKey,
} from "../../lib/studio/service-registry";

const storageKey = "justurban-wears:studio-service-order:v3";
const legacyStorageKey = "justurban-wears:studio-service-order:v2";
const changeEvent = "justurban-wears:studio-service-order";

function normalizeOrder(value: unknown): StudioPrimaryServiceKey[] {
  const supplied = Array.isArray(value) ? value : [];
  const valid = supplied.filter((key): key is StudioPrimaryServiceKey => (
    typeof key === "string" && STUDIO_PRIMARY_SERVICE_KEYS.includes(key as StudioPrimaryServiceKey)
  ));
  const unique = [...new Set(valid)];
  return [...unique, ...STUDIO_PRIMARY_SERVICE_KEYS.filter((key) => !unique.includes(key))];
}

function readOrder() {
  try {
    const stored = window.localStorage.getItem(storageKey) ?? window.localStorage.getItem(legacyStorageKey);
    return normalizeOrder(JSON.parse(stored ?? "null"));
  } catch {
    return [...STUDIO_PRIMARY_SERVICE_KEYS];
  }
}

function persistOrder(order: StudioPrimaryServiceKey[]) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(order));
  } catch {
    // The current mounted session still retains the chosen order.
  }
  window.dispatchEvent(new Event(changeEvent));
}

export function useStudioServiceOrder() {
  const [order, setOrder] = useState<StudioPrimaryServiceKey[]>([...STUDIO_PRIMARY_SERVICE_KEYS]);

  useEffect(() => {
    const sync = () => setOrder(readOrder());
    const frame = window.requestAnimationFrame(sync);
    window.addEventListener("storage", sync);
    window.addEventListener(changeEvent, sync);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("storage", sync);
      window.removeEventListener(changeEvent, sync);
    };
  }, []);

  const moveService = useCallback((key: StudioPrimaryServiceKey, direction: -1 | 1) => {
    const current = readOrder();
    const index = current.indexOf(key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return;
    const next = [...current];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    persistOrder(next);
  }, []);

  const resetServiceOrder = useCallback(() => {
    const next = [...STUDIO_PRIMARY_SERVICE_KEYS];
    setOrder(next);
    persistOrder(next);
  }, []);

  const orderedServices = useMemo(() => order.map((key) => (
    STUDIO_PRIMARY_SERVICES.find((service) => service.key === key)
  )).filter((service): service is (typeof STUDIO_PRIMARY_SERVICES)[number] => Boolean(service)), [order]);

  return { moveService, order, orderedServices, resetServiceOrder };
}
