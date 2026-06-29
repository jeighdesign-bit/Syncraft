// ─────────────────────────────────────────────
// SHARED MODAL / TOAST UTILITY
// ─────────────────────────────────────────────

/**
 * Show a transient toast notification.
 * @param {string} message
 * @param {boolean} isError
 */
export function showToast(message, isError = false) {
  let toast = document.getElementById('syncraft-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'syncraft-toast';
    document.body.appendChild(toast);
  }

  if (isError) {
    toast.style.borderColor = '#ffb4ab';
    toast.innerHTML = `<i class="icon fi fi-br-exclamation" style="color:#ffb4ab;font-size:16px;"></i> ${message}`;
  } else {
    toast.style.borderColor = 'var(--color-primary)';
    toast.innerHTML = `<i class="icon fi fi-br-check-circle" style="color:var(--color-primary);font-size:16px;"></i> ${message}`;
  }

  // Clear any pending hide timer
  if (toast._hideTimer) clearTimeout(toast._hideTimer);

  // Trigger reflow to ensure animations play correctly on consecutive toasts
  toast.classList.remove('show');
  void toast.offsetWidth;
  toast.classList.add('show');

  toast._hideTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

/**
 * Create and open a generic modal overlay.
 * Returns a { el, close } object.
 * @param {string} title
 * @param {string} bodyHTML  Inner HTML for the modal content area.
 */
export function openModal(title, bodyHTML) {
  // Remove any existing modal
  const existing = document.getElementById('syncraft-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'syncraft-modal';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.75);
    backdrop-filter: blur(6px);
    z-index: 99998;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    opacity: 0;
    transition: opacity 0.25s ease;
  `;

  overlay.innerHTML = `
    <div id="syncraft-modal-box" style="
      background: var(--color-surface-container);
      border: 1px solid var(--color-outline-dim);
      border-radius: 1.5rem;
      padding: 40px;
      max-width: 520px;
      width: 100%;
      position: relative;
      transform: scale(0.95) translateY(20px);
      transition: transform 0.3s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease;
      opacity: 0;
    ">
      <button id="syncraft-modal-close" style="
        position: absolute;
        top: 20px;
        right: 20px;
        background: none;
        border: none;
        color: var(--color-on-surface-variant);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 4px;
        border-radius: 50%;
        transition: color 0.15s, background 0.15s;
      " title="Close">
        <i class="icon fi fi-br-cross" style="font-size:22px;"></i>
      </button>
      <h2 style="
        font-family: var(--font-family-display);
        font-size: 22px;
        font-weight: 800;
        color: #fff;
        letter-spacing: -0.02em;
        text-transform: uppercase;
        margin-bottom: 24px;
        padding-right: 32px;
      ">${title}</h2>
      <div id="syncraft-modal-body" style="color: var(--color-on-surface-variant); font-size: 15px; line-height: 1.7;">
        ${bodyHTML}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const box = overlay.querySelector('#syncraft-modal-box');
  const closeBtn = overlay.querySelector('#syncraft-modal-close');

  function close() {
    overlay.style.opacity = '0';
    box.style.opacity = '0';
    box.style.transform = 'scale(0.95) translateY(20px)';
    setTimeout(() => overlay.remove(), 300);
  }

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', escHandler);
    }
  });

  // Hover state for close button
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.color = '#fff';
    closeBtn.style.background = 'rgba(255,255,255,0.1)';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.color = 'var(--color-on-surface-variant)';
    closeBtn.style.background = 'none';
  });

  // Animate in
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    requestAnimationFrame(() => {
      box.style.opacity = '1';
      box.style.transform = 'scale(1) translateY(0)';
    });
  });

  return { el: overlay, close };
}

/**
 * Show a styled confirmation modal dialog instead of native browser confirm().
 * @param {string} title - The title of the confirmation modal.
 * @param {string} message - The message prompt to display.
 * @param {function} onConfirm - Callback triggered when the user confirms.
 * @param {string} [confirmLabel='Delete'] - The label for the confirm button.
 * @param {boolean} [isDanger=true] - Whether the action is destructive (uses red/danger colors).
 */
export function showConfirmModal(title, message, onConfirm, confirmLabel = 'Delete', isDanger = true) {
  const confirmBg = isDanger ? '#ffb4ab' : 'var(--color-primary)';
  const confirmFg = isDanger ? '#690005' : '#000';
  
  const bodyHTML = `
    <div style="margin-bottom: 32px; color: rgba(255, 255, 255, 0.7); font-size: 15px;">
      ${message}
    </div>
    <div style="display: flex; gap: 12px; justify-content: flex-end;">
      <button id="confirm-btn-cancel" style="
        background: transparent;
        border: 1px solid var(--color-outline-dim);
        color: #fff;
        padding: 12px 24px;
        border-radius: var(--rounded-full);
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
      ">Cancel</button>
      <button id="confirm-btn-ok" style="
        background: ${confirmBg};
        border: none;
        color: ${confirmFg};
        padding: 12px 24px;
        border-radius: var(--rounded-full);
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.15s;
      ">${confirmLabel}</button>
    </div>
  `;

  const { el, close } = openModal(title, bodyHTML);

  const cancelBtn = document.getElementById('confirm-btn-cancel');
  const okBtn = document.getElementById('confirm-btn-ok');

  if (cancelBtn) {
    cancelBtn.addEventListener('click', close);
    cancelBtn.addEventListener('mouseenter', () => {
      cancelBtn.style.background = 'rgba(255, 255, 255, 0.05)';
      cancelBtn.style.borderColor = '#fff';
    });
    cancelBtn.addEventListener('mouseleave', () => {
      cancelBtn.style.background = 'transparent';
      cancelBtn.style.borderColor = 'var(--color-outline-dim)';
    });
  }

  if (okBtn) {
    okBtn.addEventListener('click', () => {
      onConfirm();
      close();
    });
    okBtn.addEventListener('mouseenter', () => {
      okBtn.style.transform = 'scale(1.02)';
    });
    okBtn.addEventListener('mouseleave', () => {
      okBtn.style.transform = 'scale(1)';
    });
  }
}


export const SYNCRAFT_LOGO_SVG = `<svg class="syncraft-logo-svg" viewBox="0 0 764.6 136.8" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path fill="currentColor" d="M0,136.1v-38.8h34.2c21.2,0,41.1-10.2,53.5-27.4l5.2-7.2L0,87.5V.2h106.8c0,8.4-.1,16.9-.2,25.3-5,3.3-23.5,14.6-48.6,11.5-20.4-2.5-33.8-13.2-38.7-17.6,3.3,4.9,10.6,14.5,23.7,21.5,9.4,5,20.1,7.8,31.1,7.8h32.7c0,48.2-39.1,87.4-87.4,87.4H0Z"/>
  <g fill="currentColor">
    <path d="M482.3,85h12.9c-3,11.9-9.1,23.1-18.6,32.2l-.2.2c-27.1,26-70,25.4-96.2-1.5-26-27.1-25.6-70.2,1.3-96.4,27.1-26,70-25.4,96.2,1.5.2.2.4.4.6.6,8.2,8.5,13.7,18.6,16.5,29.3h-21.5c-11.5-20.7-32.8-36.9-55.3-38.4-23.5-1.6-40.9,13.9-42.7,37.4-2.4,35.6,29.4,72,64.1,74.1,23.5,1.6,41-13.2,42.8-37,0-.7,0-1.4,0-2.1h0Z"/>
    <path d="M564.1,108.2v28h-2.3c-18.5,0-34.3-12.2-40.9-29.5v11.3c0,4.6,1.3,9.1,3.6,13l3.2,5.3h-33.5l3.2-5.3c2.4-3.9,3.6-8.4,3.6-13V18.4c0-4.6-1.3-9.1-3.6-13l-3.2-5.3h16.8s10,0,10,0h0c.2,0,.3,0,.4,0,26.4-.4,42.3,21.9,42.7,49.5.2,26.9-15.5,49.4-40.9,51,6,8,14.6,13.1,24.2,13.1s9.4-1.3,13.5-3.5c.3-.2,3.2-2,3.2-2ZM521.4,95.6c6.7-.2,9.5-3.7,13.4-10,11.6-18.4,11.2-53.9-.9-71.9-3.5-5.2-6.9-8.3-12.7-8.6,0,0-.2,0-.3,0v90.5c.2,0,.3,0,.5,0Z"/>
    <path d="M643.7,136.2h-33.5s1.7-2.2,3.2-5.3c1-2,1.5-4,1.7-6.1l-8.1-44.7h-12.8l-9.3,41c-.5,3.3-.1,6.7,1.6,9.6,0,0,0,0,0,0l3.2,5.3h-23.6l3.2-5.3c.6-1,1.2-2.1,1.9-3.7,2-4.6,5.1-14.2,5.9-16.7l18.5-81.3c.8-3.6,1.2-7.2,1.2-10.9s-1.2-8.4-3.6-13c-2.4-4.6-3.2-5.3-3.2-5.3h22.7l20.1,110.5h0s0,.1,0,.2v.4c.5,2.2,2.3,10.5,7.8,19.7,1.1,1.9,3.2,5.3,3.2,5.3ZM605.1,70.2l-3.9-21.4-4.9,21.4h8.8Z"/>
    <path d="M694.2.1v29.2l-5.8-9.6c-3.6-6-10.1-9.7-17.2-9.7h-.2v52.2c3.3-1.2,6.2-3.4,7.9-6.6l5-9.3v43.5l-5-9.3c-1.7-3.2-4.6-5.4-7.9-6.6v43.9c0,4.6,1.3,9.1,3.6,13l3.2,5.3h-33.5l3.2-5.3c2.4-3.9,3.6-8.4,3.6-13V18.4c0-4.6-1.3-9.1-3.6-13l-3.2-5.3h49.8Z"/>
    <path d="M764.6.3v29.3l-5.8-9.6c-3.6-6-10.1-9.7-17.2-9.7h-.2v107.8c0,4.6,1.3,9.1,3.6,13l3.2,5.3h-33.5l3.2-5.3c2.4-3.9,3.6-8.4,3.6-13V10.2h-.1c-7,0-13.5,3.7-17.2,9.7l-5.8,9.6V.3h66.1Z"/>
    <path d="M240.6,135.9V0h38.8l29.1,58.2V0h38.8v135.9h-38.8l-47.1-90.7,18,90.7h-38.8Z"/>
    <path d="M146.7,93.4L117.4.5h54.5l1.4,46.3h5.3l1.4-46.3h54.5l-15,20.2c-24.7,33.3-32,76.5-19.7,116.1h0s-53.1,0-53.1,0v-43.5Z"/>
  </g>
</svg>`;

/**
 * Resizes a base64 image DataURL to a maximum width/height while maintaining aspect ratio,
 * and outputs it as a compressed JPEG base64 DataURL.
 */
export function resizeImage(base64Str, maxDim = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl);
    };
    img.onerror = (err) => reject(err);
    img.src = base64Str;
  });
}

// ─────────────────────────────────────────────
// DPI METADATA INJECTION UTILITIES
// ─────────────────────────────────────────────

let pngDataTable = null;

function createPngDataTable() {
  const crcTable = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }
  return crcTable;
}

function calcCrc(buf) {
  let c = -1;
  if (!pngDataTable) pngDataTable = createPngDataTable();
  for (let n = 0; n < buf.length; n++) {
    c = pngDataTable[(c ^ buf[n]) & 0xFF] ^ (c >>> 8);
  }
  return c ^ -1;
}

const PNG = 'image/png';
const JPEG = 'image/jpeg';

const _P = 'p'.charCodeAt(0);
const _H = 'H'.charCodeAt(0);
const _Y = 'Y'.charCodeAt(0);
const _S = 's'.charCodeAt(0);

function changeDpiOnArray(dataArray, dpi, format) {
  if (format === JPEG) {
    if (dataArray.length >= 18) {
      dataArray[13] = 1; // 1 pixel per inch (DPI)
      dataArray[14] = dpi >> 8; // dpiX high byte
      dataArray[15] = dpi & 0xff; // dpiX low byte
      dataArray[16] = dpi >> 8; // dpiY high byte
      dataArray[17] = dpi & 0xff; // dpiY low byte
    }
    return dataArray;
  }
  if (format === PNG) {
    const physChunk = new Uint8Array(13);
    // dpi to dots per meter conversion: 1 inch = 0.0254 meters, so dpi * (1 / 0.0254) = dpi * 39.3700787...
    const dpm = Math.round(dpi * 39.37007874);
    physChunk[0] = _P;
    physChunk[1] = _H;
    physChunk[2] = _Y;
    physChunk[3] = _S;
    physChunk[4] = dpm >>> 24; // dpiX highest byte
    physChunk[5] = dpm >>> 16; // dpiX veryhigh byte
    physChunk[6] = dpm >>> 8; // dpiX high byte
    physChunk[7] = dpm & 0xff; // dpiX low byte
    physChunk[8] = physChunk[4]; // dpiY highest byte
    physChunk[9] = physChunk[5]; // dpiY veryhigh byte
    physChunk[10] = physChunk[6]; // dpiY high byte
    physChunk[11] = physChunk[7]; // dpiY low byte
    physChunk[12] = 1; // dot per meter unit indicator

    const crc = calcCrc(physChunk);

    const crcChunk = new Uint8Array(4);
    crcChunk[0] = crc >>> 24;
    crcChunk[1] = crc >>> 16;
    crcChunk[2] = crc >>> 8;
    crcChunk[3] = crc & 0xff;

    // A standard PNG always has IHDR length = 33 bytes.
    // We insert the pHYs chunk immediately after the IHDR chunk (at byte offset 33).
    const chunkLength = new Uint8Array(4);
    chunkLength[0] = 0;
    chunkLength[1] = 0;
    chunkLength[2] = 0;
    chunkLength[3] = 9; // pHYs chunk has 9 bytes of data

    const finalHeader = new Uint8Array(54);
    finalHeader.set(dataArray, 0);
    finalHeader.set(chunkLength, 33);
    finalHeader.set(physChunk, 37);
    finalHeader.set(crcChunk, 50);
    return finalHeader;
  }
  return dataArray;
}

/**
 * Changes the DPI metadata of a JPEG or PNG blob.
 * @param {Blob} blob - The input image blob.
 * @param {number} dpi - The target DPI resolution (e.g. 300).
 * @returns {Promise<Blob>} A promise that resolves to the modified Blob.
 */
export function changeDpiBlob(blob, dpi) {
  // We only need the first 33 bytes to perform/verify header structure modification
  const headerChunk = blob.slice(0, 33);
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    fileReader.onload = () => {
      try {
        const dataArray = new Uint8Array(fileReader.result);
        const tail = blob.slice(33);
        const changedArray = changeDpiOnArray(dataArray, dpi, blob.type);
        resolve(new Blob([changedArray, tail], { type: blob.type }));
      } catch (err) {
        reject(err);
      }
    };
    fileReader.onerror = () => reject(fileReader.error);
    fileReader.readAsArrayBuffer(headerChunk);
  });
}


