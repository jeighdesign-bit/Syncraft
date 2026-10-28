export const CREDIT_PLANS = {
  tingi: {
    key: "tingi",
    label: "Tingi",
    credits: 24,        // 2 generates × 12 tokens
    price: "₱79",
    gcashPrice: "₱79",
    dodoPrice: null,
    amount: 7900,
    currency: "PHP",
    dodoProductEnv: "DODO_PRODUCT_TINGI",
    dodoEnabled: false,
    polarProductEnv: null,
    polarEnabled: false,
  },
  basic: {
    key: "basic",
    label: "Basic",
    credits: 60,        // 5 generations × 12 credits
    price: "₱189",
    gcashPrice: "₱189",
    dodoPrice: "$2.49",
    amount: 18900,
    dodoAmount: 249,
    currency: "PHP",
    dodoCurrency: "USD",
    dodoProductEnv: "DODO_PRODUCT_BASIC",
    dodoEnabled: true,
    polarProductEnv: "POLAR_PRODUCT_BASIC",
    polarEnabled: true,
    polarPrice: "$3.49",
    polarAmount: 349,
    polarCurrency: "USD",
  },
  starter: {
    key: "starter",
    label: "Starter",
    credits: 168,       // 14 generations × 12 credits
    price: "₱399",
    gcashPrice: "₱399",
    dodoPrice: "$5.99",
    amount: 39900,
    dodoAmount: 599,
    currency: "PHP",
    dodoCurrency: "USD",
    dodoProductEnv: "DODO_PRODUCT_STARTER",
    dodoEnabled: true,
    polarProductEnv: "POLAR_PRODUCT_STARTER",
    polarEnabled: true,
    polarPrice: "$7.49",
    polarAmount: 749,
    polarCurrency: "USD",
  },
  pro: {
    key: "pro",
    label: "Pro",
    credits: 288,       // 24 generations × 12 credits
    price: "₱649",
    gcashPrice: "₱649",
    dodoPrice: "$9.99",
    amount: 64900,
    dodoAmount: 999,
    currency: "PHP",
    dodoCurrency: "USD",
    dodoProductEnv: "DODO_PRODUCT_PRO",
    dodoEnabled: true,
    polarProductEnv: "POLAR_PRODUCT_PRO",
    polarEnabled: true,
    polarPrice: "$11.99",
    polarAmount: 1199,
    polarCurrency: "USD",
  },
  elite: {
    key: "elite",
    label: "Elite",
    credits: 528,       // 44 generations × 12 credits
    price: "₱1,149",
    gcashPrice: "₱1,149",
    dodoPrice: "$15.99",
    amount: 114900,
    dodoAmount: 1599,
    currency: "PHP",
    dodoCurrency: "USD",
    dodoProductEnv: "DODO_PRODUCT_ELITE",
    dodoEnabled: true,
    polarProductEnv: "POLAR_PRODUCT_ELITE",
    polarEnabled: true,
    polarPrice: "$20.99",
    polarAmount: 2099,
    polarCurrency: "USD",
  },
};

export function getCreditPlan(planKey) {
  return CREDIT_PLANS[String(planKey || "").toLowerCase()] || null;
}

export function getDodoProductId(plan) {
  if (!plan?.dodoProductEnv) return null;
  return process.env[plan.dodoProductEnv] || null;
}

export function getPolarProductId(plan) {
  if (!plan?.polarProductEnv) return null;
  return process.env[plan.polarProductEnv] || null;
}

export function getPolarCheckoutPricing(plan, productId) {
  if (!plan?.polarEnabled || !productId || !Number.isInteger(plan.polarAmount) || plan.polarAmount <= 0) {
    throw new Error("Invalid Polar checkout plan");
  }

  // Fixed ad-hoc prices override the catalog only for this new checkout.
  // Polar ignores the top-level `amount` field for fixed-price products.
  const currency = plan.polarCurrency.toLowerCase();
  return {
    products: [productId],
    currency,
    prices: {
      [productId]: [{ amountType: "fixed", priceAmount: plan.polarAmount, priceCurrency: currency }],
    },
  };
}
