import type { ShopCustomerSession } from "../../auth/customer";
import { StudioEngineError } from "../../studio/engine/errors";
import type { ShopCustomerActor, ShopOperatorActor } from "./types";
import { ShopOrderError } from "./types";

function cleanClaim(value: string | null | undefined, maximum: number): string | undefined {
  if (!value) return undefined;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned && cleaned.length <= maximum ? cleaned : undefined;
}

export function customerActorFromSession(session: ShopCustomerSession | null): ShopCustomerActor | null {
  if (!session) return null;
  const subject = session.id;
  if (!subject || subject !== subject.trim() || subject.length > 255) {
    throw new ShopOrderError("UNAUTHENTICATED", "The authenticated user ID is invalid.");
  }
  const email = cleanClaim(session.email.toLowerCase(), 320);
  const displayName = cleanClaim(session.name, 120);
  return {
    kind: "CUSTOMER",
    subject,
    ...(email ? { email } : {}),
    ...(displayName ? { displayName } : {}),
  };
}

export async function resolveCustomerActor(request?: Request): Promise<ShopCustomerActor | null> {
  void request;
  const { getShopCustomerSession } = await import("../../auth/customer");
  return customerActorFromSession(await getShopCustomerSession());
}

export async function resolveOperatorActor(request?: Request): Promise<ShopOperatorActor | null> {
  void request;
  if (process.env.STUDIO_AI_ENGINE_AUTH_MODE !== "neon-auth") {
    throw new ShopOrderError(
      "PERSISTENCE_UNAVAILABLE",
      "Connected order operations require managed Neon Auth.",
    );
  }
  try {
    const { requireStudioOperator } = await import("../../server/studio-operator");
    const operator = await requireStudioOperator();
    return {
      kind: "OPERATOR",
      subject: operator.actorSubject,
      workspaceId: operator.workspaceId,
      workspaceSubject: operator.workspaceSubject,
      email: cleanClaim(operator.email.toLowerCase(), 320),
      displayName: cleanClaim(operator.displayName, 120),
      role: operator.role,
    };
  } catch (error) {
    if (error instanceof StudioEngineError) {
      if (error.status === 401) return null;
      if (error.status === 403) {
        throw new ShopOrderError("FORBIDDEN", "Active Studio operator membership is required.", { cause: error });
      }
      throw new ShopOrderError("PERSISTENCE_UNAVAILABLE", "Studio authorization is temporarily unavailable.", { cause: error });
    }
    throw error;
  }
}

export function requireCustomerActor(actor: ShopCustomerActor | null): ShopCustomerActor {
  if (!actor) throw new ShopOrderError("UNAUTHENTICATED", "Authentication is required.");
  return actor;
}

export function requireOperatorActor(actor: ShopOperatorActor | null): ShopOperatorActor {
  if (!actor) throw new ShopOrderError("UNAUTHENTICATED", "Authentication is required.");
  return actor;
}
