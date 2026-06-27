import authService from './authService.js?v=2.0.5';
import { showToast, openModal, SYNCRAFT_LOGO_SVG } from './utils.js';
import { initOnboarding } from './onboarding.js';

class MainLayout {
  constructor() {
    this.headerEl = null;
    this.router = null;
    this.currentRoute = null;

    // Listen for auth changes to re-render the header dynamically
    document.addEventListener('syncraft:authChange', () => {
      if (this.headerEl && this.router && this.currentRoute) {
        this.render(this.currentRoute, this.router);
      }
    });

    // Listen for setting changes (like updates to user metadata/plan) to refresh header greetings
    document.addEventListener('syncraft:settingChanged', () => {
      if (this.headerEl && this.router && this.currentRoute) {
        this.render(this.currentRoute, this.router);
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  // RENDER DYNAMIC GLOBAL HEADER
  // ══════════════════════════════════════════════════════════
  render(route, router, options = {}) {
    this.router = router;
    this.currentRoute = route;
    this.headerEl = document.getElementById('global-header');
    if (!this.headerEl) return;

    // Default class list
    this.headerEl.className = 'global-header';

    // Hide header on authentication views (login, signup, recovery)
    if (route && route.startsWith('auth/')) {
      this.headerEl.classList.add('hidden');
      return;
    } else {
      this.headerEl.classList.remove('hidden');
    }

    const authenticated = authService.isAuthenticated();
    const user = authService.getCurrentUser();

    // ── Build Header HTML by Current View Route ───────────────
    if (route === 'landing' || route === '' || route === '/') {
      this.headerEl.className = 'global-header global-header--landing';
      // 1. LANDING PAGE STATE
      this.headerEl.innerHTML = `
        <div class="landing-header-inner">
          <div class="landing-header-left">
            <span class="landing-header-logo" id="header-logo">${SYNCRAFT_LOGO_SVG}</span>
            <nav class="landing-header-nav">
              <a href="#features">Features <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1L4 4L7 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
              <a href="#pricing">Get Started <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1L4 4L7 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
              <a href="#faq">FAQ <svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1L4 4L7 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
              <a href="#/workspace">About Us</a>
            </nav>
          </div>
          <div class="landing-header-right" id="header-actions">
            ${authenticated 
              ? `
                <button class="btn-landing-dashboard" id="btn-header-dashboard">Dashboard</button>
                <div class="landing-header-avatar" id="btn-header-avatar" title="View Profile & Settings">
                  ${user && user.avatarUrl 
                    ? `<img class="avatar-img" src="${user.avatarUrl}" alt="Profile" />`
                    : `<i class="icon fi fi-br-user" style="font-size:15px;"></i>`
                  }
                </div>
              ` 
              : `
                <button class="btn-landing-signin" id="btn-header-login">Sign in</button>
              `
            }
            <button class="md-hidden" id="btn-header-mobile-menu" aria-label="Open Menu" style="background:none;border:none;color:#fff;cursor:pointer;padding:6px;display:flex;align-items:center;justify-content:center;">
              <i class="icon fi fi-br-menu" style="font-size:24px;"></i>
            </button>
          </div>
        </div>
      `;

      // Bind Landing specific buttons
      document.getElementById('btn-header-login')?.addEventListener('click', () => router.navigate('auth/login'));
      document.getElementById('btn-header-dashboard')?.addEventListener('click', () => router.navigate('dashboard'));
      document.getElementById('btn-header-avatar')?.addEventListener('click', () => router.navigate('settings?tab=profile'));
      document.getElementById('btn-header-mobile-menu')?.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('syncraft:openMobileMenu'));
      });

      // Bind Landing specific nav links (Features, Get Started, FAQ, About Us) in the header
      const headerNavLinks = this.headerEl.querySelectorAll('.landing-header-nav a');
      headerNavLinks.forEach((link) => {
        link.addEventListener('click', (e) => {
          const href = link.getAttribute('href') || '';
          if (href === '#/workspace' || link.textContent.trim().startsWith('About Us')) {
            e.preventDefault();
            this.showAboutModal();
            return;
          }
          if (href.startsWith('#')) {
            e.preventDefault();
            const target = document.getElementById(href.slice(1));
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      });

    } else if (route === 'dashboard') {
      // 2. DASHBOARD STATE
      const greeting = user && typeof user.email === 'string' ? `Hello, ${user.email.split('@')[0]}` : 'Your Projects';
      const userEmail = user?.email || '';
      const userInitial = userEmail ? userEmail[0].toUpperCase() : '?';
      const userPlan = user?.plan || 'Free';
      const isPremium = ['pro', 'professional', 'enterprise', 'enterprise unlimited'].includes(userPlan.toLowerCase());
      const planClass = isPremium ? 'avatar-plan-badge--pro' : 'avatar-plan-badge--free';

      this.headerEl.innerHTML = `
        <div class="global-header-left">
          <span class="global-header-logo" id="header-logo">${SYNCRAFT_LOGO_SVG}</span>
        </div>
        <div class="global-header-right">
          <span class="db-header-greeting" style="font-size:14px; font-weight:600; color:var(--color-on-surface-variant); margin-right:4px;">${greeting}</span>
          <div class="avatar-dropdown-wrapper" id="avatar-dropdown-wrapper">
            <div class="db-header-avatar" id="btn-header-avatar" title="Account Menu" aria-haspopup="true" aria-expanded="false">
              ${user && user.avatarUrl 
                ? `<img class="avatar-img" src="${user.avatarUrl}" alt="Profile" />`
                : `<span class="avatar-initial">${userInitial}</span>`
              }
            </div>
            <div class="avatar-dropdown-menu hidden" id="avatar-dropdown-menu" role="menu">
              <!-- User info block -->
              <div class="avatar-dropdown-user-info">
                <div class="avatar-dropdown-user-icon">
                  ${user && user.avatarUrl 
                    ? `<img class="avatar-img" src="${user.avatarUrl}" alt="Profile" />`
                    : userInitial
                  }
                </div>
                <div class="avatar-dropdown-user-details">
                  <span class="avatar-dropdown-email">${userEmail}</span>
                  <span class="avatar-plan-badge ${planClass}">${userPlan}</span>
                </div>
              </div>
              <div class="avatar-dropdown-divider"></div>
              <!-- Navigation links -->
              <button class="avatar-dropdown-item" id="avatar-menu-profile" role="menuitem">
                <i class="icon fi fi-br-user"></i>
                <span>Profile</span>
              </button>
              <button class="avatar-dropdown-item" id="avatar-menu-preferences" role="menuitem">
                <i class="icon fi fi-br-settings"></i>
                <span>Preferences</span>
              </button>
              <button class="avatar-dropdown-item" id="avatar-menu-subscription" role="menuitem">
                <i class="icon fi fi-br-bolt"></i>
                <span>Subscription</span>
              </button>
              <div class="avatar-dropdown-divider"></div>
              <!-- Logout -->
              <button class="avatar-dropdown-item avatar-dropdown-item--danger" id="avatar-menu-logout" role="menuitem">
                <i class="icon fi fi-br-sign-out-alt"></i>
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>
      `;

      // ── Avatar Dropdown Logic ───────────────────────────────
      const avatarBtn = document.getElementById('btn-header-avatar');
      const dropdownMenu = document.getElementById('avatar-dropdown-menu');

      const toggleDropdown = (e) => {
        e.stopPropagation();
        const isHidden = dropdownMenu.classList.contains('hidden');
        dropdownMenu.classList.toggle('hidden', !isHidden);
        avatarBtn.setAttribute('aria-expanded', String(isHidden));
      };

      const closeDropdown = () => {
        dropdownMenu.classList.add('hidden');
        avatarBtn?.setAttribute('aria-expanded', 'false');
      };

      avatarBtn?.addEventListener('click', toggleDropdown);

      document.addEventListener('click', closeDropdown);
      // Cleanup listener when header re-renders
      document.addEventListener('syncraft:authChange', closeDropdown, { once: true });

      document.getElementById('avatar-menu-profile')?.addEventListener('click', () => {
        closeDropdown();
        router.navigate('settings?tab=profile');
      });
      document.getElementById('avatar-menu-preferences')?.addEventListener('click', () => {
        closeDropdown();
        router.navigate('settings?tab=preferences');
      });
      document.getElementById('avatar-menu-subscription')?.addEventListener('click', () => {
        closeDropdown();
        router.navigate('settings?tab=subscription');
      });
      document.getElementById('avatar-menu-logout')?.addEventListener('click', () => {
        closeDropdown();
        authService.logout();
        showToast('Logged out successfully');
        router.navigate('');
      });

    } else if (route === 'workspace') {
      // 3. WORKSPACE STATE
      const creditsMax = user ? user.creditsMax : '—';
      const creditsUsed = user ? user.creditsUsed : '—';

      this.headerEl.innerHTML = `
        <div class="global-header-left">
          <span class="global-header-logo" id="header-logo">${SYNCRAFT_LOGO_SVG}</span>
          <div id="ws-project-meta" style="display:flex;align-items:center;gap:8px;margin-left:8px;padding-left:16px;border-left:1px solid var(--color-outline-dim);">
            <!-- Project meta auto-injected by workspace.js -->
          </div>
        </div>
        <div class="global-header-right" style="display:flex;align-items:center;gap:10px;">
          <div class="ws-credits-badge" id="btn-header-credits" style="background:var(--color-surface-container-high); border:1px solid var(--color-outline-dim); border-radius:999px; padding:7px 14px; font-size:11px; font-weight:700; color:var(--color-primary); display:inline-flex; align-items:center; gap:6px; cursor:pointer; height:34px; box-sizing:border-box;" title="View Tokens & Billing">
            <i class="icon fi fi-br-bolt" style="font-size:11px;color:var(--color-primary);"></i>
            <span id="ws-credits-text">${creditsUsed} / ${creditsMax} Tokens</span>
          </div>
          <div class="ws-zoom-dropdown-container" style="position:relative; display:inline-block;">
            <button class="workspace-header-btn-zoom" id="btn-header-zoom" style="background:var(--color-surface-container-high);border:1px solid var(--color-outline-dim);color:#fff;padding:0 12px;border-radius:999px;font-size:12px;font-weight:700;height:34px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;min-width:70px;justify-content:center;">
              <span id="ws-zoom-text">100%</span>
              <i class="icon fi fi-br-angle-small-down" style="font-size:12px; margin-top:2px;"></i>
            </button>
            <div class="zoom-dropdown-menu hidden" id="zoom-dropdown-menu" style="position:absolute; top:calc(100% + 6px); right:0; background:rgba(21, 21, 25, 0.95); border:1px solid var(--color-outline-dim); border-radius:8px; padding:6px; min-width:140px; display:flex; flex-direction:column; gap:4px; z-index:1001; backdrop-filter:blur(10px); box-shadow:0 4px 20px rgba(0,0,0,0.5);">
              <button class="zoom-menu-item" data-action="in" style="background:none;border:none;color:#fff;padding:8px 12px;border-radius:6px;text-align:left;font-size:12px;font-weight:500;cursor:pointer;display:flex;justify-content:space-between;align-items:center;width:100%;transition:background 0.15s;gap:12px;">
                <span>Zoom In</span>
                <span style="opacity:0.5; font-size:10px;">Ctrl +</span>
              </button>
              <button class="zoom-menu-item" data-action="out" style="background:none;border:none;color:#fff;padding:8px 12px;border-radius:6px;text-align:left;font-size:12px;font-weight:500;cursor:pointer;display:flex;justify-content:space-between;align-items:center;width:100%;transition:background 0.15s;gap:12px;">
                <span>Zoom Out</span>
                <span style="opacity:0.5; font-size:10px;">Ctrl -</span>
              </button>
              <button class="zoom-menu-item" data-action="fit" style="background:none;border:none;color:#fff;padding:8px 12px;border-radius:6px;text-align:left;font-size:12px;font-weight:500;cursor:pointer;display:flex;justify-content:space-between;align-items:center;width:100%;transition:background 0.15s;gap:12px;">
                <span>Zoom to Fit</span>
                <span style="opacity:0.5; font-size:10px;">Shift 1</span>
              </button>
              <div style="height:1px; background:var(--color-outline-dim); margin:4px 0;"></div>
              <button class="zoom-menu-item" data-action="50" style="background:none;border:none;color:#fff;padding:8px 12px;border-radius:6px;text-align:left;font-size:12px;font-weight:500;cursor:pointer;width:100%;transition:background 0.15s;display:flex;justify-content:flex-start;">50%</button>
              <button class="zoom-menu-item" data-action="100" style="background:none;border:none;color:#fff;padding:8px 12px;border-radius:6px;text-align:left;font-size:12px;font-weight:500;cursor:pointer;width:100%;transition:background 0.15s;display:flex;justify-content:flex-start;">100%</button>
              <button class="zoom-menu-item" data-action="200" style="background:none;border:none;color:#fff;padding:8px 12px;border-radius:6px;text-align:left;font-size:12px;font-weight:500;cursor:pointer;width:100%;transition:background 0.15s;display:flex;justify-content:flex-start;">200%</button>
            </div>
          </div>
          <button class="workspace-header-btn-share" id="btn-header-share" style="background:var(--color-surface-container-high);border:1px solid var(--color-outline-dim);color:#fff;padding:0 16px;border-radius:999px;font-size:12px;font-weight:700;height:34px;display:inline-flex;align-items:center;cursor:pointer;">Share</button>
          <div style="width:1px;height:20px;background:var(--color-outline-dim);margin:0 2px;"></div>
          <button id="btn-header-settings" style="width:34px;height:34px;border-radius:50%;background:var(--color-surface-container-high);border:1px solid var(--color-outline-dim);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:var(--color-on-surface-variant);transition:border-color 0.15s,color 0.15s;" title="Settings">
            <i class="icon fi fi-br-settings" style="font-size:15px;"></i>
          </button>
          <button id="btn-header-help" style="width:34px;height:34px;border-radius:50%;background:var(--color-surface-container-high);border:1px solid var(--color-outline-dim);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:var(--color-on-surface-variant);transition:border-color 0.15s,color 0.15s;" title="Help">
            <i class="icon fi fi-br-interrogation" style="font-size:15px;"></i>
          </button>
        </div>
      `;

      // Bind Workspace specific buttons
      document.getElementById('btn-header-credits')?.addEventListener('click', () => router.navigate('settings?tab=subscription'));
      document.getElementById('btn-header-settings')?.addEventListener('click', () => router.navigate('settings?tab=preferences'));
      
      // Bind zoom dropdown events
      const zoomBtn = document.getElementById('btn-header-zoom');
      const zoomMenu = document.getElementById('zoom-dropdown-menu');
      if (zoomBtn && zoomMenu) {
        zoomBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          zoomMenu.classList.toggle('hidden');
        });
        
        const hideZoomMenu = () => {
          zoomMenu.classList.add('hidden');
        };
        document.addEventListener('click', hideZoomMenu);
        
        zoomMenu.querySelectorAll('.zoom-menu-item').forEach(item => {
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = item.getAttribute('data-action');
            if (action) {
              document.dispatchEvent(new CustomEvent('syncraft:zoomAction', { detail: { action } }));
            }
            zoomMenu.classList.add('hidden');
          });
        });
      }
      
      // Update displayed zoom level
      document.addEventListener('syncraft:zoomLevelChanged', (e) => {
        const zoomTextEl = document.getElementById('ws-zoom-text');
        if (zoomTextEl && e.detail && typeof e.detail.zoom !== 'undefined') {
          zoomTextEl.textContent = `${Math.round(e.detail.zoom * 100)}%`;
        }
      });

      // Dispatch custom events for workspace hooks to capture
      document.getElementById('btn-header-share')?.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('syncraft:headerShare'));
      });

      document.getElementById('btn-header-help')?.addEventListener('click', () => {
        initOnboarding(true);
      });

    } else if (route === 'settings') {
      // 4. SETTINGS STATE
      this.headerEl.innerHTML = `
        <div class="global-header-left">
          <span class="global-header-logo" id="header-logo">${SYNCRAFT_LOGO_SVG}</span>
          <span style="opacity:0.3;color:#fff;font-size:16px;">/</span>
          <span class="global-header-subtitle">Settings</span>
        </div>
        <div class="global-header-right">
          <button class="settings-header-back" id="btn-header-exit-settings">
            <i class="icon fi fi-br-arrow-left" style="font-size:12px;"></i>
            Exit Settings
          </button>
        </div>
      `;

      // Bind Settings specific buttons
      document.getElementById('btn-header-exit-settings')?.addEventListener('click', () => {
        const prev = router.previousRoute || 'dashboard';
        router.navigate(prev);
      });
    }

    // ── Bind Unified Logo Navigation Event ─────────────────────
    const logoEl = document.getElementById('header-logo');
    if (logoEl) {
      logoEl.addEventListener('click', () => {
        router.navigate('');
      });
    }
  }

  showAboutModal() {
    openModal('About Syncraft', `
      <p style="margin-bottom:16px;">
        <strong style="color:var(--color-primary);">Syncraft</strong> is an AI-powered vector design system built for creators who demand speed, precision, and total creative control.
      </p>
      <p style="margin-bottom:16px;">
        Born out of the belief that design tools should augment — not replace — human creativity, we combine state-of-the-art generative AI with a clean, developer-friendly interface.
      </p>
      <p>
        Our mission: make production-ready SVG artwork accessible to every designer, developer, and brand.
      </p>
      <div style="margin-top:28px; padding-top:24px; border-top:1px solid var(--color-outline-dim); display:flex; gap:12px; flex-wrap:wrap;">
        <span style="padding:6px 16px; border-radius:999px; background:var(--color-surface-container-high); font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-primary);">Version 0.4.9 Beta</span>
        <span style="padding:6px 16px; border-radius:999px; background:var(--color-surface-container-high); font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:#fff;">San Francisco, CA</span>
      </div>
    `);
  }
}

const mainLayout = new MainLayout();
export default mainLayout;
