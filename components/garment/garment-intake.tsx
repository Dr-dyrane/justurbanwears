"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStudio } from "../studio/studio-provider";
import { PageHeading } from "../ui/page-heading";
import type { GarmentCategory } from "../../lib/data/types";

type FileKey = "front" | "back" | "detail";

export function GarmentIntake() {
  const router = useRouter();
  const { addGarment } = useStudio();
  const [files, setFiles] = useState<Record<FileKey, File | null>>({ front: null, back: null, detail: null });
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const warnings = useMemo(() => [
    !files.front && "Front image is required for review.",
    !files.back && "Back image is missing.",
    !files.detail && "Add one texture or construction detail.",
  ].filter(Boolean) as string[], [files]);

  function handleFile(key: FileKey, file?: File) {
    setFiles((current) => ({ ...current, [key]: file ?? null }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const garment = addGarment({
      sku: String(form.get("sku")),
      title: String(form.get("title")),
      category: String(form.get("category")) as GarmentCategory,
      sizeLabel: String(form.get("size")),
      estimatedFit: String(form.get("fit")),
      color: String(form.get("color")),
      price: Number(form.get("price")),
      condition: String(form.get("condition")),
      brand: String(form.get("brand") || ""),
      source: String(form.get("source")),
      notes: String(form.get("notes") || ""),
      hasFront: Boolean(files.front),
      hasBack: Boolean(files.back),
      hasDetail: Boolean(files.detail),
    });
    window.setTimeout(() => router.push(`/garments/${garment.id}`), 450);
  }

  return (
    <div>
      <PageHeading
        eyebrow="New source record"
        title="Intake the garment once."
        description="Capture the actual piece before styling begins. Upload previews stay in this browser session in the prototype."
      />
      <form className="intake-layout" onSubmit={submit} ref={formRef}>
        <section className="intake-images">
          <div className="intake-section-head">
            <div><span>01</span><h2>Reference views</h2></div>
            <p>Neutral light. Full garment. No filters.</p>
          </div>
          <div className="upload-grid garment-upload-grid">
            {(["front", "back", "detail"] as FileKey[]).map((key) => (
              <label className={files[key] ? "upload-tile has-file" : "upload-tile"} key={key}>
                <input type="file" accept="image/*" onChange={(event) => handleFile(key, event.target.files?.[0])} />
                {files[key] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={URL.createObjectURL(files[key]!)} alt={`${key} garment preview`} />
                ) : (
                  <span className="upload-plus">＋</span>
                )}
                <span className="upload-label"><strong>{key}</strong><small>{files[key]?.name ?? (key === "front" ? "Required" : "Recommended")}</small></span>
              </label>
            ))}
          </div>
          <div className="quality-panel">
            <span className="quality-icon">Q</span>
            <div>
              <strong>Reference check</strong>
              {warnings.length ? warnings.map((warning) => <p key={warning}>{warning}</p>) : <p>Core reference set is ready for human review.</p>}
            </div>
          </div>
        </section>

        <section className="intake-fields">
          <div className="intake-section-head">
            <div><span>02</span><h2>Product truth</h2></div>
            <p>Facts customers will rely on.</p>
          </div>
          <div className="form-grid">
            <label><span>SKU</span><input name="sku" placeholder="THR-046" required /></label>
            <label><span>Short name</span><input name="title" placeholder="Coral linen dress" required /></label>
            <label><span>Category</span><select name="category" defaultValue="Dress"><option>Dress</option><option>Top</option><option>Shirt</option><option>Skirt</option><option>Trousers</option><option>Jacket</option></select></label>
            <label><span>Size label</span><input name="size" placeholder="UK 12" required /></label>
            <label><span>Estimated fit</span><input name="fit" placeholder="Relaxed 10–12" required /></label>
            <label><span>Colour</span><input name="color" placeholder="Pastel orange" required /></label>
            <label><span>Price (₦)</span><input name="price" min="0" type="number" placeholder="18500" required /></label>
            <label><span>Condition</span><select name="condition" defaultValue="Excellent pre-loved"><option>New with tags</option><option>Excellent pre-loved</option><option>Very good</option><option>Good — light wear</option><option>Fair — disclosed wear</option></select></label>
            <label><span>Brand, if known</span><input name="brand" placeholder="Unlabelled" /></label>
            <label><span>Source</span><input name="source" placeholder="Lagos market edit" required /></label>
            <label className="form-wide"><span>Notes</span><textarea name="notes" placeholder="Silhouette, fasteners, visible wear, fit notes…" rows={4} /></label>
          </div>
          <div className="form-actions">
            <button className="button button-secondary" type="button" onClick={() => router.back()}>Cancel</button>
            <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Creating record…" : "Create review record"}</button>
          </div>
        </section>
      </form>
    </div>
  );
}
