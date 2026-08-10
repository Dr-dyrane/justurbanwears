"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { REJECTION_REASONS, type ReviewDecision } from "../../lib/data/types";
import { useStudio } from "../studio/studio-provider";
import { VisualAsset } from "../studio/visual-asset";
import { StatusPill } from "../ui/status-pill";

export function ShootDetail() {
  const params = useParams<{ id: string }>();
  const { shoots, garments, reviewGeneration, setHero } = useStudio();
  const shoot = shoots.find((item) => item.id === params.id);
  const [selectedId, setSelectedId] = useState(shoot?.generations[0]?.id ?? "");
  const [decision, setDecision] = useState<ReviewDecision>("PENDING");
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  if (!shoot) return <div className="empty-state"><h1>Shoot not found</h1><Link href="/shoots">Return to shoots</Link></div>;
  const garment = garments.find((item) => item.id === shoot.garmentId)!;
  const selected = shoot.generations.find((generation) => generation.id === selectedId) ?? shoot.generations[0];

  function chooseGeneration(id: string) {
    setSelectedId(id);
    const generation = shoot!.generations.find((item) => item.id === id)!;
    setDecision(generation.review.decision);
    setReasons(generation.review.reasons);
    setNote(generation.review.note ?? "");
  }

  function toggleReason(reason: string) {
    setReasons((current) => current.includes(reason) ? current.filter((item) => item !== reason) : [...current, reason]);
  }

  function saveReview() {
    reviewGeneration(selected.id, decision, reasons, note);
  }

  return (
    <div className="review-page">
      <div className="detail-topbar">
        <Link className="back-link" href="/shoots">← Shoots</Link>
        <div className="shoot-titlebar"><span>{shoot.id}</span><strong>{garment.title}</strong><StatusPill status="MOCK" /></div>
        <Link className="button button-secondary" href="/shoots/new">New shoot</Link>
      </div>
      <div className="review-workspace">
        <section className="review-stage">
          <div className="stage-main"><VisualAsset kind="generation" variant={selected.visual} label={`${shoot.id} ${selected.label}`} /></div>
          <div className="frame-filmstrip" aria-label="Generated frames">
            {shoot.generations.map((generation) => <button className={selected.id === generation.id ? "film-frame active" : "film-frame"} onClick={() => chooseGeneration(generation.id)} key={generation.id}><VisualAsset kind="generation" variant={generation.visual} label={generation.label} ratio="square" quiet /><span>{generation.label}</span><StatusPill status={generation.review.decision} /></button>)}
          </div>
        </section>

        <aside className="review-panel">
          <div className="review-scroll">
            <p className="eyebrow">Compare & decide</p>
            <h1>{selected.label}</h1>
            <div className="score-pair">
              <div><span>Identity match</span><strong>{selected.identityMatch}</strong><span className="score-track"><i style={{ width: `${selected.identityMatch}%` }} /></span></div>
              <div><span>Garment match</span><strong>{selected.garmentMatch}</strong><span className="score-track"><i style={{ width: `${selected.garmentMatch}%` }} /></span></div>
            </div>
            <div className="compare-pair">
              <div><VisualAsset kind="identity" variant="plum" label="Lulu model" ratio="square" quiet /><span>Identity authority</span></div>
              <div><VisualAsset kind="garment" variant={garment.visual} label={garment.sku} ratio="square" quiet /><span>Garment authority</span></div>
            </div>
            <fieldset className="decision-group">
              <legend>Human decision</legend>
              {(["APPROVED", "NEEDS RETRY", "REJECTED"] as ReviewDecision[]).map((item) => <label className={decision === item ? "decision-option active" : "decision-option"} key={item}><input type="radio" name="decision" checked={decision === item} onChange={() => setDecision(item)} /><span className="decision-dot" />{item.toLowerCase().replace(" ", " ")}</label>)}
            </fieldset>
            {decision !== "APPROVED" ? <div className="reason-picker"><strong>Reason</strong><div>{REJECTION_REASONS.map((reason) => <button className={reasons.includes(reason) ? "reason-chip active" : "reason-chip"} type="button" onClick={() => toggleReason(reason)} key={reason}>{reason}</button>)}</div></div> : null}
            <label className="review-note"><span>Review note</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Optional comparison note…" /></label>
            <button className="button button-primary button-full" onClick={saveReview}>Save decision</button>
            {decision === "APPROVED" ? <button className="button button-secondary button-full" onClick={() => setHero(selected.id)}>Set as garment hero</button> : null}
          </div>
        </aside>
      </div>
      <section className="shoot-record">
        <div><p className="eyebrow">Reproducibility</p><h2>Shoot record</h2></div>
        <dl><div><dt>Identity</dt><dd>{shoot.identityVersion}</dd></div><div><dt>Garment</dt><dd>{garment.sku}</dd></div><div><dt>Preset</dt><dd>{shoot.preset}</dd></div><div><dt>Pose</dt><dd>{shoot.pose}</dd></div><div><dt>Crop</dt><dd>{shoot.crop}</dd></div><div><dt>Engine</dt><dd>{shoot.generationEngine}</dd></div><div><dt>Created</dt><dd>{shoot.createdAt}</dd></div><div><dt>Output</dt><dd>{shoot.outputFormat}</dd></div></dl>
      </section>
    </div>
  );
}
