"use client";

import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  CircleGauge,
  Images,
  PackageCheck,
  RotateCcw,
  Shirt,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { useStudioServiceOrder } from "../../../hooks/studio/use-studio-service-order";
import { projectStudioDropScopes } from "../../../lib/studio/projections/drop-context";
import type { StudioPrimaryServiceKey } from "../../../lib/studio/service-registry";
import { StudioLink as Link } from "../atoms/studio-link";
import { StudioFeedback } from "../atoms/studio-feedback";
import { StudioTaskSheet } from "../atoms/studio-task-sheet";
import { useStudio } from "../studio-provider";

const serviceIcons: Record<StudioPrimaryServiceKey, LucideIcon> = {
  wardrobe: Shirt,
  atelier: Images,
  orders: PackageCheck,
  operations: CircleGauge,
};

function useServiceStatuses(): Record<StudioPrimaryServiceKey, string> {
  const studio = useStudio();
  const connected = studio.authority.snapshot;
  const projected = studio.scenario ? null : studio.application.snapshot;
  const privatePieces = connected
    ? connected.pieces.filter((piece) => piece.availability === "PRIVATE").length
    : studio.garments.filter((garment) => garment.state === "DRAFT").length;
  const activeOrders = studio.scenario
    ? connected?.orders.filter((order) => order.lifecycleStatus === "ACTIVE").length ?? 0
    : projected?.summary.orders.value ?? null;
  const available = studio.scenario
    ? connected?.pieces.filter((piece) => piece.availability === "AVAILABLE").length ?? 0
    : projected?.summary.available.value ?? null;
  const readyModels = connected?.models.filter((model) => model.state === "READY").length ?? 0;
  const actionableOrders = connected?.orders.filter((order) => order.allowedTransitions.length > 0 && !order.return).length ?? 0;
  const actionableReturns = connected?.orders.filter((order) => Boolean(order.return && order.allowedReturnTransitions.length)).length ?? 0;
  const localAttention = Math.max(privatePieces + actionableOrders + actionableReturns, connected?.notifications.length ?? 0);
  const attention = studio.scenario ? localAttention : projected?.summary.attention.value ?? null;
  const media = connected?.media.length ?? studio.shoots.length;
  const dropContext = projectStudioDropScopes(studio.garments, studio.listings);
  const currentDropCount = dropContext.scopes.find((scope) => scope.key === "current")?.count ?? 0;
  const currentCollection = projected?.collectionScopes.find((scope) => scope.isCurrent);
  const wardrobeStatus = studio.scenario
    ? `Scenario · ${dropContext.totalCount} piece${dropContext.totalCount === 1 ? "" : "s"}`
    : currentCollection
      ? `${currentCollection.label} · ${currentCollection.counts.pieces ?? "—"} pieces`
      : `${dropContext.currentDrop} · ${currentDropCount} local`;

  return {
    wardrobe: wardrobeStatus,
    atelier: `${media} media · ${readyModels} model${readyModels === 1 ? "" : "s"} ready`,
    orders: activeOrders === null ? "Open Orders" : activeOrders ? `${activeOrders} active` : "Clear",
    operations: attention === null || available === null
      ? "State unavailable"
      : `${attention ? `${attention} attention` : "Clear"} · ${available} available`,
  };
}

export function StudioServiceList() {
  const { orderedServices } = useStudioServiceOrder();
  const statuses = useServiceStatuses();

  return (
    <nav aria-label="Studio services" className="studio-service-list">
      {orderedServices.map((service) => {
        const Icon = serviceIcons[service.key];
        return (
          <Link className="studio-service-row" href={service.href} key={service.key}>
            <span aria-hidden="true"><Icon size={19} strokeWidth={1.75} /></span>
            <span className="studio-service-copy">
              <strong>{service.label}</strong>
              <small>{statuses[service.key]}</small>
            </span>
            <ChevronRight aria-hidden="true" size={17} />
          </Link>
        );
      })}
    </nav>
  );
}

export function ArrangeStudioHomeControl() {
  const [open, setOpen] = useState(false);
  const [returnFocus, setReturnFocus] = useState<HTMLButtonElement | null>(null);
  const [receipt, setReceipt] = useState<{
    detail: string;
    previousOrder: StudioPrimaryServiceKey[] | null;
  } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const {
    moveService,
    orderedServices,
    resetServiceOrder,
    setServiceOrder,
  } = useStudioServiceOrder();

  function move(key: StudioPrimaryServiceKey, label: string, direction: -1 | 1) {
    const previousOrder = moveService(key, direction);
    if (!previousOrder) return;
    setReceipt({
      detail: `${label} moved ${direction < 0 ? "up" : "down"}.`,
      previousOrder,
    });
  }

  function reset() {
    const previousOrder = resetServiceOrder();
    setReceipt({ detail: "Default order restored.", previousOrder });
  }

  return (
    <>
      <button
        aria-controls="studio-arrange-home"
        aria-expanded={open}
        className="studio-arrange-trigger"
        onClick={(event) => {
          setReturnFocus(event.currentTarget);
          setOpen(true);
        }}
        ref={triggerRef}
        type="button"
      >
        <SlidersHorizontal aria-hidden="true" size={17} />
        Arrange Studio Home
      </button>
      <StudioTaskSheet
        className="studio-arrange-home"
        eyebrow="Home"
        onDismiss={() => setOpen(false)}
        open={open}
        returnFocus={returnFocus}
        title="Arrange your services"
      >
        <div id="studio-arrange-home">
          <div className="studio-arrange-list">
            {orderedServices.map((service, index) => (
              <div className="studio-arrange-row" key={service.key}>
                <strong>{service.label}</strong>
                <span>
                  <button aria-label={`Move ${service.label} up`} disabled={index === 0} onClick={() => move(service.key, service.label, -1)} type="button"><ArrowUp aria-hidden="true" size={17} /></button>
                  <button aria-label={`Move ${service.label} down`} disabled={index === orderedServices.length - 1} onClick={() => move(service.key, service.label, 1)} type="button"><ArrowDown aria-hidden="true" size={17} /></button>
                </span>
              </div>
            ))}
          </div>
          <button className="button button-secondary studio-arrange-reset" onClick={reset} type="button"><RotateCcw aria-hidden="true" size={15} />Reset order</button>
          {receipt ? (
            <StudioFeedback
              action={receipt.previousOrder ? <button className="button button-secondary" onClick={() => {
                setServiceOrder(receipt.previousOrder!);
                setReceipt({ detail: "Previous order restored.", previousOrder: null });
              }} type="button">Undo</button> : undefined}
              className="studio-arrange-feedback"
              detail={receipt.detail}
              state="success"
              title="Home updated"
            />
          ) : null}
        </div>
      </StudioTaskSheet>
    </>
  );
}
