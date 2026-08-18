import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const envPaths = ['.env', '.env.local', '.env.production'].filter((p) => fs.existsSync(p));
if (!envPaths.length) throw new Error('No env file found');
for (const envPath of envPaths) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^['"]|['"]$/g, '');
    if (value) process.env[match[1]] = value;
  }
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function allRows(table, columns, configure = (q) => q) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await configure(db.from(table).select(columns).range(from, from + 999));
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

const profiles = await allRows('profiles', 'credits');
const active = profiles.filter((p) => Number(p.credits) > 0);
const totalCredits = active.reduce((sum, p) => sum + Number(p.credits || 0), 0);
const since = new Date(Date.now() - 30 * 86400000).toISOString();
const logs = await allRows('credit_logs', 'action,amount,created_at', (q) => q.gte('created_at', since));
const usage = new Map();
for (const row of logs) {
  if (Number(row.amount) >= 0) continue;
  const key = row.action || 'Unknown';
  const item = usage.get(key) || { jobs: 0, credits: 0 };
  item.jobs += 1;
  item.credits += Math.abs(Number(row.amount));
  usage.set(key, item);
}
console.log(JSON.stringify({
  as_of: new Date().toISOString(),
  profiles_total: profiles.length,
  active_paid_or_positive_profiles: active.length,
  total_active_credits: totalCredits,
  usage_30d: Object.fromEntries([...usage.entries()].sort((a,b) => b[1].credits - a[1].credits)),
}, null, 2));
