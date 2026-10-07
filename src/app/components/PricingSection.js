import { ArrowRight, CheckCircle } from "lucide-react";
import { CREDIT_PLANS } from "@/lib/paymentPlans";
import { CREDIT_COST } from "@/lib/pricing";
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

export default function PricingSection({ isSignedIn, onSelectPlan }) {
  return (
    <section id="pricing" className={styles.section} aria-labelledby="pricing-heading">
      <header className={styles.header}>
        <p className={styles.eyebrow}>Pricing plan</p>
        <h2 id="pricing-heading">Affordable pricing</h2>
        <p className={styles.intro}>Choose the credit package that fits your workflow.</p>
      </header>

      <div className={styles.grid}>
        {PLANS.map((plan) => (
          <article className={`${styles.card}${plan.popular ? ` ${styles.popular}` : ""}`} key={plan.key}>
            {plan.elitePromo && (
              <div className={styles.eliteRibbon} aria-label="Free lifetime DesaynScale image upscaling included with every Elite purchase">
                <span>FREE IMAGE UPSCALING</span>
                <span>DESAYNSCALE · LIFETIME ACCESS</span>
                <span>INCLUDED WITH ₱899 ELITE</span>
              </div>
            )}
            <div className={styles.cardTopline}>
              <h3>{plan.label}</h3>
              {plan.popular && (
                <span className={styles.popularBadge}>
                  <CheckCircle size={12} aria-hidden="true" /> Most popular
                </span>
              )}
            </div>

            <div className={styles.priceBlock}>
              <p className={styles.price}>{plan.gcashPrice || plan.price}</p>
              <p className={styles.credits}>{plan.credits} credits</p>
            </div>
            <p className={styles.description}>{plan.description}</p>

            <button type="button" className={styles.cta} onClick={() => onSelectPlan(plan.key)}>
              {isSignedIn ? "Select Plan" : "Log in to Purchase"}
              <ArrowRight size={14} aria-hidden="true" />
            </button>

            <div className={styles.divider} />
            <div className={styles.allowance}>
              <span>Your allowance</span>
              <div>
                <strong>{plan.generations}</strong>
                <small>AI generations</small>
              </div>
            </div>
          </article>
        ))}
      </div>

      <p className={styles.note}>One standard generation uses {CREDIT_COST.trace} credits. Some advanced workflows use more.</p>
    </section>
  );
}
