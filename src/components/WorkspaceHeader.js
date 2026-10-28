"use client";

import AccountCreditMenu from "@/components/AccountCreditMenu";
import BackToWorkspace from "@/components/BackToWorkspace";

// Shared markup from the existing tracing workspace. Keep both tools on the
// same header and account controls instead of maintaining separate designs.
export default function WorkspaceHeader({ title, eyebrow, accent = "#d4ff59", user, credits, onHome, onOpenTopUp, onSignOut, onSignIn, actions }) {
  return (
    <header className="workspace-topbar" style={{ "--workspace-accent": accent }}>
      <BackToWorkspace />
      <div className="workspace-mode-title" aria-live="polite">
        <span className="workspace-mode-title__rail" aria-hidden="true" />
        <span className="workspace-mode-title__copy">
          <span className="workspace-mode-title__eyebrow">{eyebrow}</span>
          <h1 className="workspace-mode-title__heading">{title}</h1>
        </span>
        <span className="workspace-mode-title__rail workspace-mode-title__rail--end" aria-hidden="true" />
      </div>
      <div className="syncraft-header-controls">
        {actions}
        {!user && onSignIn ? <button type="button" className="workspace-share-button" onClick={onSignIn}>Sign in</button>
          : <AccountCreditMenu user={user} credits={credits} onOpenTopUp={onOpenTopUp} onSignOut={onSignOut} />}
      </div>
    </header>
  );
}
