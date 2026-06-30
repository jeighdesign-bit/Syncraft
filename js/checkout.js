import authService from './authService.js?v=2.0.5';
import { showToast, SYNCRAFT_LOGO_SVG } from './utils.js';
import { supabaseClient } from './supabaseConfig.js';

export function initCheckoutPage(router, hash) {
  const container = document.getElementById('checkout-view');
  if (!container) return;

  const user = authService.getCurrentUser();
  if (!user) {
    showToast('Please log in to proceed to checkout', true);
    router.navigate('auth/login');
    return;
  }

  // ── Parse Query Parameters ────────────────────────────────
  const urlParams = new URLSearchParams(hash.includes('?') ? hash.substring(hash.indexOf('?')) : '');
  const price = parseInt(urlParams.get('price') || '150');
  const tokens = parseInt(urlParams.get('tokens') || '100');

  renderLayout(container, router, user, price, tokens);
}

function renderLayout(container, router, user, price, tokens) {
  container.innerHTML = `
    <div class="checkout-page" style="
      min-height: 100vh;
      background-color: #080808;
      color: #e5e2e1;
      font-family: var(--font-family-body);
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
    ">
      <!-- Minimal Checkout Header -->
      <header style="
        height: 80px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 40px;
      ">
        <button id="btn-checkout-back" style="
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #fff;
          padding: 10px 18px;
          border-radius: var(--rounded-full);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: all var(--transition-fast);
        ">
          <i class="icon fi fi-br-arrow-left" style="font-size: 12px; display: flex; align-items: center;"></i>
          Back to settings
        </button>
        <span style="height: 36px; display: flex; align-items: center; opacity: 0.9;">
          ${SYNCRAFT_LOGO_SVG}
        </span>
      </header>

      <!-- Main Layout Body -->
      <main style="
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px;
        box-sizing: border-box;
      ">
        <div class="checkout-grid" style="
          display: grid;
          grid-template-columns: 1fr;
          gap: 40px;
          max-width: 1000px;
          width: 100%;
        ">
          <!-- Left Column: Summary Card -->
          <div class="checkout-summary-card" style="
            background: #111111;
            border: 1px solid rgba(255, 255, 255, 0.04);
            border-radius: 1.5rem;
            padding: 40px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-sizing: border-box;
          ">
            <div>
              <span style="
                color: var(--color-primary);
                font-family: var(--font-family-display);
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.1em;
                display: inline-block;
                margin-bottom: 12px;
              ">Upgrade Plan</span>
              <h2 style="
                font-family: var(--font-family-display);
                font-size: 28px;
                font-weight: 800;
                color: #fff;
                margin: 0 0 8px 0;
                letter-spacing: -0.02em;
              ">Professional</h2>
              <p style="
                font-size: 14px;
                color: rgba(255,255,255,0.4);
                margin: 0 0 32px 0;
              ">Unlock unlimited vector graphics and enhanced limits.</p>

              <!-- Included Features -->
              <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 40px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div style="
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: rgba(212, 255, 89, 0.08);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--color-primary);
                  ">
                    <i class="icon fi fi-br-check" style="font-size: 10px; display: flex; align-items: center;"></i>
                  </div>
                  <span style="font-size: 14px; font-weight: 600; color: #fff;">
                    ${tokens} vector generation tokens / mo
                  </span>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div style="
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: rgba(212, 255, 89, 0.08);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--color-primary);
                  ">
                    <i class="icon fi fi-br-check" style="font-size: 10px; display: flex; align-items: center;"></i>
                  </div>
                  <span style="font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.8);">
                    Priority processing queue (Standard speed + 2x boost)
                  </span>
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div style="
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: rgba(212, 255, 89, 0.08);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--color-primary);
                  ">
                    <i class="icon fi fi-br-check" style="font-size: 10px; display: flex; align-items: center;"></i>
                  </div>
                  <span style="font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.8);">
                    Full vector SVG, high-res PNG, JPEG & PDF export
                  </span>
                </div>
              </div>
            </div>

            <!-- Receipt Breakdown -->
            <div style="
              border-top: 1px solid rgba(255, 255, 255, 0.06);
              padding-top: 24px;
              display: flex;
              flex-direction: column;
              gap: 12px;
            ">
              <div style="display: flex; justify-content: space-between; font-size: 14px; color: rgba(255,255,255,0.5);">
                <span>Subtotal</span>
                <span>₱${price}.00</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 14px; color: rgba(255,255,255,0.5);">
                <span>Tax</span>
                <span>₱0.00</span>
              </div>
              <div style="
                display: flex;
                justify-content: space-between;
                font-size: 18px;
                font-weight: 700;
                color: #fff;
                border-top: 1px solid rgba(255, 255, 255, 0.06);
                padding-top: 16px;
                margin-top: 8px;
              ">
                <span>Total Due</span>
                <span style="color: var(--color-primary);">₱${price}.00</span>
              </div>
            </div>
          </div>

          <!-- Right Column: GCash / Maya Payment Method Details Directly -->
          <div class="checkout-method-card" style="
            background: #111111;
            border: 1px solid rgba(255, 255, 255, 0.04);
            border-radius: 1.5rem;
            padding: 40px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 24px;
          ">
            <div>
              <h3 style="
                font-family: var(--font-family-display);
                font-size: 20px;
                font-weight: 800;
                color: #fff;
                margin: 0 0 6px 0;
                letter-spacing: -0.01em;
              ">Payment Method</h3>
              <p style="
                font-size: 13px;
                color: rgba(255, 255, 255, 0.4);
                margin: 0;
              ">GCash / Maya Manual Payment</p>
            </div>

            <!-- Steps & Wallet Details -->
            <div style="
              background: rgba(255,255,255,0.02);
              border: 1px solid rgba(255, 255, 255, 0.05);
              border-radius: 1rem;
              padding: 24px;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              gap: 20px;
            ">
              <div>
                <h4 style="font-size: 13px; font-weight: 700; color: #fff; margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.05em;">Manual Transfer Details</h4>
                <p style="font-size: 13px; color: rgba(255,255,255,0.4); margin: 0; line-height: 1.5;">
                  Please send exactly <strong style="color: #fff;">₱${price}.00</strong> to the GCash/Maya wallet below, then enter your transaction reference number.
                </p>
              </div>

              <div style="background: rgba(0,0,0,0.2); border-radius: 12px; padding: 16px; border: 1px solid rgba(255,255,255,0.03); font-size: 13px;">
                <div style="display: flex; flex-direction: column; gap: 8px;">
                  <div style="display: flex; justify-content: space-between;"><span style="color: rgba(255,255,255,0.4);">Network:</span><strong style="color:#fff;">GCash / Maya</strong></div>
                  <div style="display: flex; justify-content: space-between;"><span style="color: rgba(255,255,255,0.4);">Account Holder:</span><strong style="color:#fff;">JAY LUIS DONDIEGO CAÑO</strong></div>
                  <div style="display: flex; justify-content: space-between;"><span style="color: rgba(255,255,255,0.4);">Phone Number:</span><strong style="color:var(--color-primary);">0991 835 5995</strong></div>
                </div>
              </div>

              <!-- Name Verification Reference Image -->
              <div style="display: flex; flex-direction: column; gap: 8px;">
                <span style="font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.05em;">Name Verification Reference:</span>
                <div style="border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); background: #000; text-align: center; padding: 4px;">
                  <img src="gcash-verify.jfif" alt="GCash name verification" style="max-width: 100%; height: auto; display: block; border-radius: 4px;" />
                </div>
              </div>

              <!-- Input Reference Field -->
              <div style="display: flex; flex-direction: column; gap: 8px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 16px;">
                <label style="font-size: 11px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 0.05em;">GCash/Maya Reference Number:</label>
                <input type="text" id="checkout-gcash-ref" placeholder="e.g. 5012 3456 7890 1" style="
                  width: 100%;
                  background: rgba(0, 0, 0, 0.3);
                  border: 1px solid rgba(255,255,255,0.08);
                  border-radius: 8px;
                  color: #fff;
                  padding: 14px;
                  font-size: 14px;
                  box-sizing: border-box;
                  outline: none;
                  transition: border-color var(--transition-fast);
                ">
              </div>

              <!-- Upload Payment Receipt -->
              <div style="display: flex; flex-direction: column; gap: 8px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 16px;">
                <label style="font-size: 11px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: 0.05em;">Upload Payment Receipt screenshot:</label>
                <div id="receipt-upload-zone" style="
                  border: 2px dashed rgba(255, 255, 255, 0.15);
                  border-radius: 12px;
                  padding: 24px;
                  text-align: center;
                  background: rgba(255, 255, 255, 0.01);
                  cursor: pointer;
                  transition: all var(--transition-fast);
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  gap: 8px;
                ">
                  <input type="file" id="checkout-gcash-receipt" accept="image/*" style="display: none;" />
                  <i class="icon fi fi-br-document" id="receipt-upload-icon" style="font-size: 24px; color: rgba(255,255,255,0.4);"></i>
                  <span id="receipt-upload-text" style="font-size: 12px; color: rgba(255,255,255,0.5);">Click or drag receipt screenshot here</span>
                  <div id="receipt-preview-container" style="display: none; width: 100%; margin-top: 8px; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); background: #000; padding: 4px; box-sizing: border-box;">
                    <img id="receipt-preview" style="max-width: 100%; height: auto; max-height: 200px; display: block; margin: 0 auto; border-radius: 4px;" />
                  </div>
                </div>
              </div>

              <div style="margin-top: 8px;">
                <button id="checkout-gcash-submit" style="
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
                  transition: all var(--transition-fast);
                ">Submit Payment Reference</button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  `;

  // Media Query Layout updates & CSS declarations
  const styleEl = document.createElement('style');
  styleEl.innerHTML = `
    @media (min-width: 768px) {
      .checkout-grid {
        grid-template-columns: 420px 1fr !important;
      }
    }
    #checkout-gcash-ref:focus {
      border-color: var(--color-primary) !important;
    }
    #receipt-upload-zone:hover {
      border-color: var(--color-primary) !important;
      background: rgba(212, 255, 89, 0.02) !important;
    }
    #checkout-gcash-submit:hover {
      background: var(--color-primary-light) !important;
      transform: translateY(-1px);
    }
    #checkout-gcash-submit:active {
      transform: translateY(0);
    }
  `;
  container.appendChild(styleEl);

  // Bind Back Button
  document.getElementById('btn-checkout-back').addEventListener('click', () => {
    router.navigate('settings?tab=subscription');
  });

  // Local state for image upload
  let selectedReceiptBase64 = null;
  const uploadZone = document.getElementById('receipt-upload-zone');
  const fileInput = document.getElementById('checkout-gcash-receipt');
  const uploadText = document.getElementById('receipt-upload-text');
  const uploadIcon = document.getElementById('receipt-upload-icon');
  const previewContainer = document.getElementById('receipt-preview-container');
  const previewImg = document.getElementById('receipt-preview');

  uploadZone.addEventListener('click', () => fileInput.click());

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = 'var(--color-primary)';
  });
  uploadZone.addEventListener('dragleave', () => {
    uploadZone.style.borderColor = 'rgba(255, 255, 255, 0.15)';
  });
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      fileInput.files = e.dataTransfer.files;
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  });

  function handleFile(file) {
    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file (PNG/JPG)', true);
      return;
    }
    
    uploadText.textContent = 'Processing receipt...';
    
    const reader = new FileReader();
    reader.onload = function(event) {
      const img = new Image();
      img.onload = function() {
        // Compress image using canvas
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        const MAX_WIDTH = 800;
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to low-quality JPEG base64 (compressed to ~30-50kb)
        selectedReceiptBase64 = canvas.toDataURL('image/jpeg', 0.7);
        
        // Update UI preview
        previewImg.src = selectedReceiptBase64;
        previewContainer.style.display = 'block';
        uploadIcon.style.color = 'var(--color-primary)';
        uploadText.textContent = file.name + ' (Loaded)';
      };
      img.onerror = function() {
        showToast('Failed to load image', true);
        uploadText.textContent = 'Click or drag receipt screenshot here';
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Bind GCash Manual Submit Action
  const btnSubmitGcash = document.getElementById('checkout-gcash-submit');
  btnSubmitGcash.addEventListener('click', async () => {
    console.log('[Checkout] Submit payment reference clicked');
    const refInput = document.getElementById('checkout-gcash-ref');
    const refNumber = refInput.value.trim().replace(/\s+/g, '');
    
    console.log('[Checkout] Reference Number:', refNumber);
    console.log('[Checkout] Selected Receipt length:', selectedReceiptBase64 ? selectedReceiptBase64.length : 0);
    
    if (!refNumber) {
      showToast('Please enter the GCash/Maya reference number', true);
      return;
    }
    if (refNumber.length < 8) {
      showToast('Please enter a valid reference number', true);
      return;
    }
    if (!selectedReceiptBase64) {
      showToast('Please upload a screenshot of your payment receipt', true);
      return;
    }

    btnSubmitGcash.disabled = true;
    btnSubmitGcash.textContent = 'Submitting...';

    if (!user.history) {
      user.history = [];
    }

    // Lightweight log without the heavy image data (prevents LocalStorage/Supabase string overflows)
    user.history.unshift({
      date: new Date().toISOString(),
      type: 'Billing',
      desc: `Payment Pending Verification: GCash Reference #${refNumber} for ₱${price} (${tokens} tokens)`,
      status: 'pending_verification',
      refNumber: refNumber,
      tokens: tokens,
      price: price,
      email: user.email
    });

    try {
      console.log('[Checkout] Saving lightweight user state...');
      await authService.saveCurrentUserState(user);
      console.log('[Checkout] saveCurrentUserState succeeded.');

      if (supabaseClient) {
        console.log('[Checkout] Writing full details to public.payments...');
        const { error: payErr } = await supabaseClient
          .from('payments')
          .insert({
            user_id: user.id,
            email: user.email,
            ref_number: refNumber,
            price: price,
            tokens: tokens,
            receipt_image: selectedReceiptBase64,
            status: 'pending_verification'
          });

        if (payErr) {
          console.error('[Checkout] Supabase payments write failed:', payErr.message);
          throw new Error('Database write failed: ' + payErr.message);
        }
        console.log('[Checkout] Supabase payments write succeeded.');
      } else {
        console.log('[Checkout] Supabase skipped (offline mode).');
      }

      showToast('Reference and receipt submitted! Pending manual verification.');
      router.navigate('settings?tab=subscription');
    } catch (err) {
      console.error('[Checkout] Submit payment action failed:', err);
      showToast('Error saving payment details: ' + err.message, true);
      btnSubmitGcash.disabled = false;
      btnSubmitGcash.textContent = 'Submit Payment Reference';
    }
  });
}
