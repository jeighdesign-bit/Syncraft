import authService from './authService.js?v=2.0.5';
import { showToast, showConfirmModal } from './utils.js';

export function initSettingsPage(router, hash) {
  const container = document.getElementById('settings-view');
  if (!container) return;

  // ── Parse Tab Query Param ────────────────────────────────
  const urlParams = new URLSearchParams(hash.includes('?') ? hash.substring(hash.indexOf('?')) : '');
  let activeTab = urlParams.get('tab') || 'profile';
  let initialProBudget = parseInt(urlParams.get('pro_budget') || '899');

  // Validate activeTab
  const validTabs = ['profile', 'preferences', 'subscription'];
  if (!validTabs.includes(activeTab)) {
    activeTab = 'profile';
  }

  renderLayout();

  // ══════════════════════════════════════════════════════════
  // RENDER MAIN LAYOUT
  // ══════════════════════════════════════════════════════════
  function renderLayout() {
    const user = authService.getCurrentUser();
    if (!user) {
      showToast('Please log in to view settings', true);
      router.navigate('auth/login');
      return;
    }

    container.innerHTML = `
      <div class="settings-page">
        <!-- 2. Nav tabs -->
        <div class="settings-nav-bar">
          <div class="settings-tabs">
            <button class="settings-tab-btn ${activeTab === 'profile' ? 'active' : ''}" data-tab="profile">
              Profile
            </button>
            <button class="settings-tab-btn ${activeTab === 'preferences' ? 'active' : ''}" data-tab="preferences">
              Preferences
            </button>
            <button class="settings-tab-btn ${activeTab === 'subscription' ? 'active' : ''}" data-tab="subscription">
              Subscription
            </button>
          </div>
        </div>

        <!-- 3. Page Content -->
        <main class="settings-main">
          <div class="settings-content-wrap" id="settings-panel-container">
            <!-- Rendered Tab Content goes here -->
          </div>
        </main>
      </div>
    `;

    // Bind tab headers
    const tabBtns = container.querySelectorAll('.settings-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.getAttribute('data-tab');
        activeTab = tab;
        router.navigate(`settings?tab=${tab}`);
      });
    });

    renderTabContent();
  }

  // ══════════════════════════════════════════════════════════
  // RENDER TAB PANEL CONTENT
  // ══════════════════════════════════════════════════════════
  function renderTabContent() {
    const panelContainer = document.getElementById('settings-panel-container');
    if (!panelContainer) return;

    const user = authService.getCurrentUser();
    if (!user) return;

    if (activeTab === 'profile') {
      const metadata = authService.getUserMetadata();
      
      panelContainer.innerHTML = `
        <div class="settings-tab-panel">
          <!-- Card 1: Account Details -->
          <div class="settings-card">
            <div class="settings-card-info">
              <h2 class="settings-card-title">Account Details</h2>
              <p class="settings-card-desc">Update your personal identification information and account details.</p>
            </div>
            <div class="settings-card-body">
              <div class="settings-input-group">
                <label class="settings-label" for="profile-email">Email Address</label>
                <div class="settings-input-wrap">
                  <input class="settings-input" id="profile-email" type="email" value="${user.email}" disabled />
                  <span class="settings-input-icon" title="Your login email cannot be changed"><i class="icon fi fi-br-lock"></i></span>
                </div>
              </div>

              <div class="settings-input-group">
                <label class="settings-label" for="profile-name">Full Name</label>
                <input class="settings-input" id="profile-name" type="text" placeholder="e.g. John Doe" value="${metadata.name || ''}" />
              </div>

              <div class="settings-input-group">
                <label class="settings-label" for="profile-username">Username</label>
                <input class="settings-input" id="profile-username" type="text" placeholder="e.g. johndoe" value="${metadata.username || ''}" />
              </div>

              <div class="settings-btn-row">
                <button class="settings-btn settings-btn-primary" id="btn-save-profile">Save Details</button>
              </div>
            </div>
          </div>

          <!-- Card 2: Session -->
          <div class="settings-card">
            <div class="settings-card-info">
              <h2 class="settings-card-title">Session</h2>
              <p class="settings-card-desc">Manage your current active session on this device.</p>
            </div>
            <div class="settings-card-body">
              <div class="settings-btn-row">
                <button class="settings-btn settings-btn-secondary" id="btn-settings-logout">Log Out</button>
              </div>
            </div>
          </div>

          <!-- Card 3: Danger Zone -->
          <div class="settings-card danger-zone-card">
            <div class="settings-card-info">
              <h2 class="settings-card-title" style="color:#ef4444;">Danger Zone</h2>
              <p class="settings-card-desc">Irreversible account operations. Take caution before performing these actions.</p>
            </div>
            <div class="settings-card-body">
              <div class="danger-box">
                <span class="danger-box-title">Delete User Account</span>
                <p class="danger-box-text">Once you delete your account, there is no going back. All saved projects and assets will be permanently removed from our databases.</p>
                <button class="settings-btn settings-btn-danger" id="btn-delete-account">Delete Account</button>
              </div>
            </div>
          </div>
        </div>
      `;

      // Bind Profile save action
      document.getElementById('btn-save-profile')?.addEventListener('click', async (e) => {
        const btn = e.target;
        const nameVal = document.getElementById('profile-name').value.trim();
        const usernameVal = document.getElementById('profile-username').value.trim();

        if (!nameVal || !usernameVal) {
          showToast('Please enter both name and username', true);
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
          await authService.updateUserMetadata(nameVal, usernameVal);
          showToast('Profile details updated successfully');
        } catch (err) {
          showToast('Failed to update details: ' + err.message, true);
        } finally {
          btn.disabled = false;
          btn.textContent = 'Save Details';
        }
      });

      // Bind Log Out action
      document.getElementById('btn-settings-logout')?.addEventListener('click', async () => {
        try {
          await authService.logout();
          showToast('Logged out successfully');
          router.navigate('');
        } catch (err) {
          showToast('Failed to log out: ' + err.message, true);
        }
      });

      // Bind Delete Account action
      document.getElementById('btn-delete-account')?.addEventListener('click', () => {
        showConfirmModal(
          'Delete Account',
          'WARNING: Are you absolutely sure you want to delete your account? This action is permanent and cannot be undone.',
          () => {
            const doubleConfirm = prompt('Please type DELETE to confirm account deletion:');
            if (doubleConfirm !== 'DELETE') {
              showToast('Account deletion aborted. Confirmation text did not match.', true);
              return;
            }

            (async () => {
              try {
                await authService.deleteAccount();
                showToast('Your account was successfully deleted');
                router.navigate('');
              } catch (err) {
                showToast('Error deleting account: ' + err.message, true);
              }
            })();
          }
        );
      });

    } else if (activeTab === 'preferences') {
      panelContainer.innerHTML = `
        <div class="settings-tab-panel">
          <div class="settings-card">
            <div class="settings-card-info">
              <h2 class="settings-card-title">Preferences</h2>
              <p class="settings-card-desc">Configure your global application behaviors, default models, and export configurations.</p>
            </div>
            <div class="settings-card-body">
              <div class="settings-input-group">
                <label class="settings-label" for="pref-model">Default AI Model</label>
                <select class="settings-select" id="pref-model">
                  <option value="Syncraft v1 (Fast)">Syncraft v1 (Fast)</option>
                  <option value="Syncraft v2 (Quality)">Syncraft v2 (Quality)</option>
                </select>
              </div>

              <div class="settings-input-group">
                <label class="settings-label" for="pref-format">Default Export Format</label>
                <select class="settings-select" id="pref-format">
                  <option value="SVG">SVG</option>
                  <option value="PNG">PNG</option>
                  <option value="JPEG">JPEG</option>
                  <option value="PDF">PDF</option>
                </select>
              </div>

              <div class="settings-input-group">
                <label class="settings-label" for="pref-autosave">Autosave Interval</label>
                <select class="settings-select" id="pref-autosave">
                  <option value="2 seconds">2 seconds</option>
                  <option value="5 seconds">5 seconds</option>
                  <option value="Off">Off</option>
                </select>
              </div>

              <div class="settings-btn-row">
                <button class="settings-btn settings-btn-primary" id="btn-save-preferences">Save Preferences</button>
              </div>
            </div>
          </div>
        </div>
      `;

      // Prefill Preferences selectors from LocalStorage
      const prefModel = document.getElementById('pref-model');
      const prefFormat = document.getElementById('pref-format');
      const prefAutosave = document.getElementById('pref-autosave');

      if (prefModel) prefModel.value = localStorage.getItem('syncraft_opt_model') || 'Syncraft v1 (Fast)';
      if (prefFormat) prefFormat.value = localStorage.getItem('syncraft_opt_format') || 'SVG';
      if (prefAutosave) prefAutosave.value = localStorage.getItem('syncraft_opt_autosave') || '2 seconds';

      // Bind Preferences save action
      document.getElementById('btn-save-preferences')?.addEventListener('click', (e) => {
        const btn = e.target;
        const modelVal = prefModel.value;
        const formatVal = prefFormat.value;
        const autosaveVal = prefAutosave.value;

        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
          localStorage.setItem('syncraft_opt_model', modelVal);
          localStorage.setItem('syncraft_opt_format', formatVal);
          localStorage.setItem('syncraft_opt_autosave', autosaveVal);

          // Dispatch setting updates to workspace dynamically
          document.dispatchEvent(new CustomEvent('syncraft:settingChanged', { detail: { key: 'format', val: formatVal } }));
          document.dispatchEvent(new CustomEvent('syncraft:settingChanged', { detail: { key: 'autosave', val: autosaveVal } }));

          showToast('Workspace preferences updated');
        } catch (err) {
          showToast('Failed to save preferences', true);
        } finally {
          btn.disabled = false;
          btn.textContent = 'Save Preferences';
        }
      });

    } else if (activeTab === 'subscription') {
      const pct = (user.creditsUsed / user.creditsMax) * 100;

      let selectedProPrice = initialProBudget;
      if (user.plan === 'Professional') {
        selectedProPrice = Math.round(150 + (user.creditsMax - 100) / 0.868);
        selectedProPrice = Math.max(150, Math.min(899, selectedProPrice));
      }

      panelContainer.innerHTML = `
        <div class="settings-tab-panel">
          <!-- Card 1: Token Quota / Usage -->
          <div class="settings-card">
            <div class="settings-card-info">
              <h2 class="settings-card-title">Token Quota</h2>
              <p class="settings-card-desc">Monitor your monthly vector generation budget and available processing balance.</p>
            </div>
            <div class="settings-card-body">
              <div class="billing-summary-wrap">
                <div class="billing-plan-info">
                  <span class="billing-plan-name">${user.plan} Account</span>
                  <span class="billing-plan-status">Active Plan</span>
                </div>

                <div class="billing-quota-wrap">
                  <div class="billing-quota-labels">
                    <span class="billing-quota-used">${user.creditsUsed} / ${user.creditsMax} Tokens Consumed</span>
                    <span class="billing-quota-total">${Math.max(0, user.creditsMax - user.creditsUsed)} Tokens Left</span>
                  </div>
                  <div class="billing-progress-bar">
                    <div class="billing-progress-fill" style="width: ${Math.min(pct, 100)}%;"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Card 2: Upgrade Plans -->
          <div class="settings-card">
            <div class="settings-card-info">
              <h2 class="settings-card-title">Manage Plan</h2>
              <p class="settings-card-desc">Scale your token quota instantly by upgrading your subscription tier.</p>
            </div>
            <div class="settings-card-body" style="padding-left: 20px; padding-right: 20px;">
              <div class="settings-pricing-grid">
                <!-- Starter Plan -->
                <div class="settings-plan-card ${user.plan === 'Starter' ? 'active' : ''}">
                  <div class="settings-plan-name">Starter</div>
                  <div class="settings-plan-price">₱0<span class="settings-plan-price-period">/mo</span></div>
                  <p class="settings-plan-limit">25 free trial tokens<br>Standard speed</p>
                  ${user.plan === 'Starter' 
                    ? `<button class="settings-btn settings-btn-secondary" style="width:100%;cursor:default;" disabled>Current Plan</button>` 
                    : `<button class="settings-btn settings-btn-primary btn-plan-upgrade" data-plan="Starter" style="width:100%;">Downgrade</button>`
                  }
                </div>

                <!-- Professional Plan -->
                <div class="settings-plan-card ${user.plan === 'Professional' ? 'active' : ''}">
                  <div class="settings-plan-badge">Most Popular</div>
                  <div class="settings-plan-name">Professional</div>
                  <div class="settings-plan-price" id="settings-pro-price">₱${selectedProPrice}<span class="settings-plan-price-period">/mo</span></div>
                  
                  <!-- Slider Wrapper -->
                  <div style="margin: 15px 0; display: flex; flex-direction: column; gap: 6px; text-align: left;">
                    <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--color-on-surface-variant); font-weight: 600;">
                      <span>Budget</span>
                      <span id="settings-pro-slider-val" style="color: var(--color-primary); font-weight: 700;">₱${selectedProPrice}</span>
                    </div>
                    <input type="range" id="settings-pro-slider" min="150" max="899" step="1" value="${selectedProPrice}" style="
                      width: 100%;
                      accent-color: var(--color-primary);
                      background: var(--color-surface-container-highest);
                      height: 5px;
                      border-radius: 999px;
                      cursor: pointer;
                      outline: none;
                    ">
                    <div style="display: flex; justify-content: space-between; font-size: 9px; color: rgba(255,255,255,0.4);">
                      <span>₱150</span>
                      <span>₱899</span>
                    </div>
                  </div>

                  <p class="settings-plan-limit">
                    <span id="settings-pro-tokens-text">${Math.round(100 + (selectedProPrice - 150) * 0.868)} tokens / mo</span><br>
                    Priority queue
                  </p>
                  ${user.plan === 'Professional' 
                    ? `<button class="settings-btn settings-btn-secondary" style="width:100%;cursor:default;" disabled>Current Plan</button>` 
                    : `<button class="settings-btn settings-btn-primary btn-plan-upgrade" data-plan="Professional" style="width:100%;">Upgrade</button>`
                  }
                </div>

                <!-- Enterprise Plan -->
                <div class="settings-plan-card ${user.plan === 'Enterprise' ? 'active' : ''}">
                  <div class="settings-plan-name">Enterprise</div>
                  <div class="settings-plan-price">₱2,000<span class="settings-plan-price-period">/mo</span></div>
                  <p class="settings-plan-limit">1,800 vector tokens / mo<br>Dedicated queues</p>
                  ${user.plan === 'Enterprise' 
                    ? `<button class="settings-btn settings-btn-secondary" style="width:100%;cursor:default;" disabled>Current Plan</button>` 
                    : `<button class="settings-btn settings-btn-primary btn-plan-upgrade" data-plan="Enterprise" style="width:100%;">Upgrade</button>`
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      // Bind slider if it exists in DOM
      const slider = document.getElementById('settings-pro-slider');
      if (slider) {
        slider.addEventListener('input', (e) => {
          selectedProPrice = parseInt(e.target.value);
          const tokens = Math.round(100 + (selectedProPrice - 150) * 0.868);
          
          const priceText = document.getElementById('settings-pro-price');
          const sliderVal = document.getElementById('settings-pro-slider-val');
          const tokensText = document.getElementById('settings-pro-tokens-text');
          
          if (priceText) priceText.innerHTML = `₱${selectedProPrice}<span class="settings-plan-price-period">/mo</span>`;
          if (sliderVal) sliderVal.textContent = `₱${selectedProPrice}`;
          if (tokensText) tokensText.textContent = `${tokens} tokens / mo`;
        });
      }

      // Bind Plan Upgrades click actions
      document.querySelectorAll('.btn-plan-upgrade').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const plan = e.target.getAttribute('data-plan');
          e.target.disabled = true;
          e.target.textContent = 'Upgrading...';

          // Simulate payment routing delay (1.2s)
          setTimeout(async () => {
            try {
              let chosenCreditsMax = null;
              if (plan === 'Professional') {
                chosenCreditsMax = Math.round(100 + (selectedProPrice - 150) * 0.868);
              }
              await authService.upgradeSubscription(plan, chosenCreditsMax);
              showToast(`Plan upgraded to ${plan} successfully!`);
              renderTabContent();
            } catch (err) {
              showToast('Billing error: ' + err.message, true);
              e.target.disabled = false;
              e.target.textContent = 'Upgrade';
            }
          }, 1200);
        });
      });
    }
  }
}
