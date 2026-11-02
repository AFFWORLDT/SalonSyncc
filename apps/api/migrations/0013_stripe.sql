-- Plan 7: Stripe. The webhook finds the org by its Stripe customer on every event.
CREATE UNIQUE INDEX idx_subscriptions_customer ON subscriptions(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
