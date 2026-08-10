"use client";

import { Check, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  formatNaira,
  shopCategories,
  shopProducts,
  type ShopAvailability,
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
  maximumPrice: number;
  sort: ShopSortOrder;
}

export const shopSizes = [
  "All",
  ...new Set(shopProducts.map((product) => product.taggedSize)),
];

export const shopColours = [
  "All",
  ...new Set(shopProducts.map((product) => product.colour)),
];

export const shopPriceMinimum = Math.floor(
  Math.min(...shopProducts.map((product) => product.price)) / 2500,
) * 2500;

export const shopPriceMaximum = Math.ceil(
  Math.max(...shopProducts.map((product) => product.price)) / 2500,
) * 2500;

export const defaultShopFilters: ShopFilterValues = {
  category: "All",
  size: "All",
  colour: "All",
  availability: "ALL",
  maximumPrice: shopPriceMaximum,
  sort: "editorial",
};

interface ShopFilterControlsProps {
  onChange(filters: ShopFilterValues): void;
  values: ShopFilterValues;
}

export function ShopFilterControls({
  onChange,
  values,
}: ShopFilterControlsProps) {
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
            {shopSizes.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Colour</span>
          <select
            onChange={(event) => onChange({ ...values, colour: event.target.value })}
            value={values.colour}
          >
            {shopColours.map((item) => <option key={item}>{item}</option>)}
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
        <span>Price ceiling <strong>{formatNaira(values.maximumPrice)}</strong></span>
        <input
          aria-valuetext={`Up to ${formatNaira(values.maximumPrice)}`}
          max={shopPriceMaximum}
          min={shopPriceMinimum}
          onChange={(event) => onChange({
            ...values,
            maximumPrice: Number(event.target.value),
          })}
          step="2500"
          type="range"
          value={values.maximumPrice}
        />
      </label>
    </>
  );
}

interface ShopFilterSheetProps {
  activeCount: number;
  onApply(filters: ShopFilterValues): void;
  values: ShopFilterValues;
}

export function ShopFilterSheet({
  activeCount,
  onApply,
  values,
}: ShopFilterSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState(values);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const dialog = dialogRef.current;
    const mobileViewport = window.matchMedia("(max-width: 680px)");
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
    const closeWhenDesktop = (event: MediaQueryListEvent) => {
      if (!event.matches) {
        setIsOpen(false);
        dialog?.close();
      }
    };

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    dialog?.addEventListener("click", closeFromBackdrop);
    mobileViewport.addEventListener("change", closeWhenDesktop);

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = documentOverflow;
      dialog?.removeEventListener("click", closeFromBackdrop);
      mobileViewport.removeEventListener("change", closeWhenDesktop);
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
    <div className="shop-mobile-filter">
      <button
        aria-label={activeCount ? `Filters, ${activeCount} active` : "Filters"}
        aria-haspopup="dialog"
        className={`shop-filter-trigger${activeCount ? " has-filters" : ""}`}
        onClick={openSheet}
        ref={triggerRef}
        type="button"
      >
        <SlidersHorizontal aria-hidden="true" size={18} strokeWidth={1.8} />
        <span>Filters</span>
        {activeCount ? <b aria-hidden="true">{activeCount}</b> : null}
      </button>

      <ShopSheet
        aria-labelledby="shop-filter-title"
        aria-modal="true"
        className="shop-filter-sheet"
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
            <h2 id="shop-filter-title">Filters</h2>
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
          <ShopFilterControls onChange={setDraft} values={draft} />
        </div>

        <footer className="shop-filter-sheet-actions">
          <button onClick={() => setDraft(defaultShopFilters)} type="button">
            Clear all
          </button>
          <button className="shop-filter-apply" onClick={applyFilters} type="button">
            <Check aria-hidden="true" size={17} strokeWidth={2} /> Apply filters
          </button>
        </footer>
      </ShopSheet>
    </div>
  );
}
