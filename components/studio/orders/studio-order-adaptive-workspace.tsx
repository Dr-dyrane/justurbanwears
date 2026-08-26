"use client";

import { useId, type ReactNode } from "react";

import { formatNaira } from "../../../lib/shop/catalog";
import {
  orderStateLabel,
  orderStateSummary,
} from "../../../lib/shop/order-presentation";
import type { ShopServerOrder } from "../../../lib/shop/server-order/types";
import { StudioAdaptiveWorkspace } from "../workspace/studio-adaptive-workspace";

export function StudioOrderAdaptiveWorkspace({
  children,
  order,
}: {
  children: ReactNode;
  order: ShopServerOrder;
}) {
  const titleId = useId();
  const journey = orderStateSummary(order);
  const firstLine = order.lines[0];
  const remainingPieces = Math.max(0, order.lines.length - 1);

  const stage = (
    <section aria-labelledby={titleId} className="juw-order-v2-overview">
      <header>
        <p className="eyebrow">Order {order.reference}</p>
        <span
          data-state-tone={order.return
            ? "critical"
            : order.lifecycleStatus === "COMPLETED"
              ? "positive"
              : "caution"}
        >
          {orderStateLabel(order.lifecycleStatus)}
        </span>
      </header>

      <div className="juw-order-v2-heading">
        <h1 id={titleId}>{firstLine?.name ?? "Wardrobe order"}</h1>
        <p>
          {order.contact.name} · {order.deliveryLabel}
          {remainingPieces ? ` · +${remainingPieces} more` : ""}
        </p>
        <strong>{formatNaira(order.total)}</strong>
      </div>

      <ol aria-label="Order journey" className="juw-order-v2-journey">
        {journey.map((item, index) => (
          <li key={item.label}>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <small>{item.label}</small>
              <strong>{item.value}</strong>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );

  return (
    <StudioAdaptiveWorkspace
      className="juw-order-v2"
      stage={stage}
      surfaceLabel={`Manage order ${order.reference}`}
    >
      {children}
    </StudioAdaptiveWorkspace>
  );
}
