"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { CREDIT_PLANS } from "@/lib/paymentPlans";
import { CREDIT_COST } from "@/lib/pricing";
import CurrencyToggle from "@/components/CurrencyToggle";
import SectionBadge from "./SectionBadge";
import styles from "./PricingSection.module.css";

const PLAN_DETAILS = {
  tingi: "Small package for quick tests.",
  basic: "Great for hobbyists printing occasionally.",
  starter: "Ideal for small businesses taking their first steps.",
  pro: "Perfect for print shops & growing design studios.",
  elite: "For high-volume agencies & power users.",
};

const PLANS = Object.values(CREDIT_PLANS).map((plan) => ({
  ...plan,
  description: PLAN_DETAILS[plan.key],
  generations: Math.floor(plan.credits / CREDIT_COST.trace),
  popular: plan.key === "pro",
  elitePromo: plan.key === "elite",
}));

export default function PricingSection({ isSignedIn, onSelectPlan, compact = false }) {
  const [currency, setCurrency] = useState("PHP");

  return (
    <section id={compact ? undefined : "pricing"} className={`${styles.section}${compact ? ` ${styles.compact}` : ""}`} aria-labelledby={compact ? undefined : "pricing-heading"} aria-label={compact ? "Credit packages" : undefined}>
      {!compact && <header className={styles.header}>
        <SectionBadge className={styles.eyebrow}>Pricing plan</SectionBadge>
        <h2 id={compact ? "modal-pricing-heading" : "pricing-heading"}>More room to <span>create.</span></h2>
        <p className={styles.intro}>Choose your credits. Use them across your creative tools.</p>
      </header>}

      <CurrencyToggle value={currency} onChange={setCurrency} />

      <div className={styles.grid}>
        {PLANS.map((plan) => (
          <article className={`${styles.card}${plan.popular ? ` ${styles.popular}` : ""}${plan.elitePromo ? ` ${styles.elite}` : ""}`} key={plan.key}>
            <div className={styles.planBanner}>{plan.popular ? "Recommended" : plan.elitePromo ? "Best value" : "Credit package"}</div>
            <div className={styles.cardBody}>
            <div className={styles.cardTopline}>
              <h3>{plan.label}</h3>
            </div>

            <div className={styles.priceBlock}>
              <p className={styles.price}>
                {currency === "USD" && plan.polarPrice ? plan.polarPrice : plan.gcashPrice || plan.price}
              </p>
              <span className={styles.purchaseType}>one-time purchase</span>
            </div>
            <p className={styles.credits}>{plan.credits.toLocaleString()} credits</p>
            <p className={styles.description}>{plan.description}</p>
            <ul className={styles.features}>
              <li><Check size={13} aria-hidden="true" /><span>Up to <strong>{Math.floor(plan.credits / CREDIT_COST.logoGenerate)} logos</strong> in Logo Studio</span></li>
              <li><Check size={13} aria-hidden="true" /><span>Or <strong>{plan.generations} standard extractions</strong></span></li>
              <li><Check size={13} aria-hidden="true" /><span>Use credits across creative tools</span></li>
              <li><Check size={13} aria-hidden="true" /><span>Export files in supported workflows</span></li>
              {plan.key === "tingi" && <li><Check size={13} aria-hidden="true" /><span>PHP only · QR Ph payment</span></li>}
              {plan.elitePromo && <li className={styles.bonus}><Check size={13} aria-hidden="true" /><span>DesaynScale lifetime image upscaling included</span></li>}
            </ul>
            <button type="button" className={styles.cta} onClick={() => onSelectPlan(plan.key)}>
              {isSignedIn ? "Select Plan" : "Log in to Purchase"}
              <ArrowRight size={14} aria-hidden="true" />
            </button>

            </div>
          </article>
        ))}
      </div>

      <div className={styles.notes}>
        <p className={styles.note}>Allowances are alternatives, not combined totals. Logo Studio uses {CREDIT_COST.logoGenerate} credits per logo; standard extraction uses {CREDIT_COST.trace}. Some workflows use more.</p>
        <p className={styles.note}>
          The {CREDIT_PLANS.tingi.price} Tingi plan is not available for international cards because card-processing costs make this small transaction impractical. USD card prices are separate checkout prices—not direct peso conversions—and may include payment processing, cross-border or currency-conversion costs, and applicable taxes.
        </p>
      </div>
    </section>
  );
}
