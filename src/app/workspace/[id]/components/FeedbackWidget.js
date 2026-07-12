"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import styles from "./FeedbackWidget.module.css";

export default function FeedbackWidget({ projectId, initialRating = null }) {
  const [rating, setRating] = useState(initialRating || 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(!!initialRating);
  const [feedbackText, setFeedbackText] = useState("");

  const handleSubmit = async () => {
    if (rating === 0 || submitted) return; // Must select a star at least
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, feedback_text: feedbackText }),
      });
      
      if (!res.ok) {
        throw new Error("API returned error");
      }
      
      setSubmitted(true);
    } catch (err) {
      console.error("Failed to save rating:", err);
      alert("Failed to save review! Have you run the SQL migration?");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className={styles.feedbackContainer}>
        <div className={styles.successMessage}>
          <span style={{ color: "#4ade80", fontSize: "18px" }}>✓</span> Thank you for your feedback!
        </div>
      </div>
    );
  }

  return (
    <div className={styles.feedbackContainer}>
      <h3 className={styles.title}>How is the quality of this generation?</h3>
      <div className={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            className={styles.starBtn}
            onMouseEnter={() => setHoverRating(value)}
            onMouseLeave={() => setHoverRating(0)}
            onClick={() => setRating(value)}
            disabled={isSubmitting}
            title={`${value} Star${value > 1 ? 's' : ''}`}
          >
            <Star
              size={28}
              fill={(hoverRating || rating) >= value ? "#fbbf24" : "transparent"}
              color={(hoverRating || rating) >= value ? "#fbbf24" : "#555"}
              strokeWidth={1.5}
              style={{ transition: "all 0.2s ease" }}
            />
          </button>
        ))}
      </div>
      
      <div className={styles.optionalFeedback} style={{ animation: "none", marginTop: "12px" }}>
        <textarea
          placeholder="Tell us what you liked or how we can improve... (Optional)"
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
          disabled={isSubmitting}
        />
        <button 
          onClick={handleSubmit} 
          disabled={rating === 0 || isSubmitting}
          className={styles.submitBtn}
          style={{ width: "100%" }}
        >
          {isSubmitting ? "Submitting..." : "Submit Review"}
        </button>
      </div>
    </div>
  );
}
