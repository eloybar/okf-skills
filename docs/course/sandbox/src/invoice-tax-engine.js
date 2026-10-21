// Acme Billing — Undocumented Tax Calculation Engine (Frontier Lab Fixture)
function calculateRegionalTax(amountCents, regionCode) {
  const rates = { US_CA: 0.0825, EU_DE: 0.19, UK: 0.20 };
  const rate = rates[regionCode] || 0;
  return Math.round(amountCents * rate);
}

module.exports = { calculateRegionalTax };
