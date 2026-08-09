"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import {
  Check,
  Clock,
  ExternalLink,
  LogOut,
  Mail,
  RefreshCw,
  Star,
  X,
} from "lucide-react";
import { toast } from "@/components/Toast";
import {
  PAYMENT_STATUS,
  appearsInManualPaymentHistory,
} from "@/lib/paymentApprovalRules.mjs";
import styles from "./admin.module.css";

import "../globals.css";

const EMPTY_REVENUE = { today: 0, month: 0, overall: 0 };
const COST_PER_PROJECT = 2;
const pesoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

function formatPeso(value) {
  return pesoFormatter.format(Number(value || 0));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function RevenueCard({ title, description, revenue, tone }) {
  return (
    <article className={styles.revenueCard} data-tone={tone}>
      <div className={styles.revenueHeader}>
        <div>
          <p className={styles.cardEyebrow}>{title}</p>
          <p className={styles.cardDescription}>{description}</p>
        </div>
      </div>
      <div className={styles.periodGrid}>
        <div className={styles.periodItem}>
          <span>Today</span>
          <strong>{formatPeso(revenue.today)}</strong>
        </div>
        <div className={styles.periodItem}>
          <span>This month</span>
          <strong>{formatPeso(revenue.month)}</strong>
        </div>
        <div className={`${styles.periodItem} ${styles.periodOverall}`}>
          <span>Overall</span>
          <strong>{formatPeso(revenue.overall)}</strong>
        </div>
      </div>
    </article>
  );
}

function MetricCard({ label, value, detail, tone = "neutral" }) {
  return (
    <article className={styles.metricCard} data-tone={tone}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </article>
  );
}

function SectionHeader({ title, description, count }) {
  return (
    <div className={styles.sectionHeader}>
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {typeof count === "number" && <span className={styles.countBadge}>{count}</span>}
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className={styles.emptyState}>
      <Check size={22} aria-hidden="true" />
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [storeRequests, setStoreRequests] = useState([]);
  const [storeStats, setStoreStats] = useState({ pending: 0, fulfilled: 0, rejected: 0, total: 0 });
  const [revenue, setRevenue] = useState({ syncraft: EMPTY_REVENUE, store: EMPTY_REVENUE });
  const [approvedRequests, setApprovedRequests] = useState([]);
  const [dodoPayments, setDodoPayments] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [totalProjects, setTotalProjects] = useState(0);
  const [activeCreditsTotal, setActiveCreditsTotal] = useState(0);
  const [paidUsers, setPaidUsers] = useState([]);
  const [processingId, setProcessingId] = useState(null);
  const [storeProcessingId, setStoreProcessingId] = useState(null);
  const [storeProcessingAction, setStoreProcessingAction] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasNewRequests, setHasNewRequests] = useState(false);
  const router = useRouter();

  const [supabase] = useState(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ));

  const fetchRequests = async (token, options = {}) => {
    if (!options.silent) setLoading(true);
    if (options.manual) setIsRefreshing(true);
    try {
      const response = await fetch("/api/admin/get-dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      const requestRows = data.requests || [];
      setRequests(
        requestRows
          .filter((request) => request.status === "pending")
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      );
      setApprovedRequests(requestRows.filter((request) => appearsInManualPaymentHistory(request.status)));
      setStoreRequests((data.storeRequests || []).filter((request) => request.status === "pending"));
      setStoreStats({ pending: 0, fulfilled: 0, rejected: 0, total: 0, ...(data.storeStats || {}) });
      setRevenue({
        syncraft: { ...EMPTY_REVENUE, ...(data.revenue?.syncraft || {}) },
        store: { ...EMPTY_REVENUE, ...(data.revenue?.store || {}) },
      });
      setDodoPayments(data.dodoPayments || []);
      setReviews(data.reviews || []);
      setTotalProjects(Number(data.totalProjects || 0));
      setActiveCreditsTotal(Number(data.activeCreditsTotal || 0));
      setPaidUsers(data.paidUsers || []);
      if (options.manual) setHasNewRequests(false);
      return true;
    } catch (error) {
      toast.error(error.message || "Failed to load admin data");
      console.error(error);
      return false;
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    let fallbackInterval;
    let realtimeChannel;

    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        router.push("/");
        return;
      }

      const isAuthorized = await fetchRequests(session.access_token);
      if (!isAuthorized) {
        router.push("/");
        return;
      }
      setUser(session.user);

      realtimeChannel = supabase
        .channel("admin_payment_requests")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "payment_requests" }, (payload) => {
          toast.success(`New payment from ${payload.new?.email || "a user"}`);
          setHasNewRequests(true);
          fetchRequests(session.access_token, { silent: true });
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "payment_requests" }, () => {
          fetchRequests(session.access_token, { silent: true });
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "store_requests" }, (payload) => {
          toast.success(`New store request from ${payload.new?.email || "a customer"}`);
          fetchRequests(session.access_token, { silent: true });
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "store_requests" }, () => {
          fetchRequests(session.access_token, { silent: true });
        })
        .subscribe();

      fallbackInterval = setInterval(() => {
        fetchRequests(session.access_token, { silent: true });
      }, 5 * 60_000);
    };

    checkAdmin();
    return () => {
      if (fallbackInterval) clearInterval(fallbackInterval);
      if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    };
  }, [supabase, router]);

  useEffect(() => {
    const pendingTotal = requests.length + storeRequests.length;
    document.title = pendingTotal
      ? `(${pendingTotal}) Admin Dashboard - Syncraft`
      : "Admin Dashboard - Syncraft";
  }, [requests.length, storeRequests.length]);

  const handleManualRefresh = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) fetchRequests(session.access_token, { silent: true, manual: true });
  };

  const handleStoreRequestStatus = async (request, status) => {
    setStoreProcessingId(request.id);
    setStoreProcessingAction(status);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Admin session expired.");

      const response = await fetch("/api/admin/store-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ requestId: request.id, status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update store request.");

      setStoreRequests((current) => current.filter((item) => item.id !== request.id));
      setStoreStats((current) => ({
        ...current,
        pending: Math.max(0, current.pending - 1),
        [status]: current[status] + 1,
      }));
      if (status === "fulfilled") {
        const amount = Number(String(request.price || "").replace(/[^0-9.-]/g, "")) || 0;
        setRevenue((current) => ({
          ...current,
          store: {
            today: current.store.today + amount,
            month: current.store.month + amount,
            overall: current.store.overall + amount,
          },
        }));
      }
      toast.success(status === "fulfilled" ? "Store order marked as sent." : "Store request rejected.");
    } catch (error) {
      toast.error(error.message || "Could not update store request.");
    } finally {
      setStoreProcessingId(null);
      setStoreProcessingAction(null);
    }
  };

  const handleRejectStoreRequest = (request) => {
    const confirmed = window.confirm(
      `Reject the purchase request for ${request.product_name} from ${request.email}?`
    );
    if (confirmed) handleStoreRequestStatus(request, "rejected");
  };

  const handleApprove = async (request, markOnly = false) => {
    setProcessingId(request.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Admin session expired.");

      const response = await fetch("/api/admin/approve-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ requestId: request.id, markOnly }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast.success(markOnly
        ? "Marked as paid without adding credits."
        : `Approved and added ${data.addedCredits} credits to ${request.email}.`
      );
      await fetchRequests(session.access_token, { silent: true });
    } catch (error) {
      toast.error(error.message || "Failed to approve payment");
    } finally {
      setProcessingId(null);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <main className={styles.loadingScreen}>
        <RefreshCw className={styles.loadingIcon} size={22} aria-hidden="true" />
        <span>Loading dashboard</span>
      </main>
    );
  }
  if (!user) return null;

  const estimatedCost = totalProjects * COST_PER_PROJECT;
  const estimatedProfit = revenue.syncraft.overall - estimatedCost;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <button className={styles.brandButton} type="button" onClick={() => router.push("/")}>
            <img src="/logo.svg" alt="Syncraft" />
            <span>Admin</span>
          </button>
          <div className={styles.topbarActions}>
            <button className={styles.secondaryButton} type="button" onClick={handleManualRefresh} disabled={isRefreshing}>
              <RefreshCw size={16} className={isRefreshing ? styles.spin : ""} aria-hidden="true" />
              {isRefreshing ? "Refreshing" : "Refresh"}
            </button>
            <button className={styles.iconButton} type="button" onClick={handleLogout} aria-label="Log out" title="Log out">
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <section className={styles.intro}>
          <div>
            <p className={styles.kicker}>Admin dashboard</p>
            <h1>Business overview</h1>
            <p>Revenue, customer payments, credits, and store fulfillment in one place.</p>
          </div>
          <span className={styles.liveBadge}><i /> Live data</span>
        </section>

        <section className={styles.businessSection} aria-labelledby="syncraft-section-title">
          <div className={styles.businessHeading}>
            <div>
              <p className={styles.kicker}>Core platform</p>
              <h2 id="syncraft-section-title">Syncraft</h2>
            </div>
            <span>Philippine time</span>
          </div>
          <div className={styles.businessPanel} data-tone="syncraft">
            <RevenueCard
              title="Revenue"
              description="Approved top-ups and paid automated plans"
              revenue={revenue.syncraft}
              tone="syncraft"
            />
            <div className={styles.businessMetrics}>
              <MetricCard label="Pending top-ups" value={requests.length.toLocaleString()} detail="Needs review" tone={hasNewRequests ? "alert" : "neutral"} />
              <MetricCard label="Active credits" value={activeCreditsTotal.toLocaleString()} detail="Across paid users" tone="accent" />
              <MetricCard label="Projects" value={totalProjects.toLocaleString()} detail="Total processed" />
              <MetricCard label="Estimated cost" value={formatPeso(estimatedCost)} detail={`${formatPeso(COST_PER_PROJECT)} per project`} />
              <MetricCard label="Profit" value={formatPeso(estimatedProfit)} detail="Revenue less est. cost" tone="success" />
            </div>
            <div className={styles.businessDetails}>
        <section className={styles.panel}>
          <SectionHeader title="Pending top-up requests" description="Verify receipts before adding credits." count={requests.length} />
          {requests.length === 0 ? (
            <EmptyState title="All caught up" description="No pending top-up payments to review." />
          ) : (
            <div className={styles.list}>
              {requests.map((request) => (
                <article className={styles.listRow} key={request.id}>
                  <div className={styles.rowBody}>
                    <span className={styles.rowMeta}><Clock size={13} /> {formatDate(request.created_at)}</span>
                    <strong>{request.email}</strong>
                    <span>Plan: <b>{request.plan}</b> · Reference: {request.reference_number || "N/A"}</span>
                  </div>
                  <div className={styles.rowActions}>
                    {request.proof_url && <a className={styles.actionButton} href={request.proof_url} target="_blank" rel="noreferrer">Receipt <ExternalLink size={13} /></a>}
                    <button className={styles.actionButton} type="button" onClick={() => handleApprove(request, true)} disabled={processingId === request.id}>Already paid</button>
                    <button className={styles.primaryButton} type="button" onClick={() => handleApprove(request, false)} disabled={processingId === request.id}>
                      <Check size={14} /> {processingId === request.id ? "Approving" : "Approve & add"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <div className={styles.twoColumnGrid}>
          <section className={styles.panel}>
            <SectionHeader title="Manual payment history" description="Approved and previously recorded GCash requests." count={approvedRequests.length} />
            {approvedRequests.length === 0 ? (
              <EmptyState title="No approved payments" description="Approved manual payments appear here." />
            ) : (
              <div className={styles.list}>
                {approvedRequests.map((request) => (
                  <article className={styles.compactRow} key={request.id}>
                    <div className={styles.rowBody}>
                      <span className={styles.rowMeta}>{formatDate(request.created_at)}</span>
                      <strong>{request.email}</strong>
                      <span>{request.plan} · {request.reference_number || "No reference"}</span>
                    </div>
                    <span className={styles.statusPill} data-status={request.status === PAYMENT_STATUS.ALREADY_PAID ? "recorded" : "paid"}>
                      <Check size={12} /> {request.status === PAYMENT_STATUS.ALREADY_PAID ? "Recorded" : "Paid"}
                    </span>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className={styles.panel}>
            <SectionHeader title="Automated payments" description="Latest Dodo checkout activity." count={dodoPayments.length} />
            {dodoPayments.length === 0 ? (
              <EmptyState title="No automated payments" description="Dodo transactions appear here." />
            ) : (
              <div className={styles.list}>
                {dodoPayments.map((payment) => (
                  <article className={styles.compactRow} key={payment.id}>
                    <div className={styles.rowBody}>
                      <span className={styles.rowMeta}>{formatDate(payment.created_at)}</span>
                      <strong>{payment.email}</strong>
                      <span>{payment.plan} · {payment.credits} credits · {payment.currency} {(Number(payment.amount || 0) / 100).toLocaleString()}</span>
                    </div>
                    <span className={styles.statusPill} data-status={payment.status}>{payment.status}</span>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className={styles.twoColumnGrid}>
          <section className={styles.panel}>
            <SectionHeader title="Recent reviews" description="Latest customer feedback." count={reviews.length} />
            {reviews.length === 0 ? (
              <EmptyState title="No reviews yet" description="Customer ratings will appear here." />
            ) : (
              <div className={styles.list}>
                {reviews.map((review) => (
                  <article className={styles.reviewRow} key={review.id}>
                    <div className={styles.reviewHeading}>
                      <span>{formatDate(review.created_at)}</span>
                      <strong><Star size={13} fill="currentColor" /> {review.rating}/5</strong>
                    </div>
                    <p>{review.feedback_text || "No written feedback."}</p>
                    <small>{review.name || `Project ${review.id.slice(0, 8)}`}</small>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className={styles.panel}>
            <SectionHeader title="Paid users" description="Users with remaining credits." count={paidUsers.length} />
            {paidUsers.length === 0 ? (
              <EmptyState title="No paid users" description="Paid customers will appear here." />
            ) : (
              <div className={styles.list}>
                {paidUsers.map((paidUser) => (
                  <article className={styles.compactRow} key={paidUser.id}>
                    <div className={styles.rowBody}>
                      <strong>{paidUser.email}</strong>
                      <span>Joined {new Date(paidUser.created_at).toLocaleDateString("en-PH")}</span>
                    </div>
                    <span className={styles.creditBadge}>{Number(paidUser.credits || 0).toLocaleString()} credits</span>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

            </div>
          </div>
        </section>

        <section className={styles.businessSection} aria-labelledby="store-section-title">
          <div className={styles.businessHeading}>
            <div>
              <p className={styles.kicker}>Digital products</p>
              <h2 id="store-section-title">Store</h2>
            </div>
          </div>
          <div className={styles.businessPanel} data-tone="store">
            <RevenueCard
              title="Revenue"
              description="Fulfilled product orders"
              revenue={revenue.store}
              tone="store"
            />
            <div className={styles.businessMetrics}>
              <MetricCard label="Pending orders" value={storeStats.pending.toLocaleString()} detail="Needs fulfillment" />
              <MetricCard label="Fulfilled" value={storeStats.fulfilled.toLocaleString()} detail="Orders sent" tone="success" />
              <MetricCard label="Rejected" value={storeStats.rejected.toLocaleString()} detail="Declined requests" />
              <MetricCard label="Total requests" value={storeStats.total.toLocaleString()} detail="All store orders" />
            </div>
            <div className={styles.businessDetails}>
        <section className={styles.panel}>
          <SectionHeader title="Store requests" description="Verify payment, deliver the product, then mark the order as sent." count={storeRequests.length} />
          {storeRequests.length === 0 ? (
            <EmptyState title="No pending store requests" description="New product orders will appear here." />
          ) : (
            <div className={styles.list}>
              {storeRequests.map((request) => (
                <article className={styles.listRow} key={request.id}>
                  <div className={styles.rowBody}>
                    <span className={styles.rowMeta}><Clock size={13} /> {formatDate(request.created_at)}</span>
                    <strong>{request.product_name}</strong>
                    <span>{request.product_type || "Store product"} · {request.email} · <b>{request.price}</b></span>
                  </div>
                  <div className={styles.rowActions}>
                    {request.receipt_url && <a className={styles.actionButton} href={request.receipt_url} target="_blank" rel="noreferrer">Receipt <ExternalLink size={13} /></a>}
                    <a
                      className={styles.actionButton}
                      href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(request.email)}&su=${encodeURIComponent(`Your ${request.product_name} purchase`)}&body=${encodeURIComponent(`Hi,\n\nThank you for purchasing ${request.product_name} (${request.product_type || "Store product"}).\n\nYour file, download link, or license details:\n\n`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Email <Mail size={13} />
                    </a>
                    <button className={styles.primaryButton} type="button" disabled={storeProcessingId === request.id} onClick={() => handleStoreRequestStatus(request, "fulfilled")}>
                      <Check size={14} /> {storeProcessingId === request.id && storeProcessingAction === "fulfilled" ? "Saving" : "Mark sent"}
                    </button>
                    <button className={styles.dangerButton} type="button" disabled={storeProcessingId === request.id} onClick={() => handleRejectStoreRequest(request)}>
                      <X size={14} /> {storeProcessingId === request.id && storeProcessingAction === "rejected" ? "Rejecting" : "Reject"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
            </div>
          </div>
        </section>

        <footer className={styles.footer}>
          <span>Syncraft Admin · 2026</span>
          <span><i /> Realtime monitoring active</span>
        </footer>
      </div>
    </main>
  );
}
