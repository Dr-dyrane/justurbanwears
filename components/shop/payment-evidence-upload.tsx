"use client";

import { FileCheck2, Upload } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { authSignInPath } from "../../lib/auth/return-to";
import { mapConnectedOrderFailure } from "../../lib/shop/connected-order-client";
import type { ShopServerOrder } from "../../lib/shop/server-order/types";
import type { ShopBankTransferInstructions } from "../../lib/shop/server-order/commerce-guidance";

const MAX_BYTES = 5_000_000;
const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function PaymentEvidenceUpload({
  paymentInstructions,
  reference,
  onReceived,
}: {
  paymentInstructions: ShopBankTransferInstructions;
  reference: string;
  onReceived(order: ShopServerOrder): void;
}) {
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const file = selectedFile ?? inputRef.current?.files?.[0];
    setError("");
    setProgress("");
    if (!file) {
      setError("Choose an image or PDF first.");
      return;
    }
    if (!acceptedTypes.has(file.type)) {
      setError("Use a JPG, PNG, WebP, or PDF file.");
      return;
    }
    if (file.size < 1 || file.size > MAX_BYTES) {
      setError("Choose a file smaller than 5 MB.");
      return;
    }

    setPending(true);
    setProgress("Checking the file…");
    try {
      const fingerprint = await sha256(file);
      setProgress("Preparing secure upload…");
      const authorizationResponse = await fetch(
        `/api/shop/orders/${encodeURIComponent(reference)}/payment-evidence/authorizations`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            idempotencyKey: `evidence:${reference}:${fingerprint.slice(0, 16)}:${crypto.randomUUID()}`,
            originalFileName: file.name,
            contentType: file.type,
            byteSize: file.size,
            sha256: fingerprint,
          }),
        },
      );
      const authorizationBody = await authorizationResponse.json().catch(() => ({})) as {
        ok?: boolean;
        authorization?: {
          uploadUrl?: string;
          contentType?: string;
          byteSize?: number;
          sha256?: string;
        };
        error?: { code?: string };
      };
      const authorization = authorizationBody.authorization;
      if (
        !authorizationResponse.ok
        || !authorizationBody.ok
        || !authorization?.uploadUrl
        || authorization.contentType !== file.type
        || authorization.byteSize !== file.size
        || authorization.sha256 !== fingerprint
      ) {
        const failure = mapConnectedOrderFailure(authorizationResponse.status, authorizationBody.error?.code);
        if (failure.kind === "AUTH_REQUIRED") {
          window.location.assign(authSignInPath(`/shop/orders/${reference}`));
          return;
        }
        throw new Error(failure.message);
      }

      setProgress("Uploading your receipt…");
      const uploadResponse = await fetch(authorization.uploadUrl, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "content-type": file.type,
          "x-content-sha256": fingerprint,
        },
        body: file,
      });
      const uploadBody = await uploadResponse.json().catch(() => ({})) as {
        ok?: boolean;
        order?: ShopServerOrder;
        error?: { code?: string };
      };
      if (!uploadResponse.ok || !uploadBody.ok || !uploadBody.order) {
        const failure = mapConnectedOrderFailure(uploadResponse.status, uploadBody.error?.code);
        if (failure.kind === "AUTH_REQUIRED") {
          window.location.assign(authSignInPath(`/shop/orders/${reference}`));
          return;
        }
        if (uploadBody.error?.code === "EVIDENCE_AUTHORIZATION_EXPIRED") {
          throw new Error("The private upload window expired. Send the same file again.");
        }
        throw new Error(failure.message);
      }
      onReceived(uploadBody.order);
      if (inputRef.current) inputRef.current.value = "";
      setSelectedFile(null);
      setProgress("Receipt sent. Lulu will check it and confirm your payment.");
    } catch (cause) {
      setProgress("");
      setError(cause instanceof Error ? cause.message : "The upload could not be completed. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="shop-evidence-upload" aria-labelledby="payment-evidence-title">
      <div className="shop-form-section-heading">
        <span aria-hidden="true"><FileCheck2 size={18} /></span>
        <div>
          <p className="shop-kicker">Transfer receipt</p>
          <h2 id="payment-evidence-title">Send your receipt.</h2>
        </div>
      </div>
      <p>
        Transfer to <strong>{paymentInstructions.bankName} · {paymentInstructions.accountNumber}</strong>,
        {" "}account name <strong>{paymentInstructions.accountName}</strong>. Then upload the receipt from your bank.
      </p>
      <form aria-busy={pending} onSubmit={submit}>
        <label>
          <span>Image or PDF · 5 MB maximum</span>
          <input
            accept="image/jpeg,image/png,image/webp,application/pdf"
            disabled={pending}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              setSelectedFile(file);
              setError("");
              setProgress(file ? "File selected and ready for your confirmation." : "");
            }}
            ref={inputRef}
            required
            type="file"
          />
          {selectedFile ? (
            <small className="shop-selected-file" aria-live="polite">
              Selected: {selectedFile.name} · {Math.ceil(selectedFile.size / 1024)} KB
            </small>
          ) : null}
        </label>
        <button className="shop-action shop-action-primary" disabled={pending} type="submit">
          <Upload aria-hidden="true" size={16} />
          {pending ? "Sending receipt…" : "Send receipt"}
        </button>
      </form>
      {progress ? <p className="shop-evidence-feedback" aria-live="polite" role="status">{progress}</p> : null}
      {error ? <p className="shop-evidence-feedback is-error" role="alert">{error}</p> : null}
    </section>
  );
}
