import { CREDIT_COST } from "@/lib/pricing";
import styles from "./FAQSection.module.css";

const faqs = [
  {
    "question": "What can I create with Syncraft?",
    "answer": "Extract garment patterns and sublimation artwork, recover designs from photographed surfaces with Universal Design Recovery, and trace logos or wordmarks into vectors. You can also remove backgrounds, upscale images, and use Extend Design to expand artwork in your workspace."
  },
  {
    "question": "How do I sign in?",
    "answer": "Choose Continue with Google to sign in or create an account. Complete the security check and accept the Terms and Privacy Policy before continuing."
  },
  {
    "question": "What files can I upload and download?",
    "answer": "Start with a clear image such as a PNG or JPG. Depending on the tool and completed processing steps, you can download a Vector SVG, a raster PNG, a layered PSD, or a ZIP bundle of available project files. Background removal produces a transparent PNG."
  },
  {
    "question": "Can I export a layered Photoshop file?",
    "answer": "Yes. Generate the Vector SVG first, then choose Export as PSD in your workspace. Syncraft prepares a layered Photoshop file from the generated artwork. Layer structure depends on the design; it does not restore the original source file or guarantee editable text."
  },
  {
    "question": "How do credits work?",
    "answer": `Syncraft uses prepaid credits. Tracing, background removal, image upscaling, and Extend Design each cost ${CREDIT_COST.trace} credits per run. Universal Design Recovery costs ${CREDIT_COST.universal} credits per run. Check the displayed cost before starting an operation.`,
  },
  {
    "question": "How can I buy more credits?",
    "answer": "Open the credit top-up menu, choose a package, and pay through QR Ph using a supported wallet or banking app, such as GCash or Maya. Credits are added after payment confirmation without uploading a receipt. Card / International checkout is available when enabled; the payment menu shows its current availability."
  },
  {
    "question": "Can I remove backgrounds or upscale an image?",
    "answer": "Yes. Use Remove Background for a transparent cutout, or Image Upscale to enlarge an image. These tools are available separately, so you can use them without generating a vector."
  },
  {
    "question": "What if my Vector SVG is not generated?",
    "answer": "If your project already has a processed image but no SVG, use Retry Vector SVG (Free) in the workspace. This retries the vector step without charging for a new full generation."
  },
  {
    "question": "What happens if a processing run fails?",
    "answer": "Eligible failed processing runs return the charged credits to your balance automatically. If a processed image is available but vector generation fails, try the free vector retry. If credits remain deducted after an error, contact support with your project details."
  },
  {
    "question": "How can I get better results?",
    "answer": "Upload a sharp, well-lit image and crop closely around the artwork you want to recover. Choose the tool that matches your image, then review the result before printing. Blurry details, folds, and hidden areas can affect accuracy."
  },
  {
    "question": "How long are my project files kept?",
    "answer": "Project files are available in your personal history and scheduled for automatic deletion from active cloud storage within 3 days of creation. Download your uploads and finished exports before then; project history is temporary storage."
  }
];

export default function FAQSection() {
  return (
    <section id="faq" className={styles.section} aria-labelledby="faq-heading">
      <div className={styles.intro}>
        <p className={styles.eyebrow}>Need to know</p>
        <h2 id="faq-heading">Frequently asked questions</h2>
        <p>Quick answers about tools, exports, credits, and your account.</p>
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
