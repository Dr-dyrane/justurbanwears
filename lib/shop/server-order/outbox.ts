import type {
  ShopNotificationOutboxMessage,
  ShopOrderStore,
} from "./types";

export interface NotificationSink {
  readonly kind: "EMAIL" | "PREVIEW";
  deliver(message: ShopNotificationOutboxMessage): Promise<void>;
}

export type PreviewNotificationSink = NotificationSink & { readonly kind: "PREVIEW" };

export interface DispatchNotificationOutboxOptions {
  workerId: string;
  limit?: number;
  now?: () => Date;
  retryDelayMs?: number;
}

/**
 * At-least-once dispatcher. Sinks must deduplicate on `dedupeKey`; delivery
 * state remains durable in Postgres and changes only after provider acceptance.
 */
export async function dispatchNotificationOutbox(
  store: ShopOrderStore,
  sink: NotificationSink,
  {
    workerId,
    limit = 20,
    now = () => new Date(),
    retryDelayMs = 60_000,
  }: DispatchNotificationOutboxOptions,
): Promise<{ delivered: number; failed: number }> {
  const claimedAt = now();
  const messages = await store.claimPreviewOutbox(workerId, Math.min(Math.max(limit, 1), 100), claimedAt);
  let delivered = 0;
  let failed = 0;
  for (const message of messages) {
    try {
      await sink.deliver(message);
      await store.markPreviewOutboxDelivered(message.id, workerId, now());
      delivered += 1;
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Notification delivery failed.";
      const retryAt = new Date(now().getTime() + retryDelayMs);
      await store.markPreviewOutboxFailed(
        message.id,
        workerId,
        messageText.slice(0, 500),
        retryAt,
      );
      failed += 1;
    }
  }
  return { delivered, failed };
}

export const dispatchPreviewNotificationOutbox = dispatchNotificationOutbox;
