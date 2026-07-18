export const CREDIT_PLANS = {
  tingi: {
    key: "tingi",
    label: "Mini",
    credits: 2,
    price: "₱80",
    amount: 8000,       // ₱80 = 8000 centavos | ₱40/credit
    currency: "PHP",
    dodoProductEnv: "DODO_PRODUCT_TINGI",
    dodoEnabled: false, // GCash only — no Dodo for Mini
  },
  basic: {
    key: "basic",
    label: "Basic",
    credits: 4,
    price: "₱150",
    amount: 15000,      // ₱150 = 15000 centavos | ₱37.50/credit
    currency: "PHP",
    dodoProductEnv: "DODO_PRODUCT_BASIC",
    dodoEnabled: true,
  },
  starter: {
    key: "starter",
    label: "Starter",
    credits: 13,
    price: "₱390",
    amount: 39000,      // ₱390 = 39000 centavos | ₱30/credit
    currency: "PHP",
    dodoProductEnv: "DODO_PRODUCT_STARTER",
    dodoEnabled: true,
  },
  pro: {
    key: "pro",
    label: "Professional",
    credits: 45,
    price: "₱1,050",
    amount: 105000,     // ₱1,050 = 105000 centavos | ₱23.33/credit
    currency: "PHP",
    dodoProductEnv: "DODO_PRODUCT_PRO",
    dodoEnabled: true,
  },
};

export function getCreditPlan(planKey) {
  return CREDIT_PLANS[String(planKey || "").toLowerCase()] || null;
}

export function getDodoProductId(plan) {
  if (!plan?.dodoProductEnv) return null;
  return process.env[plan.dodoProductEnv] || null;
}
