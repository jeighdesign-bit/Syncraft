// ─────────────────────────────────────────────────────────────
// SYNCRAFT  –  Interactive Onboarding Walkthrough
// ─────────────────────────────────────────────────────────────

export function initOnboarding() {
  // Only run onboarding once
  if (localStorage.getItem('syncraft_onboarding_completed') === 'true') {
    return;
  }

  // Define steps
  const steps = [
    {
      title: "Welcome to Syncraft! 🚀",
      description: "Let's take a quick 1-minute tour of your new AI design workspace.",
      target: null // Centered
    },
    {
      title: "Upload Reference Image 📸",
      description: "Drop or upload your sketch, logo, mockup, or pattern here. Syncraft will extract it automatically.",
      target: "#prompt-upload-btn-floating"
    },
    {
      title: "Frontier AI Models 🧠",
      description: "Choose your model here. We have set <strong>Syncraft Ultra (Creative)</strong> as your default for maximum quality design generation!",
      target: "#tab-model"
    },
    {
      title: "Post-Processing Actions ⚡",
      description: "Remove background, edit specific regions (by dragging on the canvas), or Upscale/Vectorize your designs once generated.",
      target: ".actions-list"
    },
    {
      title: "Crisp Vector Exports 📥",
      description: "Download your completed design. SVGs and PDFs are fully editable vector paths natively compatible with <strong>Adobe Illustrator</strong> and <strong>Figma</strong>.",
      target: ".export-section"
    }
  ];

  let currentStep = 0;

  // Create Backdrop & Tooltip DOM elements
  const backdrop = document.createElement('div');
  backdrop.className = 'onboarding-backdrop';
  Object.assign(backdrop.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100vw',
    height: '100vh',
    background: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(3px)',
    zIndex: '99998',
    transition: 'all 0.3s ease',
    opacity: '0',
    pointerEvents: 'auto'
  });

  const card = document.createElement('div');
  card.className = 'onboarding-card';
  Object.assign(card.style, {
    position: 'fixed',
    zIndex: '99999',
    width: '320px',
    background: 'rgba(18, 18, 20, 0.9)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    padding: '20px',
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 1px rgba(255,255,255,0.2) inset',
    color: '#fff',
    fontFamily: "'Sora', sans-serif",
    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    opacity: '0',
    transform: 'translate(-50%, -50%) scale(0.9)'
  });

  document.body.appendChild(backdrop);
  document.body.appendChild(card);

  // Trigger smooth fade-in
  requestAnimationFrame(() => {
    backdrop.style.opacity = '1';
  });

  function renderStep() {
    const step = steps[currentStep];
    
    // Clear previously highlighted element
    const prevHighlight = document.querySelector('.onboarding-highlight');
    if (prevHighlight) {
      prevHighlight.classList.remove('onboarding-highlight');
      prevHighlight.style.boxShadow = '';
      prevHighlight.style.position = '';
      prevHighlight.style.zIndex = '';
    }

    card.innerHTML = `
      <div style="font-size: 11px; font-weight: 800; color: var(--color-primary); letter-spacing: 0.1em; margin-bottom: 6px;">TOUR ${currentStep + 1} OF ${steps.length}</div>
      <h4 style="font-size: 16px; font-weight: 700; margin-bottom: 8px; color: #fff;">${step.title}</h4>
      <p style="font-size: 12px; color: rgba(255,255,255,0.7); line-height: 1.5; margin-bottom: 18px;">${step.description}</p>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <button id="onboarding-skip" style="background: none; border: none; color: rgba(255,255,255,0.4); font-size: 11px; cursor: pointer; font-weight: 600; padding: 6px 0;">Skip Tour</button>
        <div style="display: flex; gap: 8px;">
          ${currentStep > 0 ? `<button id="onboarding-prev" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); color: #fff; border-radius: 6px; padding: 6px 12px; font-size: 11px; cursor: pointer; font-weight: 600; transition: all 0.2s;">Back</button>` : ''}
          <button id="onboarding-next" style="background: var(--color-primary); border: none; color: #000; border-radius: 6px; padding: 6px 14px; font-size: 11px; cursor: pointer; font-weight: 700; transition: all 0.2s; box-shadow: 0 4px 12px rgba(212, 255, 89, 0.2);">${currentStep === steps.length - 1 ? 'Finish' : 'Next'}</button>
        </div>
      </div>
    `;

    // Position card
    if (step.target) {
      const el = document.querySelector(step.target);
      if (el) {
        el.classList.add('onboarding-highlight');
        el.style.position = 'relative';
        el.style.zIndex = '99999';
        el.style.boxShadow = '0 0 0 9999px rgba(0, 0, 0, 0.6), 0 0 25px rgba(212, 255, 89, 0.6)';

        const rect = el.getBoundingClientRect();
        // Position card relative to highlighted element
        const isNearBottom = rect.bottom > window.innerHeight * 0.7;
        const isNearRight = rect.right > window.innerWidth * 0.7;
        
        let targetX = rect.left + rect.width / 2;
        let targetY = isNearBottom ? rect.top - 20 : rect.bottom + 20;

        // Adjust constraints
        if (targetX - 160 < 20) targetX = 180;
        if (targetX + 160 > window.innerWidth - 20) targetX = window.innerWidth - 180;

        card.style.left = `${targetX}px`;
        card.style.top = `${targetY}px`;
        card.style.transform = isNearBottom ? 'translate(-50%, -100%) scale(1)' : 'translate(-50%, 0) scale(1)';
      } else {
        // Fallback to center if element not found
        centerCard();
      }
    } else {
      centerCard();
    }

    card.style.opacity = '1';

    // Hook listeners
    const btnNext = card.querySelector('#onboarding-next');
    const btnPrev = card.querySelector('#onboarding-prev');
    const btnSkip = card.querySelector('#onboarding-skip');

    btnNext?.addEventListener('click', () => {
      if (currentStep === steps.length - 1) {
        completeOnboarding();
      } else {
        currentStep++;
        renderStep();
      }
    });

    btnPrev?.addEventListener('click', () => {
      if (currentStep > 0) {
        currentStep--;
        renderStep();
      }
    });

    btnSkip?.addEventListener('click', completeOnboarding);
  }

  function centerCard() {
    card.style.left = '50%';
    card.style.top = '50%';
    card.style.transform = 'translate(-50%, -50%) scale(1)';
  }

  function completeOnboarding() {
    localStorage.setItem('syncraft_onboarding_completed', 'true');
    
    // Clear highlight styles
    const prevHighlight = document.querySelector('.onboarding-highlight');
    if (prevHighlight) {
      prevHighlight.classList.remove('onboarding-highlight');
      prevHighlight.style.boxShadow = '';
      prevHighlight.style.position = '';
      prevHighlight.style.zIndex = '';
    }

    backdrop.style.opacity = '0';
    card.style.opacity = '0';
    card.style.transform = 'translate(-50%, -50%) scale(0.9)';

    setTimeout(() => {
      backdrop.remove();
      card.remove();
    }, 300);
  }

  // Start tour
  renderStep();
}
