"use client";

/* Fixed public catalogue paths and protected Studio previews do not use the Next image optimizer. */
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import {
  ArrowRight,
  Boxes,
  Check,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  PackageOpen,
  PackageCheck,
  RotateCcw,
  ShieldAlert,
  Shirt,
} from "lucide-react";
import { LifecycleBadge } from "./atoms/lifecycle-badge";
import { StudioLink as Link } from "./atoms/studio-link";
import { StudioPager, StudioSegmentedView, useStudioSegment } from "./atoms/studio-segmented-view";
import { StudioTaskSheet } from "./atoms/studio-task-sheet";
import { studioGarmentCover } from "./garment-cover";
import { useStudio } from "./studio-provider";

function shortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

const currency = new Intl.NumberFormat("en-NG", {
  currency: "NGN",
  maximumFractionDigits: 0,
  style: "currency",
});

type InventoryDecision = "RESERVE" | "FULFILL" | "RELEASE" | "RETURN";

const inventoryDecisionCopy: Record<InventoryDecision, { confirm: string; description: string; title: string }> = {
  RESERVE: { confirm: "Reserve unit", description: "This creates an order and removes one unit from available stock.", title: "Reserve this piece?" },
  FULFILL: { confirm: "Mark sold", description: "This fulfils the linked order and records the reserved unit as sold.", title: "Complete this sale?" },
  RELEASE: { confirm: "Release", description: "This cancels the linked order hold and restores the unit to published availability.", title: "Release this reservation?" },
  RETURN: { confirm: "Open return", description: "This creates a return record. Restock or write-off remains a separate decision.", title: "Open a return?" },
};

export function OperationsDesk() {
  const studio = useStudio();
  const [inventoryPage, setInventoryPage] = useState(0);
  const [ordersPage, setOrdersPage] = useState(0);
  const [returnsPage, setReturnsPage] = useState(0);
  const [selectedInventoryId, setSelectedInventoryId] = useState<string | null>(null);
  const [inventoryReturnFocus, setInventoryReturnFocus] = useState<HTMLButtonElement | null>(null);
  const [inventoryNotice, setInventoryNotice] = useState("");
  const [pendingInventoryDecision, setPendingInventoryDecision] = useState<InventoryDecision | null>(null);

  const reservedOrders = studio.orders.filter((order) => order.state === "RESERVED").length;
  const soldOrders = studio.orders.filter((order) => order.state === "SOLD").length;
  const openReturns = studio.returns.filter((returnCase) => returnCase.state === "DRAFT").length;
  const availableUnits = studio.inventory.reduce((total, record) => total + Math.max(0, record.onHand - record.reserved), 0);
  const segments = [
    { key: "inventory", label: "Inventory", count: studio.inventory.length },
    { key: "orders", label: "Orders", count: studio.orders.length },
    { key: "returns", label: "Returns", count: studio.returns.length },
  ];
  const { active: activeView, isPending: viewPending, select: selectView } = useStudioSegment(segments, "inventory");
  const pageSize = 8;
  const safeInventoryPage = Math.min(inventoryPage, Math.max(0, Math.ceil(studio.inventory.length / pageSize) - 1));
  const safeOrdersPage = Math.min(ordersPage, Math.max(0, Math.ceil(studio.orders.length / pageSize) - 1));
  const safeReturnsPage = Math.min(returnsPage, Math.max(0, Math.ceil(studio.returns.length / pageSize) - 1));
  const selectedInventory = selectedInventoryId
    ? studio.inventory.find((record) => record.id === selectedInventoryId)
    : undefined;
  const selectedGarment = selectedInventory
    ? studio.garments.find((garment) => garment.id === selectedInventory.garmentId)
    : undefined;
  const selectedListing = selectedInventory?.listingId
    ? studio.listings.find((listing) => listing.id === selectedInventory.listingId)
    : undefined;
  const selectedOrder = selectedInventory
    ? studio.orders.find((order) => order.inventoryId === selectedInventory.id && ["RESERVED", "SOLD"].includes(order.state))
    : undefined;
  const selectedReturn = selectedOrder
    ? studio.returns.find((returnCase) => returnCase.orderId === selectedOrder.id)
    : undefined;
  const selectedCover = selectedGarment
    ? studioGarmentCover(selectedGarment, selectedListing)
    : undefined;

  function closeInventoryDetail() {
    setSelectedInventoryId(null);
    setInventoryNotice("");
    setPendingInventoryDecision(null);
  }

  function openInventoryDetail(recordId: string, trigger: HTMLButtonElement) {
    setInventoryReturnFocus(trigger);
    setInventoryNotice("");
    setPendingInventoryDecision(null);
    setSelectedInventoryId(recordId);
  }

  function reserveSelectedListing() {
    if (!selectedListing) return;
    const orderId = studio.reserveOrder(selectedListing.id);
    setInventoryNotice(orderId ? "One unit reserved. The order is ready to review." : "This unit could not be reserved.");
    setPendingInventoryDecision(null);
  }

  function fulfillSelectedOrder() {
    if (!selectedOrder) return;
    studio.fulfillOrder(selectedOrder.id);
    setInventoryNotice("Reservation marked sold.");
    setPendingInventoryDecision(null);
  }

  function releaseSelectedReservation() {
    if (!selectedOrder) return;
    const released = studio.cancelOrder(selectedOrder.id);
    setInventoryNotice(released ? "Reservation released. The piece is published and available again." : "This reservation could not be released.");
    setPendingInventoryDecision(null);
  }

  function openSelectedReturn() {
    if (!selectedOrder) return;
    const returnId = studio.openReturn(selectedOrder.id);
    setInventoryNotice(returnId ? "Return opened for review." : "A return already exists for this order.");
    setPendingInventoryDecision(null);
  }

  function confirmInventoryDecision() {
    if (pendingInventoryDecision === "RESERVE") reserveSelectedListing();
    if (pendingInventoryDecision === "FULFILL") fulfillSelectedOrder();
    if (pendingInventoryDecision === "RELEASE") releaseSelectedReservation();
    if (pendingInventoryDecision === "RETURN") openSelectedReturn();
  }

  function showSelectedOrder() {
    if (!selectedOrder) return;
    const orderIndex = studio.orders.findIndex((order) => order.id === selectedOrder.id);
    setOrdersPage(Math.max(0, Math.floor(orderIndex / pageSize)));
    closeInventoryDetail();
    selectView("orders");
  }

  function showSelectedReturn() {
    if (!selectedReturn) return;
    const returnIndex = studio.returns.findIndex((returnCase) => returnCase.id === selectedReturn.id);
    setReturnsPage(Math.max(0, Math.floor(returnIndex / pageSize)));
    closeInventoryDetail();
    selectView("returns");
  }

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

      <StudioSegmentedView active={activeView} label="Operations workspace" onSelect={selectView} pending={viewPending} segments={segments} />

      {activeView === "inventory" ? <section className="studio-operation-section studio-stack-panel" id="studio-view-inventory" aria-labelledby="studio-tab-inventory" role="tabpanel">
        <div className="studio-section-title"><div><p className="eyebrow">Inventory</p><h2 id="inventory-title">Listing-linked stock</h2></div><span>{studio.inventory.length} records</span></div>
        {studio.inventory.length ? (
          <div className="studio-table studio-inventory-list" role="list" aria-label="Inventory records">
            {studio.inventory.slice(safeInventoryPage * pageSize, (safeInventoryPage + 1) * pageSize).map((record) => {
              const garment = studio.garments.find((candidate) => candidate.id === record.garmentId);
              const listing = record.listingId ? studio.listings.find((candidate) => candidate.id === record.listingId) : undefined;
              if (!garment) return null;
              const cover = studioGarmentCover(garment, listing);
              return (
                <article role="listitem" key={record.id}>
                  <button
                    aria-haspopup="dialog"
                    className="studio-table-row studio-inventory-row-trigger"
                    onClick={(event) => openInventoryDetail(record.id, event.currentTarget)}
                    type="button"
                  >
                    <span className={`studio-inventory-media${cover ? " is-photo" : ""}`} data-variant={garment.visual}>{cover ? <img alt="" height={cover.height} loading="lazy" src={cover.src} width={cover.width} /> : <Shirt aria-hidden="true" size={22} strokeWidth={1.4} />}</span>
                    <span className="studio-inventory-copy"><small>{garment.sku}</small><strong>{garment.title}</strong><em>{listing ? listing.slug : "Not prepared"}</em></span>
                    <span className="studio-inventory-stock"><strong>{Math.max(0, record.onHand - record.reserved)} available</strong><small>{record.reserved} reserved</small></span>
                    <span className="studio-inventory-action"><LifecycleBadge state={record.state} /><ChevronRight aria-hidden="true" size={17} /></span>
                  </button>
                </article>
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

      <StudioTaskSheet
        className="studio-inventory-detail-sheet"
        eyebrow={selectedGarment ? `Inventory · ${selectedGarment.sku}` : "Inventory"}
        onDismiss={closeInventoryDetail}
        open={Boolean(selectedInventory && selectedGarment)}
        returnFocus={inventoryReturnFocus}
        title={selectedGarment?.title ?? "Inventory detail"}
      >
        {selectedInventory && selectedGarment ? (
          <div className="studio-inventory-detail">
            <figure className={`studio-inventory-detail-media${selectedCover ? " is-photo" : ""}`} data-variant={selectedGarment.visual}>
              {selectedCover ? <img alt={`${selectedGarment.title} inventory view`} height={selectedCover.height} src={selectedCover.src} width={selectedCover.width} /> : <Shirt aria-hidden="true" size={42} strokeWidth={1.2} />}
              <figcaption><LifecycleBadge state={selectedInventory.state} /><span>{Math.max(0, selectedInventory.onHand - selectedInventory.reserved)} available</span></figcaption>
            </figure>

            <section className="studio-inventory-detail-section" aria-labelledby="inventory-detail-facts">
              <div className="studio-inventory-detail-heading"><div><p className="eyebrow">Record</p><h3 id="inventory-detail-facts">Piece and stock</h3></div><span>{shortDate(selectedInventory.updatedAt)}</span></div>
              <dl className="studio-inventory-detail-facts">
                <div><dt>Price</dt><dd>{currency.format(selectedListing?.price ?? selectedGarment.price)}</dd></div>
                <div><dt>Size</dt><dd>{selectedGarment.sizeLabel}</dd></div>
                <div><dt>Listing</dt><dd>{selectedListing?.state ?? "NOT PREPARED"}</dd></div>
                <div><dt>Inventory</dt><dd>{selectedInventory.state}</dd></div>
                <div><dt>On hand</dt><dd>{selectedInventory.onHand}</dd></div>
                <div><dt>Reserved</dt><dd>{selectedInventory.reserved}</dd></div>
                <div><dt>Sold</dt><dd>{selectedInventory.sold}</dd></div>
                <div><dt>Returns / write-off</dt><dd>{selectedInventory.returned} / {selectedInventory.writeOff}</dd></div>
              </dl>
            </section>

            <section className="studio-inventory-detail-section" aria-labelledby="inventory-detail-actions">
              <div className="studio-inventory-detail-heading"><div><p className="eyebrow">Decision</p><h3 id="inventory-detail-actions">Stock action</h3></div></div>
              <div className="studio-inventory-decision-grid">
                {selectedListing?.state === "PUBLISHED" && selectedInventory.onHand - selectedInventory.reserved > 0 ? (
                  <button className="studio-inventory-decision" onClick={() => setPendingInventoryDecision("RESERVE")} type="button"><ClipboardCheck aria-hidden="true" size={20} /><span><strong>Reserve 1 unit</strong><small>Create an order and hold this piece.</small></span><ChevronRight aria-hidden="true" size={17} /></button>
                ) : null}
                {selectedOrder?.state === "RESERVED" ? (
                  <button className="studio-inventory-decision" onClick={() => setPendingInventoryDecision("FULFILL")} type="button"><Check aria-hidden="true" size={20} /><span><strong>Mark sold</strong><small>Fulfil the open reservation.</small></span><ChevronRight aria-hidden="true" size={17} /></button>
                ) : null}
                {selectedOrder?.state === "RESERVED" ? (
                  <button className="studio-inventory-decision" onClick={() => setPendingInventoryDecision("RELEASE")} type="button"><RotateCcw aria-hidden="true" size={20} /><span><strong>Release reservation</strong><small>Cancel this order hold and restore availability.</small></span><ChevronRight aria-hidden="true" size={17} /></button>
                ) : null}
                {selectedOrder ? (
                  <button className="studio-inventory-decision" onClick={showSelectedOrder} type="button"><PackageOpen aria-hidden="true" size={20} /><span><strong>Open order</strong><small>Review the linked reservation record.</small></span><ChevronRight aria-hidden="true" size={17} /></button>
                ) : null}
                {selectedOrder?.state === "SOLD" && !selectedReturn ? (
                  <button className="studio-inventory-decision" onClick={() => setPendingInventoryDecision("RETURN")} type="button"><RotateCcw aria-hidden="true" size={20} /><span><strong>Open return</strong><small>Start a disposition record for this sale.</small></span><ChevronRight aria-hidden="true" size={17} /></button>
                ) : null}
                {selectedReturn ? (
                  <button className="studio-inventory-decision" onClick={showSelectedReturn} type="button"><RotateCcw aria-hidden="true" size={20} /><span><strong>Review return</strong><small>Choose restock or write-off.</small></span><ChevronRight aria-hidden="true" size={17} /></button>
                ) : null}
                {selectedListing ? (
                  <Link className="studio-inventory-decision" href={`/shop/products/${selectedListing.slug}`}><ExternalLink aria-hidden="true" size={20} /><span><strong>View listing</strong><small>Open the customer-facing product page.</small></span><ChevronRight aria-hidden="true" size={17} /></Link>
                ) : (
                  <Link className="studio-inventory-decision" href="/studio/wardrobe"><Shirt aria-hidden="true" size={20} /><span><strong>Open wardrobe</strong><small>Prepare this piece before publishing.</small></span><ChevronRight aria-hidden="true" size={17} /></Link>
                )}
              </div>
              {pendingInventoryDecision ? (
                <div className="studio-inventory-confirmation" aria-live="polite">
                  <div><strong>{inventoryDecisionCopy[pendingInventoryDecision].title}</strong><p>{inventoryDecisionCopy[pendingInventoryDecision].description}</p></div>
                  <div><button className="button button-secondary" onClick={() => setPendingInventoryDecision(null)} type="button">Cancel</button><button className="button button-primary" onClick={confirmInventoryDecision} type="button">{inventoryDecisionCopy[pendingInventoryDecision].confirm}</button></div>
                </div>
              ) : null}
              {inventoryNotice ? <p className="studio-inventory-notice" role="status">{inventoryNotice}</p> : null}
            </section>
          </div>
        ) : null}
      </StudioTaskSheet>
    </div>
  );
}
