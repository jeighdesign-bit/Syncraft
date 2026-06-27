// Vercel Serverless Function: api/paymongo-webhook.js
// Receives paid notifications from PayMongo and updates Supabase database.

import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Read raw body (required for signature validation)
  const buf = [];
  for await (const chunk of req) {
    buf.push(chunk);
  }
  const rawBody = Buffer.concat(buf).toString('utf8');

  // 2. Verify PayMongo webhook signature if webhook secret is configured
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SIGNING_SECRET;
  const signatureHeader = req.headers['paymongo-signature'];

  if (webhookSecret && signatureHeader) {
    try {
      // signatureHeader format: t=timestamp,li=signature
      const parts = signatureHeader.split(',');
      const tPart = parts.find(p => p.startsWith('t='));
      const liPart = parts.find(p => p.startsWith('li='));

      if (!tPart || !liPart) {
        throw new Error('Invalid signature header format');
      }

      const t = tPart.substring(2); // extract timestamp value
      const signature = liPart.substring(3); // extract signature value

      const dataToSign = `${t}.${rawBody}`;
      const computedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(dataToSign, 'utf8')
        .digest('hex');

      if (computedSignature !== signature) {
        return res.status(401).json({ error: 'Signature verification failed' });
      }
    } catch (err) {
      console.error('Signature verification error:', err);
      return res.status(400).json({ error: 'Signature verification failed' });
    }
  } else {
    console.warn('PAYMONGO_WEBHOOK_SIGNING_SECRET is not configured. Bypassing signature verification.');
  }

  // 3. Parse JSON body
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  // 4. Process the checkout session paid event
  const eventType = event.data?.attributes?.type;
  if (eventType === 'checkout_session.payment.paid') {
    const session = event.data?.attributes?.data;
    const metadata = session?.attributes?.metadata;

    const userId = metadata?.userId;
    const tokens = parseInt(metadata?.tokens || '0');
    const price = parseFloat(metadata?.price || '0');

    if (!userId || !tokens) {
      console.error('Invalid metadata in checkout session:', metadata);
      return res.status(400).json({ error: 'Invalid checkout session metadata' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase credentials are not defined in environment variables.');
      return res.status(500).json({ error: 'Server database configuration error' });
    }

    try {
      // A. Fetch current user profile
      const getResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=*`, {
        method: 'GET',
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Accept': 'application/json'
        }
      });

      if (!getResponse.ok) {
        throw new Error(`Failed to fetch user profile: ${getResponse.statusText}`);
      }

      const profiles = await getResponse.json();
      if (!profiles || profiles.length === 0) {
        throw new Error(`User profile not found for ID: ${userId}`);
      }

      const profile = profiles[0];
      const history = profile.history || [];

      // B. Append billing log
      history.unshift({
        date: new Date().toISOString(),
        type: 'Billing',
        desc: `Upgraded subscription to Professional via PayMongo (₱${price}, limit: ${tokens} tokens)`
      });

      // C. Update profile plan and credits
      const patchResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          plan: 'Professional',
          credits_max: tokens,
          history: history
        })
      });

      if (!patchResponse.ok) {
        throw new Error(`Failed to update user profile: ${patchResponse.statusText}`);
      }

      console.log(`Successfully upgraded user ${userId} to Professional plan with ${tokens} credits.`);
    } catch (error) {
      console.error('Database update failed:', error);
      return res.status(500).json({ error: 'Failed to update user subscription in database' });
    }
  }

  // Acknowledge receipt of the webhook to PayMongo
  return res.status(200).json({ received: true });
}
