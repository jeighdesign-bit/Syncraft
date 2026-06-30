import authService from './authService.js?v=2.0.5';
import { showToast, showConfirmModal, openModal } from './utils.js';
import { DEFAULT_GEMINI_API_KEY, DEFAULT_RECRAFT_API_KEY } from './aiConfig.js';

export function initSettingsPage(router, hash) {
  const container = document.getElementById('settings-view');
  if (!container) return;

  // ── Parse Tab Query Param ────────────────────────────────
  const urlParams = new URLSearchParams(hash.includes('?') ? hash.substring(hash.indexOf('?')) : '');
  let activeTab = urlParams.get('tab') || 'profile';
  let initialProBudget = parseInt(urlParams.get('pro_budget') || '150');

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
      document.getElementById('btn-settings-logout')?.addEventListener('click', (e) => {
        if (e) e.preventDefault();
        try {
          authService.logout();
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

              <div class="settings-input-group">
                <label class="settings-label" for="pref-gemini-key">Gemini / OpenRouter API Key</label>
                <input class="settings-input" id="pref-gemini-key" type="password" placeholder="sk-or-v1-..." />
              </div>

              <div class="settings-input-group">
                <label class="settings-label" for="pref-recraft-key">Recraft.ai API Key</label>
                <input class="settings-input" id="pref-recraft-key" type="password" placeholder="Enter Recraft API Key" />
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
      const prefGeminiKey = document.getElementById('pref-gemini-key');
      const prefRecraftKey = document.getElementById('pref-recraft-key');

      if (prefModel) prefModel.value = localStorage.getItem('syncraft_opt_model') || 'Syncraft v1 (Fast)';
      if (prefFormat) prefFormat.value = localStorage.getItem('syncraft_opt_format') || 'SVG';
      if (prefAutosave) prefAutosave.value = localStorage.getItem('syncraft_opt_autosave') || '2 seconds';
      if (prefGeminiKey) prefGeminiKey.value = localStorage.getItem('syncraft_gemini_api_key') || DEFAULT_GEMINI_API_KEY;
      if (prefRecraftKey) prefRecraftKey.value = localStorage.getItem('syncraft_recraft_api_key') || DEFAULT_RECRAFT_API_KEY;

      // Bind Preferences save action
      document.getElementById('btn-save-preferences')?.addEventListener('click', (e) => {
        const btn = e.target;
        const modelVal = prefModel.value;
        const formatVal = prefFormat.value;
        const autosaveVal = prefAutosave.value;
        const geminiKeyVal = prefGeminiKey ? prefGeminiKey.value.trim() : '';
        const recraftKeyVal = prefRecraftKey ? prefRecraftKey.value.trim() : '';

        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
          localStorage.setItem('syncraft_opt_model', modelVal);
          localStorage.setItem('syncraft_opt_format', formatVal);
          localStorage.setItem('syncraft_opt_autosave', autosaveVal);

          if (geminiKeyVal) {
            localStorage.setItem('syncraft_gemini_api_key', geminiKeyVal);
          } else {
            localStorage.setItem('syncraft_gemini_api_key', DEFAULT_GEMINI_API_KEY);
          }

          if (recraftKeyVal) {
            localStorage.setItem('syncraft_recraft_api_key', recraftKeyVal);
          } else {
            localStorage.setItem('syncraft_recraft_api_key', DEFAULT_RECRAFT_API_KEY);
          }

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
      const pct = ((user.creditsMax - user.creditsUsed) / user.creditsMax) * 100;

      let selectedProPrice = initialProBudget;
      if (user.plan === 'Professional') {
        selectedProPrice = Math.round(250 + (user.creditsMax - 100) / 0.462);
        selectedProPrice = Math.max(250, Math.min(899, selectedProPrice));
      } else {
        selectedProPrice = Math.max(250, Math.min(899, selectedProPrice));
      }

      const pendingPayment = user.history && user.history.find(h => h.type === 'Billing' && h.status === 'pending_verification');
      let pendingAlertHTML = '';
      if (pendingPayment) {
        pendingAlertHTML = `
          <div class="settings-card" style="border: 1px solid var(--color-primary); background: rgba(210, 255, 68, 0.03); margin-bottom: 24px; padding: 20px; border-radius: 1rem; box-sizing: border-box; width: 100%;">
            <div style="display: flex; align-items: center; gap: 10px; color: var(--color-primary); font-weight: 700; margin-bottom: 8px;">
              <i class="icon fi fi-br-clock" style="font-size: 16px; display: inline-flex; align-items: center;"></i>
              <span style="font-family: var(--font-family-display); font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">Payment Verification Pending</span>
            </div>
            <p style="font-size: 13px; color: var(--color-on-surface-variant); margin: 0; line-height: 1.6;">
              We are verifying GCash/Maya Reference <strong>#${pendingPayment.refNumber}</strong> for the ₱${pendingPayment.price} plan (${pendingPayment.tokens} tokens). Your account will be upgraded automatically once verified.
            </p>
          </div>
        `;
      }

      panelContainer.innerHTML = `
        <div class="settings-tab-panel">
          ${pendingAlertHTML}
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
                    <span class="billing-quota-used">${Math.max(0, user.creditsMax - user.creditsUsed)} Tokens Available</span>
                    <span class="billing-quota-total">Out of ${user.creditsMax} Tokens</span>
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
                  <p class="settings-plan-limit">30 free trial tokens<br>Standard speed</p>
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
                    <input type="range" id="settings-pro-slider" min="250" max="899" step="1" value="${selectedProPrice}" style="
                      width: 100%;
                      accent-color: var(--color-primary);
                      background: var(--color-surface-container-highest);
                      height: 5px;
                      border-radius: 999px;
                      cursor: pointer;
                      outline: none;
                    ">
                    <div style="display: flex; justify-content: space-between; font-size: 9px; color: rgba(255,255,255,0.4);">
                      <span>₱250</span>
                      <span>₱899</span>
                    </div>
                  </div>

                  <p class="settings-plan-limit">
                    <span id="settings-pro-tokens-text">${Math.round(100 + (selectedProPrice - 250) * 0.462)} tokens / mo</span><br>
                    Priority queue
                  </p>
                  ${user.plan === 'Professional' 
                    ? `<button class="settings-btn settings-btn-secondary" style="width:100%;cursor:default;" disabled>Current Plan</button>` 
                    : `<button class="settings-btn settings-btn-primary btn-plan-upgrade" data-plan="Professional" style="width:100%;">Upgrade</button>`
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
          const tokens = Math.round(100 + (selectedProPrice - 250) * 0.462);
          
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

          if (plan === 'Professional') {
            const tokens = Math.round(100 + (selectedProPrice - 250) * 0.462);
            router.navigate(`checkout?price=${selectedProPrice}&tokens=${tokens}`);
          } else {
            // Starter Plan downgrade (free)
            setTimeout(async () => {
              try {
                await authService.upgradeSubscription(plan, null);
                showToast(`Plan changed to ${plan} successfully!`);
                renderTabContent();
              } catch (err) {
                showToast('Billing error: ' + err.message, true);
                e.target.disabled = false;
                e.target.textContent = 'Upgrade';
              }
            }, 1000);
          }
        });
      });
    }
  }
}
