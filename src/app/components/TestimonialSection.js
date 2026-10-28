import {
  Quote,
  Star,
} from "lucide-react";
import styles from "./TestimonialSection.module.css";
import SectionBadge from "./SectionBadge";

export default function TestimonialSection({ publicStats = { totalUsers: 0, avatars: [] } }) {
  const totalUsers = Number(publicStats.totalUsers) || 0;
  const avatars = Array.isArray(publicStats.avatars) ? publicStats.avatars.slice(0, 4) : [];

  return (
    <section className={styles.sectionWrapper} aria-labelledby="testimonial-title">
      <div className={styles.testimonialSection} aria-labelledby="testimonial-title">
        <header className={styles.testimonialHeader}>
          <div>
            <SectionBadge className={styles.eyebrow}>Testimonials</SectionBadge>
            <h2 id="testimonial-title">See what a real creator thinks.</h2>
          </div>
          <p>Real feedback from a designer who discovered Syncraft during its early release.</p>
        </header>

        <div className={styles.testimonialBento}>
          <div className={styles.testimonialColumn}>
            <article className={styles.featuredReview}>
              <div className={styles.featuredTopline}>
                <span className={styles.pendingLabel}>Early user feedback</span>
                <Quote size={34} aria-hidden="true" />
              </div>
              <blockquote>
                “This is actually usable and knowing it is expensive, Imagine what price will be 5 years from now once other ai see that this is the best tool for graphic designers. Ama put it on my wishlist.”
              </blockquote>
              <div className={styles.featuredStars} aria-label="5 out of 5 stars">
                {Array.from({ length: 5 }, (_, index) => <Star key={index} size={17} fill="currentColor" aria-hidden="true" />)}
              </div>
              <div className={styles.featuredFooter}>
                <footer className={styles.reviewer}>
                  <span className={styles.avatarFallback} aria-hidden="true">TT</span>
                  <span>
                    <strong>Thee Toxicidea</strong>
                    <small>Author feedback</small>
                  </span>
                </footer>
                <div className={styles.communityInline} aria-label="Syncraft community">
                  <div className={styles.communityVisuals} aria-hidden="true">
                    <div className={styles.communityAvatars}>
                      {avatars.length > 0
                        ? avatars.map((url, index) => <img key={url} src={url} alt="" referrerPolicy="no-referrer" style={{ zIndex: avatars.length - index }} />)
                        : <span>TT</span>}
                    </div>
                    <div className={styles.communityStars}>
                      {Array.from({ length: 5 }, (_, index) => <Star key={index} size={15} fill="currentColor" />)}
                    </div>
                  </div>
                  <p>{totalUsers > 0 ? <>Loved by <strong>{totalUsers.toLocaleString()}+</strong> creatives</> : <>A growing community of <strong>creative users</strong></>}</p>
                </div>
              </div>
            </article>
          </div>

          <div className={styles.testimonialColumn}>
            <div className={styles.outcomeGrid} aria-label="Syncraft workflow facts">
              <article className={`${styles.outcomeCard} ${styles.exportCard}`}>
                <strong><b>4</b> formats</strong>
                <p>Export SVG, PNG, transparent PNG, or a packaged ZIP.</p>
              </article>
              <article className={`${styles.outcomeCard} ${styles.privacyCard}`}>
                <strong><b>3</b> days</strong>
                <p>Project files are scheduled for deletion after three days.</p>
              </article>
            </div>

            <article className={styles.secondaryReview}>
              <span className={styles.supportLabel}>A complete vector workflow</span>
              <h3>Less tracing. More designing.</h3>
              <p>Upload a reference, recover clean vector paths, and export files ready for editing or delivery.</p>
              <ul className={styles.supportFacts}>
                <li><span>Input</span><strong>PNG &amp; JPEG</strong></li>
                <li><span>Output</span><strong>Editable SVG</strong></li>
                <li><span>Delivery</span><strong>PNG &amp; ZIP</strong></li>
              </ul>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}
