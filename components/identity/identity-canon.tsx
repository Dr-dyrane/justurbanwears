"use client";

import { useMemo, useState } from "react";
import type { ModelReference, ReferenceMark } from "../../lib/data/types";
import { identityCoverage } from "../../lib/validation/reference-quality";
import { useStudio } from "../studio/studio-provider";
import { VisualAsset } from "../studio/visual-asset";
import { PageHeading } from "../ui/page-heading";
import { StatusPill } from "../ui/status-pill";

interface PendingReference {
  id: string;
  file: File;
  preview: string;
  mark: ReferenceMark;
}

const photoDirections = [
  "Face front — neutral expression",
  "Face front — natural smile",
  "Face left 3/4 and right 3/4",
  "Left profile and right profile",
  "Full body front, side, and back",
  "Standing relaxed, arms slightly away from body",
];

export function IdentityCanonPage() {
  const { identity, addIdentityReferences } = useStudio();
  const [pending, setPending] = useState<PendingReference[]>([]);
  const [saved, setSaved] = useState(false);
  const coverage = useMemo(() => identityCoverage(identity.references), [identity.references]);
  const missing = coverage.filter((item) => !item.covered);

  function addFiles(files: FileList | null) {
    if (!files) return;
    setPending((current) => [
      ...current,
      ...Array.from(files).map((file, index) => ({
        id: `pending-${Date.now()}-${index}`,
        file,
        preview: URL.createObjectURL(file),
        mark: "PRIMARY" as const,
      })),
    ]);
    setSaved(false);
  }

  function setMark(id: string, mark: ReferenceMark) {
    setPending((current) => current.map((reference) => reference.id === id ? { ...reference, mark } : reference));
  }

  function commitPending() {
    const references: ModelReference[] = pending.map((reference, index) => ({
      id: `operator-${Date.now()}-${index}`,
      label: reference.file.name,
      view: "angle to verify",
      mark: reference.mark,
      quality: reference.file.size > 1_000_000 ? 88 : 70,
      source: "OPERATOR",
    }));
    addIdentityReferences(references);
    pending.forEach((reference) => URL.revokeObjectURL(reference.preview));
    setPending([]);
    setSaved(true);
  }

  return (
    <div>
      <PageHeading
        eyebrow="Private identity canon"
        title="Konan, before generation."
        description="The images are authoritative. Notes help the operator navigate; they never replace Lulu’s approved source set."
        action={<StatusPill status={identity.status} />}
      />

      <section className="identity-hero">
        <div className="identity-contact-sheet">
          <VisualAsset kind="identity" variant="plum" label="Styled social references" />
          <VisualAsset kind="identity" variant="umber" label="Natural video references" ratio="square" quiet />
          <VisualAsset kind="identity" variant="chalk" label="Body references" ratio="square" quiet />
          <div className="private-mask"><span>15</span><small>Instagram posts indexed privately</small></div>
        </div>
        <div className="identity-summary">
          <div className="identity-titleline"><div><p className="eyebrow">{identity.version}</p><h2>{identity.name} <span>“{identity.preferredName}”</span></h2></div><div className="completeness-ring" style={{ "--progress": `${identity.completeness * 3.6}deg` } as React.CSSProperties}><span>{identity.completeness}<small>%</small></span></div></div>
          <p className="identity-state-copy"><strong>Review state.</strong> Social images, the WhatsApp video, and FaceTime frames establish useful supporting context. A controlled primary set is still required before production generation.</p>
          <div className="identity-facts"><div><span>Body references</span><strong>{identity.bodyReferenceStatus.toLowerCase()}</strong></div><div><span>Hair references</span><strong>{identity.hairReferenceStatus.toLowerCase()}</strong></div><div><span>Consent</span><strong>{identity.consent.status.toLowerCase()}</strong></div></div>
          <div className="source-ledger">
            <span><i />15 public posts indexed via signed-in Safari</span>
            <span><i />3 full-resolution carousel files stored privately</span>
            <span><i />7.4-second WhatsApp video reviewed</span>
            <span><i />2 FaceTime screenshots marked supporting</span>
          </div>
        </div>
      </section>

      <section className="identity-section split-section">
        <div>
          <p className="eyebrow">Reference intake</p>
          <h2>Add the controlled primary set</h2>
          <p className="section-intro">Previews stay in this browser session. Production storage must use the private model source area.</p>
        </div>
        <div className="identity-upload-area">
          <label className="identity-dropzone">
            <input type="file" multiple accept="image/*" onChange={(event) => addFiles(event.target.files)} />
            <span className="upload-plus">＋</span>
            <strong>Choose identity photos</strong>
            <small>JPG, PNG or HEIC · originals preferred</small>
          </label>
          {pending.length ? <div className="pending-reference-grid">{pending.map((reference) => <div className="pending-reference" key={reference.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={reference.preview} alt="Pending identity reference" />
            <select value={reference.mark} onChange={(event) => setMark(reference.id, event.target.value as ReferenceMark)} aria-label={`Classification for ${reference.file.name}`}><option>PRIMARY</option><option>SUPPORTING</option><option>LOW QUALITY</option><option>REJECTED</option></select>
            <small>{reference.file.name}</small>
          </div>)}</div> : null}
          {pending.length ? <button className="button button-primary" onClick={commitPending}>Add {pending.length} to review</button> : null}
          {saved ? <p className="save-note">References added to this review session. They are not canonical until explicitly approved.</p> : null}
        </div>
      </section>

      <section className="identity-section">
        <div className="section-heading"><div><p className="eyebrow">Angle coverage</p><h2>What is still missing</h2></div><span className="section-note">{missing.length} controlled views open</span></div>
        <div className="coverage-grid">
          {coverage.map((item) => <div className={item.covered ? "coverage-item covered" : "coverage-item"} key={item.view}><span>{item.covered ? "✓" : "○"}</span><strong>{item.view}</strong><small>{item.covered ? "Supporting coverage" : "Primary capture needed"}</small></div>)}
        </div>
      </section>

      <section className="identity-section direction-card">
        <div className="direction-copy">
          <p className="eyebrow">Send this to Lulu</p>
          <h2>One 12-photo identity session</h2>
          <p>Use a phone’s rear camera at 1×, eye-level, in bright indirect daylight against a plain wall. No portrait mode, beauty filter, or wide-angle lens. Keep makeup minimal or absent and pull hair away from the face for the head set. For the body set, wear a fitted tank and leggings; frame head-to-toe without tilting the phone. Send original files as documents or a Drive link—not screenshots or WhatsApp-compressed photos.</p>
        </div>
        <ol>{photoDirections.map((direction) => <li key={direction}><span>{String(photoDirections.indexOf(direction) + 1).padStart(2, "0")}</span>{direction}</li>)}</ol>
      </section>

      <section className="identity-section three-column-detail">
        <div><p className="eyebrow">Allowed variance</p>{identity.allowedVariance.map((item) => <p className="canon-note" key={item}>{item}</p>)}</div>
        <div><p className="eyebrow">Forbidden drift</p>{identity.forbiddenDrift.map((item) => <p className="canon-note" key={item}>{item}</p>)}</div>
        <div><p className="eyebrow">Consent boundary</p><p className="consent-copy">{identity.consent.allowedUse}</p><small>{identity.consent.restrictedUse}</small></div>
      </section>

      <section className="identity-section regression-lock">
        <div><p className="eyebrow">Identity regression</p><h2>Baseline locked</h2><p>The five-frame regression set becomes available only after the controlled primary identity set is approved.</p></div>
        <span className="lock-mark">⌁</span>
      </section>
    </div>
  );
}
