"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, BookOpen, Check, Clipboard, Code2, KeyRound, LogOut, Plus, ShieldCheck, WalletCards } from "lucide-react";
import LoginModal from "@/app/components/LoginModal";
import ApiCreditTopUpModal from "./ApiCreditTopUpModal";
import styles from "./api-dashboard.module.css";

const supabase = createClient();

export default function ApiDashboardPage() {
  const router = useRouter();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [showTopUpModal, setShowTopUpModal] = useState(false);

  const fetchDashboard = async (token) => {
    try {
      const response = await fetch("/api/b2b/dashboard", { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to fetch dashboard");
      setDashboardData(data);
    } catch (fetchError) {
      setError(fetchError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        setShowLoginModal(true);
        return;
      }
      fetchDashboard(session.access_token);
    };
    checkUser();
  }, []);

  const handleGenerateKey = async () => {
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again to continue.");
      const response = await fetch("/api/b2b/keys/generate", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDashboardData((current) => ({ ...current, apiKeys: [data.apiKey, ...current.apiKeys] }));
    } catch (generateError) {
      window.alert(`Error generating key: ${generateError.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (keyString) => {
    await navigator.clipboard.writeText(keyString);
    setCopiedKey(keyString);
    window.setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading) {
    return (
      <main className={styles.loadingScreen}>
        <img src="/logo.svg" alt="Syncraft" />
        <span className={styles.loadingLine} />
        <p>Preparing your developer workspace</p>
      </main>
    );
  }

  return (
    <div className={styles.pageShell}>
      <header className={styles.siteHeader}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand} aria-label="Syncraft home"><img src="/logo.svg" alt="Syncraft" /></Link>
          <nav className={styles.headerActions} aria-label="API dashboard navigation">
            <Link href="/docs/api" className={styles.navLink}><BookOpen size={16} aria-hidden="true" /><span>Documentation</span></Link>
            <button type="button" onClick={handleSignOut} className={styles.signOutButton}><LogOut size={16} aria-hidden="true" /><span>Sign out</span></button>
          </nav>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="dashboard-title">
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}><Code2 size={16} aria-hidden="true" /> Syncraft developer platform</div>
            <h1 id="dashboard-title">Build with <span>Syncraft.</span></h1>
            <p>Manage your API credits and production keys from one secure workspace.</p>
          </div>
          <Link href="/docs/api" className={styles.docsCard}>
            <span className={styles.docsIcon}><BookOpen size={20} aria-hidden="true" /></span>
            <span><strong>API documentation</strong><small>Endpoints, authentication and examples</small></span>
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>

        {error ? (
          <section className={styles.errorPanel} role="alert">
            <strong>We couldn’t load your API workspace.</strong><span>{error}</span>
          </section>
        ) : dashboardData ? (
          <div className={styles.dashboardGrid}>
            <section className={styles.walletPanel} aria-labelledby="wallet-title">
              <div className={styles.panelTopline}>
                <span className={styles.panelIcon}><WalletCards size={20} aria-hidden="true" /></span>
                <span className={styles.liveStatus}><i /> Wallet active</span>
              </div>
              <div className={styles.balanceBlock}>
                <p id="wallet-title">Available balance</p>
                <div className={styles.balanceValue}><strong>{dashboardData.wallet.balance_credits.toLocaleString()}</strong><span>API credits</span></div>
              </div>
              <p className={styles.walletCopy}>Prepaid credits never expire. Top up through QR Ph and your balance updates automatically.</p>
              <button type="button" onClick={() => setShowTopUpModal(true)} className={styles.primaryButton}>Buy API credits <ArrowRight size={18} aria-hidden="true" /></button>
              <div className={styles.secureNote}><ShieldCheck size={15} aria-hidden="true" /> Secure checkout powered by PayMongo</div>
            </section>

            <section className={styles.keysPanel} aria-labelledby="keys-title">
              <div className={styles.panelHeader}>
                <div>
                  <div className={styles.sectionLabel}><KeyRound size={15} aria-hidden="true" /> Developer access</div>
                  <h2 id="keys-title">API keys</h2>
                  <p>Use these private keys to authenticate requests from your server.</p>
                </div>
                <button type="button" onClick={handleGenerateKey} disabled={generating} className={styles.secondaryButton}>
                  <Plus size={17} aria-hidden="true" /> {generating ? "Generating…" : "Generate key"}
                </button>
              </div>

              {dashboardData.apiKeys.length === 0 ? (
                <div className={styles.emptyState}>
                  <KeyRound size={25} aria-hidden="true" /><strong>No API keys yet</strong><span>Generate your first key to start making requests.</span>
                </div>
              ) : (
                <div className={styles.keyList}>
                  {dashboardData.apiKeys.map((key, index) => {
                    const copied = copiedKey === key.api_key;
                    return (
                      <div className={styles.keyRow} key={key.id}>
                        <span className={styles.keyNumber}>{String(index + 1).padStart(2, "0")}</span>
                        <div className={styles.keyDetails}>
                          <strong>{index === 0 ? "Production key" : `API key ${index + 1}`}</strong>
                          <code>{key.api_key.substring(0, 16)}<span>••••••••••••</span></code>
                        </div>
                        <button type="button" onClick={() => handleCopy(key.api_key)} className={styles.copyButton} aria-label={`Copy API key ${index + 1}`}>
                          {copied ? <Check size={17} aria-hidden="true" /> : <Clipboard size={17} aria-hidden="true" />}<span>{copied ? "Copied" : "Copy"}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className={styles.companyId}><span>Company ID</span><code>{dashboardData.company.id}</code></div>
            </section>
          </div>
        ) : null}
      </main>

      <footer className={styles.footer}><span>Syncraft API</span><span>Production-ready creative automation</span></footer>

      <ApiCreditTopUpModal
        open={showTopUpModal && Boolean(dashboardData)}
        onClose={() => setShowTopUpModal(false)}
        supabase={supabase}
        onPaid={async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) await fetchDashboard(session.access_token);
        }}
      />
      <LoginModal show={showLoginModal} supabase={supabase} onClose={() => router.push("/")} />
    </div>
  );
}
