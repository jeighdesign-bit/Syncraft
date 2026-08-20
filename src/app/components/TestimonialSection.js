import { User } from "lucide-react";
import styles from "./TestimonialSection.module.css";

export default function TestimonialSection() {
  // Replace placeholder copy with verified customer feedback before publishing.
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
    },
    {
      reviewer_name: "Anonymous User",
      reviewer_avatar: null,
      rating: 5,
      feedback_text: "The logo trace came out clean and was easy to refine for printing."
    },
    {
      reviewer_name: "Anonymous User",
      reviewer_avatar: null,
      rating: 5,
      feedback_text: "Universal recovery helped turn a difficult mockup into usable artwork."
    },
    {
      reviewer_name: "Anonymous User",
      reviewer_avatar: null,
      rating: 5,
      feedback_text: "Upscaling made an old customer file much more usable for a larger print."
    }
  ];

  const ReviewCard = ({ review }) => (
    <article className={styles.card}>
      <div className={styles.cardContent}>
        <div className={styles.headerRow}>
          {review.reviewer_avatar ? (
            <img
              src={review.reviewer_avatar}
              alt={review.reviewer_name || "User"}
              referrerPolicy="no-referrer"
              className={styles.avatar}
            />
          ) : (
            <div className={styles.avatarFallback} aria-hidden="true">
              <User size={20} color="#aaa" />
            </div>
          )}
          <div>
            <div className={styles.reviewerName}>{review.reviewer_name || "Syncraft User"}</div>
            <div className={styles.stars} aria-label={`${review.rating} out of 5 stars`}>
              {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
            </div>
          </div>
        </div>
        <p className={styles.feedback}>“{review.feedback_text}”</p>
      </div>
    </article>
  );

  return (
    <div className={styles.sectionWrapper}>
      <div className={styles.header}>
        <h3 className={styles.subtitle}>Community Trust</h3>
        <h2 className={styles.title}>What our users say</h2>
      </div>

      <div className={styles.marquee} aria-label="Customer reviews">
        <div className={styles.track}>
          {[0, 1].map((setIndex) => (
            <div className={styles.reviewSet} key={setIndex} aria-hidden={setIndex === 1 ? "true" : undefined}>
              {reviews.map((review, index) => <ReviewCard review={review} key={`${setIndex}-${index}`} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
