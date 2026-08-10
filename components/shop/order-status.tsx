"use client";

import { ArrowLeft, Check, PackageSearch } from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { formatNaira } from "../../lib/shop/catalog";
import {
  formatOrderDate,
  getOrderStatusLabel,
  getOrderStep,
  checkoutProgress,
} from "../../lib/shop/commerce";
import { ShopActionLink } from "./atoms/action";
import { ShopLink as Link } from "./atoms/shop-link";
import { LocalCommerceDisclosure, ShopStatusIndicator } from "./atoms/status";
import { ProductVisual } from "./product-visual";
import { useShop } from "./shop-provider";

export function OrderStatus() {
  const params = useParams<{ id: string }>();
  const { getProduct, hydration, orders, viewOrder } = useShop();
  const order = orders.find((candidate) => candidate.id === params.id) ?? null;
  const orderId = order?.id;

  useEffect(() => {
    if (orderId) viewOrder(orderId);
  }, [orderId, viewOrder]);

  if (hydration === "idle" || hydration === "restoring") {
    return (
      <div className="shop-list-page">
        <div className="shop-route-empty" aria-live="polite" role="status">
          <h1>Opening checkout status…</h1>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="shop-list-page">
        <div className="shop-route-empty">
          <span aria-hidden="true"><PackageSearch size={34} strokeWidth={1.65} /></span>
          <p className="shop-kicker">Checkout not found</p>
          <h1>That checkout is not on this device.</h1>
          <ShopActionLink href="/shop/orders">Saved checkouts</ShopActionLink>
        </div>
      </div>
    );
  }

  const step = getOrderStep(order);
  const lines = order.lines.map((line) => ({ line, product: getProduct(line.slug) }));

  return (
    <div className="shop-list-page shop-status-page">
      <div className="shop-product-topline">
        <Link href="/shop/orders"><ArrowLeft aria-hidden="true" size={15} strokeWidth={1.8} /> Saved checkouts</Link>
        <span>{order.id}</span>
      </div>

      <header className="shop-status-heading">
        <div>
          <p className="shop-kicker">Checkout status</p>
          <h1>{getOrderStatusLabel(order.status)}.</h1>
        </div>
        <ShopStatusIndicator
          className={`shop-status-pill is-${order.status.toLowerCase()}`}
          label={getOrderStatusLabel(order.status)}
          tone={order.status === "PAYMENT_REQUIRED" ? "attention" : "positive"}
        />
      </header>

      <div className="shop-status-layout">
        <section className="shop-timeline" aria-labelledby="timeline-title">
          <h2 id="timeline-title">What happens next</h2>
          <ol>
            {checkoutProgress.map((item, index) => {
              const state = index < step ? "is-complete" : index === step ? "is-current" : "is-pending";
              return (
                <li aria-current={index === step ? "step" : undefined} className={state} key={item.label}>
                  <span aria-hidden="true">{index < step ? <Check size={16} strokeWidth={2.1} /> : String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <span className="sr-only">{index < step ? "Complete: " : index === step ? "Current: " : "Upcoming: "}</span>
                    <strong>{item.label}</strong><p>{item.note}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <aside className="shop-status-summary glass-surface">
          <p className="shop-kicker">Checkout overview</p>
          <div className="shop-status-products">
            {lines.map(({ line, product }) => {
              const name = line.snapshot === "PRODUCT" ? line.name : "Archived checkout item";
              const detail = line.snapshot === "PRODUCT"
                ? `${line.taggedSize} · Quantity 1`
                : line.slug;
              const content = (
                <>
                  {product ? <ProductVisual compact product={product} /> : line.snapshot === "PRODUCT" && line.imageSrc ? (
                    <Image alt={line.imageAlt ?? ""} height={75} src={line.imageSrc} width={60} />
                  ) : <span className="shop-status-product-placeholder" aria-hidden="true" />}
                  <span><strong>{name}</strong><small>{detail}</small></span>
                </>
              );
              return product ? (
                <Link href={`/shop/products/${product.slug}`} key={line.slug}>{content}</Link>
              ) : (
                <div key={line.slug}>{content}</div>
              );
            })}
          </div>
          <dl>
            <div><dt>Reference</dt><dd>{order.id}</dd></div>
            <div><dt>Saved</dt><dd>{formatOrderDate(order.savedAt)}</dd></div>
            <div><dt>Handoff</dt><dd>{order.deliveryLabel}</dd></div>
            <div><dt>Estimate</dt><dd>{order.deliveryEstimate}</dd></div>
            {order.contact ? <div><dt>Contact</dt><dd>{order.contact.email}</dd></div> : null}
            {order.fulfillment.kind === "DELIVERY" ? (
              <div>
                <dt>Destination</dt>
                <dd>{order.fulfillment.address.street}, {order.fulfillment.address.area}, {order.fulfillment.address.state}</dd>
              </div>
            ) : order.fulfillment.kind === "PICKUP" ? (
              <div><dt>Collection</dt><dd>Lagos studio</dd></div>
            ) : null}
            <div><dt>Total</dt><dd>{formatNaira(order.total)}</dd></div>
          </dl>
          <LocalCommerceDisclosure />
        </aside>
      </div>
    </div>
  );
}
