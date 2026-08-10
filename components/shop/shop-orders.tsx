"use client";

import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import { formatNaira } from "../../lib/shop/catalog";
import {
  formatOrderDate,
  getOrderStatusLabel,
  type ShopOrder,
} from "../../lib/shop/commerce";
import { ShopActionLink } from "./atoms/action";
import { ShopLink as Link } from "./atoms/shop-link";
import { LocalCommerceDisclosure, ShopStatusIndicator } from "./atoms/status";
import { ProductVisual } from "./product-visual";
import { useShop } from "./shop-provider";

function OrderCard({ order }: { order: ShopOrder }) {
  const { getProduct } = useShop();
  const firstLine = order.lines[0];
  const product = firstLine ? getProduct(firstLine.slug) : undefined;
  const label = getOrderStatusLabel(order.status);
  const title = firstLine?.snapshot === "PRODUCT" ? firstLine.name : "Saved checkout";

  return (
    <Link className="shop-order-card" href={`/shop/orders/${order.id}`}>
      {product ? <ProductVisual compact product={product} /> : firstLine?.snapshot === "PRODUCT" && firstLine.imageSrc ? (
        <Image
          alt={firstLine.imageAlt ?? ""}
          className="shop-order-snapshot"
          height={135}
          src={firstLine.imageSrc}
          width={108}
        />
      ) : <span className="shop-order-snapshot is-empty" aria-hidden="true" />}
      <div className="shop-order-card-copy">
        <span>Checkout</span>
        <h2>{title}</h2>
        <p>{order.id} · {order.lines.length} {order.lines.length === 1 ? "piece" : "pieces"} · {formatNaira(order.total)}</p>
      </div>
      <ShopStatusIndicator
        className={`shop-order-state is-${order.status.toLowerCase()}`}
        detail={formatOrderDate(order.savedAt)}
        label={label}
        tone={order.status === "PAYMENT_REQUIRED" ? "attention" : "positive"}
      />
      <b aria-hidden="true"><ArrowUpRight size={18} strokeWidth={1.8} /></b>
    </Link>
  );
}

export function ShopOrders() {
  const { hydration, orders } = useShop();
  const isRestoring = hydration === "idle" || hydration === "restoring";

  return (
    <div className="shop-list-page shop-orders-page">
      <header className="shop-list-heading">
        <p className="shop-kicker">Saved checkouts</p>
        <h1>Your saved checkouts.</h1>
      </header>

      <LocalCommerceDisclosure className="shop-orders-boundary" />

      {isRestoring ? (
        <div className="shop-route-empty" aria-live="polite" role="status">
          <h2>Opening saved checkouts…</h2>
        </div>
      ) : orders.length ? (
        <section className="shop-orders-list" aria-label="Saved checkouts">
          {orders.map((order) => <OrderCard key={order.id} order={order} />)}
        </section>
      ) : (
        <div className="shop-route-empty">
          <h2>No saved checkouts yet.</h2>
          <ShopActionLink href="/shop/search">Find a piece</ShopActionLink>
        </div>
      )}
    </div>
  );
}
