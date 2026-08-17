"use client";

/* Studio catalogue and protected intake media use stable runtime URLs. */
/* eslint-disable @next/next/no-img-element */

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  CircleAlert,
  MapPin,
  PackageCheck,
  RefreshCw,
  ScanLine,
  Shirt,
} from "lucide-react";
import type {
  PhysicalObservation,
  PhysicalPiece,
  StocktakeLocationKey,
  StocktakeSession,
  StocktakeWorkspace as StocktakeWorkspaceData,
} from "../../lib/server/studio-stocktake-repository";
import { StudioLink } from "./atoms/studio-link";
import { StudioTaskSheet } from "./atoms/studio-task-sheet";
import { useStudioMobileAction } from "./mobile-action-context";

const locations: Array<{ key: StocktakeLocationKey; label: string }> = [
  { key: "WARDROBE_RAIL", label: "Wardrobe rail" },
  { key: "PACKING_SHELF", label: "Packing shelf" },
  { key: "RETURN_INSPECTION", label: "Return inspection" },
];

type Receipt = {
  consequence: string;
  customerVisible: boolean;
  kind: "COUNT_STARTED" | "PIECE_CONFIRMED" | "MISMATCH_RECORDED" | "COUNT_CLOSED";
  next: string;
};

type StocktakeApiPayload = StocktakeWorkspaceData & {
  piece: PhysicalPiece | null;
};

type MutationPayload = {
  observation?: PhysicalObservation;
  piece?: PhysicalPiece;
  receipt: Receipt;
  session: StocktakeSession | null;
};

type ApiFailure = {
  error?: { message?: string; recovery?: string };
};

function receiptTitle(receipt: Receipt) {
  if (receipt.kind === "COUNT_STARTED") return "Count started";
  if (receipt.kind === "COUNT_CLOSED") return "Count complete";
  if (receipt.kind === "MISMATCH_RECORDED") return "Mismatch recorded";
  return "Piece confirmed";
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-NG", {
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
      }).format(date)
    : value;
}

function pieceRouteKey(piece: PhysicalPiece) {
  return piece.sku ?? piece.wardrobeItemId ?? piece.pieceKey;
}

function requestKey(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`;
}

async function responseBody<T>(response: Response): Promise<T> {
  const body = await response.json() as T | ApiFailure;
  if (response.ok) return body as T;
  const failure = body as ApiFailure;
  throw new Error([
    failure.error?.message,
    failure.error?.recovery,
  ].filter(Boolean).join(" ") || "Studio could not complete that action.");
}

function PieceMark({ piece }: { piece: PhysicalPiece }) {
  return (
    <span className={`studio-stocktake-piece-mark${piece.imageSrc ? " is-photo" : ""}`}>
      {piece.imageSrc
        ? <img alt="" height={160} loading="lazy" src={piece.imageSrc} width={128} />
        : <Shirt aria-hidden="true" size={22} strokeWidth={1.35} />}
    </span>
  );
}

function ReceiptView({ receipt }: { receipt: Receipt }) {
  const mismatch = receipt.kind === "MISMATCH_RECORDED";
  return (
    <section
      aria-live="polite"
      className="studio-stocktake-receipt"
      data-result={mismatch ? "mismatch" : "confirmed"}
      role="status"
    >
      <span>{mismatch ? <CircleAlert aria-hidden="true" size={20} /> : <Check aria-hidden="true" size={20} />}</span>
      <div>
        <p className="eyebrow">Receipt</p>
        <h2>{receiptTitle(receipt)}</h2>
        <p>{receipt.consequence}</p>
        <small>{receipt.customerVisible ? "Customer view updated." : "Shop is unchanged."} {receipt.next}</small>
      </div>
    </section>
  );
}

function LocationPicker({
  counts,
  onChange,
  value,
}: {
  counts: Map<StocktakeLocationKey, number>;
  onChange(value: StocktakeLocationKey): void;
  value: StocktakeLocationKey;
}) {
  return (
    <fieldset className="studio-stocktake-location-picker">
      <legend>Count location</legend>
      {locations.map((location) => (
        <label data-selected={value === location.key || undefined} key={location.key}>
          <input
            checked={value === location.key}
            name="stocktake-location"
            onChange={() => onChange(location.key)}
            type="radio"
            value={location.key}
          />
          <span><MapPin aria-hidden="true" size={18} /></span>
          <strong>{location.label}</strong>
          <small>{counts.get(location.key) ?? 0} expected</small>
        </label>
      ))}
    </fieldset>
  );
}

function StocktakePieceRow({
  piece,
  session,
  state,
  unexpected = false,
}: {
  piece: PhysicalPiece;
  session: StocktakeSession;
  state: "EXCEPTION" | "NEXT";
  unexpected?: boolean;
}) {
  const href = `/studio/scan/${encodeURIComponent(pieceRouteKey(piece))}?session=${encodeURIComponent(session.id)}`;
  return (
    <StudioLink className="studio-stocktake-piece-row" data-state={state.toLowerCase()} href={href}>
      <PieceMark piece={piece} />
      <span>
        <small>{piece.sku ?? "Private piece"}</small>
        <strong>{piece.title}</strong>
        <em>{unexpected ? "Not expected in this count" : state === "EXCEPTION" ? "Location differs" : piece.expectedLocationLabel}</em>
      </span>
      <span className="studio-stocktake-piece-state">
        {state === "EXCEPTION" ? <CircleAlert aria-hidden="true" size={17} /> : <ScanLine aria-hidden="true" size={17} />}
        <ChevronRight aria-hidden="true" size={16} />
      </span>
    </StudioLink>
  );
}

export function StocktakeWorkspace({
  mode,
  pieceKey,
}: {
  mode: "scan" | "stocktake";
  pieceKey?: string;
}) {
  const searchParams = useSearchParams();
  const requestedSessionId = searchParams.get("session");
  const [data, setData] = useState<StocktakeApiPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<StocktakeLocationKey>("WARDROBE_RAIL");
  const [scanValue, setScanValue] = useState("");
  const [note, setNote] = useState("");
  const startButtonRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = pieceKey ? `?key=${encodeURIComponent(pieceKey)}` : "";
      const response = await fetch(`/api/studio/stocktake${query}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const next = await responseBody<StocktakeApiPayload>(response);
      setData(next);
      if (mode === "scan") {
        const session = requestedSessionId && next.session?.id === requestedSessionId ? next.session : null;
        const expectedKey = session?.locationKey
          ?? (next.piece?.expectedCustody === "STUDIO"
            && locations.some((location) => location.key === next.piece?.expectedLocationKey)
              ? next.piece.expectedLocationKey as StocktakeLocationKey
              : "RETURN_INSPECTION");
        setSelectedLocation(expectedKey);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Stocktake is unavailable.");
    } finally {
      setLoading(false);
    }
  }, [mode, pieceKey, requestedSessionId]);

  useEffect(() => { void load(); }, [load]);

  const session = data?.session ?? null;
  const countSession = requestedSessionId && session?.id === requestedSessionId ? session : null;
  const piecesByKey = useMemo(
    () => new Map((data?.pieces ?? []).map((piece) => [piece.pieceKey, piece])),
    [data?.pieces],
  );
  const locationCounts = useMemo(() => {
    const counts = new Map<StocktakeLocationKey, number>();
    for (const location of locations) counts.set(location.key, 0);
    for (const piece of data?.pieces ?? []) {
      const known = locations.find((location) => location.key === piece.expectedLocationKey);
      if (!known || piece.expectedCustody !== "STUDIO") continue;
      counts.set(known.key, (counts.get(known.key) ?? 0) + 1);
    }
    return counts;
  }, [data?.pieces]);

  const mobileAction = mode === "scan"
    ? receipt
      ? { href: countSession ? "/studio/stocktake" : "/studio/wardrobe", label: countSession ? "Back to count" : "Open wardrobe" }
      : { href: "#stocktake-primary-action", invokeTargetId: "stocktake-primary-action", label: pending ? "Saving…" : data?.piece?.expectedCustody === "STUDIO" && data.piece.expectedLocationKey === selectedLocation ? "Confirm in hand" : "Record mismatch" }
    : session?.canClose
      ? { href: "#stocktake-close-action", invokeTargetId: "stocktake-close-action", label: pending ? "Closing…" : "Close count" }
      : session
        ? { href: "#stocktake-scan", label: "Scan piece" }
      : { href: "#stocktake-start", invokeTargetId: "stocktake-start", label: "Start count" };
  useStudioMobileAction(mobileAction);

  async function sendCommand(body: Record<string, unknown>) {
    const response = await fetch("/api/studio/stocktake", {
      body: JSON.stringify(body),
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      method: "POST",
    });
    return responseBody<MutationPayload>(response);
  }

  async function startCount() {
    setPending(true);
    setError("");
    try {
      const result = await sendCommand({
        command: "START_COUNT",
        idempotencyKey: requestKey("stocktake:start"),
        locationKey: selectedLocation,
      });
      setReceipt(result.receipt);
      setData((current) => current ? { ...current, session: result.session } : current);
      setStartOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The count could not start.");
    } finally {
      setPending(false);
    }
  }

  async function observePiece() {
    if (!data?.piece) return;
    setPending(true);
    setError("");
    try {
      const result = await sendCommand({
        command: "OBSERVE",
        expectedVersion: countSession?.version ?? null,
        idempotencyKey: requestKey("stocktake:observe"),
        locationKey: selectedLocation,
        note: note.trim() || undefined,
        pieceKey: data.piece.pieceKey,
        stocktakeId: countSession?.id ?? null,
      });
      setReceipt(result.receipt);
      setData((current) => current ? {
        ...current,
        piece: current.piece && result.observation
          ? { ...current.piece, latestObservation: result.observation }
          : current.piece,
        session: result.session ?? current.session,
      } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The check could not be saved.");
    } finally {
      setPending(false);
    }
  }

  async function closeCount() {
    if (!session) return;
    setPending(true);
    setError("");
    try {
      const result = await sendCommand({
        command: "CLOSE_COUNT",
        expectedVersion: session.version,
        idempotencyKey: requestKey("stocktake:close"),
        stocktakeId: session.id,
      });
      setReceipt(result.receipt);
      setData((current) => current ? { ...current, session: null } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The count could not close.");
    } finally {
      setPending(false);
    }
  }

  function openScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = scanValue.trim();
    if (!key) return;
    const query = session ? `?session=${encodeURIComponent(session.id)}` : "";
    window.location.assign(`/studio/scan/${encodeURIComponent(key)}${query}`);
  }

  if (loading) return <div className="studio-loading" role="status">Opening stocktake…</div>;

  if (mode === "scan") {
    const piece = data?.piece;
    if (!piece) {
      return (
        <section className="studio-stocktake-unavailable">
          <CircleAlert aria-hidden="true" size={28} />
          <p className="eyebrow">Scan</p>
          <h1>{error || "Piece not found."}</h1>
          <StudioLink className="button button-primary" href="/studio/stocktake">Open stocktake</StudioLink>
        </section>
      );
    }
    const willMatch = piece.expectedCustody === "STUDIO" && piece.expectedLocationKey === selectedLocation;
    return (
      <article className="studio-scan-page">
        <StudioLink className="studio-dossier-back" href="/studio/stocktake">
          <ArrowLeft aria-hidden="true" size={17} />Stocktake
        </StudioLink>

        {receipt ? <ReceiptView receipt={receipt} /> : null}

        <section className="studio-scan-piece-hero">
          <figure className={piece.imageSrc ? "is-photo" : ""}>
            {piece.imageSrc
              ? <img alt={`${piece.title} garment view`} height={1280} src={piece.imageSrc} width={1024} />
              : <Shirt aria-hidden="true" size={62} strokeWidth={1.1} />}
          </figure>
          <div>
            <p className="eyebrow">{piece.sku ?? "Private piece"}</p>
            <h1>{piece.title}</h1>
            <p>{piece.colour} · {piece.sizeLabel} · {piece.condition}</p>
            <span data-availability={piece.availability.toLowerCase()}>{piece.availability.toLowerCase()}</span>
          </div>
        </section>

        <section className="studio-scan-truth" aria-labelledby="scan-truth-title">
          <header><p className="eyebrow">Current truth</p><h2 id="scan-truth-title">Where should it be?</h2></header>
          <dl>
            <div><dt>Expected</dt><dd>{piece.expectedLocationLabel}</dd></div>
            <div><dt>Custody</dt><dd>{piece.expectedCustody === "STUDIO" ? "In Studio" : piece.expectedLocationLabel}</dd></div>
            <div><dt>Last seen</dt><dd>{piece.latestObservation ? `${piece.latestObservation.observedLocationLabel} · ${formatTime(piece.latestObservation.occurredAt)}` : "Not physically confirmed"}</dd></div>
            {piece.orderReference ? <div><dt>Order</dt><dd>{piece.orderReference}</dd></div> : null}
          </dl>
        </section>

        {!receipt ? (
          <section className="studio-scan-action" aria-labelledby="scan-action-title">
            <header>
              <span>{willMatch ? <PackageCheck aria-hidden="true" size={21} /> : <CircleAlert aria-hidden="true" size={21} />}</span>
              <div><p className="eyebrow">One action</p><h2 id="scan-action-title">{willMatch ? "Confirm in hand" : "Record what you see"}</h2></div>
            </header>
            <label>
              <span>Observed at</span>
              <select
                disabled={Boolean(countSession)}
                onChange={(event) => setSelectedLocation(event.target.value as StocktakeLocationKey)}
                value={selectedLocation}
              >
                {locations.map((location) => <option key={location.key} value={location.key}>{location.label}</option>)}
              </select>
            </label>
            <label>
              <span>Note <small>Optional</small></span>
              <input maxLength={240} onChange={(event) => setNote(event.target.value)} placeholder="Visible condition or handoff note" value={note} />
            </label>
            <div className="studio-scan-consequence">
              <strong>{willMatch ? `${piece.title} will be confirmed at ${locations.find((location) => location.key === selectedLocation)?.label.toLowerCase()}.` : "A mismatch will be recorded for review."}</strong>
              <small>Shop and order state will not change.</small>
            </div>
            <button
              className="button button-primary"
              disabled={pending}
              id="stocktake-primary-action"
              onClick={() => void observePiece()}
              type="button"
            >
              {pending ? <RefreshCw aria-hidden="true" className="studio-spin" size={17} /> : willMatch ? <Check aria-hidden="true" size={17} /> : <CircleAlert aria-hidden="true" size={17} />}
              {pending ? "Saving…" : willMatch ? "Confirm in hand" : "Record mismatch"}
            </button>
            {error ? <p className="studio-stocktake-error" role="alert">{error}</p> : null}
          </section>
        ) : (
          <div className="studio-stocktake-receipt-actions">
            {receipt.kind === "MISMATCH_RECORDED" && piece.orderReference ? (
              <StudioLink className="button button-primary" href={`/studio/orders/${encodeURIComponent(piece.orderReference)}`}>Review order</StudioLink>
            ) : null}
            <StudioLink className="button button-secondary" href={countSession ? "/studio/stocktake" : `/studio/wardrobe/${encodeURIComponent(piece.wardrobeItemId ?? piece.sku ?? piece.pieceKey)}`}>
              {countSession ? "Back to count" : "Open piece"}
            </StudioLink>
          </div>
        )}
      </article>
    );
  }

  const exceptionPieces = session?.exceptionPieceKeys.flatMap((key) => {
    const piece = piecesByKey.get(key);
    return piece ? [piece] : [];
  }) ?? [];
  const expectedPieceKeys = new Set(session?.expectedPieces.map((piece) => piece.pieceKey) ?? []);
  const unexpectedPieceKeys = new Set(
    session?.exceptionPieceKeys.filter((key) => !expectedPieceKeys.has(key)) ?? [],
  );
  const unscannedPieces = session?.unscannedPieceKeys.flatMap((key) => {
    const piece = piecesByKey.get(key);
    return piece ? [piece] : [];
  }) ?? [];
  const progress = session
    ? Math.round((session.confirmedPieceKeys.length / session.expectedPieces.length) * 100)
    : 0;

  return (
    <div className="studio-stocktake-page">
      <header className="studio-stocktake-heading">
        <div><p className="eyebrow">Stocktake</p><h1>{session ? session.locationLabel : "Count what is here."}</h1><p>{session ? "Scan each piece. Resolve only what differs." : "Choose a location, then scan every piece."}</p></div>
        {session ? <span>{session.confirmedPieceKeys.length}/{session.expectedPieces.length}</span> : <ScanLine aria-hidden="true" size={30} strokeWidth={1.3} />}
      </header>

      {receipt ? <ReceiptView receipt={receipt} /> : null}
      {error ? <p className="studio-stocktake-error" role="alert">{error}</p> : null}

      {session ? (
        <>
          <section className="studio-stocktake-progress" aria-label={`${progress}% of count complete`}>
            <div><span style={{ width: `${progress}%` }} /></div>
            <p><strong>{session.confirmedPieceKeys.length} confirmed</strong><span>{session.exceptionPieceKeys.length} exceptions · {session.unscannedPieceKeys.length} left</span></p>
          </section>

          <form className="studio-stocktake-scan-form" id="stocktake-scan" onSubmit={openScan}>
            <label htmlFor="stocktake-code">Scan or enter label</label>
            <div><ScanLine aria-hidden="true" size={19} /><input autoCapitalize="characters" autoCorrect="off" id="stocktake-code" onChange={(event) => setScanValue(event.target.value)} placeholder="JUW-001" value={scanValue} /><button type="submit">Open</button></div>
          </form>

          {exceptionPieces.length ? (
            <section className="studio-stocktake-list" aria-labelledby="stocktake-exceptions">
              <header><div><p className="eyebrow">Resolve</p><h2 id="stocktake-exceptions">Exceptions</h2></div><span>{exceptionPieces.length}</span></header>
              {unexpectedPieceKeys.size ? <p role="alert">Unexpected piece recorded. This count cannot close while that scan remains outside its frozen list.</p> : null}
              {exceptionPieces.map((piece) => <StocktakePieceRow key={piece.pieceKey} piece={piece} session={session} state="EXCEPTION" unexpected={unexpectedPieceKeys.has(piece.pieceKey)} />)}
            </section>
          ) : null}

          {unscannedPieces.length ? (
            <section className="studio-stocktake-list" aria-labelledby="stocktake-next">
              <header><div><p className="eyebrow">Next</p><h2 id="stocktake-next">Still to scan</h2></div><span>{unscannedPieces.length}</span></header>
              {unscannedPieces.map((piece) => <StocktakePieceRow key={piece.pieceKey} piece={piece} session={session} state="NEXT" />)}
            </section>
          ) : null}

          {session.canClose ? (
            <section className="studio-stocktake-close">
              <span><Check aria-hidden="true" size={20} /></span>
              <div><p className="eyebrow">All confirmed</p><h2>Close this count.</h2><p>{session.expectedPieces.length} pieces match {session.locationLabel.toLowerCase()}.</p></div>
              <button className="button button-primary" disabled={pending} id="stocktake-close-action" onClick={() => void closeCount()} type="button">{pending ? "Closing…" : "Close count"}</button>
            </section>
          ) : null}
        </>
      ) : (
        <>
          <section className="studio-stocktake-locations" aria-label="Physical locations">
            {locations.map((location) => (
              <button key={location.key} onClick={() => { setSelectedLocation(location.key); setStartOpen(true); }} type="button">
                <span><MapPin aria-hidden="true" size={18} /></span>
                <strong>{location.label}</strong>
                <small>{locationCounts.get(location.key) ?? 0} expected</small>
                <ChevronRight aria-hidden="true" size={17} />
              </button>
            ))}
          </section>

          <button className="button button-primary studio-stocktake-start" id="stocktake-start" onClick={() => setStartOpen(true)} ref={startButtonRef} type="button">
            <ScanLine aria-hidden="true" size={18} />Start count
          </button>

          <section className="studio-stocktake-recent" aria-labelledby="recent-checks">
            <header><p className="eyebrow">Last seen</p><h2 id="recent-checks">Recent checks</h2></header>
            {(data?.pieces ?? []).filter((piece) => piece.latestObservation).slice(0, 5).map((piece) => (
              <StudioLink href={`/studio/scan/${encodeURIComponent(pieceRouteKey(piece))}`} key={piece.pieceKey}>
                <PieceMark piece={piece} />
                <span><strong>{piece.title}</strong><small>{piece.latestObservation?.observedLocationLabel} · {piece.latestObservation ? formatTime(piece.latestObservation.occurredAt) : ""}</small></span>
                {piece.latestObservation?.result === "MATCH" ? <Check aria-hidden="true" size={17} /> : <CircleAlert aria-hidden="true" size={17} />}
              </StudioLink>
            ))}
            {(data?.pieces ?? []).some((piece) => piece.latestObservation) ? null : <p>No physical checks yet.</p>}
          </section>
        </>
      )}

      <StudioTaskSheet
        className="studio-stocktake-start-sheet"
        eyebrow="Stocktake"
        footer={<button className="button button-primary" disabled={pending || (locationCounts.get(selectedLocation) ?? 0) === 0} onClick={() => void startCount()} type="button">{pending ? "Starting…" : "Start count"}</button>}
        onDismiss={() => { if (pending) return false; setStartOpen(false); }}
        open={startOpen}
        returnFocus={startButtonRef.current}
        title="Choose a location"
      >
        <LocationPicker counts={locationCounts} onChange={setSelectedLocation} value={selectedLocation} />
        <p className="studio-stocktake-sheet-note">Studio freezes what is expected now. Shop stays unchanged.</p>
      </StudioTaskSheet>
    </div>
  );
}
