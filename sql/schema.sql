-- Clear any aborted transaction left over from earlier errors
ROLLBACK;

-- Remove the old strict rules that block your listings
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE public.listings DROP CONSTRAINT IF EXISTS listings_listing_type_check;

-- Make the default status match what the app uses
ALTER TABLE public.listings ALTER COLUMN status SET DEFAULT 'active';

-- Fix old rows that have a missing status or listing type
UPDATE public.listings SET status = 'active' WHERE status IS NULL OR status = 'available';
UPDATE public.listings SET listing_type = 'sell' WHERE listing_type IS NULL;

-- Add new rules that allow every value the app uses
ALTER TABLE public.listings
  ADD CONSTRAINT listings_status_check
  CHECK (status IN ('active','available','paused','sold','reserved','removed','deleted','archived'));

ALTER TABLE public.listings
  ADD CONSTRAINT listings_listing_type_check
  CHECK (listing_type IN ('sell','swap','both'));

-- Check the result
SELECT id, title, status, listing_type FROM public.listings;
SELECT id, title, owner_id FROM public.listings WHERE id = '4c2dbfee-550b-4302-8890-f6434eb79ce1';
ROLLBACK;
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_id_uidx
  ON public.payments (provider_payment_id);
 ROLLBACK;

-- Old column no longer used by the app: allow it to be empty
ALTER TABLE public.messages ALTER COLUMN offer_id DROP NOT NULL;

-- Remove any old link that forces offer_id to point to an offers table
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_offer_id_fkey;