"use client";

import {
  ArrowRight,
  Ban,
  CheckCircle2,
  CircleAlert,
  FilePenLine,
  Images,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import type {
  StudioAssistantOperation,
  StudioAssistantToolOutput,
  StudioAssistantToolRecord,
} from "../../../lib/studio/assistant/tool-contracts";
import { StudioFeedback } from "../atoms/studio-feedback";
import { StudioLink as Link } from "../atoms/studio-link";

function RecordIcon({ record }: { record: StudioAssistantToolRecord }) {
  if (record.type === "MEDIA" || record.type === "MODEL") {
    return <Images aria-hidden="true" size={18} />;
  }
  if (record.type === "INVENTORY") {
    return <RotateCcw aria-hidden="true" size={18} />;
  }
  return <FilePenLine aria-hidden="true" size={18} />;
}

function ToolRecord({ onPrompt, record }: {
  onPrompt(prompt: string): void;
  record: StudioAssistantToolRecord;
}) {
  const selectionPrompt = record.reference
    ? `Tell me about ${record.reference}.`
    : `Open ${record.label}.`;
  return (
    <article className="studio-ask-tool-record">
      <button onClick={() => onPrompt(selectionPrompt)} type="button">
        <span className="studio-ask-tool-record-icon"><RecordIcon record={record} /></span>
        <span>
          {record.reference ? <small>{record.reference}</small> : null}
          <strong>{record.label}</strong>
          {record.detail ? <em>{record.detail}</em> : null}
        </span>
        {record.state ? <small className="studio-ask-tool-state">{record.state.toLocaleLowerCase("en-NG")}</small> : null}
        <ArrowRight aria-hidden="true" size={18} />
      </button>
      {record.fields.length ? (
        <dl className="studio-ask-tool-fields">
          {record.fields.map((field) => (
            <div key={`${field.label}:${field.value}`}><dt>{field.label}</dt><dd>{field.value}</dd></div>
          ))}
        </dl>
      ) : null}
      {record.media.length ? (
        <div className="studio-ask-tool-media">
          {record.media.map((media) => <img alt={media.alt} key={media.src} loading="lazy" src={media.src} />)}
        </div>
      ) : null}
      <Link className="studio-ask-tool-open" href={record.href}>Open in Studio <ArrowRight aria-hidden="true" size={15} /></Link>
    </article>
  );
}

function OperationResult({
  busy,
  onCancel,
  onPrompt,
  onReview,
  operation,
}: {
  busy: boolean;
  onCancel(operation: StudioAssistantOperation): void;
  onPrompt(prompt: string): void;
  onReview(operation: StudioAssistantOperation, returnFocus: HTMLElement): void;
  operation: StudioAssistantOperation;
}) {
  if (operation.state === "EXECUTING") {
    return (
      <div className="studio-ask-operation-reconcile">
        <StudioFeedback
          detail={operation.lastError?.recovery ?? "Keep this conversation open. Ask Studio will reconcile the exact operation before another command can run."}
          state="loading"
          title={operation.lastError?.code === "INDETERMINATE" ? "Outcome needs reconciliation" : "Applying and reconciling"}
        />
        <button disabled={busy} onClick={(event) => onReview(operation, event.currentTarget)} type="button">
          Reconcile <RotateCcw aria-hidden="true" size={15} />
        </button>
      </div>
    );
  }
  if (operation.state === "SUCCEEDED" && operation.receipt) {
    return (
      <div className="studio-ask-operation-receipt">
        <StudioFeedback detail={operation.receipt.detail} state="success" title={operation.receipt.title} />
        <dl>
          <div><dt>Receipt</dt><dd>{operation.receipt.receiptId}</dd></div>
          <div><dt>Applied by</dt><dd>{operation.receipt.actor.displayName}</dd></div>
          <div><dt>Outcome</dt><dd>{operation.receipt.outcome.toLocaleLowerCase("en-NG")}</dd></div>
        </dl>
        <div className="studio-ask-operation-actions">
          {operation.receipt.nextPrompt ? <button disabled={busy} onClick={() => onPrompt(operation.receipt!.nextPrompt!)} type="button">Continue <ArrowRight aria-hidden="true" size={15} /></button> : null}
          {operation.receipt.route ? <Link href={operation.receipt.route}>Open result <ArrowRight aria-hidden="true" size={15} /></Link> : null}
        </div>
      </div>
    );
  }
  if (operation.state === "FAILED" && operation.lastError) {
    return <StudioFeedback detail={`${operation.lastError.message} ${operation.lastError.recovery}`} state="error" title="Change not applied" />;
  }
  if (operation.state === "CANCELLED") {
    return (
      <div className="studio-ask-operation-cancelled">
        <Ban aria-hidden="true" size={18} />
        <span><strong>Prepared change cancelled</strong><small>No garment or Shop state changed.</small></span>
      </div>
    );
  }
  return (
    <article className="studio-ask-prepared-change">
      <header>
        <span><CheckCircle2 aria-hidden="true" size={18} /></span>
        <div><small>Prepared · {operation.preview.risk}</small><strong>{operation.preview.summary}</strong></div>
      </header>
      <dl className="studio-decision-diff">
        {operation.preview.changes.map((change) => (
          <div key={`${change.field}:${change.after}`}>
            <dt>{change.label}</dt><dd>{change.before}</dd><span aria-hidden="true">→</span><dd>{change.after}</dd>
          </div>
        ))}
      </dl>
      {operation.preview.media?.length ? (
        <div className="studio-ask-prepared-media">
          {operation.preview.media.map((media) => (
            <figure key={media.id}>
              <img alt={media.label} loading="lazy" src={media.src} />
              <figcaption>{media.label}</figcaption>
            </figure>
          ))}
        </div>
      ) : null}
      <p>{operation.preview.consequence}</p>
      <div className="studio-ask-operation-actions">
        <button disabled={busy} onClick={(event) => onReview(operation, event.currentTarget)} type="button">Review change <ArrowRight aria-hidden="true" size={15} /></button>
        <button disabled={busy} onClick={() => onCancel(operation)} type="button">Cancel draft</button>
      </div>
    </article>
  );
}

export function StudioAssistantToolResult({
  busy,
  onCancel,
  onPrompt,
  onReview,
  operation,
  output,
}: {
  busy: boolean;
  onCancel(operation: StudioAssistantOperation): void;
  onPrompt(prompt: string): void;
  onReview(operation: StudioAssistantOperation, returnFocus: HTMLElement): void;
  operation?: StudioAssistantOperation | null;
  output: StudioAssistantToolOutput;
}) {
  const currentOperation = operation ?? output.operation;
  if (currentOperation) {
    return <OperationResult busy={busy} onCancel={onCancel} onPrompt={onPrompt} onReview={onReview} operation={currentOperation} />;
  }
  return (
    <section className={`studio-ask-tool-result is-${output.outcome.toLocaleLowerCase("en-US")}`}>
      <header>
        {output.outcome === "BLOCKED" ? <CircleAlert aria-hidden="true" size={18} /> : null}
        <div><strong>{output.title}</strong><p>{output.summary}</p></div>
      </header>
      {output.records.length ? <div className="studio-ask-tool-records">{output.records.map((record) => <ToolRecord key={`${record.type}:${record.id}`} onPrompt={onPrompt} record={record} />)}</div> : null}
      {output.actions.length ? (
        <div className="studio-ask-operation-actions">
          {output.actions.map((candidate) => candidate.prompt
            ? <button disabled={busy} key={`${candidate.label}:${candidate.prompt}`} onClick={() => onPrompt(candidate.prompt!)} type="button">{candidate.label}<ArrowRight aria-hidden="true" size={15} /></button>
            : candidate.href
              ? <Link href={candidate.href} key={`${candidate.label}:${candidate.href}`}>{candidate.label}<ArrowRight aria-hidden="true" size={15} /></Link>
              : null)}
        </div>
      ) : null}
    </section>
  );
}

export function StudioAssistantToolPending() {
  return <div className="studio-ask-resolving" role="status"><LoaderCircle aria-hidden="true" size={17} />Reading current Studio truth</div>;
}
