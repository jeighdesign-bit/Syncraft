import {
  ArrowUpRight,
  CheckCircle2,
  Download,
  Quote,
  ShieldCheck,
  Star,
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

export default function ProductionProofSection({ publicStats = { totalUsers: 0, avatars: [] } }) {
  const totalUsers = Number(publicStats.totalUsers) || 0;
  const avatars = Array.isArray(publicStats.avatars) ? publicStats.avatars.slice(0, 4) : [];

  return (
    <section id="production-proof" className={styles.sectionWrapper} aria-labelledby="production-proof-title">
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

      <div className={styles.testimonialSection} aria-labelledby="testimonial-title">
        <header className={styles.testimonialHeader}>
          <div>
            <p className={styles.eyebrow}>Testimonials</p>
            <h2 id="testimonial-title">Made for real creative workflows.</h2>
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
