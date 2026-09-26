"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, LoaderCircle, QrCode, ShieldCheck, Sparkles, X } from "lucide-react";
import { B2B_CREDIT_PLANS } from "@/lib/b2bPaymentPlans";
import styles from "./api-credit-top-up.module.css";

const plans = Object.values(B2B_CREDIT_PLANS);

export default function ApiCreditTopUpModal({ open, onClose, supabase, onPaid }) {
  const [selectedPlan, setSelectedPlan] = useState("pro");
  const [checkout, setCheckout] = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !starting) onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, starting]);

  useEffect(() => {
    if (!open || !checkout?.paymentId || checkout.status === "paid") return;
    const poll = window.setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const response = await fetch(
        `/api/b2b/payments/paymongo/status?paymentId=${encodeURIComponent(checkout.paymentId)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      if (!response.ok) return;
      const { payment } = await response.json();
      if (payment.status === "paid") {
        setCheckout((current) => ({ ...current, status: "paid" }));
        window.clearInterval(poll);
        await onPaid();
      } else if (["failed", "expired"].includes(payment.status)) {
        setCheckout((current) => ({ ...current, status: payment.status }));
        setError(payment.status === "expired" ? "This QR code expired. Please create a new one." : "Payment failed. Please try again.");
        window.clearInterval(poll);
      }
    }, 3000);
    return () => window.clearInterval(poll);
  }, [checkout?.paymentId, checkout?.status, onPaid, open, supabase]);

  if (!open) return null;

  const chosenPlan = B2B_CREDIT_PLANS[selectedPlan];

  const beginCheckout = async () => {
    setStarting(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again to continue.");
      const response = await fetch("/api/b2b/payments/paymongo/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: selectedPlan }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to create checkout");
      setCheckout({ ...result, status: "pending" });
    } catch (checkoutError) {
      setError(checkoutError.message);
    } finally {
      setStarting(false);
    }
  };

  const resetCheckout = () => {
    setCheckout(null);
    setError("");
  };

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !starting && onClose()}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="api-topup-title">
        <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close API credit checkout" className={styles.closeButton}>
          <X size={20} aria-hidden="true" />
        </button>

        {checkout?.status === "paid" ? (
          <div className={styles.successPanel} aria-live="polite">
            <span className={styles.successIcon}><CheckCircle2 size={34} aria-hidden="true" /></span>
            <div className={styles.eyebrow}><Sparkles size={15} aria-hidden="true" /> Payment complete</div>
            <h2 id="api-topup-title">Credits added.</h2>
            <p>{checkout.plan.credits.toLocaleString()} API credits are now available in your wallet and ready to use.</p>
            <button type="button" onClick={onClose} className={styles.primaryButton}>Back to dashboard <ArrowRight size={17} aria-hidden="true" /></button>
          </div>
        ) : checkout ? (
          <div className={styles.checkoutLayout}>
            <div className={styles.checkoutIntro}>
              <div className={styles.eyebrow}><QrCode size={15} aria-hidden="true" /> Secure QR Ph checkout</div>
              <h2 id="api-topup-title">Scan to complete payment.</h2>
              <p>Open GCash, Maya, or any QR Ph-supported banking app and scan this code.</p>
              <div className={styles.qrShell}><img src={checkout.qrBase64} alt={`QR Ph code for ${checkout.plan.label} API credits`} /></div>
            </div>
            <aside className={styles.checkoutSummary}>
              <span className={styles.summaryLabel}>Order summary</span>
              <div className={styles.summaryPlan}><span>{checkout.plan.label}</span><strong>{checkout.plan.credits.toLocaleString()} credits</strong></div>
              <div className={styles.summaryTotal}><span>Total due</span><strong>{new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(checkout.plan.amount / 100)}</strong></div>
              <div className={styles.waiting} role="status"><LoaderCircle className={styles.spinner} size={17} aria-hidden="true" /> Waiting for confirmation</div>
              <p className={styles.secureCopy}><ShieldCheck size={15} aria-hidden="true" /> Credits are added automatically after PayMongo confirms payment.</p>
              {error && <p role="alert" className={styles.error}>{error}</p>}
              {error && <button type="button" onClick={resetCheckout} className={styles.secondaryButton}><ArrowLeft size={16} aria-hidden="true" /> Choose another package</button>}
            </aside>
          </div>
        ) : (
          <>
            <header className={styles.modalHeader}>
              <div className={styles.eyebrow}><ShieldCheck size={15} aria-hidden="true" /> Secure checkout · PayMongo</div>
              <h2 id="api-topup-title">Top up your API wallet.</h2>
              <p>Choose a prepaid package. Credits never expire and arrive automatically after payment.</p>
            </header>

            <div className={styles.contentGrid}>
              <div className={styles.planArea}>
                <span className={styles.stepLabel}>01 / Choose a package</span>
                <div className={styles.planGrid} role="radiogroup" aria-label="API credit packages">
                  {plans.map((plan) => {
                    const selected = selectedPlan === plan.key;
                    return (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        key={plan.key}
                        onClick={() => setSelectedPlan(plan.key)}
                        className={`${styles.planCard} ${selected ? styles.planCardSelected : ""}`}
                      >
                        <span className={styles.radioMark}>{selected && <Check size={13} aria-hidden="true" />}</span>
                        <span className={styles.planName}>{plan.label}{plan.featured && <small>Most popular</small>}</span>
                        <strong className={styles.planPrice}>{plan.price}</strong>
                        <span className={styles.planCredits}>{plan.credits.toLocaleString()} API credits</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <aside className={styles.orderCard}>
                <span className={styles.stepLabel}>02 / Review</span>
                <div className={styles.orderHeading}><span>{chosenPlan.label}</span><strong>{chosenPlan.price}</strong></div>
                <div className={styles.creditAmount}><strong>{chosenPlan.credits.toLocaleString()}</strong><span>API credits</span></div>
                <ul>
                  <li><Check size={14} aria-hidden="true" /> Credits never expire</li>
                  <li><Check size={14} aria-hidden="true" /> Instant wallet update</li>
                  <li><Check size={14} aria-hidden="true" /> No receipt upload</li>
                </ul>
                {error && <p role="alert" className={styles.error}>{error}</p>}
                <button type="button" disabled={starting} onClick={beginCheckout} className={styles.primaryButton}>
                  {starting ? <><LoaderCircle className={styles.spinner} size={17} aria-hidden="true" /> Creating secure QR…</> : <>Continue to QR Ph <ArrowRight size={17} aria-hidden="true" /></>}
                </button>
                <p className={styles.paymentNote}><ShieldCheck size={14} aria-hidden="true" /> Encrypted checkout powered by PayMongo</p>
              </aside>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
