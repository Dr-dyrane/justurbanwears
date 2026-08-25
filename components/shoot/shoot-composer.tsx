"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, Shirt, UserRound } from "lucide-react";
import { StudioFeedback } from "../studio/atoms/studio-feedback";
import { StudioStackPage, StudioStackSection } from "../studio/atoms/studio-stack-page";
import { useStudio } from "../studio/studio-provider";

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

  if (authority.status === "idle" || authority.status === "loading") return <StudioFeedback state="loading" title="Opening Atelier" />;
  if (authority.status === "error") return <StudioFeedback detail={authority.error} state="error" title="Media unavailable" />;

  return (
    <StudioStackPage kind="workflow">
      <h1 className="sr-only">Create media</h1>
      {pieces.length ? <form className="composer-layout" onSubmit={submit}>
        <div className="composer-main">
          <StudioStackSection className="composer-section" meta="1" title="Piece"><label className="authority-card select-authority"><span className="empty-authority"><Shirt aria-hidden="true" size={26} /></span><div><span><small>Garment</small></span><select aria-label="Garment" onChange={(event) => setWardrobeItemId(event.target.value)} value={wardrobeItemId}>{pieces.map((item) => <option key={item.pieceKey} value={item.wardrobeItemId!}>{item.sku ?? "Private"} · {item.title}</option>)}</select><p>{piece?.colour} · {piece?.condition}</p></div></label></StudioStackSection>
          <StudioStackSection className="composer-section" meta="2" title="View"><div className="preset-grid"><button aria-pressed={operation === "MANNEQUIN_FRONT"} className={operation === "MANNEQUIN_FRONT" ? "preset-card active" : "preset-card"} onClick={() => setOperation("MANNEQUIN_FRONT")} type="button"><strong>Mannequin</strong><small>Garment only</small></button><button aria-pressed={operation === "MODEL_TRY_ON"} className={operation === "MODEL_TRY_ON" ? "preset-card active" : "preset-card"} onClick={() => setOperation("MODEL_TRY_ON")} type="button"><strong>On model</strong><small>Approved identity</small></button></div></StudioStackSection>
          {operation === "MODEL_TRY_ON" ? <StudioStackSection className="composer-section" meta="3" title="Model"><label className="authority-card select-authority"><span className="empty-authority"><UserRound aria-hidden="true" size={26} /></span><div><span><small>Model</small></span><select aria-label="Model" onChange={(event) => setModelProfileId(event.target.value)} required value={modelProfileId}>{models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select><p>Approved for Wear</p></div></label></StudioStackSection> : null}
        </div>
        <aside className="brief-panel"><div className="brief-sticky"><h2>{piece?.title ?? "Choose a piece"}</h2><div className="brief-meta"><span>View</span><strong>{operation === "MANNEQUIN_FRONT" ? "Mannequin" : "Model try-on"}</strong><span>Visibility</span><strong>Private</strong></div><button className="button button-primary button-full" disabled={busy || !wardrobeItemId || (operation === "MODEL_TRY_ON" && !modelProfileId)} type="submit">{busy ? <><span className="spinner" />Building view…</> : <><Camera aria-hidden="true" size={17} />Build view</>}</button>{error ? <StudioFeedback detail={error} state="error" title="View not made" /> : null}</div></aside>
      </form> : <StudioFeedback action={<button className="button button-primary" onClick={() => router.push("/studio/wardrobe?intake=1")} type="button">Intake garment</button>} detail="Add a private garment before creating media." state="empty" title="No garment yet" />}
    </StudioStackPage>
  );
}
