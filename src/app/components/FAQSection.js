import styles from "./FAQSection.module.css";

const faqs = [
  {
    question: "What can I create with Syncraft?",
    answer:
      "Syncraft helps you extract garment patterns and visible print artwork, trace logos and wordmarks, remove backgrounds, upscale images, and create clean vector-ready files for production.",
  },
  {
    question: "What files can I upload and download?",
    answer:
      "You can upload PNG and JPG images. Depending on the tool, Syncraft can produce SVG vector files, high-resolution PNGs, and transparent PNG cutouts.",
  },
  {
    question: "How do credits work?",
    answer:
      "Syncraft uses prepaid credits for processing. Standard tools use 12 credits per run, while Universal Design Recovery uses 24 credits because it handles more complex surfaces and perspective correction.",
  },
  {
    question: "Can I remove a background from a design or product photo?",
    answer:
      "Yes. The AI Background Remover isolates the subject and creates a clean transparent PNG, ready for layouts, print preparation, or further editing.",
  },
  {
    question: "What happens if a processing run fails?",
    answer:
      "If a run fails because of a server error or timeout on our side, the credit is automatically returned to your balance.",
  },
  {
    question: "How long are my uploaded files kept?",
    answer:
      "Your projects are available in your history for convenience, then automatically and permanently deleted after 3 days.",
  },
];

export default function FAQSection() {
  return (
    <section id="faq" className={styles.section} aria-labelledby="faq-heading">
      <div className={styles.intro}>
        <p className={styles.eyebrow}>Need to know</p>
        <h2 id="faq-heading">Frequently asked questions</h2>
        <p>Quick answers about files, credits, and getting production-ready results.</p>
      </div>

      <div className={styles.list}>
        {faqs.map((faq) => (
          <details className={styles.item} key={faq.question}>
            <summary>
              <span>{faq.question}</span>
              <span className={styles.control} aria-hidden="true" />
            </summary>
            <p>{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
