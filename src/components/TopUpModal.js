"use client";

import { memo, useState, useCallback, useEffect, useRef } from "react";
import { X, Wallet, CheckCircle, Package, Tag, Mail, Smartphone, ArrowRight, ImageIcon, History, CreditCard, AlertTriangle, QrCode } from "lucide-react";
import { toast } from "@/components/Toast";
import { createClient } from "@/utils/supabase/client";
import { CREDIT_PLANS } from "@/lib/paymentPlans";
import { MANUAL_GCASH_ENABLED } from "@/lib/paymentMethods.mjs";
import { trackEvent } from "@/lib/analytics.mjs";
import PricingSection from "@/app/components/PricingSection";
import CreditHistory from "./CreditHistory";
import styles from "./TopUpModal.module.css";

const PLAN_LABELS = Object.fromEntries(
  Object.values(CREDIT_PLANS).map((p) => [p.key, `${p.label} — ${p.credits} Credits`])
);
const PLAN_PRICES = Object.fromEntries(
  Object.values(CREDIT_PLANS).map((p) => [p.key, p.price])
);
const POLAR_ENABLED_PLANS = new Set(
  Object.values(CREDIT_PLANS).filter((p) => p.polarEnabled).map((p) => p.key)
);
const POLAR_CARD_PAYMENTS_AVAILABLE = process.env.NEXT_PUBLIC_POLAR_CARD_PAYMENTS_AVAILABLE === "true";


const TopUpModal = memo(function TopUpModal({ show = true, user, supabase: supabaseProp, initialPlanKey = "pro", initialStep = 1, onClose, onLoginRequired, onCreditUpdated }) {
  const [fallbackSupabase] = useState(() => createClient());
  const supabase = supabaseProp || fallbackSupabase;
  const [step, setStep] = useState(initialStep);
  const [form, setForm] = useState({ plan: CREDIT_PLANS[initialPlanKey] ? initialPlanKey : "pro", txnRef: "", screenshotName: "", screenshotFile: null });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStartingPolar, setIsStartingPolar] = useState(false);
  const [activeTab, setActiveTab] = useState("plans");
  const [logs, setLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [qrExpanded, setQrExpanded] = useState(false);
  const topUpViewTracked = useRef(false);

  useEffect(() => {
    if (show && CREDIT_PLANS[initialPlanKey]) {
      setForm((current) => current.plan === initialPlanKey ? current : { ...current, plan: initialPlanKey });
      setStep(initialStep);
      setActiveTab("plans");
    }
  }, [show, initialPlanKey, initialStep]);

  useEffect(() => {
    if (show && !topUpViewTracked.current) {
      trackEvent("top_up_view", { default_plan: form.plan });
      topUpViewTracked.current = true;
    } else if (!show) {
      topUpViewTracked.current = false;
    }
  }, [show, form.plan]);

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
    setIsStartingPolar(false);
    setActiveTab("plans");
    setForm({ plan: CREDIT_PLANS[initialPlanKey] ? initialPlanKey : "pro", txnRef: "", screenshotName: "", screenshotFile: null });
    setQrPhData(null);
    if (qrPollIntervalId) {
      clearInterval(qrPollIntervalId);
      setQrPollIntervalId(null);
    }
  }, [initialPlanKey, onClose]);


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

  const handleStartPolarCheckout = useCallback(async () => {
    if (!user) {
      onLoginRequired?.();
      return;
    }
    if (!POLAR_CARD_PAYMENTS_AVAILABLE) {
      toast.error("Card payments are being prepared. Please use QR Ph for now.");
      return;
    }
    if (!POLAR_ENABLED_PLANS.has(form.plan)) {
      toast.error("Tingi is available via QR Ph only. Please choose Basic through Elite for card payments.");
      return;
    }

    setIsStartingPolar(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Please log in again before checkout.");

      const response = await fetch("/api/payments/polar/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: form.plan }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to start card checkout");
      if (!data.checkoutUrl) throw new Error("Card checkout URL is missing");

      const selectedPlan = CREDIT_PLANS[form.plan];
      trackEvent("begin_checkout", {
        currency: selectedPlan.polarCurrency,
        value: selectedPlan.polarAmount / 100,
        payment_provider: "polar",
        plan: selectedPlan.key,
      });
      window.location.href = data.checkoutUrl;
    } catch (err) {
      toast.error(err.message || "Failed to start card checkout");
    } finally {
      setIsStartingPolar(false);
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
      <div className="modal-content credits-modal" style={{ maxWidth: (activeTab === 'plans' && step === 1) ? '1080px' : '720px', width: '100%', maxHeight: 'min(840px, calc(100dvh - 64px))', padding: '0', overflow: 'hidden', borderRadius: '16px', border: '1px solid #333', background: '#111', display: 'flex', flexDirection: 'column', transition: 'max-width 0.3s ease', margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>

        <header className={styles.header}>
          <div className={styles.heading}>
            <span className={styles.headingIcon}><Wallet size={17} aria-hidden="true" /></span>
            <div><h2>Credits & top-ups</h2><p>Your balance, your next project.</p></div>
          </div>
          <button type="button" className={styles.close} aria-label="Close credits dialog" onClick={handleClose}><X size={16} /></button>
        </header>
        <nav className={styles.navigation} aria-label="Credits sections">
          <div className={styles.tabs}>
            <button type="button" aria-pressed={activeTab === 'plans'} className={activeTab === 'plans' ? styles.activeTab : ''} onClick={() => { setActiveTab('plans'); setStep(1); }}>
              <Package size={14} aria-hidden="true" /> Credit packages
            </button>
            <button type="button" aria-pressed={activeTab === 'history'} className={activeTab === 'history' ? styles.activeTab : ''} onClick={() => { setActiveTab('history'); setStep(1); }}>
              <History size={14} aria-hidden="true" /> Credit history
            </button>
          </div>
        </nav>
        <div style={{ background: '#111', padding: '20px', overflowY: 'auto', minHeight: 0 }}>
          {activeTab === 'history' ? (
            <CreditHistory logs={logs} loading={isLoadingLogs} signedIn={Boolean(user)} />
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
            <PricingSection
              compact
              isSignedIn={Boolean(user)}
              onSelectPlan={(planKey) => {
                if (!user) {
                  onLoginRequired?.();
                  return;
                }
                setForm((current) => ({ ...current, plan: planKey }));
                setStep(2);
              }}
            />
          ) : step === 2 ? (
            <section className={styles.paymentStep} aria-labelledby="payment-method-heading">
              <div className={styles.paymentIntro}>
                <span className={styles.paymentEyebrow}>Payment Method</span>
                <h2 id="payment-method-heading">Choose how to pay</h2>
                <p className={styles.paymentSelection}>
                  Selected: <strong>{PLAN_LABELS[form.plan]}</strong> · <strong>{PLAN_PRICES[form.plan]}</strong>
                </p>
                {form.plan === 'tingi' && (
                  <p className={styles.paymentPlanNote}>
                    Mini is available through QR Ph using GCash, Maya, or a supported banking app.
                  </p>
                )}
              </div>

              <div className={styles.paymentMethods}>
                <button
                  type="button"
                  className={styles.paymentMethod}
                  onClick={handleStartPaymongoCheckout}
                  disabled={isStartingPaymongo || isStartingPolar}
                >
                  <span className={styles.headingIcon}><QrCode size={20} aria-hidden="true" /></span>
                  <span className={styles.paymentCopy}>
                    <span className={styles.paymentTitle}>
                      <strong>QR Ph (GCash & Maya)</strong>
                      <span className={styles.paymentStatusActive}>{isStartingPaymongo ? 'Loading…' : 'Instant credit'}</span>
                    </span>
                    <span className={styles.paymentDescription}>Scan dynamic QR with GCash, Maya, ShopeePay, or PH banking apps ({PLAN_PRICES[form.plan]}).</span>
                    <span className={styles.paymentBrands}>
                      <img src="/logos/qrph.png?v=2" alt="QR Ph" />
                      <img src="/logos/gcash.svg" alt="GCash" />
                      <img src="/logos/maya.png?v=2" alt="Maya" />
                    </span>
                  </span>
                  <ArrowRight size={18} className={styles.paymentArrow} aria-hidden="true" />
                </button>

                <button
                  type="button"
                  className={styles.paymentMethod}
                  onClick={handleStartPolarCheckout}
                  disabled={!POLAR_CARD_PAYMENTS_AVAILABLE || isStartingPolar || isStartingPaymongo || form.plan === 'tingi'}
                  aria-label={POLAR_CARD_PAYMENTS_AVAILABLE ? "Pay by Visa or Mastercard" : "Card payments are being prepared"}
                  aria-describedby="card-payment-status"
                >
                  <span className={styles.headingIcon}><CreditCard size={20} aria-hidden="true" /></span>
                  <span className={styles.paymentCopy}>
                    <span className={styles.paymentTitle}>
                      <strong>Card / International</strong>
                      <span className={styles.paymentStatus}>{isStartingPolar ? 'Opening checkout…' : POLAR_CARD_PAYMENTS_AVAILABLE ? 'Secure checkout' : 'Setup in progress'}</span>
                    </span>
                    <span id="card-payment-status" className={styles.paymentDescription}>
                      {POLAR_CARD_PAYMENTS_AVAILABLE
                        ? `Pay securely with Visa or Mastercard (${CREDIT_PLANS[form.plan]?.polarPrice || ''}).`
                        : 'Card payments are being prepared. Please use QR Ph for now.'}
                    </span>
                    <span className={styles.paymentBrands} aria-hidden="true">
                      <img src="/logos/visa.svg" alt="" />
                      <img src="/logos/mastercard.svg" alt="" />
                    </span>
                  </span>
                </button>

                {MANUAL_GCASH_ENABLED && <button
                  type="button"
                  className={styles.paymentMethod}
                  onClick={() => setStep(3)}
                  disabled={isStartingPaymongo || isStartingPolar}
                >
                  <span className={styles.headingIcon}><Smartphone size={20} aria-hidden="true" /></span>
                  <span className={styles.paymentCopy}>
                    <span className={styles.paymentTitle}>
                      <strong>GCash Manual (Backup)</strong>
                      <span className={styles.paymentStatus}>Manual approval</span>
                    </span>
                    <span className={styles.paymentDescription}>Scan static QR code, upload payment receipt, and receive credits in 10-30 mins.</span>
                    <span className={styles.paymentBrands}><img src="/logos/gcash.svg" alt="GCash" /></span>
                  </span>
                  <ArrowRight size={18} className={styles.paymentArrow} aria-hidden="true" />
                </button>}
              </div>

              <div role="status" className={styles.paymentNotice}>
                <CheckCircle size={16} aria-hidden="true" />
                <span>Both payment options add credits automatically after successful payment. No receipt upload or manual approval needed.</span>
              </div>

              <div className={styles.paymentFooter}>
                <button type="button" className={`${styles.close} ${styles.paymentBack}`} onClick={() => setStep(1)} disabled={isStartingPolar || isStartingPaymongo}>← Back to Plans</button>
              </div>
            </section>
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
            <section className={styles.paymentStep} aria-labelledby="qr-payment-heading">
              <div className={styles.paymentIntro}>
                <span className={styles.paymentEyebrow}>Scan to pay with QR Ph</span>
                <h2 id="qr-payment-heading">{PLAN_LABELS[form.plan]} · {PLAN_PRICES[form.plan]}</h2>
                <p className={styles.qrSubtitle}>Scan with GCash, Maya, ShopeePay, or any banking app</p>
              </div>

              <div className={styles.qrLayout}>
                <div className={styles.qrCodeCard}>
                  <img className={styles.qrCode} src={qrPhData.qrBase64} alt="QR Ph Payment Code" />
                  <div className={`${styles.paymentBrands} ${styles.qrBrands}`}>
                    <img src="/logos/qrph.png?v=2" alt="QR Ph" />
                    <img src="/logos/gcash.svg" alt="GCash" />
                    <img src="/logos/maya.png?v=2" alt="Maya" />
                  </div>
                </div>

                <div className={styles.qrDetails}>
                  <div className={styles.qrStatusRow}>
                    <span className={styles.qrProvider}>PAYMONGO QRPH</span>
                    <span role="status" className={styles.paymentStatus}>Waiting for payment</span>
                  </div>
                  <div className={styles.qrAmount}>
                    <span>Amount Due</span>
                    <div>
                      <strong>{PLAN_PRICES[form.plan]}</strong>
                      <span>({CREDIT_PLANS[form.plan]?.credits || 0} credits)</span>
                    </div>
                  </div>

                  <ol className={styles.qrInstructions}>
                    <li><span>Open <strong>GCash</strong>, <strong>Maya</strong>, or any banking app and tap <strong>Scan QR</strong>.</span></li>
                    <li><span>Keep this window open while PayMongo confirms the payment.</span></li>
                    <li><span>Credits will be <strong>added automatically</strong> to your account.</span></li>
                  </ol>

                  <div className={styles.qrFooter}>
                    <button
                      type="button"
                      className={`${styles.close} ${styles.paymentBack} ${styles.qrBack}`}
                      onClick={() => {
                      setStep(2);
                      setQrPhData(null);
                      if (qrPollIntervalId) {
                        clearInterval(qrPollIntervalId);
                        setQrPollIntervalId(null);
                      }
                    }}
                    >
                      ← Back to Payment Methods
                    </button>
                  </div>
                </div>
              </div>
            </section>
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
