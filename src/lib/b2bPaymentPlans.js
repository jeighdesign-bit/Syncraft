export const B2B_CREDIT_PLANS = Object.freeze({
  starter: Object.freeze({
    key: "starter",
    label: "Starter",
    credits: 200,
    amount: 11600,
    price: "₱116",
  }),
  pro: Object.freeze({
    key: "pro",
    label: "Pro",
    credits: 500,
    amount: 29000,
    price: "₱290",
    featured: true,
  }),
  studio: Object.freeze({
    key: "studio",
    label: "Studio",
    credits: 1000,
    amount: 58000,
    price: "₱580",
  }),
});

export function getB2bCreditPlan(planKey) {
  return B2B_CREDIT_PLANS[String(planKey || "").toLowerCase()] || null;
}

