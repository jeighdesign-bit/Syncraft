import authService from './authService.js?v=2.0.5';
import { showToast, showConfirmModal, openModal } from './utils.js';

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

      function openPaymentModal(price, tokens, upgradeBtn) {
        const title = "Upgrade to Professional";
        const bodyHTML = `
          <div class="payment-modal-content" style="display: flex; flex-direction: column; gap: 20px; font-family: var(--font-family-body);">
            <!-- Tabs Header -->
            <div style="display: flex; border-bottom: 1px solid var(--color-outline-dim); padding-bottom: 8px; gap: 16px;">
              <button id="tab-btn-paypal" style="
                flex: 1;
                background: none;
                border: none;
                color: #fff;
                font-weight: 700;
                padding: 10px;
                font-size: 13px;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                border-bottom: 2px solid var(--color-primary);
                cursor: pointer;
                transition: all var(--transition-fast);
              ">Card / PayPal (Auto)</button>
              <button id="tab-btn-gcash" style="
                flex: 1;
                background: none;
                border: none;
                color: var(--color-on-surface-variant);
                font-weight: 700;
                padding: 10px;
                font-size: 13px;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                border-bottom: 2px solid transparent;
                cursor: pointer;
                transition: all var(--transition-fast);
              ">GCash / Maya (Manual)</button>
            </div>

            <!-- PayPal Tab Content -->
            <div id="content-paypal" style="display: block;">
              <p style="font-size: 13px; line-height: 1.6; margin-bottom: 20px; color: var(--color-on-surface-variant);">
                Pay securely via Debit/Credit Card or PayPal. Tokens will be credited to your account instantly.
              </p>
              <div id="paypal-button-container" style="
                min-height: 150px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(255,255,255,0.02);
                border-radius: 12px;
                border: 1px dashed var(--color-outline-dim);
                padding: 16px;
                box-sizing: border-box;
              ">
                <span style="color: var(--color-on-surface-variant); font-size: 13px;">Loading PayPal Secure Checkout...</span>
              </div>
            </div>

            <!-- GCash Tab Content -->
            <div id="content-gcash" style="display: none;">
              <p style="font-size: 13px; line-height: 1.6; margin-bottom: 16px; color: var(--color-on-surface-variant);">
                Send exactly <strong style="color:#fff;">₱${price}.00</strong> to the GCash/Maya number below, then enter your Reference Number.
              </p>
              
              <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 16px; border: 1px solid var(--color-outline-dim); margin-bottom: 16px; font-size: 13px;">
                <div style="display: flex; flex-direction: column; gap: 8px;">
                  <div style="display: flex; justify-content: space-between;"><span style="color: var(--color-on-surface-variant);">Wallet Name:</span><strong style="color:#fff;">GCash / Maya</strong></div>
                  <div style="display: flex; justify-content: space-between;"><span style="color: var(--color-on-surface-variant);">Recipient:</span><strong style="color:#fff;">JAY LUIS DONDIEGO CAÑO</strong></div>
                  <div style="display: flex; justify-content: space-between;"><span style="color: var(--color-on-surface-variant);">Phone Number:</span><strong style="color:var(--color-primary);">0995 918 3433</strong></div>
                </div>
              </div>

              <div style="display: flex; flex-direction: column; gap: 6px;">
                <label style="font-size: 12px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 0.05em;">13-Digit Reference Number:</label>
                <input type="text" id="gcash-ref-input" placeholder="e.g. 5012 3456 7890 1" style="
                  width: 100%;
                  background: rgba(0, 0, 0, 0.3);
                  border: 1px solid var(--color-outline-dim);
                  border-radius: 8px;
                  color: #fff;
                  padding: 12px;
                  font-size: 14px;
                  box-sizing: border-box;
                  outline: none;
                  transition: border-color 0.15s;
                ">
                <button id="gcash-submit-btn" style="
                  width: 100%;
                  background: var(--color-primary);
                  color: #000;
                  border: none;
                  padding: 14px;
                  border-radius: var(--rounded-full);
                  font-weight: 700;
                  cursor: pointer;
                  font-size: 13px;
                  text-transform: uppercase;
                  letter-spacing: 0.05em;
                  margin-top: 8px;
                  transition: transform 0.1s, opacity 0.15s;
                ">Submit Payment Reference</button>
              </div>
            </div>
          </div>
        `;

        const { el, close } = openModal(title, bodyHTML);

        // Setup cleanup when modal is closed
        const origCloseBtn = el.querySelector('#syncraft-modal-close');
        const customClose = () => {
          upgradeBtn.disabled = false;
          upgradeBtn.textContent = 'Upgrade';
          close();
        };
        if (origCloseBtn) {
          origCloseBtn.replaceWith(origCloseBtn.cloneNode(true));
          el.querySelector('#syncraft-modal-close').addEventListener('click', customClose);
        }
        el.addEventListener('click', (e) => {
          if (e.target === el) customClose();
        });

        // Tab buttons switching
        const tabPaypal = el.querySelector('#tab-btn-paypal');
        const tabGcash = el.querySelector('#tab-btn-gcash');
        const contentPaypal = el.querySelector('#content-paypal');
        const contentGcash = el.querySelector('#content-gcash');

        tabPaypal.addEventListener('click', () => {
          tabPaypal.style.color = '#fff';
          tabPaypal.style.borderBottomColor = 'var(--color-primary)';
          tabGcash.style.color = 'var(--color-on-surface-variant)';
          tabGcash.style.borderBottomColor = 'transparent';
          contentPaypal.style.display = 'block';
          contentGcash.style.display = 'none';
        });

        tabGcash.addEventListener('click', () => {
          tabGcash.style.color = '#fff';
          tabGcash.style.borderBottomColor = 'var(--color-primary)';
          tabPaypal.style.color = 'var(--color-on-surface-variant)';
          tabPaypal.style.borderBottomColor = 'transparent';
          contentGcash.style.display = 'block';
          contentPaypal.style.display = 'none';
        });

        // Handle GCash Submit
        const gcashSubmit = el.querySelector('#gcash-submit-btn');
        gcashSubmit.addEventListener('click', async () => {
          const refInput = el.querySelector('#gcash-ref-input');
          const refNumber = refInput.value.trim().replace(/\s+/g, '');
          if (!refNumber) {
            showToast('Please enter the GCash/Maya reference number', true);
            return;
          }
          if (refNumber.length < 8) {
            showToast('Please enter a valid reference number', true);
            return;
          }

          gcashSubmit.disabled = true;
          gcashSubmit.textContent = 'Submitting...';

          if (!user.history) {
            user.history = [];
          }

          user.history.unshift({
            date: new Date().toISOString(),
            type: 'Billing',
            desc: `Payment Pending Verification: GCash Reference #${refNumber} for ₱${price} (${tokens} tokens)`,
            status: 'pending_verification',
            refNumber: refNumber,
            tokens: tokens,
            price: price
          });

          try {
            await authService.saveCurrentUserState(user);
            showToast('Reference number submitted! Pending manual verification.');
            customClose();
            renderTabContent();
          } catch (err) {
            showToast('Error saving reference: ' + err.message, true);
            gcashSubmit.disabled = false;
            gcashSubmit.textContent = 'Submit Payment Reference';
          }
        });

        // Load & Render PayPal Smart Buttons
        const renderPayPal = () => {
          if (!window.paypal) {
            const script = document.createElement('script');
            script.src = `https://www.paypal.com/sdk/js?client-id=sb&currency=PHP`;
            script.onload = () => {
              initializePayPalButtons();
            };
            script.onerror = () => {
              const container = el.querySelector('#paypal-button-container');
              if (container) {
                container.innerHTML = `<span style="color:#ffb4ab;">Failed to load PayPal. Please use GCash instead or refresh the page.</span>`;
              }
            };
            document.head.appendChild(script);
          } else {
            initializePayPalButtons();
          }
        };

        const initializePayPalButtons = () => {
          const container = el.querySelector('#paypal-button-container');
          if (!container) return;
          container.innerHTML = '';
          
          window.paypal.Buttons({
            style: {
              layout: 'vertical',
              color:  'gold',
              shape:  'rect',
              label:  'paypal'
            },
            createOrder: function(data, actions) {
              return actions.order.create({
                purchase_units: [{
                  amount: {
                    currency_code: 'PHP',
                    value: price.toString()
                  },
                  description: `Syncraft Professional Upgrade - ${tokens} tokens`
                }]
              });
            },
            onApprove: function(data, actions) {
              return actions.order.capture().then(async function(details) {
                try {
                  await authService.upgradeSubscription('Professional', tokens);
                  showToast('Payment successful! Your account has been upgraded.', false);
                  customClose();
                  renderTabContent();
                } catch (err) {
                  showToast('Upgrade error: ' + err.message, true);
                }
              });
            },
            onError: function(err) {
              console.error('PayPal error:', err);
              showToast('PayPal checkout failed. Please try again.', true);
            }
          }).render('#paypal-button-container');
        };

        renderPayPal();
      }

      // Bind Plan Upgrades click actions
      document.querySelectorAll('.btn-plan-upgrade').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const plan = e.target.getAttribute('data-plan');
          e.target.disabled = true;
          e.target.textContent = 'Upgrading...';

          if (plan === 'Professional') {
            const tokens = Math.round(100 + (selectedProPrice - 150) * 0.868);
            openPaymentModal(selectedProPrice, tokens, e.target);
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
