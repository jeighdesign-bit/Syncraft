"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function ApiDocsPage() {
  const router = useRouter();
  const supabase = createClient();

  return (
    <div style={{ backgroundColor: "#121212", minHeight: "100vh", color: "white", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "20px 40px", borderBottom: "1px solid #27272a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", color: "white" }}>
          <img src="/images/syncraft.png" alt="Syncraft" style={{ height: "30px", marginRight: "10px" }} />
        </Link>
        <div>
          <Link href="/api-dashboard" style={{ color: "#a1a1aa", marginRight: "20px", textDecoration: "none" }}>Dashboard</Link>
          <button onClick={() => supabase.auth.signOut().then(() => router.push('/'))} style={{ background: "transparent", border: "1px solid #3f3f46", color: "white", padding: "8px 16px", borderRadius: "6px", cursor: "pointer" }}>Sign Out</button>
        </div>
      </header>
      
      <main style={{ flex: 1, padding: "60px 20px" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto", background: "#1c1c1e", padding: "40px", borderRadius: "16px", border: "1px solid #27272a" }}>
          <h1 style={{ fontSize: "2.5rem", fontWeight: "bold", marginBottom: "10px" }}>API Documentation</h1>
          <p style={{ color: "#a1a1aa", marginBottom: "40px" }}>Integrate Syncraft's AI features directly into your own applications.</p>

          <h2 style={{ fontSize: "1.5rem", marginBottom: "15px", borderBottom: "1px solid #3f3f46", paddingBottom: "10px" }}>API Credit Pricing</h2>
          <p style={{ color: "#a1a1aa", marginBottom: "15px" }}>
            The Syncraft API uses a prepaid credit system. API Credits must be purchased in advance and will not expire. 
          </p>
          <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse", marginBottom: "30px", fontSize: "0.95rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #3f3f46", color: "#a1a1aa" }}>
                <th style={{ padding: "10px" }}>Package Name</th>
                <th style={{ padding: "10px" }}>Price (PHP)</th>
                <th style={{ padding: "10px" }}>API Credits Received</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid #27272a" }}>
                <td style={{ padding: "15px 10px", color: "white", fontWeight: "bold" }}>Starter</td>
                <td style={{ padding: "15px 10px", color: "#a1a1aa" }}>₱116.00</td>
                <td style={{ padding: "15px 10px", color: "#d4ff59", fontWeight: "bold" }}>200</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #27272a" }}>
                <td style={{ padding: "15px 10px", color: "white", fontWeight: "bold" }}>Pro</td>
                <td style={{ padding: "15px 10px", color: "#a1a1aa" }}>₱290.00</td>
                <td style={{ padding: "15px 10px", color: "#d4ff59", fontWeight: "bold" }}>500</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #27272a" }}>
                <td style={{ padding: "15px 10px", color: "white", fontWeight: "bold" }}>Studio</td>
                <td style={{ padding: "15px 10px", color: "#a1a1aa" }}>₱580.00</td>
                <td style={{ padding: "15px 10px", color: "#d4ff59", fontWeight: "bold" }}>1,000</td>
              </tr>
            </tbody>
          </table>

          <h2 style={{ fontSize: "1.5rem", marginBottom: "15px", borderBottom: "1px solid #3f3f46", paddingBottom: "10px" }}>Cost per Generation</h2>
          <p style={{ color: "#a1a1aa", marginBottom: "15px" }}>
            The following are the service charges (in API Credits) for each feature. Credits are automatically deducted from your prepaid wallet upon a successful generation.
          </p>
          <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse", marginBottom: "40px", fontSize: "0.95rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #3f3f46", color: "#a1a1aa" }}>
                <th style={{ padding: "10px" }}>Service Description</th>
                <th style={{ padding: "10px" }}>Cost (PHP)</th>
                <th style={{ padding: "10px" }}>Cost (API Credits)</th>
                <th style={{ padding: "10px" }}>Billing Basis</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid #27272a" }}>
                <td style={{ padding: "15px 10px", color: "white" }}>
                  <strong>Garment Trace & Vectorization</strong><br/>
                  <span style={{ fontSize: "0.85rem", color: "#a1a1aa" }}>Modes: keep_artwork, extract_pattern</span>
                </td>
                <td style={{ padding: "15px 10px", color: "#a1a1aa" }}>₱23.20</td>
                <td style={{ padding: "15px 10px", color: "#d4ff59", fontWeight: "bold" }}>40</td>
                <td style={{ padding: "15px 10px", color: "#a1a1aa" }}>Per image</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #27272a" }}>
                <td style={{ padding: "15px 10px", color: "white" }}>
                  <strong>Logo & Emblems Trace</strong><br/>
                  <span style={{ fontSize: "0.85rem", color: "#a1a1aa" }}>Mode: logo_trace</span>
                </td>
                <td style={{ padding: "15px 10px", color: "#a1a1aa" }}>₱23.20</td>
                <td style={{ padding: "15px 10px", color: "#d4ff59", fontWeight: "bold" }}>40</td>
                <td style={{ padding: "15px 10px", color: "#a1a1aa" }}>Per image</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #27272a" }}>
                <td style={{ padding: "15px 10px", color: "white" }}>
                  <strong>Background Remover</strong><br/>
                  <span style={{ fontSize: "0.85rem", color: "#a1a1aa" }}>Mode: bg_remover</span>
                </td>
                <td style={{ padding: "15px 10px", color: "#a1a1aa" }}>₱2.90</td>
                <td style={{ padding: "15px 10px", color: "#d4ff59", fontWeight: "bold" }}>5</td>
                <td style={{ padding: "15px 10px", color: "#a1a1aa" }}>Per image</td>
              </tr>
            </tbody>
          </table>

          <h2 style={{ fontSize: "1.5rem", marginBottom: "15px", borderBottom: "1px solid #3f3f46", paddingBottom: "10px" }}>Base URL</h2>
          <pre style={{ background: "#27272a", padding: "15px", borderRadius: "8px", marginBottom: "40px", color: "#d4ff59" }}>
            https://syncraft.co/api/v1/generate
          </pre>

          <h2 style={{ fontSize: "1.5rem", marginBottom: "15px", borderBottom: "1px solid #3f3f46", paddingBottom: "10px" }}>Authentication</h2>
          <p style={{ color: "#a1a1aa", marginBottom: "15px" }}>Authenticate your requests by sending your API key in the `Authorization` header as a Bearer token.</p>
          <pre style={{ background: "#27272a", padding: "15px", borderRadius: "8px", marginBottom: "40px" }}>
            Authorization: Bearer YOUR_API_KEY
          </pre>

          <h2 style={{ fontSize: "1.5rem", marginBottom: "15px", borderBottom: "1px solid #3f3f46", paddingBottom: "10px" }}>Request Body Parameters</h2>
          <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse", marginBottom: "40px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #3f3f46", color: "#a1a1aa" }}>
                <th style={{ padding: "10px" }}>Parameter</th>
                <th style={{ padding: "10px" }}>Type</th>
                <th style={{ padding: "10px" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid #27272a" }}>
                <td style={{ padding: "15px 10px", fontWeight: "bold", color: "#d4ff59" }}>image_url</td>
                <td style={{ padding: "15px 10px", color: "#a1a1aa" }}>string</td>
                <td style={{ padding: "15px 10px" }}>Required. The public URL of the image you want to process.</td>
              </tr>
              <tr style={{ borderBottom: "1px solid #27272a" }}>
                <td style={{ padding: "15px 10px", fontWeight: "bold", color: "#d4ff59" }}>mode</td>
                <td style={{ padding: "15px 10px", color: "#a1a1aa" }}>string</td>
                <td style={{ padding: "15px 10px" }}>
                  Optional. Determines which AI pipeline to use. Options:<br/>
                  <code style={{ background: "#27272a", padding: "2px 6px", borderRadius: "4px" }}>keep_artwork</code> (Default, 40 Credits)<br/>
                  <code style={{ background: "#27272a", padding: "2px 6px", borderRadius: "4px" }}>extract_pattern</code> (40 Credits)<br/>
                  <code style={{ background: "#27272a", padding: "2px 6px", borderRadius: "4px" }}>logo_trace</code> (40 Credits)<br/>
                  <code style={{ background: "#27272a", padding: "2px 6px", borderRadius: "4px" }}>bg_remover</code> (5 Credits)
                </td>
              </tr>
            </tbody>
          </table>

          <h2 style={{ fontSize: "1.5rem", marginBottom: "15px", borderBottom: "1px solid #3f3f46", paddingBottom: "10px" }}>Example Request (cURL)</h2>
          <pre style={{ background: "#27272a", padding: "15px", borderRadius: "8px", marginBottom: "40px", overflowX: "auto" }}>
{`curl -X POST https://syncraft.co/api/v1/generate \\
-H "Authorization: Bearer YOUR_API_KEY_HERE" \\
-H "Content-Type: application/json" \\
-d '{
  "image_url": "https://example.com/jersey.png",
  "mode": "extract_pattern" 
}'`}
          </pre>

          <h2 style={{ fontSize: "1.5rem", marginBottom: "15px", borderBottom: "1px solid #3f3f46", paddingBottom: "10px" }}>Example Response</h2>
          <pre style={{ background: "#27272a", padding: "15px", borderRadius: "8px", overflowX: "auto" }}>
{`{
  "success": true,
  "company": "Your Company Name",
  "mode": "extract_pattern",
  "credits_charged": 40,
  "image_url": "https://url-to-final-vector.svg",
  "type": "image/svg+xml"
}`}
          </pre>

        </div>
      </main>
    </div>
  );
}
