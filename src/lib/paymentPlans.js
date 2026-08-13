export const CREDIT_PLANS = {
  tingi: {
    key: "tingi",
    label: "Tingi",
    credits: 24,        // 2 generates × 12 tokens
    price: "₱60",
    gcashPrice: "₱60",
    dodoPrice: null,
    amount: 6000,
    currency: "PHP",
    dodoProductEnv: "DODO_PRODUCT_TINGI",
    dodoEnabled: false,
  },
  basic: {
    key: "basic",
    label: "Basic",
    credits: 60,        // 5 generations × 12 credits
    price: "₱149",
    gcashPrice: "₱149",
    dodoPrice: "$2.49",
    amount: 14900,
    dodoAmount: 249,
    currency: "PHP",
    dodoCurrency: "USD",
    dodoProductEnv: "DODO_PRODUCT_BASIC",
    dodoEnabled: true,
  },
  starter: {
    key: "starter",
    label: "Starter",
    credits: 168,       // 14 generations × 12 credits
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
    credits: 288,       // 24 generations × 12 credits
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
    credits: 528,       // 44 generations × 12 credits
    price: "₱899",
    gcashPrice: "₱899",
    dodoPrice: "$15.99",
    amount: 89900,
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
