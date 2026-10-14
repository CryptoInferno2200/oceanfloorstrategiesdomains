-- Abyss One bills monthly through a Stripe subscription; renewals extend renews_at by subscription id.
ALTER TABLE purchase_history ADD COLUMN stripe_subscription_id TEXT;

CREATE UNIQUE INDEX purchase_history_subscription_idx
  ON purchase_history (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
