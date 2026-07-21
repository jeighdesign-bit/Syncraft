export const CREDIT_PLANS = {
  tingi: {
    key: "tingi",
    label: "Tingi",
    credits: 24,        // 2 generates × 12 tokens
    price: "₱50",
    amount: 5000,
    currency: "PHP",
    dodoProductEnv: "DODO_PRODUCT_TINGI",
    dodoEnabled: false,
  },
  basic: {
    key: "basic",
    label: "Basic",
    credits: 48,        // 4 generates × 12 tokens
    price: "₱100",
    amount: 10000,
    currency: "PHP",
    dodoProductEnv: "DODO_PRODUCT_BASIC",
    dodoEnabled: true,
  },
  starter: {
    key: "starter",
    label: "Starter",
    credits: 156,       // 13 generates × 12 tokens
    price: "₱299",
    amount: 29900,
    currency: "PHP",
    dodoProductEnv: "DODO_PRODUCT_STARTER",
    dodoEnabled: true,
  },
  pro: {
    key: "pro",
    label: "Pro",
    credits: 300,       // 25 generates × 12 tokens
    price: "₱499",
    amount: 49900,
    currency: "PHP",
    dodoProductEnv: "DODO_PRODUCT_PRO",
    dodoEnabled: true,
  },
  elite: {
    key: "elite",
    label: "Elite",
    credits: 540,       // 45 generates × 12 tokens
    price: "₱799",
    amount: 79900,
    currency: "PHP",
    dodoProductEnv: "DODO_PRODUCT_ELITE",
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
