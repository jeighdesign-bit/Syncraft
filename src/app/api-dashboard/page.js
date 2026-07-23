"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LoginModal from "@/app/components/LoginModal";

export default function ApiDashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  
  const [user, setUser] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [copiedCompanyId, setCopiedCompanyId] = useState(false);
  const [showGcashModal, setShowGcashModal] = useState(false);

  // Auth Check
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        setShowLoginModal(true);
      } else {
        setUser(session.user);
        fetchDashboard(session.access_token);
      }
    };
    checkUser();
  }, [supabase]);

  const fetchDashboard = async (token) => {
    try {
      const res = await fetch("/api/b2b/dashboard", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch dashboard");
      
      setDashboardData(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateKey = async () => {
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/b2b/keys/generate", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Add new key to state
      setDashboardData(prev => ({
        ...prev,
        apiKeys: [data.apiKey, ...prev.apiKeys]
      }));
    } catch (err) {
      alert("Error generating key: " + err.message);
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  };

  const handleCopy = (keyStr) => {
    navigator.clipboard.writeText(keyStr);
    setCopiedKey(keyStr);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (loading) {
    return (
      <div style={{ backgroundColor: "#121212", minHeight: "100vh", color: "white", display: "flex", justifyContent: "center", alignItems: "center" }}>
        Loading API Dashboard...
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: "#121212", minHeight: "100vh", color: "white", display: "flex", flexDirection: "column" }}>
      <header style={{ padding: "20px 40px", borderBottom: "1px solid #27272a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", textDecoration: "none", color: "white" }}>
          <img src="/logo.svg" alt="Syncraft" style={{ height: "30px", marginRight: "10px" }} />
        </Link>
        <button onClick={() => supabase.auth.signOut().then(() => router.push('/'))} style={{ background: "transparent", border: "1px solid #3f3f46", color: "white", padding: "8px 16px", borderRadius: "6px", cursor: "pointer" }}>Sign Out</button>
      </header>
      
      <main style={{ flex: 1, padding: "60px 20px" }}>
        <div style={{ maxWidth: "650px", margin: "0 auto" }}>
          
          <div style={{ marginBottom: "40px" }}>
            <img src="/logo.svg" alt="Syncraft Logo" style={{ height: "40px", marginBottom: "20px" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h1 style={{ fontSize: "2.5rem", fontWeight: "bold" }}>API Dashboard</h1>
              <div style={{ display: "flex", gap: "15px" }}>
                <Link href="/docs/api" style={{ color: "#a1a1aa", textDecoration: "none", fontSize: "0.9rem" }}>Documentation</Link>
              </div>
            </div>
          </div>

          {error ? (
            <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid #ef4444", padding: "20px", borderRadius: "12px", color: "#ef4444" }}>
              {error}
            </div>
          ) : dashboardData ? (
            <div style={{ background: "#1c1c1e", borderRadius: "16px", padding: "40px", border: "1px solid #27272a" }}>
              
              {/* Balance Section */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #27272a", paddingBottom: "30px", marginBottom: "30px" }}>
                <div>
                  <div style={{ fontSize: "1rem", color: "#a1a1aa", marginBottom: "5px" }}>Balance</div>
                  <div style={{ fontSize: "3rem", fontWeight: "bold", display: "flex", alignItems: "baseline", gap: "10px" }}>
                    {dashboardData.wallet.balance_credits.toLocaleString()} 
                    <span style={{ fontSize: "1.2rem", color: "#a1a1aa", fontWeight: "normal" }}>API Credits</span>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.85rem", color: "#a1a1aa", marginBottom: "10px" }}>Auto top-up is off</div>
                  <button 
                    onClick={() => setShowGcashModal(true)}
                    style={{ background: "#3b82f6", color: "white", padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", border: "none", cursor: "pointer", textDecoration: "none", display: "inline-block" }}
                  >
                    Buy Credits
                  </button>
                </div>
              </div>

              {/* API Keys Section */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h2 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>API keys</h2>
                <button 
                  onClick={handleGenerateKey}
                  disabled={generating}
                  style={{ background: "white", color: "black", padding: "8px 16px", borderRadius: "8px", fontWeight: "bold", border: "none", cursor: generating ? "not-allowed" : "pointer" }}
                >
                  {generating ? "Generating..." : "Generate new key"}
                </button>
              </div>

              {dashboardData.apiKeys.length === 0 ? (
                <div style={{ padding: "40px", textAlign: "center", color: "#a1a1aa", border: "1px dashed #3f3f46", borderRadius: "12px" }}>
                  You don't have any API keys yet. Generate one to get started.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {dashboardData.apiKeys.map((key) => (
                    <div key={key.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", background: "#27272a", borderRadius: "10px" }}>
                      <div style={{ fontFamily: "monospace", fontSize: "1.1rem" }}>
                        {key.api_key.substring(0, 15)}••••••••••••
                      </div>
                      <button 
                        onClick={() => handleCopy(key.api_key)}
                        style={{ background: "transparent", border: "none", color: "#a1a1aa", cursor: "pointer", fontSize: "0.9rem" }}
                      >
                        {copiedKey === key.api_key ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: "40px", fontSize: "0.85rem", color: "#71717a" }}>
                Company ID: {dashboardData.company.id}
              </div>

            </div>
          ) : null}

        </div>
      </main>

      {/* GCash Payment Modal */}
      {showGcashModal && dashboardData && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.8)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div style={{ background: "#1c1c1e", padding: "40px", borderRadius: "16px", maxWidth: "600px", width: "90%", border: "1px solid #3f3f46" }}>
            <h2 style={{ fontSize: "1.8rem", fontWeight: "bold", marginBottom: "20px", color: "white" }}>Top-up via GCash</h2>
            <p style={{ color: "#a1a1aa", marginBottom: "20px", lineHeight: "1.5" }}>
              We currently process API credits manually. To purchase credits, please follow these 3 simple steps:
            </p>
            
            <div style={{ background: "#27272a", padding: "20px", borderRadius: "12px", marginBottom: "20px" }}>
              <ol style={{ margin: 0, paddingLeft: "20px", color: "white", display: "flex", flexDirection: "column", gap: "15px" }}>
                <li>
                  Send your payment to our official GCash:
                  <div style={{ display: "flex", alignItems: "center", gap: "20px", marginTop: "10px" }}>
                    <a href="/Gcash-qr-code.jpg" target="_blank" rel="noreferrer" style={{ background: "white", padding: "10px", borderRadius: "12px", display: "inline-block", cursor: "pointer", transition: "transform 0.2s" }} onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'} onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                      <img src="/Gcash-qr-code.jpg" alt="GCash QR Code (Click to enlarge)" style={{ width: "120px", height: "auto", borderRadius: "8px", display: "block" }} />
                    </a>
                    <div>
                      <div style={{ color: "#3b82f6", fontWeight: "bold", fontSize: "1.4rem" }}>09918355995</div>
                      <div style={{ fontSize: "1rem", color: "#a1a1aa", marginTop: "5px" }}>Name: JAY LUIS CANO</div>
                    </div>
                  </div>
                </li>
                <li>
                  Include your <strong>Company ID</strong> in the GCash message note so we know who to credit:
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#121212", padding: "10px", borderRadius: "6px", marginTop: "5px" }}>
                    <div style={{ fontFamily: "monospace", color: "#d4ff59", wordBreak: "break-all" }}>
                      {dashboardData.company.id}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(dashboardData.company.id);
                        setCopiedCompanyId(true);
                        setTimeout(() => setCopiedCompanyId(false), 2000);
                      }}
                      style={{ background: "transparent", color: "#a1a1aa", border: "none", cursor: "pointer", fontSize: "0.85rem", padding: "5px 10px" }}
                    >
                      {copiedCompanyId ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </li>
                <li>
                  Message our Facebook page with a screenshot of your receipt. We will credit your account instantly!
                </li>
              </ol>
            </div>

            <div style={{ display: "flex", gap: "15px", justifyContent: "flex-end" }}>
              <button 
                onClick={() => setShowGcashModal(false)}
                style={{ padding: "10px 20px", borderRadius: "8px", background: "transparent", color: "white", border: "1px solid #3f3f46", cursor: "pointer" }}
              >
                Cancel
              </button>
              <a 
                href="https://web.facebook.com/profile.php?id=61562539277199" 
                target="_blank" 
                rel="noreferrer"
                style={{ padding: "10px 20px", borderRadius: "8px", background: "#3b82f6", color: "white", textDecoration: "none", fontWeight: "bold" }}
              >
                Message on Facebook
              </a>
            </div>
          </div>
        </div>
      )}

      <LoginModal 
        isOpen={showLoginModal} 
        onClose={() => router.push('/')} 
      />
    </div>
  );
}
