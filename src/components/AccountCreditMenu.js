"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Coins, FileText, LogOut, Menu, ShoppingBag } from "lucide-react";
import styles from "./AccountCreditMenu.module.css";

export default function AccountCreditMenu({ user, credits, onOpenTopUp, onSignOut }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const displayedCredits = credits ?? "-";

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setIsOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const closeMenu = () => setIsOpen(false);
  const userLabel = user?.user_metadata?.full_name || user?.email || "Syncraft account";
  const initial = (user?.user_metadata?.full_name?.[0] || user?.email?.[0] || "U").toUpperCase();

  return (
    <div className={styles.accountMenu} ref={menuRef}>
      <div className="syncraft-header-control" aria-label={`${displayedCredits} credits`}>
        <span className="syncraft-header-control__value">{displayedCredits}</span>
        <span className="syncraft-header-control__label">CREDITS</span>
      </div>

      <button
        type="button"
        className={styles.trigger}
        onClick={() => setIsOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Open account menu for ${userLabel}`}
      >
        <Menu size={18} aria-hidden="true" />
      </button>

      {isOpen && (
        <div className={styles.popover} role="menu">
          <div className={styles.summary}>
            {user?.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url} referrerPolicy="no-referrer" className={styles.avatar} alt="" />
            ) : (
              <span className={`${styles.avatar} ${styles.fallbackAvatar}`} aria-hidden="true">{initial}</span>
            )}
            <span className={styles.summaryCopy}>
              <strong>{user?.email || userLabel}</strong>
              <small>{displayedCredits} Syncraft credits</small>
            </span>
          </div>

          <div className={styles.divider} />
          <Link href="/store" role="menuitem" onClick={closeMenu} className={styles.item}>
            <ShoppingBag size={17} aria-hidden="true" />
            <span>Store</span>
          </Link>
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => { closeMenu(); onOpenTopUp?.(); }}
          >
            <Coins size={17} aria-hidden="true" />
            <span>Credits &amp; top up</span>
            <span className={styles.itemValue}>{displayedCredits}</span>
          </button>
          <Link href="/terms" role="menuitem" onClick={closeMenu} className={styles.item}>
            <FileText size={17} aria-hidden="true" />
            <span>Legal &amp; policies</span>
          </Link>

          <div className={styles.divider} />
          <button
            type="button"
            role="menuitem"
            className={`${styles.item} ${styles.signOut}`}
            onClick={() => { closeMenu(); onSignOut?.(); }}
          >
            <LogOut size={17} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}
