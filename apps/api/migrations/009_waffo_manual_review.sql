-- 009: manual_review terminal state for payment webhook events.
--
-- Provider events that must NOT be applied automatically (partial or
-- otherwise ambiguous refunds, unrecognized event types such as a future
-- dispute/chargeback) are preserved verbatim — payload column keeps the raw
-- normalized event — and parked in status='manual_review' with the reason in
-- the error column. These rows are excluded from automatic replay
-- (retryReceivedEvents only replays 'received') and from any money path; a
-- human resolves them through the documented ops procedure.
ALTER TABLE payment_webhook_events DROP CONSTRAINT IF EXISTS payment_webhook_events_status_check;
ALTER TABLE payment_webhook_events ADD CONSTRAINT payment_webhook_events_status_check
  CHECK (status IN ('received', 'processed', 'failed', 'manual_review'));
