"use client";

import { memo, useState } from "react";
import { ImageIcon, MoreVertical, Edit3, Trash2, Check, X, Search, ShieldAlert, Clock } from "lucide-react";

const RecentProjects = memo(function RecentProjects({
  user,
  isLoadingProjects,
  recentProjects,
  editingId,
  editValue,
  setEditValue,
  openMenuId,
  setOpenMenuId,
  onNavigate,
  onStartEditing,
  onCancelEditing,
  onSaveRename,
  onConfirmDelete,
}) {
  const [searchQuery, setSearchQuery] = useState("");

  if (isLoadingProjects) {
    return (
      <div className="recent-projects">
        <h3>Recent Projects</h3>
        <div className="recent-grid">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="recent-card skeleton-card">
              <div className="skeleton-thumb"></div>
              <div className="skeleton-info">
                <div className="skeleton-text"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (recentProjects.length > 0) {
    const filteredProjects = recentProjects.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
      <div className="recent-projects">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <h3 style={{ margin: 0, marginBottom: "4px", borderBottom: "none", paddingBottom: 0, fontSize: "16px", color: "#fff", fontWeight: "700" }}>RECENT PROJECTS</h3>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#666", fontSize: "11px", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              <Clock size={11} /> Auto-deleted after 3 days
            </div>
          </div>
          <div style={{ position: "relative", width: "260px" }}>
            <Search size={14} color="#666" style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }} />
            <input 
              type="text" 
              placeholder="Search projects..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                background: "#161616",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: "#e0e0e0",
                padding: "10px 14px 10px 38px",
                borderRadius: "99px",
                fontSize: "13px",
                outline: "none",
                transition: "all 0.25s ease-out"
              }}
              onFocus={(e) => { e.target.style.borderColor = "#d4ff59"; e.target.style.background = "#1a1a1a"; e.target.style.boxShadow = "0 0 0 3px rgba(212, 255, 89, 0.1)"; }}
              onBlur={(e) => { e.target.style.borderColor = "rgba(255, 255, 255, 0.1)"; e.target.style.background = "#161616"; e.target.style.boxShadow = "none"; }}
            />
          </div>
        </div>

        {/* Privacy Notice for main projects */}
        <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "14px", padding: "13px 16px", marginBottom: "24px", display: "flex", gap: "12px", alignItems: "center" }}>
          <span style={{ width: "36px", height: "36px", display: "grid", placeItems: "center", flexShrink: 0, borderRadius: "10px", background: "rgba(212, 255, 89, 0.08)", border: "1px solid rgba(212, 255, 89, 0.2)" }}>
            <ShieldAlert size={19} strokeWidth={1.8} color="#d4ff59" aria-hidden="true" />
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: "0 0 3px", fontSize: "12.5px", fontWeight: "650", color: "#e8e8e8", lineHeight: 1.25 }}>Your work stays yours</p>
            <p style={{ margin: 0, fontSize: "11px", color: "#929292", lineHeight: 1.5 }}>Syncraft does not claim, sell, or reuse your uploaded or extracted designs. You retain ownership, and projects are permanently deleted after 3 days.</p>
          </div>
        </div>

        {filteredProjects.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#666", fontSize: "14px", background: "#1a1a1a", border: "1px dashed #333", borderRadius: "0" }}>
            No projects found matching "{searchQuery}"
          </div>
        ) : (
          <div className="recent-grid">
            {filteredProjects.map(proj => (
              <div key={proj.id} className="recent-card" onClick={() => onNavigate(proj)}>
              <div className="recent-thumb" style={{
                  backgroundImage: proj.original_image_url
                    ? `url(/api/proxy?url=${encodeURIComponent(proj.original_image_url)})`
                    : 'none',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}></div>
                <div className="recent-info">
                  
                  {editingId === proj.id ? (
                    <div className="inline-edit" onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="text" 
                        value={editValue} 
                        onChange={(e) => setEditValue(e.target.value)} 
                        onKeyDown={(e) => e.key === 'Enter' && onSaveRename(e, proj.id)}
                        autoFocus
                      />
                      <button onClick={(e) => onSaveRename(e, proj.id)} className="save-btn"><Check size={14}/></button>
                      <button onClick={onCancelEditing} className="cancel-btn"><X size={14}/></button>
                    </div>
                  ) : (
                    <>
                      <div className="recent-name" title={proj.name}>{proj.name}</div>
                      <div className="menu-container" onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === proj.id ? null : proj.id); }}>
                        <button className="dots-btn"><MoreVertical size={16} /></button>
                        {openMenuId === proj.id && (
                          <div className="dropdown-menu">
                            <button onClick={(e) => onStartEditing(e, proj)}><Edit3 size={14} /> Rename</button>
                            <button onClick={(e) => onConfirmDelete(e, proj)} className="delete-option"><Trash2 size={14} /> Delete</button>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (user) {
    return (
      <div className="recent-projects" style={{ textAlign: "center", padding: "40px 0", background: "#1a1a1a", border: "1px dashed #333", marginTop: "24px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
          <div style={{ background: "#222", padding: "16px", borderRadius: "50%", border: "1px solid #333" }}>
            <ImageIcon size={32} color="#555" />
          </div>
        </div>
        <p style={{ color: "#888", fontSize: "14px", margin: 0 }}>No projects yet. Upload a design above to start your first trace.</p>
      </div>
    );
  }

  return null;
});

export default RecentProjects;
