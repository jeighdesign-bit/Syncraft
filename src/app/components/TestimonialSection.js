"use client";

import { useEffect, useState } from "react";
import { User } from "lucide-react";
import styles from "./TestimonialSection.module.css";

export default function TestimonialSection() {
  const reviews = [
    {
      reviewer_name: "Anonymous User",
      reviewer_avatar: null,
      rating: 5,
      feedback_text: "Nice!! Kay editable ang layer after vectorizing."
    },
    {
      reviewer_name: "Anonymous User",
      reviewer_avatar: null,
      rating: 5,
      feedback_text: "Super helpful! Auto-tracing the jersey saved me hours of manual work."
    },
    {
      reviewer_name: "Anonymous User",
      reviewer_avatar: null,
      rating: 5,
      feedback_text: "Amazing tool. Background removal is incredibly fast and precise."
    }
  ];

  return (
    <div className={styles.sectionWrapper}>
      <div className={styles.header}>
        <h3 className={styles.subtitle}>Community Trust</h3>
        <h2 className={styles.title}>What our users say</h2>
      </div>

      <div className={styles.grid}>
        {reviews.map((rev, idx) => (
          <div key={idx} className={styles.card}>
            <div className={styles.cardContent}>
              <div className={styles.headerRow}>
                {rev.reviewer_avatar ? (
                  <img 
                    src={rev.reviewer_avatar} 
                    alt={rev.reviewer_name || "User"} 
                    referrerPolicy="no-referrer"
                    className={styles.avatar} 
                  />
                ) : (
                  <div className={styles.avatarFallback}>
                    <User size={20} color="#aaa" />
                  </div>
                )}
                <div>
                  <div className={styles.reviewerName}>{rev.reviewer_name || "Syncraft User"}</div>
                  <div className={styles.stars}>
                    {'★'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}
                  </div>
                </div>
              </div>
              
              <div className={styles.feedback}>
                "{rev.feedback_text}"
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
