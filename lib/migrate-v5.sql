-- Migration v5 — charge an order in a single transaction
--
-- Charging used to be two independent requests from the browser: one to bump
-- order_items.paid_quantity and another to add up the money. If the second one
-- failed, the items were already marked as paid and the order could no longer
-- be charged at all. And because the client sent absolute totals it had read
-- earlier, two devices charging the same bill overwrote each other's amounts.
--
-- charge_order_items() does the whole thing server-side, in one transaction,
-- incrementing the amounts in place and locking the order row so concurrent
-- charges queue up instead of clobbering each other. Call it with no
-- selections and zero amounts to just re-evaluate whether an order is settled.
--
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.charge_order_items(
  p_order_id   TEXT,
  p_cash       NUMERIC,
  p_terminal   NUMERIC,
  p_selections JSONB DEFAULT '[]'::jsonb
) RETURNS public.orders
LANGUAGE plpgsql
AS $$
DECLARE
  v_order   public.orders;
  v_lines   INTEGER;
  v_pending INTEGER;
  v_method  TEXT;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % does not exist', p_order_id;
  END IF;

  IF v_order.status = 'completed' THEN
    RAISE EXCEPTION 'order % is already fully paid', p_order_id;
  END IF;

  -- Apply the units being paid now, never past what the line actually has.
  IF p_selections IS NOT NULL AND jsonb_array_length(p_selections) > 0 THEN
    UPDATE public.order_items i
       SET paid_quantity = LEAST(i.quantity, COALESCE(i.paid_quantity, 0) + s.qty)
      FROM (
        SELECT e.value ->> 'itemId' AS item_id,
               GREATEST(COALESCE((e.value ->> 'quantity')::INTEGER, 0), 0) AS qty
          FROM jsonb_array_elements(p_selections) AS e
      ) s
     WHERE i.id = s.item_id
       AND i.order_id = p_order_id
       AND s.qty > 0;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE COALESCE(paid_quantity, 0) < quantity)
    INTO v_lines, v_pending
    FROM public.order_items
   WHERE order_id = p_order_id;

  UPDATE public.orders
     SET paid_cash     = COALESCE(paid_cash, 0) + COALESCE(p_cash, 0),
         paid_terminal = COALESCE(paid_terminal, 0) + COALESCE(p_terminal, 0)
   WHERE id = p_order_id
   RETURNING * INTO v_order;

  -- Every unit of every line covered → the bill is settled.
  IF v_lines > 0 AND v_pending = 0 THEN
    v_method := CASE
      WHEN COALESCE(v_order.paid_cash, 0) > 0 AND COALESCE(v_order.paid_terminal, 0) > 0 THEN 'mixed'
      WHEN COALESCE(v_order.paid_terminal, 0) > 0 THEN 'terminal'
      ELSE 'cash'
    END;

    UPDATE public.orders
       SET status = 'completed',
           payment_method = v_method,
           completed_at = now()
     WHERE id = p_order_id
     RETURNING * INTO v_order;
  END IF;

  RETURN v_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.charge_order_items(TEXT, NUMERIC, NUMERIC, JSONB)
  TO anon, authenticated, service_role;
