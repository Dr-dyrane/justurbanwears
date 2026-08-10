"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { formatNaira, getShopProduct } from "../../lib/shop/catalog";
import {
  formatOrderDate,
  getOrderStatusLabel,
  type ShopOrder,
} from "../../lib/shop/commerce";
import { ShopActionLink } from "./atoms/action";
import { ShopStatusIndicator } from "./atoms/status";
import { ProductVisual } from "./product-visual";
import { useShop } from "./shop-provider";

function OrderCard({ order }: { order: ShopOrder }) {
  const product = getShopProduct(order.itemSlugs[0]);
  const label = getOrderStatusLabel(order.status);

  return (
    <Link className="shop-order-card" href={`/shop/orders/${order.id}`}>
      {product ? <ProductVisual compact product={product} /> : null}
      <div className="shop-order-card-copy">
        <span>Order</span>
        <h2>{order.id}</h2>
        <p>{order.itemSlugs.length} {order.itemSlugs.length === 1 ? "piece" : "pieces"} · {formatNaira(order.total)}</p>
      </div>
      <ShopStatusIndicator
        className={`shop-order-state is-${order.status.toLowerCase()}`}
        detail={formatOrderDate(order.placedAt)}
        label={label}
        tone={order.status === "ORDER_RECEIVED" ? "attention" : "positive"}
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
        <p className="shop-kicker">Order history</p>
        <h1>Your orders.</h1>
      </header>

      {isRestoring ? (
        <div className="shop-route-empty" aria-live="polite" role="status">
          <h2>Opening your order history…</h2>
        </div>
      ) : orders.length ? (
        <section className="shop-orders-list" aria-label="Orders">
          {orders.map((order) => <OrderCard key={order.id} order={order} />)}
        </section>
      ) : (
        <div className="shop-route-empty">
          <h2>No orders yet.</h2>
          <ShopActionLink href="/shop/search">Find a piece</ShopActionLink>
        </div>
      )}
    </div>
  );
}
