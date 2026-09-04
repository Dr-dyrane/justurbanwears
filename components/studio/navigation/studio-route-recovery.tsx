"use client";

import { RotateCcw, SearchX } from "lucide-react";
import { StudioLink } from "../atoms/studio-link";
import { StudioStackPage } from "../atoms/studio-stack-page";

export function StudioRouteRecovery({
  kind,
  onRetry,
}: {
  kind: "error" | "not-found";
  onRetry?: () => void;
}) {
  const isError = kind === "error";
  const Icon = isError ? RotateCcw : SearchX;

  return (
    <StudioStackPage className="studio-route-recovery" kind="workflow">
      <Icon aria-hidden="true" size={30} strokeWidth={1.5} />
      <p className="eyebrow">{isError ? "Studio interrupted" : "Studio route"}</p>
      <h1>{isError ? "This Studio page did not open." : "This Studio page was not found."}</h1>
      <p>
        {isError
          ? "Your Studio session is still open. Try this page once more."
          : "The link may be old or incomplete. Return to Studio Home to choose the current workflow."}
      </p>
      {isError && onRetry ? (
        <button className="button button-primary" onClick={onRetry} type="button">Try again</button>
      ) : (
        <StudioLink className="button button-primary" href="/studio">Open Studio Home</StudioLink>
      )}
    </StudioStackPage>
  );
}
