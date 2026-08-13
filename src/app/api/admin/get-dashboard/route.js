import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { authenticateAdminRequest } from "@/lib/adminAuth";
import { isMissingStoreRequestsTable, listStoredStoreRequests } from "@/lib/storeRequestStorage";
import { CREDIT_PLANS } from "@/lib/paymentPlans";
import { countsAsManualRevenue } from "@/lib/paymentApprovalRules.mjs";

const RECEIPT_BUCKET = "store_receipts";
const REVENUE_TIME_ZONE = "Asia/Manila";

function parsePesoAmount(value) {
  const amount = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function getPeriodKeys(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REVENUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return year && month && day
    ? { day: `${year}-${month}-${day}`, month: `${year}-${month}` }
    : null;
}

function summarizeRevenue(records, amountFor, dateFor) {
  const currentKeys = getPeriodKeys(new Date());
  return records.reduce((summary, record) => {
    const amount = Number(amountFor(record)) || 0;
    const recordKeys = getPeriodKeys(dateFor(record));
    summary.overall += amount;
    if (recordKeys?.month === currentKeys?.month) summary.month += amount;
    if (recordKeys?.day === currentKeys?.day) summary.today += amount;
    return summary;
  }, { today: 0, month: 0, overall: 0 });
}

function planPrice(planKey) {
  return parsePesoAmount(CREDIT_PLANS[String(planKey || "").toLowerCase()]?.price);
}

function paymentPesoAmount(payment) {
  if (payment?.currency && payment.currency !== "PHP") return planPrice(payment.plan);
  const savedAmount = Number(payment?.amount);
  return Number.isFinite(savedAmount) && savedAmount > 0
    ? savedAmount / 100
    : planPrice(payment?.plan);
}

async function fetchActiveCreditsTotal() {
  try {
    const pageSize = 1000;
    let from = 0;
    let total = 0;

    while (true) {
      const { data, error } = await adminSupabase
        .from('profiles')
        .select('credits')
        .gt('credits', 0)
        .range(from, from + pageSize - 1);

      if (error) {
        console.error("[Admin] fetchActiveCreditsTotal error:", error.message);
        return 0;
      }

      const rows = data || [];
      total += rows.reduce((sum, row) => sum + Number(row.credits || 0), 0);

      if (rows.length < pageSize) {
        return total;
      }

      from += pageSize;
    }
  } catch (e) {
    console.error("[Admin] fetchActiveCreditsTotal threw:", e.message);
    return 0;
  }
}

export async function GET(request) {
  try {
    const adminAuth = await authenticateAdminRequest(request);
    if (!adminAuth.user) {
      return NextResponse.json({ error: adminAuth.error }, { status: adminAuth.status });
    }

    // Fetch all payment requests
    let requests = [];
    try {
      const { data, error: reqError } = await adminSupabase
        .from('payment_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (reqError) {
        console.error("[Admin] payment_requests error:", reqError.message);
      } else {
        requests = data || [];
      }
    } catch (e) {
      console.error("[Admin] payment_requests threw:", e.message);
    }

    // Fetch manual store requests. This remains optional until the store SQL setup is run.
    let storeRequests = [];
    try {
      const { data, error: storeError } = await adminSupabase
        .from('store_requests')
        .select('*')
        .order('created_at', { ascending: false });
      let rows = data || [];
      if (isMissingStoreRequestsTable(storeError)) {
        const { data: storedRows, error: storedRowsError } = await listStoredStoreRequests();
        if (storedRowsError) {
          console.warn("[Admin] stored store_requests unavailable:", storedRowsError.message);
        } else {
          rows = storedRows || [];
        }
      } else if (storeError) {
        console.warn("[Admin] store_requests unavailable:", storeError.message);
      }

      if (!storeError || isMissingStoreRequestsTable(storeError)) {
        storeRequests = await Promise.all(rows.map(async (storeRequest) => {
          const receiptPath = storeRequest.receipt_url;
          if (!receiptPath || /^https?:\/\//i.test(receiptPath)) return storeRequest;

          const { data: signedReceipt, error: signedReceiptError } = await adminSupabase.storage
            .from(RECEIPT_BUCKET)
            .createSignedUrl(receiptPath, 10 * 60);

          if (signedReceiptError) {
            console.warn("[Admin] Could not sign store receipt:", signedReceiptError.message);
            return { ...storeRequest, receipt_url: null };
          }

          return { ...storeRequest, receipt_url: signedReceipt.signedUrl };
        }));
      }
    } catch (e) {
      console.warn("[Admin] store_requests threw:", e.message);
    }

    // Fetch Dodo payments
    let dodoPayments = [];
    try {
      const { data: dodoRows, error: dodoErr } = await adminSupabase
        .from('dodo_payments')
        .select('*')
        .order('created_at', { ascending: false });

      if (dodoErr) {
        console.error("Failed to fetch Dodo payments:", dodoErr.message);
      } else {
        dodoPayments = dodoRows || [];
      }
    } catch (dodoFetchErr) {
      console.error("Error fetching Dodo payments:", dodoFetchErr.message);
    }

    // Fetch total generations (projects) count
    let projCount = 0;
    try {
      const { count, error: projError } = await adminSupabase
        .from('projects')
        .select('*', { count: 'exact', head: true });
      if (projError) {
        console.error("[Admin] projects count error:", projError.message);
      } else {
        projCount = count || 0;
      }
    } catch (e) {
      console.error("[Admin] projects count threw:", e.message);
    }

    // Fetch recent reviews
    let reviews = [];
    try {
      const { data: reviewData, error: reviewError } = await adminSupabase
        .from('projects')
        .select('id, name, rating, feedback_text, created_at')
        .not('rating', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);
      if (reviewError) {
        console.error("Failed to fetch reviews:", reviewError.message);
      } else {
        reviews = reviewData || [];
      }
    } catch (e) {
      console.error("[Admin] reviews threw:", e.message);
    }

    const activeCreditsTotal = await fetchActiveCreditsTotal();

    // Fetch users with credits
    let paidUsers = [];
    try {
      const { data: profiles, error: profErr } = await adminSupabase
        .from('profiles')
        .select('id, credits')
        .gt('credits', 0)
        .order('credits', { ascending: false })
        .limit(100);

      if (!profErr && profiles && profiles.length > 0) {
        const userIds = profiles.map(p => p.id);

        const { data: reqs } = await adminSupabase
          .from('payment_requests')
          .select('user_id, email, created_at')
          .in('user_id', userIds);

        const emailMap = {};
        const joinMap = {};

        if (reqs) {
          reqs.forEach(r => {
            if (r.email) emailMap[r.user_id] = r.email;
            if (!joinMap[r.user_id] || new Date(r.created_at) < new Date(joinMap[r.user_id])) {
              joinMap[r.user_id] = r.created_at;
            }
          });
        }

        const missingEmailIds = userIds.filter(id => !emailMap[id]);
        if (missingEmailIds.length > 0) {
          await Promise.all(
            missingEmailIds.map(async (id) => {
              try {
                const { data: authData } = await adminSupabase.auth.admin.getUserById(id);
                if (authData && authData.user) {
                  emailMap[id] = authData.user.email;
                  joinMap[id] = authData.user.created_at;
                }
              } catch (e) {
                console.error("[Admin] getUserById error for", id, e.message);
              }
            })
          );
        }

        paidUsers = profiles.map(p => ({
          id: p.id,
          email: emailMap[p.id] || "Unknown User",
          credits: p.credits,
          created_at: joinMap[p.id] || new Date().toISOString()
        }));
      }
    } catch (e) {
      console.error("Error fetching paid users list", e);
    }

    const approvedManualPayments = requests.filter((payment) => countsAsManualRevenue(payment.status));
    const paidAutomatedPayments = dodoPayments.filter((payment) => payment.status === "paid");
    const fulfilledStoreRequests = storeRequests.filter((storeRequest) => storeRequest.status === "fulfilled");
    const storeStats = {
      pending: storeRequests.filter((storeRequest) => storeRequest.status === "pending").length,
      fulfilled: fulfilledStoreRequests.length,
      rejected: storeRequests.filter((storeRequest) => storeRequest.status === "rejected").length,
      total: storeRequests.length,
    };

    const syncraftRevenue = summarizeRevenue(
      [...approvedManualPayments, ...paidAutomatedPayments],
      (payment) => paymentPesoAmount(payment),
      (payment) => payment.credited_at || payment.updated_at || payment.created_at
    );
    const storeRevenue = summarizeRevenue(
      fulfilledStoreRequests,
      (storeRequest) => parsePesoAmount(storeRequest.price),
      (storeRequest) => storeRequest.updated_at || storeRequest.created_at
    );

    return NextResponse.json({
      success: true,
      requests: requests || [],
      storeRequests,
      storeStats,
      revenue: {
        syncraft: syncraftRevenue,
        store: storeRevenue,
      },
      dodoPayments: dodoPayments.slice(0, 50),
      totalProjects: projCount || 0,
      activeCreditsTotal,
      reviews: reviews || [],
      paidUsers: paidUsers
    });
  } catch (error) {
    console.error("Admin Dashboard Fetch Error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
