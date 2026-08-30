"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  CheckCircle2,
  Download,
  Quote,
  ShieldCheck,
  Star,
  User,
} from "lucide-react";
import styles from "./TestimonialSection.module.css";

const proofs = [
  {
    step: "01",
    title: "Inspect real transformations",
    description: "Compare the supplied reference with Syncraft's recovered output in the interactive before-and-after gallery.",
    href: "#samples-section",
    linkLabel: "Explore the samples",
    Icon: CheckCircle2,
  },
  {
    step: "02",
    title: "Export production-ready files",
    description: "Move from preview to editable SVG, high-resolution PNG, transparent PNG, or a packaged ZIP export.",
    href: "/#syncraft-upload",
    linkLabel: "Try your own artwork",
    Icon: Download,
  },
  {
    step: "03",
    title: "Stay in control of your work",
    description: "You keep ownership of your uploaded artwork, with project files scheduled for deletion after three days.",
    href: "/privacy",
    linkLabel: "Review our privacy policy",
    Icon: ShieldCheck,
  },
];

function ReviewCard({ review }) {
  const rating = Math.max(1, Math.min(5, Math.round(Number(review.rating) || 5)));

  return (
    <article className={styles.reviewCard}>
      <Quote className={styles.quoteIcon} size={32} aria-hidden="true" />
      <div className={styles.reviewStars} aria-label={`${rating} out of 5 stars`}>
        {Array.from({ length: 5 }, (_, index) => (
          <Star
            key={index}
            size={15}
            fill={index < rating ? "currentColor" : "none"}
            aria-hidden="true"
          />
        ))}
      </div>
      <blockquote>“{review.feedback_text}”</blockquote>
      <footer className={styles.reviewer}>
        {review.reviewer_avatar ? (
          <img
            src={review.reviewer_avatar}
            alt=""
            referrerPolicy="no-referrer"
            className={styles.avatar}
          />
        ) : (
          <span className={styles.avatarFallback} aria-hidden="true">
            <User size={18} />
          </span>
        )}
        <span>
          <strong>{review.reviewer_name || "Syncraft user"}</strong>
          <small><BadgeCheck size={13} aria-hidden="true" /> Project feedback</small>
        </span>
      </footer>
    </article>
  );
}

export default function ProductionProofSection() {
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    let active = true;

    async function loadReviews() {
      try {
        const response = await fetch("/api/reviews");
        const data = await response.json();

        if (!active) return;

        if (response.ok && data.success && Array.isArray(data.reviews)) {
          setReviews(data.reviews.slice(0, 6));
        }
      } catch {
        // Keep the public section hidden when verified reviews are unavailable.
      }
    }

    loadReviews();
    return () => { active = false; };
  }, []);

  return (
    <section className={styles.sectionWrapper} aria-labelledby="production-proof-title">
      <div className={styles.proofShell}>
        <div className={styles.glow} aria-hidden="true" />
        <header className={styles.proofHeader}>
          <div>
            <p className={styles.eyebrow}>See the workflow in action</p>
            <h2 id="production-proof-title">Proof you can inspect, not promises you have to trust.</h2>
          </div>
          <p className={styles.proofIntro}>
            Review real examples, confirm the formats you need, and understand how your files are handled before you start.
          </p>
        </header>

        <div className={styles.proofGrid}>
          {proofs.map(({ step, title, description, href, linkLabel, Icon }) => (
            <article className={styles.proofCard} key={title}>
              <div className={styles.cardTopline}>
                <span className={styles.proofIcon} aria-hidden="true"><Icon size={20} /></span>
                <span className={styles.step}>{step}</span>
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
              <a href={href}>
                {linkLabel}
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </article>
          ))}
        </div>
      </div>

      {reviews.length > 0 && (
        <div className={styles.testimonialSection} aria-labelledby="testimonial-title">
          <header className={styles.testimonialHeader}>
            <div>
              <p className={styles.eyebrow}>Community feedback</p>
              <h2 id="testimonial-title">What Syncraft users say</h2>
            </div>
            <p>Reviews submitted directly from Syncraft project workspaces.</p>
          </header>

          <div className={styles.reviewGrid}>
            {reviews.map((review, index) => (
              <ReviewCard review={review} key={`${review.reviewer_name || "review"}-${review.created_at || index}`} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
