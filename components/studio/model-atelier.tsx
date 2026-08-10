"use client";

import { FormEvent, useState } from "react";
import { Check, Plus, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import type { StudioModel } from "../../lib/studio/domain/entities";
import { modelReadiness } from "../../lib/studio/domain/readiness";
import { APPROVED_PUBLIC_MODEL_ANCHOR } from "../../lib/studio/projections/approved-catalogue";
import { LifecycleBadge } from "./atoms/lifecycle-badge";
import { ReadinessList } from "./atoms/readiness-list";
import { useStudio } from "./studio-provider";

function ModelEditor({ model }: { model: StudioModel }) {
  const { updateModel } = useStudio();
  const [name, setName] = useState(model.name);
  const [hair, setHair] = useState(model.styling.hair);
  const [makeup, setMakeup] = useState(model.styling.makeup);
  const [direction, setDirection] = useState(model.styling.direction);
  const [identityApproved, setIdentityApproved] = useState(model.readiness.identityApproved);
  const [consentConfirmed, setConsentConfirmed] = useState(model.readiness.consentConfirmed);
  const [saved, setSaved] = useState(false);

  function save(event: FormEvent) {
    event.preventDefault();
    updateModel(model.id, {
      name,
      styling: { hair, makeup, direction },
      readiness: {
        identityApproved,
        consentConfirmed,
        stylingComplete: Boolean(hair.trim() && makeup.trim() && direction.trim()),
      },
    });
    setSaved(true);
  }

  return (
    <form className="studio-model-editor" onSubmit={save}>
      <div className="studio-editor-heading">
        <div>
          <p className="eyebrow">Selected model</p>
          <h2>{model.name}</h2>
        </div>
        <LifecycleBadge state={model.state} />
      </div>

      {model.isDefault ? (
        <div className="studio-approved-prefill" role="note">
          <ShieldCheck aria-hidden="true" size={18} strokeWidth={1.8} />
          <span><strong>Lulu neutral master V2</strong><small>Approved portrait and styling defaults prefilled</small></span>
        </div>
      ) : null}

      <div className="studio-form-grid" id="model-styling">
        <label className="studio-field">
          <span>Model name</span>
          <input
            disabled={model.isDefault}
            value={name}
            onChange={(event) => { setName(event.target.value); setSaved(false); }}
            required
          />
          {model.isDefault ? <small>Lulu remains the default Studio model.</small> : null}
        </label>
        <label className="studio-field">
          <span>Hair direction</span>
          <input value={hair} onChange={(event) => { setHair(event.target.value); setSaved(false); }} placeholder="Natural, softly shaped" />
        </label>
        <label className="studio-field">
          <span>Makeup direction</span>
          <input value={makeup} onChange={(event) => { setMakeup(event.target.value); setSaved(false); }} placeholder="Fresh skin, quiet definition" />
        </label>
        <label className="studio-field studio-field-wide">
          <span>Presentation direction</span>
          <textarea value={direction} onChange={(event) => { setDirection(event.target.value); setSaved(false); }} rows={3} placeholder="Neutral posture, minimal styling intervention, product-first" />
        </label>
      </div>

      <fieldset className="studio-readiness-controls" id="model-readiness">
        <legend>Identity readiness</legend>
        <label className={identityApproved ? "is-checked" : undefined}>
          <input type="checkbox" checked={identityApproved} onChange={(event) => { setIdentityApproved(event.target.checked); setSaved(false); }} />
          <span><ShieldCheck aria-hidden="true" size={19} /><strong>Identity approved</strong><small>Private source set has operator approval</small></span>
        </label>
        <label className={consentConfirmed ? "is-checked" : undefined}>
          <input type="checkbox" checked={consentConfirmed} onChange={(event) => { setConsentConfirmed(event.target.checked); setSaved(false); }} />
          <span><Check aria-hidden="true" size={19} /><strong>Consent confirmed</strong><small>Commercial styling use is current</small></span>
        </label>
      </fieldset>

      <div className="studio-editor-footer">
        <ReadinessList gates={modelReadiness({
          ...model,
          name,
          styling: { hair, makeup, direction },
          readiness: {
            identityApproved,
            consentConfirmed,
            stylingComplete: Boolean(hair.trim() && makeup.trim() && direction.trim()),
          },
        })} compact />
        <button className="button button-primary" type="submit">{saved ? "Saved" : "Save model"}</button>
      </div>
    </form>
  );
}

export function ModelAtelier() {
  const { models, defaultModelId, createModel, hydration } = useStudio();
  const [selectedId, setSelectedId] = useState(defaultModelId);
  const [newName, setNewName] = useState("");
  const selected = models.find((model) => model.id === selectedId)
    ?? models.find((model) => model.id === defaultModelId)
    ?? models[0];

  function addModel(event: FormEvent) {
    event.preventDefault();
    const id = createModel({ name: newName });
    if (!id) return;
    setSelectedId(id);
    setNewName("");
  }

  if (hydration === "idle" || hydration === "restoring" || !selected) {
    return <div className="studio-loading" role="status">Opening model atelier…</div>;
  }

  return (
    <div className="studio-ops-page">
      <header className="studio-ops-heading" id="models">
        <div><p className="eyebrow">Model atelier</p><h1>Identity, named and ready.</h1><p>Create models, set their styling direction, and clear identity gates before a listing can use them.</p></div>
        <span className="studio-private-chip"><ShieldCheck aria-hidden="true" size={15} />Private readiness only</span>
      </header>

      <div className="studio-model-layout">
        <aside className="studio-model-index">
          <div className="studio-index-heading"><span>Models</span><strong>{models.length}</strong></div>
          <div className="studio-model-list" role="group" aria-label="Studio models">
            {models.map((model) => (
              <button
                aria-pressed={selected.id === model.id}
                className={selected.id === model.id ? "studio-model-option is-selected" : "studio-model-option"}
                key={model.id}
                onClick={() => setSelectedId(model.id)}
                type="button"
              >
                <span className="studio-model-avatar" aria-hidden="true"><UserRound size={21} strokeWidth={1.6} /></span>
                <span><strong>{model.name}</strong><small>{model.isDefault ? "Default model" : `${model.completeness}% ready`}</small></span>
                <LifecycleBadge state={model.state} />
              </button>
            ))}
          </div>
          <form className="studio-add-model" id="new-model" onSubmit={addModel}>
            <label htmlFor="new-model-name">New model</label>
            <div><input id="new-model-name" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Model name" required /><button aria-label="Create model" type="submit"><Plus aria-hidden="true" size={18} /></button></div>
          </form>
        </aside>
        <div className="studio-model-stage">
          <div className={`studio-model-portrait${selected.isDefault ? " is-approved" : ""}`}>
            {selected.isDefault ? (
              <>
                {/* Approved public projection only; no private source image enters this bundle. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={`${selected.name}, approved neutral identity master V2`}
                  className="studio-model-approved-image"
                  height={1619}
                  src={APPROVED_PUBLIC_MODEL_ANCHOR.src}
                  width={972}
                />
                <span className="studio-model-anchor-badge">
                  <ShieldCheck aria-hidden="true" size={17} strokeWidth={1.8} />
                  <span><small>Approved anchor</small><strong>{APPROVED_PUBLIC_MODEL_ANCHOR.id}</strong></span>
                </span>
                <div className="studio-model-master-caption">
                  <small>Neutral identity master</small>
                  <strong>{selected.name}</strong>
                  <span>{selected.version}</span>
                </div>
              </>
            ) : (
              <>
                <span aria-hidden="true"><Sparkles size={22} strokeWidth={1.5} /></span>
                <div className="studio-model-silhouette" aria-hidden="true"><i /><b /></div>
                <small>{selected.version}</small>
              </>
            )}
          </div>
          <ModelEditor model={selected} key={selected.id} />
        </div>
      </div>
    </div>
  );
}
