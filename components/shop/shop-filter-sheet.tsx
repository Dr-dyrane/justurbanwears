"use client";

import { Check, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  formatNaira,
  shopCategories,
  type ShopAvailability,
  type ShopProduct,
} from "../../lib/shop/catalog";
import {
  ShopSheet,
  ShopSheetCloseButton,
  ShopSheetHandle,
} from "./atoms/sheet";

export type ShopCategory = (typeof shopCategories)[number];
export type ShopSortOrder = "editorial" | "price-low" | "price-high";
export type ShopAvailabilityFilter = "ALL" | ShopAvailability;

export interface ShopFilterValues {
  category: ShopCategory;
  size: string;
  colour: string;
  availability: ShopAvailabilityFilter;
  maximumPrice: number | null;
  sort: ShopSortOrder;
}

function filterOptions(products: readonly ShopProduct[]) {
  const prices = products.map((product) => product.price);
  const lowest = prices.length ? Math.min(...prices) : 0;
  const highest = prices.length ? Math.max(...prices) : 0;
  return {
    sizes: ["All", ...new Set(products.map((product) => product.taggedSize))],
    colours: ["All", ...new Set(products.map((product) => product.colour))],
    priceMinimum: Math.floor(lowest / 2500) * 2500,
    priceMaximum: Math.ceil(highest / 2500) * 2500,
  };
}

export const defaultShopFilters: ShopFilterValues = {
  category: "All",
  size: "All",
  colour: "All",
  availability: "ALL",
  maximumPrice: null,
  sort: "editorial",
};

export function countActiveShopFilters(
  values: ShopFilterValues,
  baseline: ShopFilterValues = defaultShopFilters,
) {
  return [
    values.category !== baseline.category,
    values.size !== baseline.size,
    values.colour !== baseline.colour,
    values.availability !== baseline.availability,
    values.maximumPrice !== baseline.maximumPrice,
    values.sort !== baseline.sort,
  ].filter(Boolean).length;
}

interface ShopFilterControlsProps {
  onChange(filters: ShopFilterValues): void;
  products: readonly ShopProduct[];
  values: ShopFilterValues;
}

export function ShopFilterControls({
  onChange,
  products,
  values,
}: ShopFilterControlsProps) {
  const options = filterOptions(products);
  const priceCeiling = values.maximumPrice ?? options.priceMaximum;
  return (
    <>
      <fieldset className="shop-refine-group">
        <legend>Category</legend>
        <div className="shop-refine-chips">
          {shopCategories.map((item) => (
            <button
              aria-pressed={values.category === item}
              className={values.category === item ? "is-active" : undefined}
              key={item}
              onClick={() => onChange({ ...values, category: item })}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="shop-refine-selects">
        <label>
          <span>Tagged size</span>
          <select
            onChange={(event) => onChange({ ...values, size: event.target.value })}
            value={values.size}
          >
            {options.sizes.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Colour</span>
          <select
            onChange={(event) => onChange({ ...values, colour: event.target.value })}
            value={values.colour}
          >
            {options.colours.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select
            onChange={(event) => onChange({
              ...values,
              sort: event.target.value as ShopSortOrder,
            })}
            value={values.sort}
          >
            <option value="editorial">Editorial order</option>
            <option value="price-low">Price: low first</option>
            <option value="price-high">Price: high first</option>
          </select>
        </label>
      </div>

      <fieldset className="shop-refine-group">
        <legend>Availability</legend>
        <div className="shop-refine-chips">
          {([
            ["ALL", "All states"],
            ["AVAILABLE", "Available"],
            ["RESERVED", "Reserved"],
            ["SOLD", "Sold archive"],
          ] as Array<[ShopAvailabilityFilter, string]>).map(([filter, label]) => (
            <button
              aria-pressed={values.availability === filter}
              className={values.availability === filter ? "is-active" : undefined}
              key={filter}
              onClick={() => onChange({ ...values, availability: filter })}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="shop-price-filter">
        <span>Price ceiling <strong>{formatNaira(priceCeiling)}</strong></span>
        <input
          aria-valuetext={`Up to ${formatNaira(priceCeiling)}`}
          disabled={!products.length}
          max={Math.max(options.priceMaximum, options.priceMinimum)}
          min={options.priceMinimum}
          onChange={(event) => onChange({
            ...values,
            maximumPrice: Number(event.target.value),
          })}
          step="2500"
          type="range"
          value={priceCeiling}
        />
      </label>
    </>
  );
}

interface ShopFilterSheetProps {
  activeCount: number;
  onApply(filters: ShopFilterValues): void;
  products: readonly ShopProduct[];
  resetValues?: ShopFilterValues;
  triggerLabel?: string;
  values: ShopFilterValues;
}

export function ShopFilterSheet({
  activeCount,
  onApply,
  products,
  resetValues = defaultShopFilters,
  triggerLabel = "Refine",
  values,
}: ShopFilterSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(values);
  const [isOpen, setIsOpen] = useState(false);
  const dialogId = useId();
  const titleId = `${dialogId}-title`;

  useEffect(() => {
    if (!isOpen) return;

    const dialog = dialogRef.current;
    const bodyOverflow = document.body.style.overflow;
    const documentOverflow = document.documentElement.style.overflow;
    const closeFromBackdrop = (event: MouseEvent) => {
      if (!dialog || event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      const clickedOutside = event.clientX < bounds.left
        || event.clientX > bounds.right
        || event.clientY < bounds.top
        || event.clientY > bounds.bottom;
      if (clickedOutside) {
        setIsOpen(false);
        dialog.close();
      }
    };
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    dialog?.addEventListener("click", closeFromBackdrop);

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = documentOverflow;
      dialog?.removeEventListener("click", closeFromBackdrop);
    };
  }, [isOpen]);

  function openSheet() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;

    setDraft(values);
    setIsOpen(true);
    dialog.showModal();
    requestAnimationFrame(() => closeButtonRef.current?.focus());
  }

  function closeSheet() {
    setIsOpen(false);
    dialogRef.current?.close();
  }

  function applyFilters() {
    onApply(draft);
    closeSheet();
  }

  return (
    <div className="shop-filter-control">
      <button
        aria-label={activeCount ? `${triggerLabel}, ${activeCount} active filters` : triggerLabel}
        aria-controls={dialogId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className={`shop-filter-trigger${activeCount ? " has-filters" : ""}`}
        onClick={openSheet}
        ref={triggerRef}
        type="button"
      >
        <SlidersHorizontal aria-hidden="true" size={18} strokeWidth={1.8} />
        <span>{triggerLabel}</span>
        {activeCount ? <b aria-hidden="true">{activeCount}</b> : null}
      </button>

      <ShopSheet
        aria-labelledby={titleId}
        aria-modal="true"
        className="shop-filter-sheet"
        id={dialogId}
        onCancel={(event) => {
          event.preventDefault();
          closeSheet();
        }}
        onClose={() => {
          setIsOpen(false);
          triggerRef.current?.focus();
        }}
        ref={dialogRef}
      >
        <ShopSheetHandle />
        <header className="shop-filter-sheet-header">
          <div>
            <p className="shop-kicker">Refine the rail</p>
            <h2 id={titleId}>Refine</h2>
          </div>
          <ShopSheetCloseButton
            aria-label="Close filters"
            className="shop-filter-close"
            onClick={closeSheet}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" size={21} strokeWidth={1.7} />
          </ShopSheetCloseButton>
        </header>

        <div className="shop-filter-sheet-body">
          <ShopFilterControls onChange={setDraft} products={products} values={draft} />
        </div>

        <footer className="shop-filter-sheet-actions">
          <button onClick={() => setDraft(resetValues)} type="button">
            Reset
          </button>
          <button className="shop-filter-apply" onClick={applyFilters} type="button">
            <Check aria-hidden="true" size={17} strokeWidth={2} /> Apply filters
          </button>
        </footer>
      </ShopSheet>
    </div>
  );
}
