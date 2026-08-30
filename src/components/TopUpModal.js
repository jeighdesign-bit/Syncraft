"use client";

import { memo, useState, useCallback, useEffect, useRef } from "react";
import { X, Shirt, CheckCircle, Package, Tag, Mail, Smartphone, Check, ArrowRight, ImageIcon, History, Clock, CreditCard, AlertTriangle, QrCode } from "lucide-react";
import { toast } from "@/components/Toast";
import { createClient } from "@/utils/supabase/client";
import { CREDIT_PLANS } from "@/lib/paymentPlans";
import { CREDIT_COST } from "@/lib/pricing";
import { trackEvent } from "@/lib/analytics.mjs";

// Derived from CREDIT_PLANS — single source of truth.
// To change prices, edit src/lib/paymentPlans.js only.
const PLANS_META = {
  tingi:   { desc: 'Small package for quick tests.' },
  basic:   { desc: 'Great for hobbyists printing occasionally.' },
  starter: { desc: 'Ideal for small businesses taking their first steps.' },
  pro:     { desc: 'Perfect for print shops & growing design studios.', best: true },
  elite:   { desc: 'For high-volume agencies & power users.', elitePromo: true },
};

const PLANS = Object.values(CREDIT_PLANS).map((plan) => ({
  key:        plan.key,
  label:      plan.label,
  traces:     plan.credits,
  price:      plan.price,
  gcashPrice: plan.gcashPrice || plan.price,
  dodoPrice:  plan.dodoPrice,
  desc:       PLANS_META[plan.key]?.desc || '',
  best:       PLANS_META[plan.key]?.best || false,
  elitePromo: PLANS_META[plan.key]?.elitePromo || false,
  generations: Math.floor(plan.credits / CREDIT_COST.trace),
}));

const PLAN_LABELS = Object.fromEntries(
  Object.values(CREDIT_PLANS).map((p) => [p.key, `${p.label} — ${p.credits} Credits`])
);
const PLAN_PRICES = Object.fromEntries(
  Object.values(CREDIT_PLANS).map((p) => [p.key, p.price])
);
const PLAN_DODO_PRICES = Object.fromEntries(
  Object.values(CREDIT_PLANS).map((p) => [p.key, p.dodoPrice || p.price])
);
const DODO_ENABLED_PLANS = new Set(
  Object.values(CREDIT_PLANS).filter((p) => p.dodoEnabled).map((p) => p.key)
);
const SHOW_ELITE_PROMO_RIBBON = false;


const TopUpModal = memo(function TopUpModal({ show = true, user, supabase: supabaseProp, onClose, onLoginRequired, onCreditUpdated }) {
  const [fallbackSupabase] = useState(() => createClient());
  const supabase = supabaseProp || fallbackSupabase;
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ plan: "pro", txnRef: "", screenshotName: "", screenshotFile: null });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStartingDodo, setIsStartingDodo] = useState(false);
  const [activeTab, setActiveTab] = useState("plans");
  const [logs, setLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [qrExpanded, setQrExpanded] = useState(false);
  const [elitePromo, setElitePromo] = useState({ configured: null, limit: 10, remaining: 10 });
  const topUpViewTracked = useRef(false);

  useEffect(() => {
    if (show && !topUpViewTracked.current) {
      trackEvent("top_up_view", { default_plan: form.plan });
      topUpViewTracked.current = true;
    } else if (!show) {
      topUpViewTracked.current = false;
    }
  }, [show, form.plan]);

  useEffect(() => {
    if (!show || !SHOW_ELITE_PROMO_RIBBON) return;

    const controller = new AbortController();
    fetch("/api/promotions/elite-autoresizer", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data && Number.isFinite(data.remaining)) setElitePromo(data);
      })
      .catch((error) => {
        if (error.name !== "AbortError") console.warn("Elite promo counter unavailable", error);
      });

    return () => controller.abort();
  }, [show]);

  useEffect(() => {
    if (activeTab === "history" && user) {
      setIsLoadingLogs(true);
      
      const fetchLogs = async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (!token) throw new Error("No session");

          const response = await fetch("/api/credit-logs", {
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
          const data = await response.json();
          if (response.ok && data.logs) {
            setLogs(data.logs);
          } else {
            console.error("Failed to fetch logs:", data.error);
          }
        } catch (err) {
          console.error("Error fetching logs:", err);
        } finally {
          setIsLoadingLogs(false);
        }
      };

      fetchLogs();
    }
  }, [activeTab, user, supabase]);

  const handleClose = useCallback(() => {
    onClose();
    setStep(1);
    setSubmitted(false);
    setIsStartingDodo(false);
    setActiveTab("plans");
    setForm({ plan: "pro", txnRef: "", screenshotName: "", screenshotFile: null });
    setQrPhData(null);
    if (qrPollIntervalId) {
      clearInterval(qrPollIntervalId);
      setQrPollIntervalId(null);
    }
  }, [onClose]);


  const [isStartingPaymongo, setIsStartingPaymongo] = useState(false);
  const [qrPhData, setQrPhData] = useState(null);
  const [qrPollIntervalId, setQrPollIntervalId] = useState(null);

  const handleStartPaymongoCheckout = useCallback(async () => {
    if (!user) {
      onLoginRequired?.();
      return;
    }
    setIsStartingPaymongo(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Please log in again before checkout.");

      const response = await fetch("/api/payments/paymongo/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ planKey: form.plan }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to start PayMongo checkout");
      if (!data.qrBase64) throw new Error("PayMongo did not return a QR code");

      setQrPhData(data);
      setStep('qr_display');
      const selectedPlan = CREDIT_PLANS[form.plan];
      trackEvent("begin_checkout", {
        currency: "PHP",
        value: selectedPlan.amount / 100,
        payment_provider: "paymongo",
        plan: selectedPlan.key,
      });

      // Start polling
      const intervalId = setInterval(async () => {
        try {
          const res = await fetch(`/api/payments/paymongo/status?localPaymentId=${data.localPaymentId}`);
          if (res.ok) {
            const statusData = await res.json();
            if (statusData.status === 'paid') {
              clearInterval(intervalId);
              setQrPollIntervalId(null);
              setStep('success');
              toast.success("Payment completed! Your credits have been added.");
              trackEvent("purchase", {
                transaction_id: data.localPaymentId,
                currency: "PHP",
                value: selectedPlan.amount / 100,
                payment_provider: "paymongo",
                plan: selectedPlan.key,
                items: [{ item_id: selectedPlan.key, item_name: selectedPlan.label, quantity: 1 }],
              });

              // Broadcast credit update to all open components & parent
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("syncraft:credits-updated"));
              }
              onCreditUpdated?.();
            } else if (statusData.status === 'failed' || statusData.status === 'expired') {
              clearInterval(intervalId);
              setQrPollIntervalId(null);
              toast.error("Payment failed or expired. Please try again.");
              setStep(2);
            }
          }
        } catch(e) {
          console.error("Polling error", e);
        }
      }, 3000);
      setQrPollIntervalId(intervalId);
    } catch (err) {
      toast.error(err.message || "Failed to start PayMongo checkout");
    } finally {
      setIsStartingPaymongo(false);
    }
  }, [user, form.plan, supabase, onLoginRequired]);

  const handleStartDodoCheckout = useCallback(async () => {
    if (!user) {
      onLoginRequired?.();
      return;
    }
    if (!DODO_ENABLED_PLANS.has(form.plan)) {
      toast.error("Tingi is available via GCash only. Please choose Basic through Elite for card payments.");
      return;
    }

    setIsStartingDodo(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Please log in again before checkout.");

      const response = await fetch("/api/payments/dodo/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: form.plan }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to start Dodo checkout");
      if (!data.checkoutUrl) throw new Error("Dodo checkout URL is missing");

      const selectedPlan = CREDIT_PLANS[form.plan];
      trackEvent("begin_checkout", {
        currency: selectedPlan.dodoCurrency,
        value: selectedPlan.dodoAmount / 100,
        payment_provider: "dodo",
        plan: selectedPlan.key,
      });
      window.location.href = data.checkoutUrl;
    } catch (err) {
      toast.error(err.message || "Failed to start Dodo checkout");
    } finally {
      setIsStartingDodo(false);
    }
  }, [form.plan, onLoginRequired, supabase, user]);

  const handleSubmit = useCallback(async () => {
    if (!form.txnRef.trim() || !form.screenshotFile) {
      toast.error("Please enter the GCash reference number and upload proof of payment.");
      return;
    }
    if (!user) {
      toast.error("You must be logged in.");
      return;
    }

    setIsSubmitting(true);
    try {
      const fileExt = form.screenshotFile.name.split(".").pop();
      const fileName = `proof_${user.id}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("payment_proofs")
        .upload(fileName, form.screenshotFile);
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from("payment_proofs").getPublicUrl(fileName);

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Please log in again before submitting payment proof.");

      const response = await fetch("/api/payments/gcash/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plan: form.plan,
          referenceNumber: form.txnRef,
          proofUrl: publicData.publicUrl,
        }),
      });

      const data = await response.json();

      if (data.alreadyApproved) {
        toast.error("❌ This Transaction was already used. Please enter the NEW Phone/Ref Number from your recent payment.");
        return;
      }

      if (!response.ok) throw new Error(data.error || "Failed to submit payment request.");

      setSubmitted(true);
      trackEvent("generate_lead", {
        lead_source: "manual_gcash_payment_request",
        plan: form.plan,
      });
    } catch (err) {
      toast.error(`Error submitting request: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [form, user, supabase]);

  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={handleClose} style={{ padding: '24px' }}>
      <div className="modal-content" style={{ maxWidth: (activeTab === 'plans' && step === 1) ? '1250px' : '780px', width: '100%', maxHeight: 'calc(100vh - 48px)', padding: '0', overflow: 'hidden', borderRadius: '16px', border: '1px solid #333', background: '#111', display: 'flex', flexDirection: 'column', transition: 'max-width 0.3s ease', margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
        
        {/* Modal Header */}
        <div style={{ background: '#18181b', borderBottom: '1px solid #444', padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shirt size={18} color="#fff" />
            <span style={{ fontWeight: '600', fontSize: '15px', color: '#fff' }}>Get More Traces</span>
          </div>
          {!submitted && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {activeTab === 'plans' && [1, 2].map(s => (
                <div key={s} style={{ width: '24px', height: '24px', borderRadius: '50%', background: step >= s ? '#fff' : '#27272a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '600', color: step >= s ? '#000' : '#888', transition: 'all 0.2s' }}>{s}</div>
              ))}
            </div>
          )}
          <button onClick={handleClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '4px' }}><X size={16} /></button>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', background: '#18181b', borderBottom: '1px solid #444', padding: '0 24px', flexShrink: 0 }}>
          <button 
            onClick={() => { setActiveTab('plans'); setStep(1); }} 
            style={{ padding: '16px 20px', background: 'none', border: 'none', borderBottom: activeTab === 'plans' ? '2px solid #d4ff59' : '2px solid transparent', color: activeTab === 'plans' ? '#d4ff59' : '#888', fontWeight: '600', fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <Package size={16} /> Top-Up Plans
          </button>
          <button 
            onClick={() => { setActiveTab('history'); setStep(1); }} 
            style={{ padding: '16px 20px', background: 'none', border: 'none', borderBottom: activeTab === 'history' ? '2px solid #d4ff59' : '2px solid transparent', color: activeTab === 'history' ? '#d4ff59' : '#888', fontWeight: '600', fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <History size={16} /> Token Logs
          </button>
        </div>

        <div style={{ background: '#111', padding: '24px', overflowY: 'auto', minHeight: 0 }}>
          {activeTab === 'history' ? (
            <div style={{ minHeight: '300px' }}>
              <div style={{ marginBottom: '24px' }}>
                <h2 style={{ margin: '0 0 8px', fontSize: '24px', fontWeight: '700', color: '#fff' }}>Token History</h2>
                <p style={{ margin: 0, color: '#aaa', fontSize: '14px' }}>View your recent credit transactions and usage. Logs are automatically deleted after 3 days.</p>
              </div>
              
              {!user ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#888' }}>Please log in to view your token history.</div>
              ) : isLoadingLogs ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#888' }}>Loading logs...</div>
              ) : logs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: '#18181b', border: '1px dashed #444', borderRadius: '8px' }}>
                  <Clock size={32} color="#555" style={{ marginBottom: '12px' }} />
                  <div style={{ color: '#aaa', fontSize: '14px' }}>No transactions found in the last 3 days.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {logs.map((log) => (
                    <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#18181b', padding: '16px', borderRadius: '8px', border: '1px solid #222' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ color: '#fff', fontSize: '14px', fontWeight: '500' }}>{log.action}</span>
                        <span style={{ color: '#666', fontSize: '12px' }}>{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: log.amount > 0 ? '#4ade80' : '#ef4444' }}>
                        {log.amount > 0 ? '+' : ''}{log.amount}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : submitted ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'center' }}>
                <CheckCircle size={48} color="#4ade80" strokeWidth={1.5} />
              </div>
              <h3 style={{ margin: '0 0 8px', color: '#4ade80', fontWeight: '700' }}>Request Submitted!</h3>
              <p style={{ color: '#888', fontSize: '13px', margin: '0 0 8px' }}>We received your payment request.</p>
              <div style={{ background: '#111', border: '1px solid #18181b', borderRadius: '8px', padding: '14px', margin: '16px 0', textAlign: 'left' }}>
                <p style={{ margin: '0 0 8px', color: '#aaa', fontSize: '12px', display: 'flex', alignItems: 'center' }}><Package size={14} style={{ marginRight: '6px', color: '#888' }} /> Package: <strong style={{ color: '#d4ff59', marginLeft: '6px' }}>{PLAN_LABELS[form.plan]}</strong></p>
                <p style={{ margin: '0 0 8px', color: '#aaa', fontSize: '12px', display: 'flex', alignItems: 'center' }}><Tag size={14} style={{ marginRight: '6px', color: '#888' }} /> Phone No: <strong style={{ color: '#fff', marginLeft: '6px' }}>{form.txnRef || '—'}</strong></p>
                <p style={{ margin: 0, color: '#aaa', fontSize: '12px', display: 'flex', alignItems: 'center' }}><Mail size={14} style={{ marginRight: '6px', color: '#888' }} /> Account: <strong style={{ color: '#fff', marginLeft: '6px' }}>{user?.email}</strong></p>
              </div>
              <p style={{ color: '#666', fontSize: '12px', margin: '0 0 20px' }}>Credits are usually added within <strong style={{ color: '#4ade80' }}>10-30 minutes</strong>. Thank you.</p>
              <button onClick={handleClose} style={{ width: '100%', padding: '12px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>Close</button>
            </div>
          ) : step === 1 ? (
            <>
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                {!user && (
                  <div style={{ background: 'rgba(212, 255, 89,0.1)', border: '1px solid #d4ff59', color: '#d4ff59', padding: '12px', borderRadius: '8px', marginBottom: '24px', fontSize: '14px', fontWeight: '500' }}>
                    Welcome. You need credits to trace images. Please select a plan and log in.
                  </div>
                )}
                <div style={{ display: 'inline-block', border: '1px solid #555', padding: '4px 12px', fontSize: '11px', fontWeight: '600', color: '#ccc', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '16px', borderRadius: '4px' }}>Pricing Plan</div>
                <h2 style={{ margin: '0 0 8px', fontSize: '28px', fontWeight: '700', color: '#fff' }}>Affordable pricing</h2>
                <p style={{ margin: 0, color: '#aaa', fontSize: '14px', maxWidth: '500px', marginLeft: 'auto', marginRight: 'auto' }}>Choose the credit package that fits your workflow.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                {PLANS.map(p => (
                  <div key={p.key} style={{ background: p.best ? '#222' : '#18181b', border: `1px solid ${p.best ? '#d4ff59' : '#444'}`, padding: '32px 24px', display: 'flex', flexDirection: 'column', position: 'relative', borderRadius: '16px' }}>
                    {SHOW_ELITE_PROMO_RIBBON && p.elitePromo && (
                      <div
                        aria-label={elitePromo.remaining > 0 ? `Free Subli Auto-Resizer, ${elitePromo.remaining} slots left` : 'Subli Auto-Resizer promo ended'}
          style={{ position: 'absolute', top: '-46px', right: '-51px', transform: 'rotate(-5deg)', transformOrigin: 'center', zIndex: 2, minWidth: '242px', padding: '12px 22px 13px 18px', background: elitePromo.remaining > 0 ? '#fff' : '#3f3f46', clipPath: 'polygon(0 0, 96% 0, 100% 12%, 96% 24%, 100% 36%, 96% 50%, 100% 64%, 96% 76%, 100% 88%, 96% 100%, 0 100%, 4% 88%, 0 76%, 4% 64%, 0 50%, 4% 36%, 0 24%, 4% 12%)', whiteSpace: 'nowrap', lineHeight: 1.15, textAlign: 'center', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.92)', filter: elitePromo.remaining > 0 ? 'drop-shadow(0 7px 0 #a1a1aa) drop-shadow(0 13px 16px rgba(0,0,0,0.3))' : 'drop-shadow(0 7px 0 #25252a) drop-shadow(0 13px 16px rgba(0,0,0,0.3))' }}
                      >
                        {elitePromo.configured === false ? (
                          <span style={{ display: 'block', color: '#e4e4e7', fontSize: '9px', fontWeight: '800' }}>PROMO SETUP PENDING</span>
                        ) : elitePromo.remaining > 0 ? (
            <><span style={{ display: 'block', color: '#111', fontSize: '10px', fontWeight: '900', letterSpacing: '0.1px', transform: 'translateX(-7px)' }}>FREE LIFETIME SUBLI AUTO-RESIZER</span><span style={{ display: 'block', color: '#111', fontSize: '9.5px', fontWeight: '800', marginTop: '4px', transform: 'translateX(-7px)' }}>FIRST 10 ELITE BUYERS · {elitePromo.remaining} LEFT</span></>
                        ) : (
                          <span style={{ display: 'block', color: '#e4e4e7', fontSize: '9px', fontWeight: '800' }}>LAUNCH PROMO ENDED</span>
                        )}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '16px' }}>
                      <div style={{ fontSize: '16px', fontWeight: '500', color: '#fff' }}>{p.label}</div>
                      {p.best && <div style={{ background: '#d4ff59', color: '#000', fontSize: '11px', fontWeight: '800', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '4px', whiteSpace: 'nowrap' }}><CheckCircle size={12} /> Most popular</div>}
                    </div>

                    <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '32px', fontWeight: '700', color: '#fff', letterSpacing: '-1px' }}>{p.gcashPrice}</span>
                      </div>
                      <span style={{ fontSize: '12px', color: '#888' }}>{p.traces} credits</span>
                    </div>
                    
                    <p style={{ color: '#aaa', fontSize: '13px', lineHeight: '1.5', margin: '0 0 24px', minHeight: '40px' }}>{p.desc}</p>

                    <button 
                      onClick={() => { 
                        if (!user) {
                          onLoginRequired?.();
                          return;
                        }
                        setForm(f => ({ ...f, plan: p.key })); 
                        setStep(2); 
                      }}
                      style={{ width: '100%', padding: '12px 8px', background: p.best ? '#d4ff59' : 'transparent', color: p.best ? '#000' : '#d5d5d5', border: p.best ? 'none' : '1px solid #555', fontWeight: '600', fontSize: '13px', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginBottom: '24px', borderRadius: '8px', whiteSpace: 'nowrap' }}
                      onMouseOver={e => { e.target.style.opacity = '0.9'; if (!p.best) { e.target.style.background = '#3a3a3a'; e.target.style.borderColor = '#777'; } }} 
                      onMouseOut={e => { e.target.style.opacity = '1'; if (!p.best) { e.target.style.background = 'transparent'; e.target.style.borderColor = '#555'; } }}
                    >
                      {user ? 'Select Plan' : 'Log in to Purchase'} <ArrowRight size={14} />
                    </button>

                    <div style={{ borderTop: '1px solid #3b3b3f', margin: '0 -24px 20px' }}></div>

                    <div style={{ marginTop: 'auto', textAlign: 'center', padding: '4px 0 2px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '800', color: p.best ? '#d4ff59' : '#7f7f86', marginBottom: '8px', letterSpacing: '0.8px', textTransform: 'uppercase' }}>Your allowance</div>
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: '7px', color: '#fff', lineHeight: 1 }}>
                        <span style={{ fontSize: '42px', fontWeight: '850', letterSpacing: '-2px' }}>{p.generations}</span>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: p.best ? '#d4ff59' : '#d5d5d5' }}>AI generations</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : step === 2 ? (
            <>
              <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                <div style={{ display: 'inline-block', border: '1px solid #555', padding: '4px 12px', fontSize: '11px', fontWeight: '600', color: '#ccc', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '16px', borderRadius: '4px' }}>Payment Method</div>
                <h2 style={{ margin: '0 0 8px', fontSize: '28px', fontWeight: '700', color: '#fff' }}>Choose how to pay</h2>
                <p style={{ margin: 0, color: '#aaa', fontSize: '14px' }}>
                  Selected: <strong style={{ color: '#d4ff59' }}>{PLAN_LABELS[form.plan]}</strong> · <strong style={{ color: '#fff' }}>{PLAN_PRICES[form.plan]}</strong>
                </p>
                {form.plan === 'tingi' && (
                  <p style={{ margin: '10px 0 0', color: '#d4ff59', fontSize: '13px', fontWeight: '600' }}>
                    Mini is GCash-only. Card / International starts at Basic.
                  </p>
                )}
              </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', margin: '0 auto 24px' }}>
                {/* 1. QR Ph */}
                <button
                  type="button"
                  onClick={handleStartPaymongoCheckout}
                  disabled={isStartingPaymongo || isStartingDodo}
                  style={{ background: '#18181b', border: '1px solid #333', color: '#fff', padding: '16px 20px', minHeight: '96px', boxSizing: 'border-box', textAlign: 'left', cursor: (isStartingPaymongo || isStartingDodo) ? 'not-allowed' : 'pointer', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '16px', opacity: (isStartingPaymongo || isStartingDodo) ? 0.6 : 1, transition: 'all 0.2s ease', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
                  onMouseOver={(e) => { if (!isStartingPaymongo && !isStartingDodo) { e.currentTarget.style.borderColor = '#d4ff59'; e.currentTarget.style.background = '#222226'; } }}
                  onMouseOut={(e) => { if (!isStartingPaymongo && !isStartingDodo) { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.background = '#18181b'; } }}
                >
                  <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(212, 255, 89, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <QrCode size={24} color="#d4ff59" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <span style={{ fontSize: '16px', fontWeight: '700', color: '#fff' }}>QR Ph (GCash & Maya)</span>
                      <span style={{ background: 'rgba(212, 255, 89, 0.15)', color: '#d4ff59', fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {isStartingPaymongo ? 'Loading...' : 'Instant Auto-Credit'}
                      </span>
                    </div>
                    <span style={{ color: '#888', fontSize: '13px', lineHeight: '1.4' }}>
                      Scan dynamic QR with GCash, Maya, ShopeePay, or PH banking apps ({PLAN_PRICES[form.plan]}).
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', paddingLeft: '16px', borderLeft: '1px solid #2a2a2e', flexShrink: 0, height: '32px' }}>
                    <img src="/logos/qrph.png?v=2" alt="QR Ph" style={{ height: '18px', width: 'auto', objectFit: 'contain' }} />
                    <img src="/logos/gcash.svg" alt="GCash" style={{ height: '18px', width: 'auto', objectFit: 'contain' }} />
                    <img src="/logos/maya.png?v=2" alt="Maya" style={{ height: '18px', width: 'auto', objectFit: 'contain' }} />
                    <ArrowRight size={18} color="#666" style={{ marginLeft: '4px' }} />
                  </div>
                </button>

                {/* 2. Card */}
                <button
                  type="button"
                  onClick={handleStartDodoCheckout}
                  disabled={isStartingDodo || isStartingPaymongo || form.plan === 'tingi'}
                  style={{ background: form.plan === 'tingi' ? '#141416' : '#18181b', border: '1px solid #333', color: '#fff', padding: '16px 20px', minHeight: '96px', boxSizing: 'border-box', textAlign: 'left', cursor: (isStartingDodo || isStartingPaymongo || form.plan === 'tingi') ? 'not-allowed' : 'pointer', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '16px', opacity: (isStartingDodo || isStartingPaymongo || form.plan === 'tingi') ? 0.5 : 1, transition: 'all 0.2s ease', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
                  onMouseOver={(e) => { if (!isStartingDodo && !isStartingPaymongo && form.plan !== 'tingi') { e.currentTarget.style.borderColor = '#d4ff59'; e.currentTarget.style.background = '#222226'; } }}
                  onMouseOut={(e) => { if (!isStartingDodo && !isStartingPaymongo && form.plan !== 'tingi') { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.background = '#18181b'; } }}
                >
                  <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(212, 255, 89, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <CreditCard size={24} color="#d4ff59" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <span style={{ fontSize: '16px', fontWeight: '700', color: '#fff' }}>Card / International</span>
                      <span style={{ background: 'rgba(212, 255, 89, 0.15)', color: '#d4ff59', fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {form.plan === 'tingi' ? 'Basic+' : isStartingDodo ? 'Loading...' : 'Instant Auto-Credit'}
                      </span>
                    </div>
                    <span style={{ color: '#888', fontSize: '13px', lineHeight: '1.4' }}>
                      {form.plan === 'tingi'
                        ? 'Not available for Mini due to high card transaction fees.'
                        : `Pay instantly via Credit/Debit card with auto-crediting (${PLAN_DODO_PRICES[form.plan]}).`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', paddingLeft: '16px', borderLeft: '1px solid #2a2a2e', flexShrink: 0, height: '32px' }}>
                    <img src="/logos/visa.svg" alt="Visa" style={{ height: '16px', width: 'auto', objectFit: 'contain' }} />
                    <img src="/logos/mastercard.svg" alt="Mastercard" style={{ height: '18px', width: 'auto', objectFit: 'contain' }} />
                    <ArrowRight size={18} color="#666" style={{ marginLeft: '4px' }} />
                  </div>
                </button>

                {/* 3. GCash Manual */}
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={isStartingPaymongo || isStartingDodo}
                  style={{ background: '#18181b', border: '1px solid #333', color: '#fff', padding: '16px 20px', minHeight: '96px', boxSizing: 'border-box', textAlign: 'left', cursor: (isStartingPaymongo || isStartingDodo) ? 'not-allowed' : 'pointer', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '16px', opacity: (isStartingPaymongo || isStartingDodo) ? 0.6 : 1, transition: 'all 0.2s ease', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
                  onMouseOver={(e) => { if (!isStartingPaymongo && !isStartingDodo) { e.currentTarget.style.borderColor = '#d4ff59'; e.currentTarget.style.background = '#222226'; } }}
                  onMouseOut={(e) => { if (!isStartingPaymongo && !isStartingDodo) { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.background = '#18181b'; } }}
                >
                  <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Smartphone size={24} color="#aaa" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <span style={{ fontSize: '16px', fontWeight: '700', color: '#fff' }}>GCash Manual (Backup)</span>
                      <span style={{ background: '#27272a', color: '#aaa', fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Manual Approval</span>
                    </div>
                    <span style={{ color: '#888', fontSize: '13px', lineHeight: '1.4' }}>
                      Scan static QR code, upload payment receipt, and receive credits in 10-30 mins.
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', paddingLeft: '16px', borderLeft: '1px solid #2a2a2e', flexShrink: 0, height: '32px' }}>
                    <img src="/logos/gcash.svg" alt="GCash" style={{ height: '18px', width: 'auto', opacity: 0.7, objectFit: 'contain' }} />
                    <ArrowRight size={18} color="#666" style={{ marginLeft: '4px' }} />
                  </div>
                </button>

                {form.plan !== 'tingi' && (
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '14px 18px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <AlertTriangle size={16} color="#888" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span style={{ color: '#777', fontSize: '12px', lineHeight: '1.5' }}>
                      QR Ph provides instant automated crediting in PHP with no foreign currency fees. International card payments are billed in USD.
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '12px' }}>
                  <button onClick={() => setStep(1)} disabled={isStartingDodo || isStartingPaymongo} style={{ padding: '10px 20px', background: 'transparent', color: '#aaa', border: '1px solid #444', borderRadius: '8px', cursor: (isStartingDodo || isStartingPaymongo) ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: '500', transition: 'all 0.2s' }}>← Back to Plans</button>
                </div>
              </div>


            </>
          ) : step === 'success' ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(74, 222, 128, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px', border: '1px solid #4ade80' }}>
                <CheckCircle size={40} color="#4ade80" />
              </div>
              <h2 style={{ fontSize: '26px', fontWeight: '800', color: '#fff', margin: '0 0 8px' }}>Payment Completed! 🎉</h2>
              <p style={{ color: '#aaa', fontSize: '15px', margin: '0 0 28px', maxWidth: '420px', lineHeight: '1.5' }}>
                <strong style={{ color: '#d4ff59' }}>{CREDIT_PLANS[form.plan]?.credits || 24} Credits</strong> have been added directly to your account.
              </p>
              <button 
                onClick={handleClose} 
                style={{ padding: '14px 36px', background: '#d4ff59', color: '#000', border: 'none', borderRadius: '10px', fontWeight: '700', fontSize: '15px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 16px rgba(212, 255, 89, 0.25)' }}
                onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
                onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
              >
                Start Creating Now →
              </button>
            </div>
          ) : step === 'qr_display' && qrPhData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', border: '1px solid #333', padding: '4px 12px', fontSize: '11px', fontWeight: '700', color: '#d4ff59', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '12px', borderRadius: '4px', background: 'rgba(212, 255, 89, 0.05)' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#d4ff59', boxShadow: '0 0 8px #d4ff59', display: 'inline-block' }} />
                  Scan to Pay with QR Ph
                </div>
                <h2 style={{ margin: '0 0 6px', fontSize: '24px', fontWeight: '700', color: '#fff' }}>
                  {PLAN_LABELS[form.plan]} · {PLAN_PRICES[form.plan]}
                </h2>
                <p style={{ margin: 0, color: '#888', fontSize: '13px' }}>
                  Scan with GCash, Maya, ShopeePay, or any banking app
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', alignItems: 'stretch' }}>
                {/* Left Card: QR Code */}
                <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                  <img 
                    src={qrPhData.qrBase64} 
                    alt="QR Ph Payment Code" 
                    style={{ width: '100%', maxWidth: '260px', height: 'auto', aspectRatio: '1/1', objectFit: 'contain', display: 'block' }} 
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #eee', width: '100%', justifyContent: 'center' }}>
                    <img src="/logos/qrph.png?v=2" alt="QR Ph" style={{ height: '16px', width: 'auto' }} />
                    <img src="/logos/gcash.svg" alt="GCash" style={{ height: '16px', width: 'auto' }} />
                    <img src="/logos/maya.png?v=2" alt="Maya" style={{ height: '16px', width: 'auto' }} />
                  </div>
                </div>

                {/* Right Card: Status & Instructions */}
                <div style={{ background: '#18181b', borderRadius: '16px', border: '1px solid #2a2a2e', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #27272a' }}>
                      <span style={{ color: '#888', fontSize: '11px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase' }}>PAYMONGO QRPH</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(212, 255, 89, 0.1)', padding: '4px 10px', borderRadius: '20px', border: '1px solid rgba(212, 255, 89, 0.2)' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#d4ff59', boxShadow: '0 0 6px #d4ff59', display: 'inline-block' }} />
                        <span style={{ color: '#d4ff59', fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px' }}>WAITING FOR PAYMENT</span>
                      </div>
                    </div>

                    <div style={{ color: '#888', fontSize: '12px', marginBottom: '4px' }}>Amount Due</div>
                    <div style={{ fontSize: '32px', fontWeight: '800', color: '#fff', marginBottom: '20px', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      {PLAN_PRICES[form.plan]}
                      <span style={{ fontSize: '13px', color: '#888', fontWeight: '500' }}>({CREDIT_PLANS[form.plan]?.credits || 0} credits)</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#27272a', color: '#d4ff59', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>1</div>
                        <span style={{ color: '#ccc', fontSize: '13px', lineHeight: '1.4' }}>Open <strong>GCash</strong>, <strong>Maya</strong>, or any banking app and tap <strong>Scan QR</strong>.</span>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#27272a', color: '#d4ff59', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>2</div>
                        <span style={{ color: '#ccc', fontSize: '13px', lineHeight: '1.4' }}>Keep this window open while PayMongo confirms the payment.</span>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#27272a', color: '#d4ff59', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>3</div>
                        <span style={{ color: '#ccc', fontSize: '13px', lineHeight: '1.4' }}>Credits will be <strong>added automatically</strong> to your account.</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setStep(2);
                      setQrPhData(null);
                      if (qrPollIntervalId) {
                        clearInterval(qrPollIntervalId);
                        setQrPollIntervalId(null);
                      }
                    }}
                    style={{ width: '100%', padding: '12px', background: '#27272a', color: '#aaa', border: '1px solid #3f3f46', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s' }}
                    onMouseOver={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#666'; }}
                    onMouseOut={(e) => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = '#3f3f46'; }}
                  >
                    ← Back to Payment Methods
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ background: '#18181b', border: '1px solid #444', borderRadius: '8px', padding: '12px 16px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#aaa', fontSize: '13px' }}>Selected: <strong style={{ color: '#fff' }}>{PLAN_LABELS[form.plan]}</strong> · GCash Manual</span>
                <span style={{ color: '#d4ff59', fontWeight: '600', fontSize: '15px' }}>{PLAN_PRICES[form.plan]}</span>
              </div>
              <div style={{ background: 'rgba(212, 255, 89, 0.08)', border: '1px solid rgba(212, 255, 89, 0.35)', borderRadius: '8px', padding: '14px 16px', marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <AlertTriangle size={18} color="#d4ff59" style={{ flexShrink: 0, marginTop: '1px' }} />
                <div style={{ color: '#d6d6d6', fontSize: '13px', lineHeight: 1.55 }}>
                  <strong style={{ color: '#d4ff59' }}>Manual GCash is not automated.</strong> Submit only once after paying. Duplicate or repeated proof submissions after credits are already added may be blocked for 7 days. Use the same email/account you want credited.
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#18181b', border: '1px solid #333', borderRadius: '10px', padding: '12px 16px', cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => setQrExpanded(true)} onMouseOver={e => e.currentTarget.style.borderColor = '#d4ff59'} onMouseOut={e => e.currentTarget.style.borderColor = '#333'}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '8px', overflow: 'hidden', background: '#fff', padding: '4px', flexShrink: 0 }}>
                    <img src="/Gcash-qr-code.jpg" alt="GCash QR" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#fff', marginBottom: '2px' }}>GCash QR Code</div>
                    <div style={{ fontSize: '12px', color: '#888' }}>Tap to view full QR code for scanning</div>
                  </div>
                  <Smartphone size={18} color="#d4ff59" style={{ flexShrink: 0 }} />
                </div>

                {qrExpanded && (
                  <div onClick={() => setQrExpanded(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
                    <div style={{ background: '#fff', borderRadius: '16px', padding: '12px', maxWidth: '360px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
                      <img src="/Gcash-qr-code.jpg" alt="GCash QR" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px' }} />
                      <p style={{ textAlign: 'center', margin: '12px 0 4px', fontSize: '13px', color: '#333', fontWeight: '600' }}>Scan with GCash app</p>
                      <button onClick={() => setQrExpanded(false)} style={{ width: '100%', padding: '10px', background: '#111', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', marginTop: '8px' }}>Close</button>
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '12px' }}>
                  <div>
                    <label style={{ display: 'block', color: '#aaa', fontSize: '13px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>GCASH SENDER PHONE NUMBER *</label>
                    <input type="tel" inputMode="numeric" placeholder="e.g. 09123456789" value={form.txnRef} onChange={e => setForm(f => ({ ...f, txnRef: e.target.value }))} style={{ width: '100%', background: '#222', border: '1px solid #444', borderRadius: '8px', padding: '16px', color: '#fff', fontSize: '16px', outline: 'none', boxSizing: 'border-box' }} onFocus={e => e.target.style.borderColor = '#d4ff59'} onBlur={e => e.target.style.borderColor = '#444'} />
                    <div style={{ color: '#888', fontSize: '11px', marginTop: '6px' }}>Enter the GCash number you used to send the payment.</div>
                  </div>
                  <div>
                    <label style={{ display: 'block', color: '#aaa', fontSize: '13px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Upload Proof of Payment *</label>
                    <input type="file" accept="image/*" onChange={e => { if (e.target.files[0]) setForm(f => ({ ...f, screenshotName: e.target.files[0].name, screenshotFile: e.target.files[0] })) }} style={{ display: 'none' }} id="proof-upload" />
                    <label htmlFor="proof-upload" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: '#222', border: '1px dashed #555', borderRadius: '8px', padding: '14px 16px', color: form.screenshotName ? '#d4ff59' : '#888', fontSize: '15px', cursor: 'pointer', boxSizing: 'border-box', transition: 'all 0.2s' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><ImageIcon size={18} /> {form.screenshotName || 'Select screenshot...'}</span>
                      <span style={{ fontSize: '12px', background: '#444', color: '#fff', padding: '6px 10px', borderRadius: '4px' }}>Browse</span>
                    </label>
                  </div>
                  <div>
                    <label style={{ display: 'block', color: '#888', fontSize: '13px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Your Email (auto-filled)</label>
                    <input type="text" value={user?.email || ''} readOnly style={{ width: '100%', background: '#1a1a1a', border: '1px solid #222', borderRadius: '8px', padding: '16px', color: '#666', fontSize: '16px', outline: 'none', boxSizing: 'border-box', cursor: 'not-allowed' }} />
                  </div>
                  <p style={{ margin: '12px 0 0', color: '#aaa', fontSize: '13px', lineHeight: 1.6 }}>After paying, fill in the phone number, attach your screenshot above and submit. Credits arrive within <strong style={{ color: '#d4ff59' }}>10–30 minutes</strong>.</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" onClick={() => setStep(1)} disabled={isSubmitting} style={{ flex: 1, padding: '16px', background: 'transparent', color: '#aaa', border: '1px solid #444', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px' }}>Back</button>
                <button 
                  onClick={handleSubmit} 
                  disabled={!form.txnRef || !form.screenshotFile || isSubmitting} 
                  style={{ flex: 2, padding: '16px', background: (!form.txnRef || !form.screenshotFile || isSubmitting) ? '#222' : '#d4ff59', color: (!form.txnRef || !form.screenshotFile || isSubmitting) ? '#666' : '#000', border: 'none', borderRadius: '8px', cursor: (!form.txnRef || !form.screenshotFile || isSubmitting) ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '15px' }}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Payment'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

export default TopUpModal;
