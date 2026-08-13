-- Migration v4 — split & mixed payments
--
-- Commit 8fbe6a4 ("Split & mixed payments when charging an order") assumed
-- three additive columns and a new payment_method value, but no migration was
-- ever shipped for them. Without this migration a mixed (cash + card) charge
-- is rejected by the original CHECK constraint, so the whole UPDATE — money,
-- status and completed_at — is lost.
--
-- Every statement is idempotent: running it twice is harmless.

-- 1) Units of each line already paid (split bills)
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS paid_quantity INTEGER;
UPDATE public.order_items SET paid_quantity = 0 WHERE paid_quantity IS NULL;
ALTER TABLE public.order_items ALTER COLUMN paid_quantity SET DEFAULT 0;
ALTER TABLE public.order_items ALTER COLUMN paid_quantity SET NOT NULL;

-- 2) Cash / terminal amounts accumulated per order
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_cash NUMERIC(10,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_terminal NUMERIC(10,2);

-- 3) Allow payment_method = 'mixed'.
--    The original constraint was declared inline in CREATE TABLE, so drop
--    whatever check currently guards payment_method, whatever its name is.
DO $$
DECLARE con_name TEXT;
BEGIN
  FOR con_name IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'orders'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%payment_method%'
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', con_name);
  END LOOP;
END $$;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('cash', 'terminal', 'mixed'));
