import { CREDIT_COST } from "@/lib/pricing";
import SectionBadge from "./SectionBadge";
import styles from "./FAQSection.module.css";

const faqs = [
  {
    question: "What can I make with Syncraft?",
    answer: "Create logos from text, a photo, or a sketch in Logo Studio. You can also recover artwork from garments and printed surfaces, trace images into vectors, remove backgrounds, and upscale images."
  },
  {
    question: "How do I get started?",
    answer: "Sign in with Google to open your workspace and choose a tool. For image tools, upload your file; for Logo Studio, start with a short idea, a photo, or a sketch. You can visit the homepage anytime without signing out."
  },
  {
    question: "How does Logo Studio work?",
    answer: "Choose Text to Logo, Image to Logo, or Sketch to Logo, then pick a style. A short idea is enough. You can refine the result and choose optional colors or design controls."
  },
  {
    question: "Can I change a logo after creating it?",
    answer: "Yes. Open the saved logo to make an AI edit, generate a variation, remove its background, or vectorize it. The available action and credit cost appear beside the preview."
  },
  {
    question: "What can I upload and download?",
    answer: "Upload a clear PNG, JPG, or WebP image. Logo Studio downloads include PNG and JPG; vectorize a logo first to download SVG. Other workspaces may offer transparent PNG, SVG, layered PSD, or ZIP when those outputs are available."
  },
  {
    question: "Can I export a Photoshop file?",
    answer: "In a supported artwork workspace, generate the Vector SVG first, then choose Export as PSD. The layers depend on the artwork; text may not remain editable."
  },
  {
    question: "How do credits work?",
    answer: `A Logo Studio creation or AI edit costs ${CREDIT_COST.logoGenerate} credits per output; vectorizing or removing its background costs ${CREDIT_COST.logoVectorize}. Most other tools cost ${CREDIT_COST.trace} credits per run, while Universal Design Recovery costs ${CREDIT_COST.universal}. The cost appears before you start, and you can add credits from the credit menu.`
  },
  {
    question: "How can I get cleaner results?",
    answer: "Use a sharp image and crop around the subject you want to keep. In Logo Studio, pick the closest style and add a short note only when you want to guide a detail. Review fine lines and text before production."
  },
  {
    question: "What if a run fails?",
    answer: "Eligible failed runs return their charged credits automatically. If an image is ready but its Vector SVG failed, use the free vector retry in that workspace."
  },
  {
    question: "How long are my files kept?",
    answer: "Project files are scheduled for deletion from active cloud storage within 3 days. Download the finished files you want to keep."
  }
];

export default function FAQSection() {
  return (
    <section id="faq" className={styles.section} aria-labelledby="faq-heading">
      <div className={styles.intro}>
        <SectionBadge className={styles.eyebrow}>FAQ</SectionBadge>
        <h2 id="faq-heading">Frequently asked<br />questions.</h2>
        <p>Quick answers about creating, exporting, and credits.</p>
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
