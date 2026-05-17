-- ============================================================
-- 054 — Faz 8: AI rejection feedback bulk fetch RPC
-- Bulk fetch most recent rejection notes per product (max p_limit each, 90-day cutoff).
-- ROW_NUMBER PARTITION BY ai_recommendations.entity_id ile her ürün için top-N kapaması.
-- Idempotent: CREATE OR REPLACE; ROLLBACK SQL aşağıda yorum bloğunda.
-- ============================================================

CREATE OR REPLACE FUNCTION get_recent_rejections_for_products(
    p_product_ids uuid[],
    p_limit int DEFAULT 3
) RETURNS TABLE (entity_id text, feedback_note text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT entity_id, feedback_note, created_at
    FROM (
        SELECT
            r.entity_id,
            f.feedback_note,
            f.created_at,
            ROW_NUMBER() OVER (
                PARTITION BY r.entity_id
                ORDER BY f.created_at DESC
            ) AS rn
        FROM ai_feedback f
        INNER JOIN ai_recommendations r ON r.id = f.recommendation_id
        WHERE r.entity_type = 'product'
          AND r.recommendation_type = 'purchase_suggestion'
          AND r.entity_id = ANY(p_product_ids::text[])
          AND f.feedback_type = 'rejected'
          AND f.feedback_note IS NOT NULL
          AND f.feedback_note <> ''
          AND r.decided_at >= NOW() - INTERVAL '90 days' -- decided_at: rejection event timestamp (canonical), not af.created_at
    ) ranked
    WHERE rn <= p_limit;
$$;

REVOKE ALL ON FUNCTION get_recent_rejections_for_products(uuid[], int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_recent_rejections_for_products(uuid[], int)
    TO service_role;

-- ============================================================
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS get_recent_rejections_for_products(uuid[], int);
-- ============================================================
