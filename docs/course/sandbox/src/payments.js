// Acme Billing — Stripe Webhook & Idempotency Processor
function processStripeWebhook(event, redisLockTable) {
  if (!event || !event.id) {
    throw new Error('Missing Stripe event ID');
  }
  if (redisLockTable.has(event.id)) {
    return { status: 'duplicate_ignored', eventId: event.id };
  }
  redisLockTable.add(event.id);
  return { status: 'processed', type: event.type, eventId: event.id };
}

module.exports = { processStripeWebhook };
