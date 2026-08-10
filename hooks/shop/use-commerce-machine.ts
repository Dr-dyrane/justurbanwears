"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type {
  BagItem,
  ShopDeliveryId,
  ShopNotificationPreference,
} from "../../lib/shop/domain/entities";
import {
  commerceReducer,
  initialCommerceState,
  selectCommerceLifecycle,
  selectCommerceSnapshot,
} from "../../lib/shop/machines/commerce-machine";
import type { CommerceService } from "../../lib/shop/services/contracts";

export function useCommerceMachine(service: CommerceService) {
  const [state, dispatch] = useReducer(commerceReducer, initialCommerceState);
  const stateRef = useRef(state);
  const persistedRevisionRef = useRef(0);

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

    void service.hydrate()
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

  const removeFromBag = useCallback((slug: string) => {
    dispatch({ type: "BAG_ITEM_REMOVED", slug });
  }, []);

  const beginCheckout = useCallback(() => {
    dispatch({ type: "CHECKOUT_OPENED" });
  }, []);

  const closeCheckout = useCallback(() => {
    dispatch({ type: "CHECKOUT_CLOSED" });
  }, []);

  const placeOrder = useCallback((deliveryId: ShopDeliveryId) => {
    const current = stateRef.current;
    dispatch({ type: "ORDER_PLACEMENT_REQUESTED" });
    if (current.connectivity === "offline" || !current.bag.length) return "";

    const order = service.createOrder(selectCommerceSnapshot(current), deliveryId);
    if (!order) {
      dispatch({ type: "ORDER_PLACEMENT_FAILED" });
      return "";
    }
    dispatch({ type: "ORDER_PLACEMENT_SUCCEEDED", order });
    return order.id;
  }, [service]);

  const viewOrder = useCallback((id: string) => {
    dispatch({ type: "ORDER_VIEWED", id });
  }, []);

  const actions = useMemo(() => ({
    toggleSaved,
    toggleFollowing,
    toggleNotificationPreference,
    addToBag,
    removeFromBag,
    beginCheckout,
    closeCheckout,
    placeOrder,
    viewOrder,
  }), [
    addToBag,
    beginCheckout,
    closeCheckout,
    placeOrder,
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
