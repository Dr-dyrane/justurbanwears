export type StudioServiceKey =
  | "wardrobe"
  | "atelier"
  | "shop"
  | "orders"
  | "inventory"
  | "models"
  | "operations";

export const STUDIO_PRIMARY_SERVICE_KEYS = [
  "wardrobe",
  "atelier",
  "orders",
  "operations",
] as const satisfies readonly StudioServiceKey[];

export type StudioPrimaryServiceKey = (typeof STUDIO_PRIMARY_SERVICE_KEYS)[number];

export interface StudioServiceDefinition {
  aliases: readonly string[];
  description: string;
  href: string;
  key: StudioServiceKey;
  label: string;
}

export type StudioPrimaryServiceDefinition = Omit<StudioServiceDefinition, "key"> & {
  key: StudioPrimaryServiceKey;
};

export const STUDIO_SERVICES: readonly StudioServiceDefinition[] = [
  {
    key: "wardrobe",
    label: "Wardrobe",
    description: "Bring in pieces, keep garment truth, and finish private drafts.",
    href: "/studio/wardrobe",
    aliases: ["garment", "piece", "intake", "clothes", "draft"],
  },
  {
    key: "atelier",
    label: "Atelier",
    description: "Create, review, and keep approved Wear and product imagery.",
    href: "/studio/media",
    aliases: ["media", "wear", "image", "photo", "generate", "shoot"],
  },
  {
    key: "shop",
    label: "Shop",
    description: "Check publication readiness and preview what customers see.",
    href: "/studio/wardrobe?view=publishing",
    aliases: ["publish", "listing", "public", "store", "catalogue"],
  },
  {
    key: "orders",
    label: "Orders",
    description: "Verify, prepare, hand off, complete, or receive a return.",
    href: "/studio/orders",
    aliases: ["order", "customer", "payment", "delivery", "fulfilment", "return"],
  },
  {
    key: "inventory",
    label: "Inventory",
    description: "See availability, locations, holds, and physical stock.",
    href: "/studio/operations?view=inventory",
    aliases: ["stock", "stocktake", "hold", "location", "available"],
  },
  {
    key: "models",
    label: "Models",
    description: "Manage approved identity, consent, body canon, and styling.",
    href: "/studio/models",
    aliases: ["lulu", "identity", "face", "body", "styling", "consent"],
  },
  {
    key: "operations",
    label: "Operations",
    description: "Resolve attention, system state, and recovery work.",
    href: "/studio/operations",
    aliases: ["updates", "attention", "issue", "recovery", "system", "status"],
  },
] as const;

export const STUDIO_SERVICE_KEYS = STUDIO_SERVICES.map((service) => service.key);

export const STUDIO_PRIMARY_SERVICES: readonly StudioPrimaryServiceDefinition[] = STUDIO_PRIMARY_SERVICE_KEYS.map((key) => {
  const service = STUDIO_SERVICES.find((candidate) => candidate.key === key);
  if (!service) throw new Error(`Missing primary Studio service: ${key}`);
  return { ...service, key };
});
