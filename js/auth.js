import authService from './authService.js?v=2.0.5';
import { showToast, SYNCRAFT_LOGO_SVG } from './utils.js';

export function initAuthView(router) {
  const container = document.getElementById('auth-view');
  if (!container) return;

  // Render the split-screen auth layout
  container.innerHTML = `
    <div class="auth-split-layout">

      <!-- ── LEFT: BRAND PANEL ─────────────────── -->
      <div class="auth-brand-panel">
        <!-- Back to home link -->
        <a href="#/" class="auth-brand-logo">${SYNCRAFT_LOGO_SVG}</a>

        <!-- Hero graphic -->
        <div class="auth-hero-graphic">
          <img src="2222.jpg" alt="Syncraft vector art preview" class="auth-hero-img" />
          <!-- Glowing orb behind image -->
          <div class="auth-hero-glow"></div>
          <!-- Floating decorative SVG nodes -->
          <div class="auth-node auth-node-1"></div>
          <div class="auth-node auth-node-2"></div>
          <div class="auth-node auth-node-3"></div>
        </div>

        <!-- Bottom tagline area -->
        <div class="auth-brand-tagline">
          <p class="auth-brand-eyebrow">Syncraft AI Design System</p>
          <h1 class="auth-brand-headline">Design.<br>Vector.<br>Export.</h1>
          <p class="auth-brand-body">Generate production-ready SVG vector artwork from text prompts or reference images in seconds.</p>
        </div>

        <!-- Bottom decorative ticker -->
        <div class="auth-brand-ticker">
          <span>SVG</span><span class="auth-ticker-dot">•</span>
          <span>PDF</span><span class="auth-ticker-dot">•</span>
          <span>EPS</span><span class="auth-ticker-dot">•</span>
          <span>PNG</span><span class="auth-ticker-dot">•</span>
          <span>AI POWERED</span><span class="auth-ticker-dot">•</span>
          <span>VECTORS</span>
        </div>
      </div>

      <!-- ── RIGHT: FORM PANEL ──────────────────── -->
      <div class="auth-form-panel">
        <!-- Inner scrollable area -->
        <div class="auth-form-inner">

          <!-- Logo (mobile only, hidden on desktop since left panel shows it) -->
          <a href="#/" class="auth-form-logo-mobile">${SYNCRAFT_LOGO_SVG}</a>

          <!-- Forms Card -->
          <div class="auth-form-card">

            <!-- 1. LOGIN FORM -->
            <form id="auth-login-form" class="auth-form">
              <div class="auth-form-header">
                <h2 class="auth-title">Welcome Back</h2>
                <p class="auth-subtitle">Sign in to your Syncraft workspace</p>
              </div>

              <button type="button" class="auth-google-btn login-google-btn">
                <svg viewBox="0 0 24 24" width="18" height="18">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Continue with Google
              </button>

              <div class="auth-divider"><span>or continue with email</span></div>

              <div class="auth-input-group">
                <label for="login-email">Email Address</label>
                <input type="email" id="login-email" required placeholder="name@example.com">
              </div>

              <div class="auth-input-group">
                <div class="auth-label-row">
                  <label for="login-password">Password</label>
                  <a href="#/auth/recovery" class="auth-link-alt">Forgot Password?</a>
                </div>
                <div class="auth-input-with-icon">
                  <input type="password" id="login-password" required placeholder="••••••••">
                  <button type="button" class="auth-pw-toggle" id="login-pw-toggle" tabindex="-1" aria-label="Show password">
                    <i class="icon fi fi-br-eye"></i>
                  </button>
                </div>
              </div>

              <button type="submit" class="auth-submit-btn">
                <span>Log In</span>
                <i class="icon fi fi-br-arrow-right"></i>
              </button>

              <p class="auth-switch-prompt">
                Don't have an account? <a href="#/auth/signup" class="auth-link">Create one free</a>
              </p>
            </form>

            <!-- 2. SIGN UP FORM -->
            <form id="auth-signup-form" class="auth-form hidden">
              <div class="auth-form-header">
                <h2 class="auth-title">Create Account</h2>
                <p class="auth-subtitle">Initialize your Syncraft profile</p>
              </div>

              <button type="button" class="auth-google-btn signup-google-btn">
                <svg viewBox="0 0 24 24" width="18" height="18">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                Continue with Google
              </button>

              <div class="auth-divider"><span>or continue with email</span></div>

              <div class="auth-input-group">
                <label for="signup-email">Email Address</label>
                <input type="email" id="signup-email" required placeholder="name@example.com">
              </div>

              <div class="auth-input-group">
                <label for="signup-password">Password <span style="font-weight:400;opacity:0.6;">(min. 6 characters)</span></label>
                <div class="auth-input-with-icon">
                  <input type="password" id="signup-password" required placeholder="••••••••" minlength="6">
                  <button type="button" class="auth-pw-toggle" id="signup-pw-toggle" tabindex="-1" aria-label="Show password">
                    <i class="icon fi fi-br-eye"></i>
                  </button>
                </div>
              </div>

              <button type="submit" class="auth-submit-btn">
                <span>Create Account</span>
                <i class="icon fi fi-br-arrow-right"></i>
              </button>

              <p class="auth-switch-prompt">
                Already have an account? <a href="#/auth/login" class="auth-link">Log In</a>
              </p>
            </form>

            <!-- 3. RECOVERY FORM -->
            <form id="auth-recovery-form" class="auth-form hidden">
              <div class="auth-form-header">
                <h2 class="auth-title">Reset Password</h2>
                <p class="auth-subtitle">We'll send a secure reset link to your inbox</p>
              </div>

              <div class="auth-input-group">
                <label for="recovery-email">Email Address</label>
                <input type="email" id="recovery-email" required placeholder="name@example.com">
              </div>

              <button type="submit" class="auth-submit-btn">
                <span>Send Reset Link</span>
                <i class="icon fi fi-br-paper-plane"></i>
              </button>

              <p class="auth-switch-prompt">
                Remember your password? <a href="#/auth/login" class="auth-link">Log In</a>
              </p>
            </form>

          </div><!-- /auth-form-card -->
        </div><!-- /auth-form-inner -->
      </div><!-- /auth-form-panel -->

    </div><!-- /auth-split-layout -->
  `;

  const loginForm = document.getElementById('auth-login-form');
  const signupForm = document.getElementById('auth-signup-form');
  const recoveryForm = document.getElementById('auth-recovery-form');

  // Helper to toggle views
  function showForm(formId) {
    [loginForm, signupForm, recoveryForm].forEach(f => {
      if (f.id === formId) {
        f.classList.remove('hidden');
      } else {
        f.classList.add('hidden');
      }
    });
  }

  // Handle routing internally depending on hash sub-route
  router.updateAuthSubRoute = function (hash) {
    if (hash === 'auth/signup') {
      showForm('auth-signup-form');
    } else if (hash === 'auth/recovery') {
      showForm('auth-recovery-form');
    } else {
      showForm('auth-login-form');
    }
  };

  // ── Form Submissions ────────────────────────
  
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;

    try {
      await authService.login(email, pass);
      showToast('Logged in successfully');
      router.navigate('dashboard');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signup-email').value;
    const pass = document.getElementById('signup-password').value;

    try {
      await authService.signUp(email, pass);
      showToast('Account created successfully');
      router.navigate('dashboard');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  recoveryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('recovery-email').value;

    try {
      await authService.recoverPassword(email);
      showToast('Password reset link sent');
      router.navigate('auth/login');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  const handleGoogleLogin = async () => {
    try {
      await authService.loginWithGoogle();
    } catch (err) {
      showToast(err.message, true);
    }
  };

  const loginGoogleBtn = container.querySelector('.login-google-btn');
  const signupGoogleBtn = container.querySelector('.signup-google-btn');
  if (loginGoogleBtn) loginGoogleBtn.addEventListener('click', handleGoogleLogin);
  if (signupGoogleBtn) signupGoogleBtn.addEventListener('click', handleGoogleLogin);

  // ── Password Toggle Visibility ──────────────
  function bindPasswordToggle(toggleId, inputId) {
    const btn = document.getElementById(toggleId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;
    btn.addEventListener('click', () => {
      const isText = input.type === 'text';
      input.type = isText ? 'password' : 'text';
      const icon = btn.querySelector('i');
      if (icon) {
        icon.className = isText ? 'icon fi fi-br-eye' : 'icon fi fi-br-eye-crossed';
      }
    });
  }

  bindPasswordToggle('login-pw-toggle', 'login-password');
  bindPasswordToggle('signup-pw-toggle', 'signup-password');
}

import { openModal } from './utils.js';

export function showSettingsModal(initialTab = 'general', showGeneral = true) {
  if (typeof initialTab !== 'string') {
    initialTab = 'general';
  }
  let activeTab = showGeneral ? initialTab : 'profile';
  
  function render() {
    const user = authService.getCurrentUser();
    if (!user) {
      showToast('Please log in to view settings', true);
      return;
    }

    const modalTitle = 'Account & Settings';
    
    // Tab HTML template
    const tabsHTML = `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <!-- Tabs Nav -->
        <div style="display:flex; border-bottom:1px solid var(--color-outline-dim); padding-bottom:8px; gap:16px;">
          ${showGeneral ? `
            <span id="tab-btn-general" style="cursor:pointer; font-weight:700; font-size:12px; text-transform:uppercase; letter-spacing:0.05em; padding-bottom:6px; color:${activeTab === 'general' ? 'var(--color-primary)' : 'var(--color-on-surface-variant)'}; border-bottom:2px solid ${activeTab === 'general' ? 'var(--color-primary)' : 'transparent'}; transition:color 0.15s;">Settings</span>
          ` : ''}
          <span id="tab-btn-profile" style="cursor:pointer; font-weight:700; font-size:12px; text-transform:uppercase; letter-spacing:0.05em; padding-bottom:6px; color:${activeTab === 'profile' ? 'var(--color-primary)' : 'var(--color-on-surface-variant)'}; border-bottom:2px solid ${activeTab === 'profile' ? 'var(--color-primary)' : 'transparent'}; transition:color 0.15s;">Profile</span>
          <span id="tab-btn-billing" style="cursor:pointer; font-weight:700; font-size:12px; text-transform:uppercase; letter-spacing:0.05em; padding-bottom:6px; color:${activeTab === 'billing' ? 'var(--color-primary)' : 'var(--color-on-surface-variant)'}; border-bottom:2px solid ${activeTab === 'billing' ? 'var(--color-primary)' : 'transparent'}; transition:color 0.15s;">Subscription</span>
        </div>
        
        <!-- Tab Content -->
        <div id="settings-tab-content">
          ${renderTabContent(user)}
        </div>
      </div>
    `;

    openModal(modalTitle, tabsHTML);

    // Bind Tab Click Handlers
    setTimeout(() => {
      const btnGen = document.getElementById('tab-btn-general');
      const btnProf = document.getElementById('tab-btn-profile');
      const btnBill = document.getElementById('tab-btn-billing');

      if (btnGen) btnGen.addEventListener('click', () => { activeTab = 'general'; render(); });
      if (btnProf) btnProf.addEventListener('click', () => { activeTab = 'profile'; render(); });
      if (btnBill) btnBill.addEventListener('click', () => { activeTab = 'billing'; render(); });

      // Bind upgrade actions
      document.querySelectorAll('.plan-upgrade-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const plan = btn.getAttribute('data-plan');
          btn.disabled = true;
          btn.textContent = 'Upgrading...';
          
          // Simulate Stripe payment checkout delay
          setTimeout(() => {
            try {
              authService.upgradeSubscription(plan);
              showToast(`Subscription upgraded to ${plan}!`);
              render();
            } catch (err) {
              showToast(err.message, true);
              btn.disabled = false;
              btn.textContent = 'Upgrade';
            }
          }, 1200);
        });
      });

      // Bind General Settings select box changes (saving to localStorage persistence)
      const fmtSel = document.getElementById('opt-export-fmt');
      const modelSel = document.getElementById('opt-ai-model');
      const autosaveSel = document.getElementById('opt-autosave');

      if (fmtSel) {
        fmtSel.value = localStorage.getItem('syncraft_opt_format') || 'SVG';
        fmtSel.addEventListener('change', (e) => {
          localStorage.setItem('syncraft_opt_format', e.target.value);
          // Trigger custom event so workspace knows to update formats
          document.dispatchEvent(new CustomEvent('syncraft:settingChanged', { detail: { key: 'format', val: e.target.value } }));
        });
      }

      if (modelSel) {
        modelSel.value = localStorage.getItem('syncraft_opt_model') || 'Syncraft v1 (Fast)';
        modelSel.addEventListener('change', (e) => {
          localStorage.setItem('syncraft_opt_model', e.target.value);
        });
      }

      if (autosaveSel) {
        autosaveSel.value = localStorage.getItem('syncraft_opt_autosave') || '2 seconds';
        autosaveSel.addEventListener('change', (e) => {
          localStorage.setItem('syncraft_opt_autosave', e.target.value);
          document.dispatchEvent(new CustomEvent('syncraft:settingChanged', { detail: { key: 'autosave', val: e.target.value } }));
        });
      }

      const shortcutsBtn = document.getElementById('opt-view-shortcuts');
      if (shortcutsBtn) {
        shortcutsBtn.addEventListener('click', () => {
          alert('Ctrl+G: Generate\nCtrl+S: Save\nCtrl+E: Export\nEsc: Close');
        });
      }
    }, 50);
  }

  function renderTabContent(user) {
    if (activeTab === 'general') {
      return `
        <div style="display:flex;flex-direction:column;gap:0;">
          ${settingRow('Auto-export format', `<select id="opt-export-fmt" style="background:var(--color-surface-container-highest);border:1px solid var(--color-outline-dim);border-radius:0.4rem;color:#fff;padding:8px 12px;font-size:13px;cursor:pointer;outline:none;"><option>SVG</option><option>PNG</option><option>PDF</option></select>`)}
          ${settingRow('AI Model', `<select id="opt-ai-model" style="background:var(--color-surface-container-highest);border:1px solid var(--color-outline-dim);border-radius:0.4rem;color:#fff;padding:8px 12px;font-size:13px;cursor:pointer;outline:none;"><option>Syncraft v1 (Fast)</option><option>Syncraft v2 (Quality)</option></select>`)}
          ${settingRow('Autosave', `<select id="opt-autosave" style="background:var(--color-surface-container-highest);border:1px solid var(--color-outline-dim);border-radius:0.4rem;color:#fff;padding:8px 12px;font-size:13px;cursor:pointer;outline:none;"><option>2 seconds</option><option>5 seconds</option><option>Off</option></select>`)}
          ${settingRow('Shortcuts', `<span style="color:var(--color-primary);font-size:13px;font-weight:700;cursor:pointer;" id="opt-view-shortcuts">View →</span>`)}
        </div>
      `;
    }

    if (activeTab === 'profile') {
      const pct = (user.creditsUsed / user.creditsMax) * 100;
      const historyRows = user.history.length === 0
        ? `<div style="font-size:12px;color:var(--color-on-surface-variant);text-align:center;padding:12px;">No activity logged yet.</div>`
        : user.history.slice(0, 5).map(h => `
            <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:12px;border-bottom:1px solid rgba(255,255,255,0.05);">
              <span style="color:#fff;font-weight:600;">${h.type}</span>
              <span style="color:var(--color-on-surface-variant);text-overflow:ellipsis;white-space:nowrap;overflow:hidden;max-width:180px;">${h.desc}</span>
              <span style="color:rgba(255,255,255,0.3);font-size:11px;">${new Date(h.date).toLocaleDateString()}</span>
            </div>
          `).join('');

      return `
        <div style="display:flex;flex-direction:column;gap:16px;margin-top:8px;">
          <div>
            <div style="font-size:10px;font-weight:700;color:var(--color-on-surface-variant);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Email Account</div>
            <div style="color:#fff;font-weight:600;font-size:14px;">${user.email}</div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:700;color:var(--color-on-surface-variant);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">
              <span>Usage (Credits)</span>
              <span style="color:var(--color-primary);">${user.creditsUsed} / ${user.creditsMax} Quota</span>
            </div>
            <!-- Progress Bar -->
            <div style="width:100%;height:8px;background:rgba(255,255,255,0.1);border-radius:99px;overflow:hidden;">
              <div style="width:${Math.min(pct, 100)}%;height:100%;background:var(--color-primary);border-radius:99px;transition:width 0.3s ease;"></div>
            </div>
          </div>
          <div style="margin-top:8px;">
            <div style="font-size:10px;font-weight:700;color:var(--color-on-surface-variant);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;border-bottom:1px solid var(--color-outline-dim);padding-bottom:4px;">Usage History (Recent)</div>
            <div style="display:flex;flex-direction:column;">
              ${historyRows}
            </div>
          </div>
        </div>
      `;
    }

    if (activeTab === 'billing') {
      const plans = [
        { name: 'Starter', price: '₱0', desc: 'Essential operators', limit: '15 credits (free trial)' },
        { name: 'Professional', price: '₱150+', desc: 'Active environments', limit: '100 - 750 credits/mo' }
      ];

      const cardsHTML = plans.map(p => {
        const isCurrent = user.plan.toLowerCase() === p.name.toLowerCase();
        let btnHTML = '';
        if (isCurrent) {
          btnHTML = `<button style="width:100%;padding:8px 16px;border-radius:999px;background:rgba(255,255,255,0.1);color:#fff;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border:none;cursor:default;">Current Plan</button>`;
        } else {
          btnHTML = `<button class="plan-upgrade-btn" data-plan="${p.name}" style="width:100%;padding:8px 16px;border-radius:999px;background:var(--color-primary);color:#000;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border:none;cursor:pointer;transition:all 0.15s;">Upgrade</button>`;
        }

        return `
          <div style="flex:1;min-width:130px;background:var(--color-surface-container-high);border:1px solid ${isCurrent ? 'var(--color-primary)' : 'var(--color-outline-dim)'};border-radius:12px;padding:16px;display:flex;flex-direction:column;justify-content:between;gap:10px;">
            <div style="font-weight:800;font-size:13px;color:#fff;text-transform:uppercase;letter-spacing:-0.02em;">${p.name}</div>
            <div style="font-size:20px;font-weight:800;color:${isCurrent ? 'var(--color-primary)' : '#fff'};">${p.price}<span style="font-size:11px;font-weight:500;color:var(--color-on-surface-variant);text-transform:none;">${p.price !== 'Custom' ? '/mo' : ''}</span></div>
            <div style="font-size:11px;color:var(--color-on-surface-variant);line-height:1.4;">${p.limit}</div>
            <div style="margin-top:auto;padding-top:8px;">
              ${btnHTML}
            </div>
          </div>
        `;
      }).join('');

      return `
        <div style="display:flex;flex-direction:column;gap:16px;margin-top:8px;">
          <div style="font-size:10px;font-weight:700;color:var(--color-on-surface-variant);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">Select Subscription Plan</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            ${cardsHTML}
          </div>
        </div>
      `;
    }
  }

  function settingRow(label, ctrl) {
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid var(--color-outline-dim);"><span style="font-size:14px;color:#fff;font-weight:600;">${label}</span>${ctrl}</div>`;
  }

  render();
}
