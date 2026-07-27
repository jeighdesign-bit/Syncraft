export const CREDIT_PLANS = {
  tingi: {
    key: "tingi",
    label: "Tingi",
    credits: 24,        // 2 generates × 12 tokens
    price: "₱50",
    gcashPrice: "₱50",
    dodoPrice: null,
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
    gcashPrice: "₱100",
    dodoPrice: "$2.49",
    amount: 10000,
    dodoAmount: 249,
    currency: "PHP",
    dodoCurrency: "USD",
    dodoProductEnv: "DODO_PRODUCT_BASIC",
    dodoEnabled: true,
  },
  starter: {
    key: "starter",
    label: "Starter",
    credits: 156,       // 13 generates × 12 tokens
    price: "₱299",
    gcashPrice: "₱299",
    dodoPrice: "$5.99",
    amount: 29900,
    dodoAmount: 599,
    currency: "PHP",
    dodoCurrency: "USD",
    dodoProductEnv: "DODO_PRODUCT_STARTER",
    dodoEnabled: true,
  },
  pro: {
    key: "pro",
    label: "Pro",
    credits: 300,       // 25 generates × 12 tokens
    price: "₱499",
    gcashPrice: "₱499",
    dodoPrice: "$9.99",
    amount: 49900,
    dodoAmount: 999,
    currency: "PHP",
    dodoCurrency: "USD",
    dodoProductEnv: "DODO_PRODUCT_PRO",
    dodoEnabled: true,
  },
  elite: {
    key: "elite",
    label: "Elite",
    credits: 540,       // 45 generates × 12 tokens
    price: "₱799",
    gcashPrice: "₱799",
    dodoPrice: "$15.99",
    amount: 79900,
    dodoAmount: 1599,
    currency: "PHP",
    dodoCurrency: "USD",
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
