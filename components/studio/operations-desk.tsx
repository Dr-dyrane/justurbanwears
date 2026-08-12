"use client";

import { useState } from "react";
import {
  ArrowRight,
  Boxes,
  Check,
  ClipboardCheck,
  PackageCheck,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { LifecycleBadge } from "./atoms/lifecycle-badge";
import { StudioLink as Link } from "./atoms/studio-link";
import { StudioPager, StudioSegmentedView, useStudioSegment } from "./atoms/studio-segmented-view";
import { useStudio } from "./studio-provider";

function shortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function OperationsDesk() {
  const studio = useStudio();
  const [inventoryPage, setInventoryPage] = useState(0);
  const [ordersPage, setOrdersPage] = useState(0);
  const [returnsPage, setReturnsPage] = useState(0);

  const reservedOrders = studio.orders.filter((order) => order.state === "RESERVED").length;
  const soldOrders = studio.orders.filter((order) => order.state === "SOLD").length;
  const openReturns = studio.returns.filter((returnCase) => returnCase.state === "DRAFT").length;
  const availableUnits = studio.inventory.reduce((total, record) => total + Math.max(0, record.onHand - record.reserved), 0);
  const segments = [
    { key: "inventory", label: "Inventory", count: studio.inventory.length },
    { key: "orders", label: "Orders", count: studio.orders.length },
    { key: "returns", label: "Returns", count: studio.returns.length },
  ];
  const { active: activeView, select: selectView } = useStudioSegment(segments, "inventory");
  const pageSize = 8;
  const safeInventoryPage = Math.min(inventoryPage, Math.max(0, Math.ceil(studio.inventory.length / pageSize) - 1));
  const safeOrdersPage = Math.min(ordersPage, Math.max(0, Math.ceil(studio.orders.length / pageSize) - 1));
  const safeReturnsPage = Math.min(returnsPage, Math.max(0, Math.ceil(studio.returns.length / pageSize) - 1));

  if (studio.hydration === "idle" || studio.hydration === "restoring") {
    return <div className="studio-loading" role="status">Opening operations…</div>;
  }

  return (
    <div className="studio-ops-page">
      <header className="studio-ops-heading">
        <div><p className="eyebrow">Operations</p><h1>Stock follows every decision.</h1><p>Reservations link listings to orders. Returns link the sold order back to a named stock disposition.</p></div>
        <Link className="button button-secondary" href="/studio/wardrobe">Open wardrobe <ArrowRight aria-hidden="true" size={15} /></Link>
      </header>

      <div className="studio-operation-summary" role="list" aria-label="Operations summary">
        <div role="listitem"><span><Boxes aria-hidden="true" size={18} /></span><strong>{availableUnits}</strong><small>available units</small></div>
        <div role="listitem"><span><ClipboardCheck aria-hidden="true" size={18} /></span><strong>{reservedOrders}</strong><small>orders to fulfil</small></div>
        <div role="listitem"><span><PackageCheck aria-hidden="true" size={18} /></span><strong>{soldOrders}</strong><small>sold orders</small></div>
        <div role="listitem"><span><RotateCcw aria-hidden="true" size={18} /></span><strong>{openReturns}</strong><small>returns to dispose</small></div>
      </div>

      <StudioSegmentedView active={activeView} label="Operations workspace" onSelect={selectView} segments={segments} />

      {activeView === "inventory" ? <section className="studio-operation-section studio-stack-panel" id="studio-view-inventory" aria-labelledby="studio-tab-inventory" role="tabpanel">
        <div className="studio-section-title"><div><p className="eyebrow">Inventory</p><h2 id="inventory-title">Listing-linked stock</h2></div><span>{studio.inventory.length} records</span></div>
        {studio.inventory.length ? (
          <div className="studio-table" role="table" aria-label="Inventory records">
            <div className="studio-table-head" role="row"><span role="columnheader">Piece</span><span role="columnheader">Listing</span><span role="columnheader">On hand</span><span role="columnheader">Reserved</span><span role="columnheader">State</span><span role="columnheader">Action</span></div>
            {studio.inventory.slice(safeInventoryPage * pageSize, (safeInventoryPage + 1) * pageSize).map((record) => {
              const garment = studio.garments.find((candidate) => candidate.id === record.garmentId);
              const listing = record.listingId ? studio.listings.find((candidate) => candidate.id === record.listingId) : undefined;
              if (!garment) return null;
              return (
                <div className="studio-table-row" role="row" key={record.id}>
                  <span role="cell"><small>{garment.sku}</small><strong>{garment.title}</strong></span>
                  <span role="cell">{listing ? listing.slug : "Not prepared"}</span>
                  <span role="cell">{record.onHand}</span>
                  <span role="cell">{record.reserved}</span>
                  <span role="cell"><LifecycleBadge state={record.state} /></span>
                  <span role="cell">{listing?.state === "PUBLISHED" ? <button className="button button-primary" onClick={() => studio.reserveOrder(listing.id)} type="button">Reserve sale</button> : <small>{listing ? listing.state.toLowerCase() : "Wardrobe first"}</small>}</span>
                </div>
              );
            })}
          </div>
        ) : <div className="studio-quiet-empty"><Boxes aria-hidden="true" size={24} /><div><strong>No stock records</strong><p>Inventory begins when a garment is created.</p></div><Link className="button button-primary" href="/studio/wardrobe?intake=1">Intake garment</Link></div>}
        <StudioPager label="Inventory pages" onPageChange={setInventoryPage} page={safeInventoryPage} pageSize={pageSize} total={studio.inventory.length} />
      </section> : null}

      {activeView === "orders" ? <section className="studio-operation-section studio-stack-panel" id="studio-view-orders" aria-labelledby="studio-tab-orders" role="tabpanel">
        <div className="studio-section-title"><div><p className="eyebrow">Orders</p><h2 id="orders-title">Reservations to sold</h2></div><span>{studio.orders.length} orders</span></div>
        {studio.orders.length ? (
          <div className="studio-operation-cards">
            {studio.orders.slice(safeOrdersPage * pageSize, (safeOrdersPage + 1) * pageSize).map((order) => {
              const listing = studio.listings.find((candidate) => candidate.id === order.listingId);
              const garment = listing ? studio.garments.find((candidate) => candidate.id === listing.garmentId) : undefined;
              const returnCase = studio.returns.find((candidate) => candidate.orderId === order.id);
              return (
                <article className="studio-operation-card" key={order.id}>
                  <div className="studio-card-heading"><div><small>{order.id}</small><h3>{garment?.title ?? "Listing record"}</h3></div><LifecycleBadge state={order.state} /></div>
                  <dl><div><dt>Listing</dt><dd>{listing?.slug ?? "Unavailable"}</dd></div><div><dt>Quantity</dt><dd>{order.quantity}</dd></div><div><dt>Reserved</dt><dd>{shortDate(order.createdAt)}</dd></div></dl>
                  <div className="studio-card-actions">
                    {order.state === "RESERVED" ? <button className="button button-primary" onClick={() => studio.fulfillOrder(order.id)} type="button"><Check aria-hidden="true" size={15} />Mark sold</button> : null}
                    {order.state === "SOLD" && !returnCase ? <button className="button button-secondary" onClick={() => studio.openReturn(order.id)} type="button"><RotateCcw aria-hidden="true" size={15} />Open return</button> : null}
                    {returnCase ? <button className="button button-secondary" onClick={() => { setReturnsPage(Math.floor(studio.returns.findIndex((candidate) => candidate.id === returnCase.id) / pageSize)); selectView("returns"); }} type="button">View return</button> : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : <div className="studio-quiet-empty"><ClipboardCheck aria-hidden="true" size={24} /><div><strong>No orders</strong><p>Reserve a published listing from Inventory to create one.</p></div></div>}
        <StudioPager label="Order pages" onPageChange={setOrdersPage} page={safeOrdersPage} pageSize={pageSize} total={studio.orders.length} />
      </section> : null}

      {activeView === "returns" ? <section className="studio-operation-section studio-stack-panel" id="studio-view-returns" aria-labelledby="studio-tab-returns" role="tabpanel">
        <div className="studio-section-title"><div><p className="eyebrow">Returns</p><h2 id="returns-title">Receive and dispose</h2></div><span>{openReturns} open</span></div>
        {studio.returns.length ? (
          <div className="studio-operation-cards">
            {studio.returns.slice(safeReturnsPage * pageSize, (safeReturnsPage + 1) * pageSize).map((returnCase) => {
              const order = studio.orders.find((candidate) => candidate.id === returnCase.orderId);
              const listing = order ? studio.listings.find((candidate) => candidate.id === order.listingId) : undefined;
              const garment = listing ? studio.garments.find((candidate) => candidate.id === listing.garmentId) : undefined;
              return (
                <article className="studio-operation-card" id={returnCase.id} key={returnCase.id}>
                  <div className="studio-card-heading"><div><small>{returnCase.id}</small><h3>{garment?.title ?? "Returned piece"}</h3></div><LifecycleBadge state={returnCase.state} /></div>
                  <dl><div><dt>Order</dt><dd>{returnCase.orderId}</dd></div><div><dt>Quantity</dt><dd>{returnCase.quantity}</dd></div><div><dt>Disposition</dt><dd>{returnCase.disposition.toLowerCase().replace("_", " ")}</dd></div></dl>
                  {returnCase.state === "DRAFT" ? <div className="studio-disposition-actions"><button className="button button-primary" onClick={() => studio.disposeReturn(returnCase.id, "RESTOCK")} type="button"><RotateCcw aria-hidden="true" size={15} />Restock to review</button><button className="button button-secondary" onClick={() => studio.disposeReturn(returnCase.id, "WRITE_OFF")} type="button"><ShieldAlert aria-hidden="true" size={15} />Write off</button></div> : <p className="studio-resolution-note">{returnCase.disposition === "RESTOCK" ? "Back in wardrobe readiness; republish when checked." : "Removed from sellable stock."}</p>}
                </article>
              );
            })}
          </div>
        ) : <div className="studio-quiet-empty"><RotateCcw aria-hidden="true" size={24} /><div><strong>No return cases</strong><p>Open a return from a sold order when one arrives.</p></div></div>}
        <StudioPager label="Return pages" onPageChange={setReturnsPage} page={safeReturnsPage} pageSize={pageSize} total={studio.returns.length} />
      </section> : null}
    </div>
  );
}
