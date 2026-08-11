"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type {
  BagItem,
  ShopCheckoutRequest,
  ShopCheckoutSaveResult,
  ShopNotificationPreference,
} from "../../lib/shop/domain/entities";
import {
  commerceReducer,
  selectCommerceLifecycle,
  selectCommerceSnapshot,
} from "../../lib/shop/machines/commerce-machine";
import { createInitialCommerceState } from "../../lib/shop/domain/state";
import type { CommerceService } from "../../lib/shop/services/contracts";

export function useCommerceMachine(service: CommerceService) {
  const [state, dispatch] = useReducer(
    commerceReducer,
    service.listProducts(),
    createInitialCommerceState,
  );
  const stateRef = useRef(state);
  const persistedRevisionRef = useRef(0);
  const checkoutSaveRef = useRef<Promise<ShopCheckoutSaveResult> | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let active = true;
    dispatch({ type: "HYDRATION_REQUESTED" });
    dispatch({
      type: "CONNECTIVITY_CHANGED",
      connectivity: service.readConnectivity(),
    });

    const stopStateSync = service.subscribe((snapshot) => {
      if (active) dispatch({ type: "EXTERNAL_STATE_RECEIVED", snapshot });
    });
    const stopConnectivitySync = service.subscribeConnectivity((connectivity) => {
      if (active) dispatch({ type: "CONNECTIVITY_CHANGED", connectivity });
    });
    const stopCatalogSync = service.subscribeCatalog((products) => {
      if (active) dispatch({ type: "CATALOG_RECEIVED", products });
    });

    void service.hydrateCatalog()
      .then((products) => {
        if (active) dispatch({ type: "CATALOG_RECEIVED", products });
        return service.hydrate();
      })
      .then((snapshot) => {
        if (active) dispatch({ type: "HYDRATION_SUCCEEDED", snapshot });
      })
      .catch(() => {
        if (active) dispatch({ type: "HYDRATION_FAILED" });
      });

    return () => {
      active = false;
      stopStateSync();
      stopConnectivitySync();
      stopCatalogSync();
    };
  }, [service]);

  useEffect(() => {
    if (
      state.hydration === "idle"
      || state.hydration === "restoring"
      || state.persistenceRevision <= persistedRevisionRef.current
    ) {
      return;
    }

    persistedRevisionRef.current = state.persistenceRevision;
    void service.persist(selectCommerceSnapshot(state)).catch(() => {
      dispatch({ type: "PERSISTENCE_FAILED" });
    });
  }, [service, state]);

  const toggleSaved = useCallback((slug: string) => {
    if (service.getProductAvailability(slug) === null) return;
    dispatch({ type: "SAVED_TOGGLED", slug });
  }, [service]);

  const toggleFollowing = useCallback(() => {
    dispatch({ type: "FOLLOWING_TOGGLED" });
  }, []);

  const toggleNotificationPreference = useCallback((preference: ShopNotificationPreference) => {
    dispatch({ type: "NOTIFICATION_TOGGLED", preference });
  }, []);

  const addToBag = useCallback((candidate: BagItem) => {
    const item = service.normalizeBagItem(candidate);
    const current = stateRef.current;
    if (
      !item
      || current.connectivity === "offline"
      || current.bag.some((entry) => entry.slug === item.slug)
    ) {
      return false;
    }
    dispatch({
      type: "BAG_ITEM_ADDED",
      item,
      availability: service.getProductAvailability(item.slug),
    });
    return true;
  }, [service]);

  const prepareCheckout = useCallback(async (candidate: BagItem) => {
    const item = service.normalizeBagItem(candidate);
    const current = stateRef.current;
    if (!item || current.connectivity === "offline") return false;

    const command = {
      type: "BAG_ITEM_ADDED" as const,
      item,
      availability: service.getProductAvailability(item.slug),
    };
    const next = current.bag.some((entry) => entry.slug === item.slug)
      ? current
      : commerceReducer(current, command);

    try {
      await service.persist(selectCommerceSnapshot(next));
    } catch {
      dispatch({ type: "PERSISTENCE_FAILED" });
      return false;
    }

    if (next !== current) {
      stateRef.current = next;
      persistedRevisionRef.current = next.persistenceRevision;
      dispatch(command);
    }
    return true;
  }, [service]);

  const removeFromBag = useCallback((slug: string) => {
    dispatch({ type: "BAG_ITEM_REMOVED", slug });
  }, []);

  const beginCheckout = useCallback(() => {
    dispatch({ type: "CHECKOUT_OPENED" });
  }, []);

  const closeCheckout = useCallback(() => {
    dispatch({ type: "CHECKOUT_CLOSED" });
  }, []);

  const saveCheckout = useCallback((request: ShopCheckoutRequest): Promise<ShopCheckoutSaveResult> => {
    if (checkoutSaveRef.current) {
      return Promise.resolve({ ok: false, reason: "IN_PROGRESS" });
    }

    const run = async (): Promise<ShopCheckoutSaveResult> => {
      const current = stateRef.current;
      if (!current.bag.length) return { ok: false, reason: "EMPTY_BAG" };

      const requested = commerceReducer(current, { type: "CHECKOUT_SAVE_REQUESTED" });
      stateRef.current = requested;
      dispatch({ type: "CHECKOUT_SAVE_REQUESTED" });

      const creation = service.createCheckout(selectCommerceSnapshot(current), request);
      if (creation.ok === false) {
        const failed = commerceReducer(requested, { type: "CHECKOUT_SAVE_FAILED" });
        stateRef.current = failed;
        dispatch({ type: "CHECKOUT_SAVE_FAILED" });
        return { ok: false, reason: creation.reason };
      }

      const saved = commerceReducer(requested, {
        type: "CHECKOUT_SAVE_SUCCEEDED",
        order: creation.order,
      });
      try {
        await service.persist(selectCommerceSnapshot(saved));
      } catch {
        const failed = commerceReducer(requested, { type: "CHECKOUT_SAVE_FAILED" });
        stateRef.current = failed;
        dispatch({ type: "CHECKOUT_SAVE_FAILED" });
        dispatch({ type: "PERSISTENCE_FAILED" });
        return { ok: false, reason: "PERSISTENCE_FAILED" };
      }

      stateRef.current = saved;
      persistedRevisionRef.current = saved.persistenceRevision;
      dispatch({ type: "CHECKOUT_SAVE_SUCCEEDED", order: creation.order });

      if (current.connectivity === "online") {
        try {
          const submission = await service.submitCheckout(creation.order);
          if (submission.ok) {
            const submitted = commerceReducer(saved, {
              type: "CHECKOUT_SUBMISSION_SUCCEEDED",
              localOrderId: creation.order.id,
              order: submission.order,
            });
            if (submitted !== saved) {
              stateRef.current = submitted;
              persistedRevisionRef.current = submitted.persistenceRevision;
              dispatch({
                type: "CHECKOUT_SUBMISSION_SUCCEEDED",
                localOrderId: creation.order.id,
                order: submission.order,
              });
              try {
                await service.persist(selectCommerceSnapshot(submitted));
              } catch {
                dispatch({ type: "PERSISTENCE_FAILED" });
              }
              return { ok: true, orderId: submission.order.id };
            }
          }
        } catch {
          // The truthful local checkout remains available and retryable.
        }
      }

      return { ok: true, orderId: creation.order.id };
    };

    const operation = run().finally(() => {
      checkoutSaveRef.current = null;
    });
    checkoutSaveRef.current = operation;
    return operation;
  }, [service]);

  const viewOrder = useCallback((id: string) => {
    dispatch({ type: "ORDER_VIEWED", id });
  }, []);

  const actions = useMemo(() => ({
    toggleSaved,
    toggleFollowing,
    toggleNotificationPreference,
    addToBag,
    prepareCheckout,
    removeFromBag,
    beginCheckout,
    closeCheckout,
    saveCheckout,
    viewOrder,
  }), [
    addToBag,
    beginCheckout,
    closeCheckout,
    saveCheckout,
    prepareCheckout,
    removeFromBag,
    toggleFollowing,
    toggleNotificationPreference,
    toggleSaved,
    viewOrder,
  ]);

  return {
    state,
    lifecycle: selectCommerceLifecycle(state),
    actions,
  };
}
