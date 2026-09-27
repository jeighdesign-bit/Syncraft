"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Shield, FileText, CheckCircle2 } from "lucide-react";
import "../globals.css";

export default function PrivacyPolicy() {
  const router = useRouter();

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#111", color: "#eee", padding: "40px 20px" }}>
      {/* Header */}
      <div style={{ maxWidth: "800px", margin: "0 auto", paddingBottom: "20px", borderBottom: "1px solid #333" }}>
        <button 
          onClick={() => router.push('/')}
          style={{ display: "flex", alignItems: "center", gap: "8px", background: "transparent", color: "#aaa", border: "none", cursor: "pointer", padding: "0", fontSize: "14px", marginBottom: "30px", transition: "color 0.2s" }}
          onMouseEnter={(e) => e.currentTarget.style.color = "#d4ff59"}
          onMouseLeave={(e) => e.currentTarget.style.color = "#aaa"}
        >
          <ArrowLeft size={16} /> Back to Home
        </button>
        <h1 style={{ fontSize: "36px", margin: "0 0 10px 0", color: "#fff", display: "flex", alignItems: "center", gap: "12px" }}>
          <Shield color="#d4ff59" size={36} /> Privacy Policy & FAQ
        </h1>
        <p style={{ color: "#888", fontSize: "16px", margin: 0 }}>How we handle your data, images, and copyright.</p>
        <p style={{ color: "#666", fontSize: "13px", margin: "10px 0 0" }}>Last updated: September 9, 2026</p>
      </div>

      {/* Content */}
      <div style={{ maxWidth: "800px", margin: "40px auto 100px auto", display: "flex", flexDirection: "column", gap: "50px" }}>
        
        {/* FAQ Section */}
        <section>
          <h2 style={{ fontSize: "24px", color: "#d4ff59", marginBottom: "24px", display: "flex", alignItems: "center", gap: "8px" }}>
            <CheckCircle2 size={24} /> Frequently Asked Questions
          </h2>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ background: "#1a1a1a", padding: "24px", borderRadius: "12px", border: "1px solid #2a2a2a" }}>
              <h3 style={{ margin: "0 0 10px 0", color: "#fff", fontSize: "18px" }}>What happens to the images I upload? Are they saved in your database?</h3>
              <p style={{ color: "#aaa", margin: 0, lineHeight: "1.6" }}>
                Images uploaded to Syncraft are processed to provide the feature you request. Project files are available in your personal project history and are <strong style={{ color: "#ddd" }}>scheduled for automatic deletion within 3 days</strong>. We do not sell uploaded images or use them for unrelated advertising.
              </p>
            </div>

            <div style={{ background: "#1a1a1a", padding: "24px", borderRadius: "12px", border: "1px solid #2a2a2a" }}>
              <h3 style={{ margin: "0 0 10px 0", color: "#fff", fontSize: "18px" }}>Who owns the copyright of the images I upload and convert?</h3>
              <p style={{ color: "#aaa", margin: 0, lineHeight: "1.6" }}>
                Syncraft does not claim ownership of your uploads or outputs. You retain whatever rights you hold in the source material and resulting files. Using Syncraft does not grant rights to third-party artwork, trademarks, fonts, or other protected material.
              </p>
            </div>

            <div style={{ background: "#1a1a1a", padding: "24px", borderRadius: "12px", border: "1px solid #2a2a2a" }}>
              <h3 style={{ margin: "0 0 10px 0", color: "#fff", fontSize: "18px" }}>Do you use my images to train AI or sell them?</h3>
              <p style={{ color: "#aaa", margin: 0, lineHeight: "1.6" }}>
                We do not sell your files or use them to train our own AI models. To provide requested features, files may be securely transmitted to the processing and storage providers listed below. Their handling is governed by their own service terms and privacy commitments.
              </p>
            </div>
          </div>
        </section>

        {/* Privacy Policy Section */}
        <section>
          <h2 style={{ fontSize: "24px", color: "#d4ff59", marginBottom: "24px", display: "flex", alignItems: "center", gap: "8px" }}>
            <FileText size={24} /> Official Privacy Policy
          </h2>
          
          <div style={{ color: "#ccc", lineHeight: "1.8", fontSize: "15px", background: "#1a1a1a", padding: "30px", borderRadius: "12px", border: "1px solid #2a2a2a" }}>
            <h3 style={{ color: "#fff", marginTop: "0", marginBottom: "15px", fontSize: "20px" }}>1. Data Collection and Image Processing</h3>
            <p>When you use Syncraft to convert images, you upload media files to our servers. Please be assured of the following regarding your data:</p>
            <ul style={{ paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "12px", marginTop: "15px", marginBottom: "30px", color: "#aaa" }}>
              <li><strong style={{color: "#ddd"}}>Temporary Processing:</strong> We only process your uploaded images and generated files to provide the requested tracing, background removal, upscaling, export, project history, and download services.</li>
              <li><strong style={{color: "#ddd"}}>Automatic Deletion (3-Day Retention):</strong> Your project files (original uploads, processed outputs, and vector files) are stored in your personal project history and scheduled for permanent deletion from active cloud storage within <strong style={{color: "#fff"}}>3 days</strong> of creation. You may also request or initiate earlier project deletion where that control is available.</li>
              <li><strong style={{color: "#ddd"}}>Copyright and Ownership:</strong> Syncraft claims no ownership over your content. You retain the rights you already hold, and you are responsible for having permission to process uploaded material.</li>
              <li><strong style={{color: "#ddd"}}>Limited Disclosure:</strong> We do not sell uploaded images. We disclose files only where needed to deliver requested processing, storage, security, payment, or support functions.</li>
              <li><strong style={{color: "#ddd"}}>No Sale of Uploaded Files:</strong> Uploaded files are not sold. Temporary access to files is used only where needed to process, store, display, export, download, or delete your projects.</li>
            </ul>

            <h3 style={{ color: "#fff", marginTop: "0", marginBottom: "15px", fontSize: "20px" }}>2. Authentication and Account Data</h3>
            <p style={{ color: "#aaa", marginBottom: "30px" }}>If you create an account using Google Auth, we store only the necessary information to maintain your session and manage your credits (e.g., your email address and profile name). We may also process payment request details needed to verify purchases, basic usage and project metadata needed to operate the Service, aggregated analytics such as public usage counts, and technical information such as IP address, browser headers, device information, security logs, and rate-limit metadata needed for security, abuse prevention, troubleshooting, and service reliability. We do not have access to your passwords. You can request account deletion at any time.</p>
            
            <h3 style={{ color: "#fff", marginTop: "0", marginBottom: "15px", fontSize: "20px" }}>3. Google Analytics and Cookies</h3>
            <p style={{ color: "#aaa", marginBottom: "30px" }}>
              If you choose <strong style={{ color: "#ddd" }}>Accept Analytics</strong> in our cookie banner, Syncraft uses Google Analytics to understand page visits, traffic sources, approximate geographic location, device and browser information, and interactions such as scrolling and outbound-link clicks. Analytics is not loaded when you choose Essential Only, and we do not send your uploaded images or generated designs to Google Analytics. Google explains how it processes information from sites that use its services in its <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noreferrer" style={{ color: "#d4ff59" }}>partner-sites privacy notice</a>.
            </p>

            <h3 style={{ color: "#fff", marginTop: "0", marginBottom: "15px", fontSize: "20px" }}>4. Service Providers and International Processing</h3>
            <p style={{ color: "#aaa", marginBottom: "30px" }}>
              Depending on the feature you use, Syncraft may rely on service providers including Fal.ai and Recraft for AI image processing; Cloudflare R2 and Supabase for storage, databases, and authentication; Cloudflare Turnstile for abuse prevention; Google Analytics when you consent; Resend for transactional email; and configured payment providers for payment processing or verification. These providers may process data outside the Philippines. We limit the information sent to what is reasonably needed for the service and use technical and contractual safeguards where available.
            </p>

            <h3 style={{ color: "#fff", marginTop: "0", marginBottom: "15px", fontSize: "20px" }}>5. Retention and Your Privacy Rights</h3>
            <p style={{ color: "#aaa", marginBottom: "30px" }}>
              Project files are scheduled for deletion within 3 days. Account, transaction, security, and support records may be retained longer when needed to operate the service, prevent fraud, resolve disputes, or meet legal obligations. Subject to applicable law, you may request access to or correction or deletion of your personal data, object to or restrict certain processing, withdraw consent for optional processing, and raise a concern with the National Privacy Commission. Withdrawing consent does not affect processing already performed lawfully.
            </p>

            <h3 style={{ color: "#fff", marginTop: "0", marginBottom: "15px", fontSize: "20px" }}>6. Payments & Refunds</h3>
            <p style={{ color: "#aaa", marginBottom: "30px" }}>Syncraft operates on a prepaid credit system. For full details on our credit refund rules and payment policies, please read our <a href="/refunds" style={{ color: "#d4ff59" }}>Refund & Payment Policy</a>.</p>

            <h3 style={{ color: "#fff", marginTop: "0", marginBottom: "15px", fontSize: "20px" }}>7. Contact Us</h3>
            <p style={{ color: "#aaa", margin: 0 }}>If you have any questions or concerns about this Privacy Policy or how we handle your data, please reach out to us on our official Facebook page or contact channels.</p>
          </div>
        </section>

      </div>
    </div>
  );
}
