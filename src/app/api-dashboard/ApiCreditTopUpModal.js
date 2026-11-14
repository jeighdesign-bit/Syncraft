"use client";

import CreditAmount from '@/components/CreditAmount';
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, LoaderCircle, QrCode, ShieldCheck, Sparkles, X } from "lucide-react";
import { B2B_CREDIT_PLANS } from "@/lib/b2bPaymentPlans";
import { useQrExpiry } from "@/hooks/useQrExpiry";
import { qrExpiryTimestamp } from "@/lib/qrExpiry.mjs";
import styles from "./api-credit-top-up.module.css";

const plans = Object.values(B2B_CREDIT_PLANS);

export default function ApiCreditTopUpModal({ open, onClose, supabase, onPaid }) {
  const [selectedPlan, setSelectedPlan] = useState("pro");
  const [checkout, setCheckout] = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const closeButtonRef = useRef(null);
  const checkoutRequest = useRef(null);
  const qrExpiry = useQrExpiry(checkout?.expiresAt, open && checkout?.status !== "paid");
  const qrUnavailable = qrExpiry.expired || ["failed", "expired"].includes(checkout?.status);

  useEffect(() => () => checkoutRequest.current?.abort(), [open]);

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
    if (!open || !checkout?.paymentId || ["paid", "failed"].includes(checkout.status)) return;
    const controller = new AbortController();
    const deadline = qrExpiryTimestamp(checkout.expiresAt);
    let timer;
    const poll = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (controller.signal.aborted) return;
        if (session) {
          const response = await fetch(
            `/api/b2b/payments/paymongo/status?paymentId=${encodeURIComponent(checkout.paymentId)}`,
            { headers: { Authorization: `Bearer ${session.access_token}` }, signal: controller.signal, cache: "no-store" },
          );
          const result = response.ok ? await response.json() : null;
          if (controller.signal.aborted) return;
          if (result?.payment?.status === "paid") {
            checkoutRequest.current?.abort();
            setStarting(false);
            setCheckout((current) => ({ ...current, status: "paid" }));
            await onPaid();
            return;
          }
          if (["failed", "expired"].includes(result?.payment?.status)) {
            setCheckout((current) => ({ ...current, status: result.payment.status }));
            if (result.payment.status === "failed") {
              setError("Payment failed. Please try again.");
              return;
            }
          }
        }
      } catch (pollError) {
        if (controller.signal.aborted) return;
        console.error("[API credits] Payment confirmation check failed:", pollError);
      }
      if (!controller.signal.aborted && deadline != null && Date.now() < deadline + 60_000) {
        timer = setTimeout(poll, 3000);
      }
    };
    poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [checkout?.paymentId, checkout?.expiresAt, checkout?.status, onPaid, open, supabase]);

  if (!open) return null;

  const chosenPlan = B2B_CREDIT_PLANS[selectedPlan];

  const beginCheckout = async () => {
    if (checkoutRequest.current && !checkoutRequest.current.signal.aborted) return;
    const controller = new AbortController();
    checkoutRequest.current = controller;
    setStarting(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (controller.signal.aborted) return;
      if (!session) throw new Error("Please sign in again to continue.");
      const response = await fetch("/api/b2b/payments/paymongo/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: selectedPlan }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(result.error || "Unable to create checkout");
      setCheckout({ ...result, status: "pending" });
    } catch (checkoutError) {
      if (!controller.signal.aborted) setError(checkoutError.message);
    } finally {
      if (checkoutRequest.current === controller) {
        checkoutRequest.current = null;
        setStarting(false);
      }
    }
  };

  const resetCheckout = () => {
    checkoutRequest.current?.abort();
    setStarting(false);
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
            <p><CreditAmount amount={checkout.plan.credits.toLocaleString()} unit="API credits" /> are now available in your wallet and ready to use.</p>
            <button type="button" onClick={onClose} className={styles.primaryButton}>Back to dashboard <ArrowRight size={17} aria-hidden="true" /></button>
          </div>
        ) : checkout ? (
          <div className={styles.checkoutLayout}>
            <div className={styles.checkoutIntro}>
              <div className={styles.eyebrow}><QrCode size={15} aria-hidden="true" /> Secure QR Ph checkout</div>
              <h2 id="api-topup-title">{qrUnavailable ? 'This QR is no longer active.' : 'Scan to complete payment.'}</h2>
              <p>{qrUnavailable ? 'Do not pay using this code or a saved screenshot.' : 'Open GCash, Maya, or any QR Ph-supported banking app. Pay before the countdown ends.'}</p>
              <div className={styles.qrShell}>
                {qrUnavailable ? <div className={styles.expiredQr}><Clock3 size={40} aria-hidden="true" /><strong>{checkout.status === 'failed' ? 'QR unavailable' : 'QR expired'}</strong></div> : <img src={checkout.qrBase64} alt={`QR Ph code for ${checkout.plan.label} API credits`} />}
              </div>
            </div>
            <aside className={styles.checkoutSummary}>
              <span className={styles.summaryLabel}>Order summary</span>
              <div className={styles.summaryPlan}><span>{checkout.plan.label}</span><strong><CreditAmount amount={checkout.plan.credits.toLocaleString()} /></strong></div>
              <div className={styles.summaryTotal}><span>Total due</span><strong>{new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(checkout.plan.amount / 100)}</strong></div>
              <div className={styles.waiting} role="status">{qrUnavailable ? <><Clock3 size={17} aria-hidden="true" /> {checkout.status === 'failed' ? 'Payment failed' : 'QR expired'}</> : <><LoaderCircle className={styles.spinner} size={17} aria-hidden="true" /> Waiting for confirmation</>}</div>
              <div className={`${styles.countdown} ${qrUnavailable || qrExpiry.remainingSeconds <= 120 ? styles.countdownWarning : ''}`}>
                <span>{qrUnavailable ? 'QR no longer active' : 'QR expires in'}</span>
                <strong role="timer" aria-label="Time remaining to pay" aria-live="off">{qrUnavailable ? '00:00' : qrExpiry.label}</strong>
              </div>
              {qrUnavailable && <>
                <p className={styles.expiryNotice}>If money was already deducted, do not pay again. Wait for confirmation or contact support with your receipt.</p>
                <button type="button" disabled={starting} onClick={beginCheckout} className={styles.primaryButton}>{starting ? 'Generating new QR…' : 'Generate new QR'}</button>
              </>}
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
                        <span className={styles.planCredits}><CreditAmount amount={plan.credits.toLocaleString()} unit="API credits" /></span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <aside className={styles.orderCard}>
                <span className={styles.stepLabel}>02 / Review</span>
                <div className={styles.orderHeading}><span>{chosenPlan.label}</span><strong>{chosenPlan.price}</strong></div>
                <div className={styles.creditAmount}><strong><CreditAmount amount={chosenPlan.credits.toLocaleString()} unit={null} /></strong><span>API credits</span></div>
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
