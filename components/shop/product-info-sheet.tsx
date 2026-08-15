"use client";

import { Ruler, Shirt, X } from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { useDocumentScrollLock } from "../../hooks/use-document-scroll-lock";
import { useHistoryBackedDialog } from "../../hooks/use-history-backed-dialog";
import { useSheetDismissGesture } from "../../hooks/use-sheet-dismiss-gesture";
import {
  ShopSheet,
  ShopSheetCloseButton,
  ShopSheetHandle,
} from "./atoms/sheet";

type ProductInfoSection = "measurements" | "care";

interface ProductInfoSheetProps {
  condition: string;
  details: readonly string[];
  measurements: ReadonlyArray<{ label: string; value: string }>;
  productName: string;
}

export function ProductInfoSheet({
  condition,
  details,
  measurements,
  productName,
}: ProductInfoSheetProps) {
  const [activeSection, setActiveSection] = useState<ProductInfoSection | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const dialogId = useId();
  const titleId = `${dialogId}-title`;
  const descriptionId = `${dialogId}-description`;
  const section = activeSection ?? "measurements";
  const isOpen = activeSection !== null;
  useDocumentScrollLock(isOpen);

  const { openWithHistory, requestClose } = useHistoryBackedDialog({
    marker: `product-info:${dialogId}`,
    isOpen,
    onDismiss: dismissSheet,
  });
  const sheetGesture = useSheetDismissGesture({
    dialogRef,
    onDismiss: requestClose,
  });

  function openSection(nextSection: ProductInfoSection, trigger: HTMLButtonElement) {
    returnFocusRef.current = trigger;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) openWithHistory();
    setActiveSection(nextSection);
    if (dialog && !dialog.open) dialog.showModal();
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
  }

  function dismissSheet() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    else setActiveSection(null);
  }

  function closeSheet() {
    requestClose();
  }

  function handleClosed() {
    setActiveSection(null);
    window.requestAnimationFrame(() => returnFocusRef.current?.focus());
  }

  function closeFromBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const outside = event.clientX < bounds.left
      || event.clientX > bounds.right
      || event.clientY < bounds.top
      || event.clientY > bounds.bottom;
    if (outside) closeSheet();
  }

  return (
    <div className="shop-product-info">
      <div className="shop-product-info-actions" aria-label="Product information">
        <button
          aria-controls={dialogId}
          aria-expanded={section === "measurements" && isOpen}
          aria-haspopup="dialog"
          onClick={(event) => openSection("measurements", event.currentTarget)}
          type="button"
        >
          <Ruler aria-hidden="true" size={18} strokeWidth={1.7} />
          <span><strong>Measurements</strong><small>Check the fit</small></span>
        </button>
        <button
          aria-controls={dialogId}
          aria-expanded={section === "care" && isOpen}
          aria-haspopup="dialog"
          onClick={(event) => openSection("care", event.currentTarget)}
          type="button"
        >
          <Shirt aria-hidden="true" size={18} strokeWidth={1.7} />
          <span><strong>Details & care</strong><small>Fabric and finish</small></span>
        </button>
      </div>

      <ShopSheet
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="shop-product-info-sheet"
        data-section={section}
        id={dialogId}
        onCancel={(event) => {
          event.preventDefault();
          closeSheet();
        }}
        onClick={closeFromBackdrop}
        onClose={handleClosed}
        ref={dialogRef}
      >
        <ShopSheetHandle {...sheetGesture} />
        <header className="shop-product-info-header">
          <div>
            <p className="shop-kicker">Product information</p>
            <h2 id={titleId}>{section === "measurements" ? "Measurements" : "Details & care"}</h2>
            <p id={descriptionId}>{productName}</p>
          </div>
          <ShopSheetCloseButton aria-label="Close product information" onClick={closeSheet} ref={closeButtonRef}>
            <X aria-hidden="true" size={21} strokeWidth={1.7} />
          </ShopSheetCloseButton>
        </header>

        <div className="shop-product-info-body">
          {section === "measurements" ? (
            measurements.length ? (
              <dl>
                {measurements.map((item) => (
                  <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
                ))}
              </dl>
            ) : <p>Exact measurements are confirmed before payment.</p>
          ) : (
            <>
              <ul>{details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
              <p>{condition}. Gently launder cold and air dry.</p>
            </>
          )}
        </div>
      </ShopSheet>
    </div>
  );
}
