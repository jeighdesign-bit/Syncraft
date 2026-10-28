import test from "node:test";
import assert from "node:assert/strict";
import { CREDIT_PLANS } from "../src/lib/paymentPlans.js";
import { createPaymongoQrPhDirectIntent, createPaymongoCheckoutSession } from "../src/lib/paymongo.js";

test("PayMongo QR and hosted checkout send the new prices with unchanged credit quantities", async (t) => {
  const previousKey = process.env.PAYMONGO_SECRET_KEY;
  process.env.PAYMONGO_SECRET_KEY = "sk_test_pricing_fixture";
  t.after(() => {
    if (previousKey === undefined) delete process.env.PAYMONGO_SECRET_KEY;
    else process.env.PAYMONGO_SECRET_KEY = previousKey;
  });

  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const attributes = JSON.parse(options.body).data.attributes;
    requests.push({ url, attributes });
    if (url.endsWith("/checkout_sessions")) {
      return Response.json({ data: { id: "cs_fixture", attributes: { checkout_url: "https://example.com/checkout" } } });
    }
    if (url.endsWith("/payment_intents")) {
      return Response.json({ data: { id: "pi_fixture", attributes: { client_key: "fixture" } } });
    }
    if (url.endsWith("/payment_methods")) {
      return Response.json({ data: { id: "pm_fixture" } });
    }
    assert.ok(url.endsWith("/payment_intents/pi_fixture/attach"));
    return Response.json({ data: { attributes: { next_action: { code: { image_url: "data:image/png;base64,fixture" } } } } });
  });

  const expected = {
    tingi: [7900, 24], basic: [18900, 60], starter: [39900, 168],
    pro: [64900, 288], elite: [114900, 528],
  };
  for (const [key, [amount, credits]] of Object.entries(expected)) {
    requests.length = 0;
    const input = {
      user: { id: "user-fixture", email: "pricing@example.com" },
      plan: CREDIT_PLANS[key], localPaymentId: `payment-${key}`,
    };
    await createPaymongoQrPhDirectIntent(input);
    assert.equal(requests[0].attributes.amount, amount, `${key} QR amount`);
    assert.equal(requests[0].attributes.currency, "PHP");
    assert.equal(requests[0].attributes.metadata.credits, String(credits));

    await createPaymongoCheckoutSession(input);
    const hosted = requests.at(-1).attributes;
    assert.equal(hosted.line_items[0].amount, amount, `${key} hosted amount`);
    assert.equal(hosted.line_items[0].quantity, 1);
    assert.equal(hosted.line_items[0].currency, "PHP");
    assert.equal(hosted.metadata.credits, String(credits));
  }
});
