"use client";

import { ArrowLeft, Check, PackageSearch } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { formatNaira, getShopProduct } from "../../lib/shop/catalog";
import {
  formatOrderDate,
  getOrderStatusLabel,
  getOrderStep,
  orderTimeline,
} from "../../lib/shop/commerce";
import { ShopActionLink } from "./atoms/action";
import { ShopStatusIndicator } from "./atoms/status";
import { ProductVisual } from "./product-visual";
import { useShop } from "./shop-provider";

export function OrderStatus() {
  const params = useParams<{ id: string }>();
  const { hydration, orders, viewOrder } = useShop();
  const order = orders.find((candidate) => candidate.id === params.id) ?? null;
  const orderId = order?.id;

  useEffect(() => {
    if (orderId) viewOrder(orderId);
  }, [orderId, viewOrder]);

  if (hydration === "idle" || hydration === "restoring") {
    return (
      <div className="shop-list-page">
        <div className="shop-route-empty" aria-live="polite" role="status">
          <h1>Opening order status…</h1>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="shop-list-page">
        <div className="shop-route-empty">
          <span aria-hidden="true"><PackageSearch size={34} strokeWidth={1.65} /></span>
          <p className="shop-kicker">Status not found</p>
          <h1>That order is not on this device.</h1>
          <ShopActionLink href="/shop/orders">View orders</ShopActionLink>
        </div>
      </div>
    );
  }

  const step = getOrderStep(order);
  const products = order.itemSlugs.flatMap((slug) => {
    const product = getShopProduct(slug);
    return product ? [product] : [];
  });

  return (
    <div className="shop-list-page shop-status-page">
      <div className="shop-product-topline">
        <Link href="/shop/orders"><ArrowLeft aria-hidden="true" size={15} strokeWidth={1.8} /> All orders</Link>
        <span>{order.id}</span>
      </div>

      <header className="shop-status-heading">
        <div>
          <p className="shop-kicker">Order status</p>
          <h1>{getOrderStatusLabel(order.status)}.</h1>
        </div>
        <ShopStatusIndicator
          className={`shop-status-pill is-${order.status.toLowerCase()}`}
          label={getOrderStatusLabel(order.status)}
          tone={order.status === "ORDER_RECEIVED" ? "attention" : "positive"}
        />
      </header>

      <div className="shop-status-layout">
        <section className="shop-timeline" aria-labelledby="timeline-title">
          <h2 id="timeline-title">Delivery progress</h2>
          <ol>
            {orderTimeline.map((item, index) => {
              const state = index < step ? "is-complete" : index === step ? "is-current" : "is-pending";
              return (
                <li aria-current={index === step ? "step" : undefined} className={state} key={item.label}>
                  <span aria-hidden="true">{index < step ? <Check size={16} strokeWidth={2.1} /> : String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{item.label}</strong></div>
                </li>
              );
            })}
          </ol>
        </section>

        <aside className="shop-status-summary glass-surface">
          <p className="shop-kicker">Order overview</p>
          <div className="shop-status-products">
            {products.map((product) => (
              <Link href={`/shop/products/${product.slug}`} key={product.slug}>
                <ProductVisual compact product={product} />
                <span><strong>{product.name}</strong><small>{product.taggedSize} · Quantity 1</small></span>
              </Link>
            ))}
          </div>
          <dl>
            <div><dt>Reference</dt><dd>{order.id}</dd></div>
            <div><dt>Placed</dt><dd>{formatOrderDate(order.placedAt)}</dd></div>
            <div><dt>Delivery</dt><dd>{order.deliveryLabel}</dd></div>
            <div><dt>Estimate</dt><dd>{order.deliveryEstimate}</dd></div>
            <div><dt>Total</dt><dd>{formatNaira(order.total)}</dd></div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
