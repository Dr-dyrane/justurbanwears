"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PRESET_DETAILS, type NewShootInput, type ShootPreset } from "../../lib/data/types";
import { composeGenerationBrief } from "../../lib/generation/prompt";
import { useStudio } from "../studio/studio-provider";
import { VisualAsset } from "../studio/visual-asset";
import { PageHeading } from "../ui/page-heading";
import { StatusPill } from "../ui/status-pill";

export function ShootComposer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { identity, garments, createMockShoot } = useStudio();
  const approved = garments.filter((garment) => garment.canonState === "APPROVED");
  const initialGarment = searchParams.get("garment") && approved.some((garment) => garment.id === searchParams.get("garment"))
    ? searchParams.get("garment")!
    : approved[0]?.id ?? "";
  const [input, setInput] = useState<NewShootInput>({
    garmentId: initialGarment,
    preset: "CLEAN CATALOGUE",
    pose: "Relaxed standing",
    crop: "Full body",
    outputFormat: "Instagram feed portrait · 1080 × 1350",
  });
  const [busy, setBusy] = useState(false);
  const garment = approved.find((item) => item.id === input.garmentId);
  const brief = useMemo(() => garment ? composeGenerationBrief(identity, garment, input) : "Select an approved garment.", [garment, identity, input]);
  const gateReady = identity.status === "APPROVED" && Boolean(garment);

  function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    window.setTimeout(() => {
      const shootId = createMockShoot(input);
      router.push(`/shoots/${shootId}`);
    }, 950);
  }

  return (
    <div>
      <PageHeading
        eyebrow="Mock generation"
        title="Compose the shoot, not a prompt."
        description="The studio turns canon, garment truth, and art direction into one reproducible brief."
      />
      <form className="composer-layout" onSubmit={submit}>
        <div className="composer-main">
          <section className="composer-section">
            <div className="intake-section-head"><div><span>01</span><h2>Authorities</h2></div><p>Both must be approved for production.</p></div>
            <div className="authority-grid">
              <div className="authority-card">
                <VisualAsset kind="identity" variant="plum" label="Lulu model readiness" ratio="square" quiet />
                <div><span><small>Identity</small><StatusPill status={identity.status} /></span><strong>{identity.version}</strong><p>{identity.completeness}% complete</p></div>
              </div>
              <label className="authority-card select-authority">
                {garment ? <VisualAsset kind="garment" variant={garment.visual} label={garment.title} ratio="square" quiet /> : <span className="empty-authority">＋</span>}
                <div><span><small>Garment</small>{garment ? <StatusPill status={garment.canonState} /> : null}</span><select value={input.garmentId} onChange={(event) => setInput((current) => ({ ...current, garmentId: event.target.value }))} aria-label="Approved garment">{approved.map((item) => <option value={item.id} key={item.id}>{item.sku} · {item.title}</option>)}</select><p>{garment?.color ?? "No approved garment"}</p></div>
              </label>
            </div>
            {!gateReady ? <div className="warning-banner"><strong>Production gate closed</strong><span>The selected model and garment must be ready. The button below creates a clearly marked mock only.</span></div> : null}
          </section>

          <section className="composer-section">
            <div className="intake-section-head"><div><span>02</span><h2>Shoot preset</h2></div><p>Curated direction keeps the workflow repeatable.</p></div>
            <div className="preset-grid">
              {PRESET_DETAILS.map((preset) => <button className={input.preset === preset.name ? "preset-card active" : "preset-card"} type="button" key={preset.name} onClick={() => setInput((current) => ({ ...current, preset: preset.name as ShootPreset }))}><small>{preset.eyebrow}</small><strong>{preset.name}</strong><p>{preset.description}</p><span>{input.preset === preset.name ? "Selected" : "Choose"}</span></button>)}
            </div>
          </section>

          <section className="composer-section">
            <div className="intake-section-head"><div><span>03</span><h2>Frame</h2></div><p>Pose, crop, and output stay in the record.</p></div>
            <div className="form-grid compact-form">
              <label><span>Pose</span><select value={input.pose} onChange={(event) => setInput((current) => ({ ...current, pose: event.target.value }))}><option>Relaxed standing</option><option>Walking 3/4</option><option>Hands relaxed at sides</option><option>Seated, garment visible</option><option>Phone at chest</option></select></label>
              <label><span>Crop</span><select value={input.crop} onChange={(event) => setInput((current) => ({ ...current, crop: event.target.value }))}><option>Full body</option><option>Knee-up</option><option>Three-quarter</option><option>Detail crop</option></select></label>
              <label><span>Output</span><select value={input.outputFormat} onChange={(event) => setInput((current) => ({ ...current, outputFormat: event.target.value }))}><option>Instagram feed portrait · 1080 × 1350</option><option>Instagram square · 1080 × 1080</option><option>Story / Reels · 1080 × 1920</option><option>Web product portrait · 4:5</option></select></label>
            </div>
          </section>
        </div>

        <aside className="brief-panel">
          <div className="brief-sticky">
            <p className="eyebrow">Automatic brief</p>
            <h2>{garment?.sku ?? "No garment"} · {input.preset}</h2>
            <pre>{brief}</pre>
            <div className="brief-meta"><span>Engine</span><strong>konan/mock-v1</strong><span>Mode</span><strong>3-frame set</strong></div>
            <button className="button button-primary button-full" disabled={busy || !garment} type="submit">{busy ? <><span className="spinner" /> Building mock set…</> : "Generate mock set"}</button>
            <p className="fine-print">No real image provider is connected. Mock frames cannot become identity canon.</p>
          </div>
        </aside>
      </form>
    </div>
  );
}
