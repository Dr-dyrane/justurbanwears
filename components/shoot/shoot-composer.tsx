"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, CircleAlert, Shirt, UserRound } from "lucide-react";
import { useStudio } from "../studio/studio-provider";
import { PageHeading } from "../ui/page-heading";

type WearOperation = "MANNEQUIN_FRONT" | "MODEL_TRY_ON";
type ApiFailure = { error?: { message?: string; recovery?: string } };

async function responseBody<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T | ApiFailure;
  if (response.ok) return body as T;
  const failure = body as ApiFailure;
  throw new Error([failure.error?.message, failure.error?.recovery].filter(Boolean).join(" ") || "The view could not be created.");
}

export function ShootComposer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authority } = useStudio();
  const pieces = useMemo(() => (authority.snapshot?.pieces ?? []).filter((piece) => piece.wardrobeItemId && piece.availability !== "ARCHIVED"), [authority.snapshot?.pieces]);
  const models = useMemo(() => (authority.snapshot?.models ?? []).filter((model) => model.state === "READY"), [authority.snapshot?.models]);
  const requested = searchParams.get("garment");
  const [wardrobeItemId, setWardrobeItemId] = useState(() => pieces.find((piece) => piece.wardrobeItemId === requested)?.wardrobeItemId ?? pieces[0]?.wardrobeItemId ?? "");
  const [operation, setOperation] = useState<WearOperation>("MANNEQUIN_FRONT");
  const [modelProfileId, setModelProfileId] = useState(models.find((model) => model.kind === "LULU_V3")?.id ?? models[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const piece = pieces.find((candidate) => candidate.wardrobeItemId === wardrobeItemId);

  useEffect(() => {
    if (wardrobeItemId && pieces.some((candidate) => candidate.wardrobeItemId === wardrobeItemId)) return;
    setWardrobeItemId(pieces.find((candidate) => candidate.wardrobeItemId === requested)?.wardrobeItemId ?? pieces[0]?.wardrobeItemId ?? "");
  }, [pieces, requested, wardrobeItemId]);

  useEffect(() => {
    if (modelProfileId && models.some((model) => model.id === modelProfileId)) return;
    setModelProfileId(models.find((model) => model.kind === "LULU_V3")?.id ?? models[0]?.id ?? "");
  }, [modelProfileId, models]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wardrobeItemId) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/studio/wardrobe/${wardrobeItemId}/wear`, {
        body: JSON.stringify({ operation, ...(operation === "MODEL_TRY_ON" ? { modelProfileId } : {}) }),
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        method: "POST",
      });
      const result = await responseBody<{ workspace: { generations: Array<{ id: string; operation: string; state: string }> } }>(response);
      const generated = [...result.workspace.generations].reverse().find((item) => item.operation === operation);
      await authority.refresh();
      router.push(generated ? `/studio/media/${generated.id}` : "/studio/media");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The view could not be created.");
    } finally {
      setBusy(false);
    }
  }

  if (authority.status === "idle" || authority.status === "loading") return <div className="studio-loading" role="status">Opening media…</div>;
  if (authority.status === "error") return <div className="studio-quiet-empty" role="alert"><CircleAlert aria-hidden="true" size={24} /><div><strong>Media unavailable</strong><p>{authority.error}</p></div></div>;

  return (
    <div>
      <PageHeading eyebrow="Create media" title="Choose the piece. Choose the view." description="Studio uses the approved garment and model authorities already on record." />
      {pieces.length ? <form className="composer-layout" onSubmit={submit}>
        <div className="composer-main">
          <section className="composer-section"><div className="intake-section-head"><div><span>01</span><h2>Piece</h2></div><p>Private garment truth</p></div><label className="authority-card select-authority"><span className="empty-authority"><Shirt aria-hidden="true" size={26} /></span><div><span><small>Garment</small></span><select aria-label="Garment" onChange={(event) => setWardrobeItemId(event.target.value)} value={wardrobeItemId}>{pieces.map((item) => <option key={item.pieceKey} value={item.wardrobeItemId!}>{item.sku ?? "Private"} · {item.title}</option>)}</select><p>{piece?.colour} · {piece?.condition}</p></div></label></section>
          <section className="composer-section"><div className="intake-section-head"><div><span>02</span><h2>View</h2></div><p>One real generation</p></div><div className="preset-grid"><button className={operation === "MANNEQUIN_FRONT" ? "preset-card active" : "preset-card"} onClick={() => setOperation("MANNEQUIN_FRONT")} type="button"><small>Shape</small><strong>Mannequin</strong><p>Show the garment without a person.</p><span>{operation === "MANNEQUIN_FRONT" ? "Selected" : "Choose"}</span></button><button className={operation === "MODEL_TRY_ON" ? "preset-card active" : "preset-card"} onClick={() => setOperation("MODEL_TRY_ON")} type="button"><small>Wear</small><strong>On model</strong><p>Use one approved model authority.</p><span>{operation === "MODEL_TRY_ON" ? "Selected" : "Choose"}</span></button></div></section>
          {operation === "MODEL_TRY_ON" ? <section className="composer-section"><div className="intake-section-head"><div><span>03</span><h2>Model</h2></div><p>Approved private authority</p></div><label className="authority-card select-authority"><span className="empty-authority"><UserRound aria-hidden="true" size={26} /></span><div><span><small>Model</small></span><select aria-label="Model" onChange={(event) => setModelProfileId(event.target.value)} required value={modelProfileId}>{models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select><p>Usage authority confirmed</p></div></label></section> : null}
        </div>
        <aside className="brief-panel"><div className="brief-sticky"><p className="eyebrow">Ready</p><h2>{piece?.title ?? "Choose a piece"}</h2><div className="brief-meta"><span>View</span><strong>{operation === "MANNEQUIN_FRONT" ? "Mannequin" : "Model try-on"}</strong><span>Privacy</span><strong>Private until kept</strong></div><button className="button button-primary button-full" disabled={busy || !wardrobeItemId || (operation === "MODEL_TRY_ON" && !modelProfileId)} type="submit">{busy ? <><span className="spinner" />Building view…</> : <><Camera aria-hidden="true" size={17} />Build view</>}</button>{error ? <p className="studio-task-error" role="alert">{error}</p> : null}</div></aside>
      </form> : <div className="studio-quiet-empty"><Shirt aria-hidden="true" size={24} /><div><strong>No private garment authority</strong><p>Intake a garment before creating Wear media.</p></div><button className="button button-primary" onClick={() => router.push("/studio/wardrobe?intake=1")} type="button">Intake garment</button></div>}
    </div>
  );
}
