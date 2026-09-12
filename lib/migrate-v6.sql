-- Migration v6 — order numbers and items added after the order was placed
--
-- Two things the kitchen could not tell apart:
--   * which order is which, beyond the customer's name
--   * which products were added later, once an order went back to Preparando
--
-- orders.order_number  → a number per day, shown big next to the customer name.
-- order_items.added_batch → 0 for what the order was created with, 1, 2, … for
--                           each later round of additions, rendered as "+2"
--                           instead of "x2".
--
-- Every statement is idempotent: running it twice is harmless.

-- ── 1) Per-day order number ────────────────────────────────────────────────

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_number INTEGER;

CREATE OR REPLACE FUNCTION public.assign_order_number() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    -- One number at a time per day, so two devices taking orders in the same
    -- second can't be handed the same one.
    PERFORM pg_advisory_xact_lock(
      hashtext('order_number:' || COALESCE(NEW.day_session_id, 'sin-sesion'))
    );

    SELECT COALESCE(MAX(order_number), 0) + 1
      INTO NEW.order_number
      FROM public.orders
     WHERE day_session_id IS NOT DISTINCT FROM NEW.day_session_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_assign_number ON public.orders;
CREATE TRIGGER orders_assign_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_order_number();

-- Number whatever is already on the floor, oldest first, continuing after any
-- number that was already handed out for that day.
WITH numbered AS (
  SELECT o.id,
         COALESCE(
           (SELECT MAX(x.order_number) FROM public.orders x
             WHERE x.day_session_id IS NOT DISTINCT FROM o.day_session_id),
           0
         ) + row_number() OVER (PARTITION BY o.day_session_id ORDER BY o.created_at) AS n
    FROM public.orders o
   WHERE o.order_number IS NULL
)
UPDATE public.orders o
   SET order_number = numbered.n
  FROM numbered
 WHERE o.id = numbered.id;

-- ── 2) Items added after the order was placed ──────────────────────────────

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS added_batch INTEGER;
UPDATE public.order_items SET added_batch = 0 WHERE added_batch IS NULL;
ALTER TABLE public.order_items ALTER COLUMN added_batch SET DEFAULT 0;
ALTER TABLE public.order_items ALTER COLUMN added_batch SET NOT NULL;
