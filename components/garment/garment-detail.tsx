"use client";

import { useParams } from "next/navigation";
import { StudioLink as Link } from "../studio/atoms/studio-link";
import { useStudio } from "../studio/studio-provider";
import { VisualAsset } from "../studio/visual-asset";
import { StatusPill } from "../ui/status-pill";
import { garmentWarnings } from "../../lib/validation/reference-quality";

export function GarmentDetail() {
  const params = useParams<{ id: string }>();
  const { garments, shoots, approveGarment } = useStudio();
  const garment = garments.find((item) => item.id === params.id);
  if (!garment) return <div className="empty-state"><h1>Garment not found</h1><Link href="/garments">Return to library</Link></div>;
  const warnings = garmentWarnings(garment.references);
  const associated = shoots.filter((shoot) => shoot.garmentId === garment.id);

  return (
    <div className="detail-page">
      <div className="detail-topbar">
        <Link className="back-link" href="/garments">← Garments</Link>
        <div className="detail-actions">
          {garment.canonState !== "APPROVED" ? <button className="button button-secondary" onClick={() => approveGarment(garment.id)}>Approve garment canon</button> : null}
          <Link className="button button-primary" href={`/shoots/new?garment=${garment.id}`}>Create shoot</Link>
        </div>
      </div>
      <div className="garment-detail-hero">
        <div className="garment-detail-visual"><VisualAsset kind="garment" variant={garment.visual} label={garment.title} ratio="portrait" /></div>
        <div className="garment-detail-copy">
          <p className="eyebrow">{garment.sku} · {garment.category}</p>
          <h1>{garment.title}</h1>
          <div className="detail-statuses"><StatusPill status={garment.canonState} /><StatusPill status={garment.availability} /></div>
          <p className="detail-lede">{garment.notes}</p>
          <dl className="truth-grid">
            <div><dt>Price</dt><dd>₦{garment.price.toLocaleString("en-NG")}</dd></div>
            <div><dt>Tagged size</dt><dd>{garment.sizeLabel}</dd></div>
            <div><dt>Estimated fit</dt><dd>{garment.estimatedFit}</dd></div>
            <div><dt>Colour</dt><dd>{garment.color}</dd></div>
            <div><dt>Condition</dt><dd>{garment.condition}</dd></div>
            <div><dt>Source</dt><dd>{garment.source}</dd></div>
          </dl>
        </div>
      </div>
      <section className="detail-section">
        <div className="section-heading"><div><p className="eyebrow">Garment canon</p><h2>Source views</h2></div><span className="section-note">Originals are never overwritten</span></div>
        <div className="reference-strip">
          {garment.references.map((reference) => <div className="reference-card" key={reference.id}><VisualAsset kind="garment" variant={garment.visual} label={reference.view} ratio="square" quiet /><div><strong>{reference.view}</strong><span>{reference.quality}% quality</span></div></div>)}
          {["FRONT", "BACK", "DETAIL"].filter((view) => !garment.references.some((reference) => reference.view === view)).map((view) => <div className="reference-card missing" key={view}><span className="missing-plus">＋</span><div><strong>{view}</strong><span>Missing</span></div></div>)}
        </div>
        {warnings.length ? <div className="warning-banner"><strong>Not ready for production</strong><span>{warnings.join(" · ")}</span></div> : <div className="success-banner"><strong>Reference set complete</strong><span>Human approval is the final gate.</span></div>}
      </section>
      <section className="detail-section">
        <div className="section-heading"><div><p className="eyebrow">Shoot history</p><h2>{associated.length} associated shoots</h2></div><Link className="text-link" href={`/shoots/new?garment=${garment.id}`}>New shoot ↗</Link></div>
        {associated.length ? <div className="shoot-mini-grid">{associated.map((shoot) => <Link className="shoot-mini" href={`/shoots/${shoot.id}`} key={shoot.id}><VisualAsset kind="generation" variant={shoot.generations[0].visual} label={shoot.id} ratio="landscape" quiet /><span><small>{shoot.id}</small><strong>{shoot.preset}</strong><em>{shoot.createdAt}</em></span></Link>)}</div> : <p className="empty-copy">No shoots yet. This record is ready to enter the studio.</p>}
      </section>
    </div>
  );
}
