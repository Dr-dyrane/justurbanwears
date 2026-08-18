import {
  CATALOGUE_NAMESPACE,
  compareCatalogueRows,
  decideRevision,
  LEGACY_CATALOGUE_SKUS,
  queryRows,
} from "./release-core.mjs";

async function readLedger(transaction, revision, target) {
  const matching = queryRows(await transaction.query(
    'select "namespace", "revision", "target", "checksum", "row_count" from "shop_seed_ledger" where "namespace" = $1 and "revision" = $2 and "target" = $3',
    [CATALOGUE_NAMESPACE, revision, target],
  ));
  if (matching[0]) return matching[0];
  const otherTarget = queryRows(await transaction.query(
    'select "namespace", "revision", "target", "checksum", "row_count" from "shop_seed_ledger" where "namespace" = $1 and "revision" = $2',
    [CATALOGUE_NAMESPACE, revision],
  ));
  if (otherTarget[0]) throw new Error(`Seed revision ${revision} was recorded for a different target.`);
  return undefined;
}

async function compareStoredRows(transaction, manifest) {
  const skus = manifest.products.map((product) => product.sku);
  const verificationSkus = [...skus, ...LEGACY_CATALOGUE_SKUS];
  const catalogueRows = queryRows(await transaction.query(
    `select catalogue.*, publication.origin as publication_origin,
      publication.baseline as publication_baseline
     from "shop_catalogue_items" catalogue
     left join "studio_catalogue_publications" publication on publication.sku = catalogue.sku
     where catalogue."sku" = any($1::varchar[])`,
    [verificationSkus],
  ));
  const inventoryRows = queryRows(await transaction.query(
    'select "sku" from "shop_inventory" where "sku" = any($1::varchar[])',
    [verificationSkus],
  ));
  const releaseRows = catalogueRows.map((row) => {
    if (row.publication_origin !== "CATALOGUE_ADOPTED") return row;
    if (!row.publication_baseline || typeof row.publication_baseline !== "object") {
      throw new Error(`Catalogue adoption baseline is missing for ${row.sku}.`);
    }
    return { ...row, ...row.publication_baseline };
  });
  const issues = compareCatalogueRows(manifest, releaseRows, inventoryRows);
  if (issues.length) throw new Error(`Catalogue verification failed:\n- ${issues.join("\n- ")}`);
}

export async function verifyCatalogueInTransaction(transaction, manifest, validation, target) {
  const ledger = await readLedger(transaction, manifest.revision, target);
  const decision = decideRevision(ledger, {
    namespace: CATALOGUE_NAMESPACE,
    revision: manifest.revision,
    checksum: validation.checksum,
    rowCount: validation.productCount,
    target,
  });
  if (decision !== "noop") throw new Error(`Seed revision ${manifest.revision} is not applied.`);
  await compareStoredRows(transaction, manifest);
}

export async function applyCatalogueInTransaction(transaction, manifest, plan, target) {
  const ledger = await readLedger(transaction, plan.revision, target);
  const decision = decideRevision(ledger, {
    namespace: plan.namespace,
    revision: plan.revision,
    checksum: plan.checksum,
    rowCount: plan.productCount,
    target,
  });
  if (decision === "noop") {
    await compareStoredRows(transaction, manifest);
    return decision;
  }
  const adoptedRows = queryRows(await transaction.query(
    `select sku from studio_catalogue_publications where origin = 'CATALOGUE_ADOPTED'`,
  ));
  const adoptedSkus = new Set(adoptedRows.map((row) => row.sku));
  for (const query of plan.catalogue) {
    if (!adoptedSkus.has(query.values[0])) await transaction.query(query.text, query.values);
  }
  for (const query of plan.inventory) await transaction.query(query.text, query.values);
  await compareStoredRows(transaction, manifest);
  await transaction.query(plan.ledger.text, plan.ledger.values);
  return decision;
}
