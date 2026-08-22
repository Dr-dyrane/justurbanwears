const REPEATED_SUPPORTING_PIECE = "Black Cropped Tee";
const PRODUCT_CONJUNCTION = " and ";

type ProductDisplayNameParts = {
  lead: string;
  primary: string;
  supportingLead: boolean;
} | null;

function splitProductDisplayName(name: string): ProductDisplayNameParts {
  const conjunctionIndex = name.indexOf(PRODUCT_CONJUNCTION);
  if (conjunctionIndex <= 0) return null;

  const lead = name.slice(0, conjunctionIndex);
  const primary = name.slice(conjunctionIndex + PRODUCT_CONJUNCTION.length);
  if (!primary) return null;

  return {
    lead,
    primary,
    supportingLead: lead === REPEATED_SUPPORTING_PIECE,
  };
}

export function ProductDisplayName({ name }: { name: string }) {
  const parts = splitProductDisplayName(name);
  if (!parts) return name;

  return (
    <span className={`shop-product-display-name${parts.supportingLead ? " has-supporting-lead" : ""}`}>
      <span className={parts.supportingLead ? "shop-product-name-supporting" : undefined}>{parts.lead}</span>
      <span className="shop-product-name-conjunction">
        <span className="sr-only"> and </span>
        <span aria-hidden="true" className="shop-product-name-conjunction-visual"> & </span>
      </span>
      <span className="shop-product-name-primary">{parts.primary}</span>
    </span>
  );
}
