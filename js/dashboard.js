// ─────────────────────────────────────────────
// PROJECTS DASHBOARD CONTROLLER  –  js/dashboard.js
// ─────────────────────────────────────────────
import ProjectService from './projectService.js?v=2.0.5';
import { showToast, showConfirmModal }  from './utils.js';
import authService    from './authService.js?v=2.0.5';


export function initDashboard(router) {

  // Bind global error listener for diagnostics
  if (!window.hasDashboardErrorBound) {
    window.hasDashboardErrorBound = true;
    window.addEventListener('error', (e) => {
      console.error('Captured dashboard error:', e.error);
      const errDiv = document.createElement('div');
      errDiv.className = 'db-diagnostic-error';
      errDiv.style.color = '#ff4d4d';
      errDiv.style.background = 'rgba(255,77,77,0.1)';
      errDiv.style.padding = '16px';
      errDiv.style.margin = '20px';
      errDiv.style.borderRadius = '12px';
      errDiv.style.border = '1px solid rgba(255,77,77,0.3)';
      errDiv.style.fontSize = '12px';
      errDiv.style.fontFamily = 'monospace';
      errDiv.style.whiteSpace = 'pre-wrap';
      errDiv.style.gridColumn = '1 / -1';
      errDiv.textContent = `CRASH: ${e.message}\nAt: ${e.filename}:${e.lineno}:${e.colno}\nStack: ${e.error ? e.error.stack : ''}`;
      document.getElementById('db-project-list')?.prepend(errDiv);
    });
  }

  // ── DOM ───────────────────────────────────────
  const newBtn      = document.getElementById('db-new-project-btn');
  const projectList = document.getElementById('db-project-list');
  const countEl     = document.getElementById('db-project-count');
  const emptyState  = document.getElementById('db-empty-state');


  // ── New project ───────────────────────────────
  if (newBtn) {
    const freshNewBtn = newBtn.cloneNode(true);
    newBtn.parentNode.replaceChild(freshNewBtn, newBtn);
    freshNewBtn.addEventListener('click', createAndOpenProject);
  }

  // Bind click outside to close folders once
  const dbMain = document.querySelector('.db-main');
  if (dbMain && !dbMain.dataset.clickBound) {
    dbMain.dataset.clickBound = 'true';
    document.addEventListener('click', (e) => {
      const activeView = document.getElementById('dashboard-view');
      if (activeView && !activeView.classList.contains('hidden')) {
        if (e.target && typeof e.target.closest === 'function' && !e.target.closest('.folder')) {
          const openFolders = activeView.querySelectorAll('.folder.open');
          openFolders.forEach(f => {
            f.classList.remove('open');
            f.setAttribute('aria-expanded', 'false');
            const papers = f.querySelectorAll('.paper');
            papers.forEach(p => {
              p.style.setProperty('--magnet-x', '0px');
              p.style.setProperty('--magnet-y', '0px');
            });
          });
        }
      }
    });
  }



  // ════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════

  const FOLDER_COLORS = [
    '#d4ff59', // Primary Lime
    '#a8d629', // Darker Brand Lime
    '#8e937c', // Sage Green
    '#c5c9b0', // Light Sage/Cream
    '#e4ff8f'  // Light Brand Lime
  ];

  function getFolderColors(projId) {
    let hash = 0;
    const str = projId || '';
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % FOLDER_COLORS.length;
    const primary = FOLDER_COLORS[index];
    const back = darkenColor(primary, 0.08);
    return { primary, back };
  }

  function darkenColor(hex, percent) {
    let color = hex.startsWith('#') ? hex.slice(1) : hex;
    if (color.length === 3) {
      color = color.split('').map(c => c + c).join('');
    }
    const num = parseInt(color, 16);
    let r = (num >> 16) & 0xff;
    let g = (num >> 8) & 0xff;
    let b = num & 0xff;
    r = Math.max(0, Math.min(255, Math.floor(r * (1 - percent))));
    g = Math.max(0, Math.min(255, Math.floor(g * (1 - percent))));
    b = Math.max(0, Math.min(255, Math.floor(b * (1 - percent))));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
  }

  function closeAllFolders() {
    const openFolders = projectList?.querySelectorAll('.folder.open');
    openFolders?.forEach(f => {
      f.classList.remove('open');
      f.setAttribute('aria-expanded', 'false');
      const papers = f.querySelectorAll('.paper');
      papers.forEach(p => {
        p.style.setProperty('--magnet-x', '0px');
        p.style.setProperty('--magnet-y', '0px');
      });
    });
  }

  function renderProjects() {
    const projects = ProjectService.getRecentProjects();

    if (countEl) {
      countEl.textContent = projects.length === 0
        ? '0 projects'
        : `${projects.length} project${projects.length !== 1 ? 's' : ''}`;
    }

    const existingCards = projectList?.querySelectorAll('.db-project-folder-card');
    existingCards?.forEach(c => c.remove());

    if (emptyState) {
      emptyState.style.display = 'none';
    }

    // 1. Build and append "+ NEW PROJECT" Folder card
    const newCard = buildNewProjectFolderCard();
    projectList?.appendChild(newCard);

    // 2. Build and append Project Folder cards
    projects.forEach(p => {
      const card = buildProjectFolderCard(p);
      projectList?.appendChild(card);
    });
  }

  function buildNewProjectFolderCard() {
    const card = document.createElement('div');
    card.className = 'db-project-folder-card';

    card.innerHTML = `
      <div class="folder-wrapper">
        <div class="folder folder-create" tabindex="0" role="button" aria-label="Create new project">
          <div class="folder__back">
            <div class="paper paper-3">
              <i class="fi fi-br-plus"></i>
            </div>
            <div class="folder__front"></div>
            <div class="folder__front right"></div>
          </div>
        </div>
      </div>
      <div class="db-project-info-container">
        <span class="db-project-name">New Project</span>
        <span class="db-project-date">Create Fresh</span>
      </div>
    `;

    const folderEl = card.querySelector('.folder');
    folderEl.addEventListener('click', (e) => {
      e.stopPropagation();
      createAndOpenProject();
    });

    folderEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        createAndOpenProject();
      }
    });

    return card;
  }

  function buildProjectFolderCard(project) {
    const card = document.createElement('div');
    card.className = 'db-project-folder-card';
    card.setAttribute('data-project-id', project.id);

    const { primary, back } = getFolderColors(project.id);

    const d = new Date(project.lastModified);
    const dateStr = d.toLocaleDateString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    }).replace(/\//g, '/');

    card.innerHTML = `
      <div class="folder-wrapper" style="--folder-color: ${primary}; --folder-back-color: ${back};">
        <div class="folder" tabindex="0" role="button" aria-expanded="false" aria-label="Open folder for ${escHTML(project.name)}">
          <div class="folder__back">
            <div class="paper paper-1" title="Delete project">
              <i class="fi fi-br-trash"></i>
            </div>
            <div class="paper paper-2" title="Rename project">
              <i class="fi fi-br-edit"></i>
            </div>
            <div class="paper paper-3" title="Open project">
              <div class="paper-preview"></div>
              <button class="folder-open-overlay-btn" aria-label="Open Project">
                <i class="fi fi-br-play"></i>
              </button>
            </div>
            <div class="folder__front"></div>
            <div class="folder__front right"></div>
          </div>
        </div>
      </div>
      <div class="db-project-info-container">
        <div class="db-project-name-edit-wrap">
          <span class="db-project-name">${escHTML(project.name)}</span>
          <input type="text" class="db-project-rename-input hidden" value="${escHTML(project.name)}" maxlength="80" autocomplete="off" />
        </div>
        <span class="db-project-date">Modified ${dateStr}</span>
      </div>
    `;

    const folderEl = card.querySelector('.folder');
    const paper1 = card.querySelector('.paper-1');
    const paper2 = card.querySelector('.paper-2');
    const paper3 = card.querySelector('.paper-3');
    const nameSpan = card.querySelector('.db-project-name');
    const renameInput = card.querySelector('.db-project-rename-input');

    // Safely inject thumbnail
    const previewEl = card.querySelector('.paper-preview');
    if (previewEl) {
      if (project.thumbnail) {
        previewEl.innerHTML = project.thumbnail;
      } else {
        previewEl.innerHTML = '<i class="fi fi-br-paint-brush"></i>';
      }
    }

    // Click folder to open/close
    folderEl.addEventListener('click', (e) => {
      if (e.target && typeof e.target.closest === 'function') {
        if (e.target.closest('.paper-1') || e.target.closest('.paper-2') || e.target.closest('.paper-3')) {
          return;
        }
      }
      e.stopPropagation();
      const isOpen = folderEl.classList.contains('open');
      closeAllFolders();
      if (!isOpen) {
        folderEl.classList.add('open');
        folderEl.setAttribute('aria-expanded', 'true');
      } else {
        folderEl.classList.remove('open');
        folderEl.setAttribute('aria-expanded', 'false');
      }
    });

    // Double-click folder to open project
    folderEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      openProject(project.id);
    });

    // Keyboard Enter/Space
    folderEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (document.activeElement === folderEl) {
          e.preventDefault();
          folderEl.click();
        }
      }
    });

    // Magnet animation on hover of open papers
    const papers = [paper1, paper2, paper3];
    papers.forEach((paper, idx) => {
      paper.addEventListener('mousemove', (e) => {
        if (!folderEl.classList.contains('open')) return;
        const rect = paper.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const offsetX = (e.clientX - centerX) * 0.15;
        const offsetY = (e.clientY - centerY) * 0.15;
        paper.style.setProperty('--magnet-x', `${offsetX}px`);
        paper.style.setProperty('--magnet-y', `${offsetY}px`);
      });

      paper.addEventListener('mouseleave', () => {
        paper.style.setProperty('--magnet-x', '0px');
        paper.style.setProperty('--magnet-y', '0px');
      });
    });

    // Action 1: Delete Project
    paper1.addEventListener('click', (e) => {
      e.stopPropagation();
      showConfirmModal(
        'Delete Project',
        `Are you sure you want to delete "${project.name}"? This action cannot be undone.`,
        () => {
          deleteProject(project.id, card);
        }
      );
    });

    // Action 2: Show Rename Box
    paper2.addEventListener('click', (e) => {
      e.stopPropagation();
      nameSpan.classList.add('hidden');
      renameInput.classList.remove('hidden');
      renameInput.focus();
      renameInput.select();
      folderEl.classList.remove('open');
      folderEl.setAttribute('aria-expanded', 'false');
    });

    // Inline Rename Handlers
    renameInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const newName = renameInput.value.trim();
        if (newName && newName !== project.name) {
          try {
            await ProjectService.renameProject(project.id, newName);
            nameSpan.textContent = newName;
            project.name = newName;
            showToast('Project renamed');
          } catch (err) {
            console.error(err);
            showToast('Failed to rename project', true);
          }
        }
        renameInput.classList.add('hidden');
        nameSpan.classList.remove('hidden');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        renameInput.value = project.name;
        renameInput.classList.add('hidden');
        nameSpan.classList.remove('hidden');
      }
    });

    renameInput.addEventListener('blur', () => {
      const newName = renameInput.value.trim();
      if (newName && newName !== project.name) {
        ProjectService.renameProject(project.id, newName).then(() => {
          nameSpan.textContent = newName;
          project.name = newName;
          showToast('Project renamed');
        }).catch((err) => {
          console.error(err);
        });
      }
      renameInput.classList.add('hidden');
      nameSpan.classList.remove('hidden');
    });

    // Action 3: Open Project
    paper3.addEventListener('click', (e) => {
      e.stopPropagation();
      openProject(project.id);
    });

    return card;
  }

  // ════════════════════════════════════════════
  // ACTIONS
  // ════════════════════════════════════════════

  function createAndOpenProject() {
    showNewProjectModal(router);
  }

  async function openProject(id) {
    try {
      const project = await ProjectService.openProject(id);
      if (!project) {
        showToast('Project not found', true);
        renderProjects();
        return;
      }
      router.navigate('workspace');
    } catch (err) {
      console.error(err);
      showToast('Failed to open project', true);
    }
  }

  function deleteProject(id, cardEl) {
    // Animate out
    cardEl.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    cardEl.style.opacity = '0';
    cardEl.style.transform = 'scale(0.8) translateY(10px)';
    setTimeout(async () => {
      try {
        cardEl.remove();
        await ProjectService.deleteProject(id);
        renderProjects();
        showToast('Project deleted');
      } catch (err) {
        console.error(err);
        showToast('Failed to delete project', true);
      }
    }, 250);
  }

  // ════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════

  function escHTML(s) {
    return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Render project list on every visit ───────
  renderProjects();

  // ── Re-render when projects change ───────────
  document.addEventListener('syncraft:projectCreated',  renderProjects);
  document.addEventListener('syncraft:projectDeleted',  renderProjects);
  document.addEventListener('syncraft:autosaved',       renderProjects);
  document.addEventListener('syncraft:projectsLoaded',  renderProjects);
}

// ─────────────────────────────────────────────
// New Project Modal  (exported for reuse)
// ─────────────────────────────────────────────

export function showNewProjectModal(router) {
  // Remove any existing modal
  document.getElementById('np-modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'np-modal-overlay';
  overlay.innerHTML = `
    <div class="np-modal" id="np-modal-card" role="dialog" aria-modal="true" aria-labelledby="np-modal-title">
      <div class="np-modal-header">
        <div class="np-modal-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
            <line x1="12" y1="12" x2="12" y2="18"/>
            <line x1="9" y1="15" x2="15" y2="15"/>
          </svg>
        </div>
        <div>
          <h2 class="np-modal-title" id="np-modal-title">New Project</h2>
          <p class="np-modal-subtitle">Give your project a name to get started</p>
        </div>
      </div>

      <div class="np-modal-body">
        <label class="np-label" for="np-name-input">Project Name</label>
        <div class="np-input-wrap">
          <input
            id="np-name-input"
            class="np-input"
            type="text"
            placeholder="e.g. Brand Identity 2025"
            maxlength="80"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
      </div>

      <div class="np-modal-footer">
        <button class="np-btn np-btn-cancel" id="np-cancel-btn">Cancel</button>
        <button class="np-btn np-btn-create" id="np-create-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Create Project
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Auto-focus the input after animation frame
  requestAnimationFrame(() => {
    document.getElementById('np-name-input')?.focus();
  });

  // ── Helpers ───────────────────────────────────
  function close() {
    const card = document.getElementById('np-modal-card');
    if (card) {
      card.style.animation = 'npModalOut 0.18s ease forwards';
    }
    overlay.style.animation = 'npOverlayOut 0.2s ease forwards';
    setTimeout(() => overlay.remove(), 200);
  }

  function create() {
    const input = document.getElementById('np-name-input');
    const name  = (input?.value ?? '').trim() || 'Untitled Project';
    close();
    setTimeout(() => {
      try {
        ProjectService.createProject(name);
        router.navigate('workspace');
      } catch (err) {
        console.error('Failed to create project:', err);
      }
    }, 180);
  }

  // ── Event wiring ──────────────────────────────
  document.getElementById('np-create-btn').addEventListener('click', create);
  document.getElementById('np-cancel-btn').addEventListener('click', close);

  // Click outside to close
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  // Keyboard shortcuts
  document.getElementById('np-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter')  { e.preventDefault(); create(); }
    if (e.key === 'Escape') { e.preventDefault(); close();  }
  });
}
