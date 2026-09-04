DO $$
DECLARE
	drop_01_id uuid;
	drop_02_id uuid;
	drop_01_skus text[] := ARRAY[
		'JUW-001', 'JUW-002', 'JUW-003', 'JUW-004',
		'JUW-005', 'JUW-006', 'JUW-007', 'JUW-008',
		'JUW-009', 'JUW-010', 'JUW-011', 'JUW-012',
		'JUW-013', 'JUW-014', 'JUW-015', 'JUW-016',
		'JUW-020', 'JUW-021'
	];
	drop_02_skus text[] := ARRAY[
		'JUW-025', 'JUW-026', 'JUW-027', 'JUW-028',
		'JUW-029', 'JUW-030', 'JUW-031', 'JUW-032',
		'JUW-033', 'JUW-034', 'JUW-035', 'JUW-036',
		'JUW-037', 'JUW-038', 'JUW-039', 'JUW-040',
		'JUW-041', 'JUW-042', 'JUW-043', 'JUW-044',
		'JUW-045', 'JUW-046', 'JUW-047', 'JUW-048',
		'JUW-049', 'JUW-050', 'JUW-051', 'JUW-052',
		'JUW-053', 'JUW-054', 'JUW-055', 'JUW-056',
		'JUW-057', 'JUW-058'
	];
BEGIN
	SELECT id INTO drop_01_id
	FROM shop_collections
	WHERE "key" = 'drop-01' AND state = 'ARCHIVED';

	SELECT id INTO drop_02_id
	FROM shop_collections
	WHERE "key" = 'drop-02' AND state = 'ACTIVE';

	IF drop_01_id IS NULL OR drop_02_id IS NULL OR (
		SELECT count(*) FROM shop_collections WHERE state = 'ACTIVE'
	) <> 1 THEN
		RAISE EXCEPTION 'SHOP_COLLECTION_LIFECYCLE_MISMATCH';
	END IF;

	IF EXISTS (
		SELECT expected.sku
		FROM unnest(drop_01_skus) AS expected(sku)
		LEFT JOIN shop_catalogue_items catalogue ON catalogue.sku = expected.sku
		WHERE catalogue.sku IS NULL OR catalogue.collection_id IS DISTINCT FROM drop_01_id
	) THEN
		RAISE EXCEPTION 'DROP_01_MEMBERSHIP_MISMATCH';
	END IF;

	IF EXISTS (
		SELECT expected.sku
		FROM unnest(drop_02_skus) AS expected(sku)
		LEFT JOIN shop_catalogue_items catalogue ON catalogue.sku = expected.sku
		WHERE catalogue.sku IS NULL
			OR catalogue.drop_label IS DISTINCT FROM 'Drop 02'
			OR (
				catalogue.collection_id IS NOT NULL
				AND catalogue.collection_id IS DISTINCT FROM drop_02_id
			)
	) OR EXISTS (
		SELECT catalogue.sku
		FROM shop_catalogue_items catalogue
		WHERE catalogue.drop_label = 'Drop 02'
			AND NOT (catalogue.sku = ANY(drop_02_skus))
	) THEN
		RAISE EXCEPTION 'DROP_02_RELEASE_MEMBERSHIP_MISMATCH';
	END IF;

	IF EXISTS (
		SELECT publication.sku
		FROM studio_catalogue_publications publication
		JOIN studio_wardrobe_items wardrobe ON wardrobe.id = publication.wardrobe_item_id
		WHERE publication.sku = ANY(drop_02_skus)
			AND publication.state IN ('PUBLISHED', 'ARCHIVED')
			AND wardrobe.target_collection_id IS NOT NULL
			AND wardrobe.target_collection_id IS DISTINCT FROM drop_02_id
	) THEN
		RAISE EXCEPTION 'DROP_02_WARDROBE_TARGET_CONFLICT';
	END IF;

	UPDATE shop_catalogue_items
	SET collection_id = drop_02_id
	WHERE sku = ANY(drop_02_skus)
		AND collection_id IS DISTINCT FROM drop_02_id;

	UPDATE studio_wardrobe_items AS wardrobe
	SET target_collection_id = drop_02_id
	FROM studio_catalogue_publications AS publication
	WHERE publication.wardrobe_item_id = wardrobe.id
		AND publication.sku = ANY(drop_02_skus)
		AND publication.state IN ('PUBLISHED', 'ARCHIVED')
		AND wardrobe.target_collection_id IS NULL;

	UPDATE shop_collections
	SET version = version + 1, updated_at = now()
	WHERE id = drop_02_id;

	IF (
		SELECT coalesce(array_agg(catalogue.sku ORDER BY catalogue.sku)::text[], ARRAY[]::text[])
		FROM shop_catalogue_items catalogue
		WHERE catalogue.collection_id = drop_01_id
	) IS DISTINCT FROM drop_01_skus OR (
		SELECT coalesce(array_agg(catalogue.sku ORDER BY catalogue.sku)::text[], ARRAY[]::text[])
		FROM shop_catalogue_items catalogue
		WHERE catalogue.collection_id = drop_02_id
	) IS DISTINCT FROM drop_02_skus THEN
		RAISE EXCEPTION 'SHOP_COLLECTION_FINAL_MEMBERSHIP_MISMATCH';
	END IF;

	IF EXISTS (
		SELECT publication.sku
		FROM studio_catalogue_publications publication
		JOIN studio_wardrobe_items wardrobe ON wardrobe.id = publication.wardrobe_item_id
		WHERE publication.sku = ANY(drop_02_skus)
			AND publication.state IN ('PUBLISHED', 'ARCHIVED')
			AND wardrobe.target_collection_id IS DISTINCT FROM drop_02_id
	) THEN
		RAISE EXCEPTION 'DROP_02_WARDROBE_TARGET_NOT_BACKFILLED';
	END IF;
END
$$;
