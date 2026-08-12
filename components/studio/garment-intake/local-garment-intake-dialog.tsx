"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Camera, Check, X } from "lucide-react";
import type { GarmentCategory } from "../../../lib/studio/domain/entities";
import { useStudio } from "../studio-provider";

type CaptureKey = "front" | "back" | "detail";

interface LocalGarmentIntakeDialogProps {
  onDismiss(): void;
  open: boolean;
  returnFocus?: HTMLElement | null;
}

export function LocalGarmentIntakeDialog({
  onDismiss,
  open,
  returnFocus,
}: LocalGarmentIntakeDialogProps) {
  const { createGarment } = useStudio();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [files, setFiles] = useState<Record<CaptureKey, File | null>>({
    front: null,
    back: null,
    detail: null,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function close() {
    dialogRef.current?.close();
  }

  function closed() {
    onDismiss();
    window.requestAnimationFrame(() => returnFocus?.focus());
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createGarment({
      sku: String(form.get("sku")),
      title: String(form.get("title")),
      category: String(form.get("category")) as GarmentCategory,
      sizeLabel: String(form.get("size")),
      estimatedFit: String(form.get("fit")),
      color: String(form.get("colour")),
      price: Number(form.get("price")),
      condition: String(form.get("condition")),
      brand: String(form.get("brand") || ""),
      source: String(form.get("source") || "Studio intake"),
      notes: String(form.get("description")),
      privateNote: String(form.get("privateNote") || ""),
      publicDescription: String(form.get("description")),
      quantity: Number(form.get("quantity")),
      saleEligible: form.get("saleEligible") === "on",
      measurements: [
        { label: "Bust", value: String(form.get("bust") || "") },
        { label: "Waist", value: String(form.get("waist") || "") },
        { label: "Length", value: String(form.get("length") || "") },
      ],
      hasFront: Boolean(files.front),
      hasBack: Boolean(files.back),
      hasDetail: Boolean(files.detail),
    });
    event.currentTarget.reset();
    setFiles({ front: null, back: null, detail: null });
    close();
  }

  return (
    <dialog
      aria-labelledby="studio-local-intake-title"
      className="studio-intake-sheet"
      onClose={closed}
      ref={dialogRef}
    >
      <form onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">Garment pipeline</p>
            <h2 id="studio-local-intake-title">Snap. Classify. Wardrobe.</h2>
          </div>
          <button aria-label="Close garment intake" className="studio-icon-action" onClick={close} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        <section className="studio-intake-step">
          <div className="studio-step-label">
            <span>01</span>
            <div><strong>Snap or upload</strong><small>Saved on this device.</small></div>
          </div>
          <div className="studio-capture-grid">
            {(["front", "back", "detail"] as CaptureKey[]).map((key) => (
              <label className={files[key] ? "studio-capture-tile has-file" : "studio-capture-tile"} key={key}>
                <input
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => setFiles((current) => ({
                    ...current,
                    [key]: event.target.files?.[0] ?? null,
                  }))}
                  type="file"
                />
                {files[key] ? <Check aria-hidden="true" size={22} /> : <Camera aria-hidden="true" size={22} />}
                <strong>{key}</strong>
                <small>{files[key]?.name ?? "Choose image"}</small>
              </label>
            ))}
          </div>
        </section>

        <section className="studio-intake-step">
          <div className="studio-step-label">
            <span>02</span>
            <div><strong>Create & classify</strong><small>Facts drive readiness.</small></div>
          </div>
          <div className="studio-form-grid">
            <label className="studio-field"><span>SKU</span><input name="sku" placeholder="JUW-101" required /></label>
            <label className="studio-field"><span>Garment name</span><input name="title" placeholder="Cocoa bias dress" required /></label>
            <label className="studio-field"><span>Category</span><select defaultValue="Dress" name="category"><option>Dress</option><option>Set</option><option>Shirt</option><option>Knitwear</option><option>Skirt</option><option>Trousers</option></select></label>
            <label className="studio-field"><span>Colour</span><input name="colour" placeholder="Cocoa" required /></label>
            <label className="studio-field"><span>Tagged size</span><input name="size" placeholder="UK 12" required /></label>
            <label className="studio-field"><span>Fit</span><input name="fit" placeholder="Relaxed 10–12" required /></label>
            <label className="studio-field"><span>Condition</span><select defaultValue="Excellent pre-loved" name="condition"><option>New with tags</option><option>Excellent pre-loved</option><option>Very good</option><option>Good — disclosed wear</option></select></label>
            <label className="studio-field"><span>Quantity</span><input defaultValue="1" min="1" name="quantity" required type="number" /></label>
            <label className="studio-field"><span>Price (₦)</span><input min="1" name="price" placeholder="18500" required type="number" /></label>
            <label className="studio-field"><span>Brand</span><input name="brand" placeholder="Unlabelled" /></label>
            <label className="studio-field"><span>Bust</span><input name="bust" placeholder="96 cm" /></label>
            <label className="studio-field"><span>Waist</span><input name="waist" placeholder="78 cm" /></label>
            <label className="studio-field"><span>Length</span><input name="length" placeholder="124 cm" required /></label>
            <label className="studio-field"><span>Acquisition source</span><input name="source" placeholder="Private Studio note" /></label>
            <label className="studio-field studio-field-wide"><span>Public description</span><textarea name="description" placeholder="Bias-cut midi with a softly flared hem." required rows={3} /></label>
            <label className="studio-field studio-field-wide"><span>Private condition note</span><textarea name="privateNote" placeholder="Operator-only detail" rows={2} /></label>
          </div>
          <label className="studio-check-row">
            <input aria-label="Eligible for sale" defaultChecked name="saleEligible" type="checkbox" />
            <span><strong>Eligible for sale</strong><small>No unresolved condition hold</small></span>
          </label>
        </section>

        <footer>
          <button className="button button-secondary" onClick={close} type="button">Cancel</button>
          <button className="button button-primary" type="submit">Create garment</button>
        </footer>
      </form>
    </dialog>
  );
}
