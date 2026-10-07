"use client";

import { memo, useState, useEffect, useRef } from "react";
import { X, Loader2 } from "lucide-react";
import { toast } from "@/components/Toast";
import styles from "./LoginModal.module.css";
import { Turnstile } from '@marsidev/react-turnstile';

const LoginModal = memo(function LoginModal({ show, onClose, supabase }) {
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState(null);
  const turnstileRef = useRef(null);

  // Use the production key by default; localhost switches to Cloudflare's dummy testing key below.
  const [turnstileSiteKey, setTurnstileSiteKey] = useState(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAAD4kODjBozDJ38OZ');

  useEffect(() => {
    if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      setTurnstileSiteKey('1x00000000000000000000AA'); // Cloudflare official dummy testing key
    }
  }, []);

  if (!show) return null;

  const handleGoogleLogin = async () => {
    if (!acceptedTerms) {
      toast.error("Please accept the Terms and Privacy Policy first.");
      return;
    }
    if (!turnstileToken) {
      toast.error("Please complete the security check first.");
      return;
    }
    
    // Strict token handling: Capture and clear immediately to prevent leak/reuse
    const secureToken = turnstileToken;
    setTurnstileToken(null);
    setIsLoadingGoogle(true);
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { 
          redirectTo: `${window.location.origin}/api/auth/callback`,
          captchaToken: secureToken
        }
      });
      if (error) throw error;
    } catch (err) {
      toast.error("Google login failed. Please try again.");
      setIsLoadingGoogle(false);
      if (turnstileRef.current) turnstileRef.current.reset();
    }
  };

  const canContinue = acceptedTerms && turnstileToken && !isLoadingGoogle;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="login-title" aria-describedby="login-description" onClick={(event) => event.stopPropagation()}>
        <button className={styles.close} onClick={onClose} type="button" aria-label="Close login dialog"><X size={20} aria-hidden="true" /></button>
        <div className={styles.content}>
          <img src="/logo.svg" alt="Syncraft" className={styles.logo} />
          <h2 id="login-title" className={styles.title}>Create your account</h2>
          <p id="login-description" className={styles.description}>Start creating with Syncraft in seconds.</p>
          <div className={styles.form}>
            <button className={styles.google} type="button" onClick={handleGoogleLogin} disabled={!canContinue} aria-busy={isLoadingGoogle} aria-describedby="login-status">
              {isLoadingGoogle ? <Loader2 size={20} className="animate-spin" aria-hidden="true" /> : <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>}
              {isLoadingGoogle ? 'Connecting to Google…' : 'Continue with Google'}
            </button>

            <div className={styles.security}>
              <div className={styles.captcha}>
                <Turnstile key={turnstileSiteKey} ref={turnstileRef} siteKey={turnstileSiteKey}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onError={() => { toast.error("Security check failed. Please try again."); setTurnstileToken(null); }}
                  onExpire={() => setTurnstileToken(null)}
                  options={{ theme: 'dark', size: 'flexible', appearance: 'always' }} />
              </div>
            </div>
            <label className={styles.consent} htmlFor="login-terms-consent">
              <input id="login-terms-consent" type="checkbox" checked={acceptedTerms} disabled={isLoadingGoogle} onChange={(event) => setAcceptedTerms(event.target.checked)} />
              <span>I agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms</a> and acknowledge the <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.</span>
            </label>
            <p id="login-status" className={styles.hint} role="status">{isLoadingGoogle ? 'Taking you to Google to sign in.' : !turnstileToken ? 'Complete the security check to continue.' : !acceptedTerms ? 'Accept the terms to continue.' : 'You’re ready. Continue with your Google account.'}</p>
          </div>
        </div>
        <div className={styles.art} aria-hidden="true"><img src="/login-bg.webp" alt="" width="1400" height="933" decoding="async" /><div className={styles.artCaption}><span>MAKE SOMETHING GREAT</span><p>From your first idea.<br />To your next masterpiece.</p></div></div>
      </div>
    </div>
  );
});

export default LoginModal;
