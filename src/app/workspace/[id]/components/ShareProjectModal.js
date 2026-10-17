"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Loader2, Lock, Trash2, UserRound, X } from "lucide-react";
import styles from "./ShareProjectModal.module.css";

function PermissionMenu({ value, open, onToggle, onChange, label }) {
  return (
    <div className={styles.permissionMenu}>
      <button type="button" className={styles.permissionTrigger} aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={onToggle}>
        <span>{value === "edit" ? "Can edit" : "View only"}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className={styles.permissionPopover} role="listbox" aria-label={label}>
          {[["edit", "Can edit"], ["view", "View only"]].map(([optionValue, optionLabel]) => (
            <button type="button" role="option" aria-selected={value === optionValue} className={styles.permissionOption} key={optionValue} onClick={() => onChange(optionValue)}>
              <span>{optionLabel}</span>
              {value === optionValue && <Check size={15} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountAvatar({ email, avatarUrl, owner = false }) {
  const [imageFailed, setImageFailed] = useState(false);
  const fallback = owner ? <UserRound size={15} aria-hidden="true" /> : (email?.[0] || "U").toUpperCase();

  return (
    <span className={styles.avatar} aria-hidden="true">
      {avatarUrl && !imageFailed ? (
        <img
          className={styles.avatarImage}
          src={avatarUrl}
          alt=""
          width="32"
          height="32"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      ) : fallback}
    </span>
  );
}

export default function ShareProjectModal({ show, project, user, supabase, onClose }) {
  const titleId = useId();
  const emailId = useId();
  const dialogRef = useRef(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("edit");
  const [members, setMembers] = useState([]);
  const [owner, setOwner] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [openPermissionMenu, setOpenPermissionMenu] = useState(null);

  const authenticatedFetch = useCallback(async (url, options = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Please sign in again.");
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        ...(options.headers || {}),
      },
    });
  }, [supabase]);

  const loadMembers = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await authenticatedFetch(`/api/project-share?projectId=${encodeURIComponent(project.id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load sharing settings.");
      setMembers(data.collaborators || []);
      setOwner(data.owner || null);
      setExpiresAt(data.expiresAt || null);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch, project?.id]);

  useEffect(() => {
    if (!show) return;
    void loadMembers();
    const previous = document.activeElement;
    requestAnimationFrame(() => dialogRef.current?.focus());
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus?.();
    };
  }, [show, loadMembers, onClose]);

  if (!show) return null;

  const invite = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const response = await authenticatedFetch("/api/project-share", {
        method: "POST",
        body: JSON.stringify({ projectId: project.id, email, role }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to share this project.");
      setEmail("");
      setMessage("Access updated.");
      await loadMembers();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const updateRole = async (userId, nextRole) => {
    setMessage("");
    const response = await authenticatedFetch("/api/project-share", {
      method: "PATCH",
      body: JSON.stringify({ projectId: project.id, userId, role: nextRole }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Unable to update permission.");
    setMembers((current) => current.map((member) => member.user_id === userId ? { ...member, role: nextRole } : member));
  };

  const removeMember = async (userId) => {
    setMessage("");
    const response = await authenticatedFetch(`/api/project-share?projectId=${encodeURIComponent(project.id)}&userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Unable to remove collaborator.");
    setMembers((current) => current.filter((member) => member.user_id !== userId));
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const expiryLabel = expiresAt
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(expiresAt))
    : "with the project";

  return (
    <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className={styles.header}>
          <h2 id={titleId}>Share “{project?.name || "Untitled Project"}”</h2>
          <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close share dialog"><X size={17} /></button>
        </header>

        <form className={styles.inviteForm} onSubmit={invite}>
          <label className={styles.srOnly} htmlFor={emailId}>Syncraft account email</label>
          <div className={styles.inviteRow}>
            <input id={emailId} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" required />
            <button type="submit" className={styles.primaryButton} disabled={submitting || !email.trim()}>
              {submitting ? <Loader2 size={14} className="animate-spin" /> : "Invite"}
            </button>
          </div>
          {message && <p className={styles.message} role="status">{message}</p>}
        </form>

        <div className={styles.restriction}>
          <span className={styles.lockIcon}><Lock size={15} aria-hidden="true" /></span>
          <div><strong>Invited Syncraft accounts</strong><span>Access expires {expiryLabel}.</span></div>
          <PermissionMenu
            value={role}
            open={openPermissionMenu === "invite"}
            onToggle={() => setOpenPermissionMenu((current) => current === "invite" ? null : "invite")}
            onChange={(nextRole) => { setRole(nextRole); setOpenPermissionMenu(null); }}
            label="Permission for new invitations"
          />
        </div>

        <div className={styles.people} aria-busy={loading}>
          <p className={styles.sectionLabel}>People with access</p>
          <div className={styles.personRow}>
            <AccountAvatar email={owner?.email || user?.email} avatarUrl={owner?.avatarUrl || user?.user_metadata?.avatar_url || user?.user_metadata?.picture} owner />
            <span className={styles.identity}><strong>{owner?.email || user?.email || "You"}</strong><small>Project owner</small></span>
            <span className={styles.ownerRole}>Owner</span>
          </div>
          {loading ? (
            <div className={styles.loading}><Loader2 size={15} className="animate-spin" /> Loading access…</div>
          ) : members.map((member) => (
            <div className={styles.personRow} key={member.user_id}>
              <AccountAvatar email={member.email} avatarUrl={member.avatarUrl} />
              <span className={styles.identity}><strong>{member.email}</strong><small>Syncraft account</small></span>
              <PermissionMenu
                value={member.role}
                open={openPermissionMenu === member.user_id}
                onToggle={() => setOpenPermissionMenu((current) => current === member.user_id ? null : member.user_id)}
                onChange={(nextRole) => { setOpenPermissionMenu(null); void updateRole(member.user_id, nextRole); }}
                label={`Permission for ${member.email}`}
              />
              <button type="button" className={styles.removeButton} onClick={() => void removeMember(member.user_id)} aria-label={`Remove ${member.email}`}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.copyButton} onClick={copyLink}>
            {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy link"}
          </button>
        </footer>
      </section>
    </div>
  );
}

