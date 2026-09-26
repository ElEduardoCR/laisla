-- Additive only: no updates/deletes/backfills of existing business data.
-- Receipts deliberately survive day close and order deletion (no foreign key).
SET lock_timeout = '3s';

CREATE TABLE public.order_submission_receipts (
  order_id TEXT PRIMARY KEY,
  payload_hash TEXT NOT NULL,
  order_number INTEGER NOT NULL,
  day_session_id TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_submission_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_submission_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.order_submission_receipts TO anon, authenticated;
-- Matches this single-store POS's existing anonymous access model. Receipts
-- contain no customer details and cannot be updated/deleted by the POS.
CREATE POLICY receipt_read ON public.order_submission_receipts
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY receipt_insert ON public.order_submission_receipts
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE FUNCTION public.submit_order_once(p_order JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
SET lock_timeout = '3s'
AS $$
DECLARE
  v_id TEXT := p_order->>'id';
  v_session TEXT := p_order->>'daySessionId';
  v_hash TEXT := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_order::TEXT, 'UTF8')), 'hex');
  v_receipt public.order_submission_receipts;
  v_number INTEGER;
  v_item JSONB;
BEGIN
  IF v_id IS NULL OR length(v_id) > 100 OR v_session IS NULL
     OR nullif(btrim(p_order->>'customerName'), '') IS NULL
     OR jsonb_typeof(p_order->'items') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_order->'items') = 0 THEN
    RAISE SQLSTATE 'PT422' USING MESSAGE = 'Invalid order submission';
  END IF;

  -- Serialize all replays, including concurrent tabs and lost HTTP responses.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('submission:' || v_id, 0));
  SELECT * INTO v_receipt FROM public.order_submission_receipts WHERE order_id = v_id;
  IF FOUND THEN
    IF v_receipt.payload_hash <> v_hash THEN
      RAISE SQLSTATE 'PT409' USING MESSAGE = 'Submission identifier already used';
    END IF;
    RETURN jsonb_build_object('order_number', v_receipt.order_number);
  END IF;

  -- A queued order belongs to its original day. Never move it into another day.
  PERFORM 1 FROM public.day_sessions WHERE id = v_session AND status = 'open' FOR SHARE;
  IF NOT FOUND THEN
    RAISE SQLSTATE 'PT410' USING MESSAGE = 'Original day session is closed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.orders WHERE id = v_id) THEN
    -- Never overwrite/repair an unrelated legacy or partially-written order.
    RAISE SQLSTATE 'PT409' USING MESSAGE = 'Order exists without submission receipt';
  END IF;

  INSERT INTO public.orders (id, customer_name, takeout, status, created_at, day_session_id)
  VALUES (v_id, btrim(p_order->>'customerName'), (p_order->>'takeout')::BOOLEAN,
          'preparing', (p_order->>'createdAt')::TIMESTAMPTZ, v_session)
  RETURNING order_number INTO v_number;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_order->'items') LOOP
    IF (v_item->>'orderId') IS DISTINCT FROM v_id
       OR (v_item->>'quantity')::INTEGER <= 0
       OR (v_item->>'productPrice')::NUMERIC < 0 THEN
      RAISE SQLSTATE 'PT422' USING MESSAGE = 'Invalid order item';
    END IF;
    INSERT INTO public.order_items
      (id, order_id, product_id, product_name, product_price, quantity, notes, paid_quantity, added_batch)
    VALUES (v_item->>'id', v_id, v_item->>'productId', v_item->>'productName',
            (v_item->>'productPrice')::NUMERIC, (v_item->>'quantity')::INTEGER,
            nullif(v_item->>'notes', ''), 0, 0);
  END LOOP;

  INSERT INTO public.order_submission_receipts (order_id, payload_hash, order_number, day_session_id)
  VALUES (v_id, v_hash, v_number, v_session);
  RETURN jsonb_build_object('order_number', v_number);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_order_once(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_order_once(JSONB) TO anon, authenticated;
RESET lock_timeout;
