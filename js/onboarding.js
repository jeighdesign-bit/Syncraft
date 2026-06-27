// ─────────────────────────────────────────────────────────────
// SYNCRAFT  –  Interactive Onboarding Modal (Carousel + Video)
// ─────────────────────────────────────────────────────────────

let onboardingActive = false;

export function initOnboarding(force = false) {
  if (!force && localStorage.getItem('syncraft_onboarding_completed') === 'true') return;
  if (onboardingActive) return;
  onboardingActive = true;

  // Clean up stale DOM
  document.querySelectorAll('.onboarding-backdrop, .onboarding-modal').forEach(el => el.remove());

  // ── Slide Data ──
  // Set `media` to a video URL (mp4/webm) or image URL.
  // Set `mediaType` to 'video' or 'image'.
  const slides = [
    {
      mediaType: 'video',
      media: '',  // ← Put your demo video URL here (e.g. 'assets/demo-intro.mp4')
      fallbackText: '🚀',
      title: 'Welcome to Syncraft',
      description: 'Your AI-powered design workspace. Upload a reference, and Syncraft extracts clean, editable vector designs in seconds.'
    },
    {
      mediaType: 'image',
      media: '',
      fallbackText: '📸',
      title: 'Upload a Reference',
      description: 'Drop or upload your sketch, logo, mockup, or pattern. Syncraft will extract and transform it automatically.'
    },
    {
      mediaType: 'image',
      media: '',
      fallbackText: '🧠',
      title: 'Choose Your AI Model',
      description: '<strong>Syncraft Ultra (Creative)</strong> is set as your default for maximum quality. Switch models anytime from the prompt bar.'
    },
    {
      mediaType: 'image',
      media: '',
      fallbackText: '⚡',
      title: 'Post-Processing Tools',
      description: 'Remove backgrounds, annotate regions for AI edits, vectorize raster outputs, or upscale designs — all in one click.'
    },
    {
      mediaType: 'image',
      media: '',
      fallbackText: '📥',
      title: 'Export Anywhere',
      description: 'Download as SVG, PNG, JPEG, or PDF. All vector exports are natively compatible with <strong>Adobe Illustrator</strong> and <strong>Figma</strong>.'
    }
  ];

  let current = 0;

  // ── Backdrop ──
  const backdrop = document.createElement('div');
  backdrop.className = 'onboarding-backdrop';
  Object.assign(backdrop.style, {
    position: 'fixed', inset: '0',
    background: 'rgba(0, 0, 0, 0.55)',
    zIndex: '99998',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'opacity 0.3s ease',
    opacity: '0'
  });

  // ── Modal ──
  const modal = document.createElement('div');
  modal.className = 'onboarding-modal';
  Object.assign(modal.style, {
    position: 'relative',
    width: '420px', maxWidth: '92vw',
    background: '#141416',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset',
    fontFamily: "'Sora', sans-serif",
    color: '#fff',
    transition: 'transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease',
    transform: 'scale(0.92)', opacity: '0'
  });

  // ── Close X Button ──
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '✕';
  Object.assign(closeBtn.style, {
    position: 'absolute', top: '12px', right: '14px', zIndex: '5',
    background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)',
    fontSize: '16px', cursor: 'pointer', lineHeight: '1',
    transition: 'color 0.2s'
  });
  closeBtn.addEventListener('mouseenter', () => closeBtn.style.color = '#fff');
  closeBtn.addEventListener('mouseleave', () => closeBtn.style.color = 'rgba(255,255,255,0.35)');
  closeBtn.addEventListener('click', finish);
  modal.appendChild(closeBtn);

  // ── Media Container ──
  const mediaBox = document.createElement('div');
  Object.assign(mediaBox.style, {
    width: '100%', height: '220px',
    background: '#0c0c0e',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', position: 'relative'
  });
  modal.appendChild(mediaBox);

  // ── Body ──
  const body = document.createElement('div');
  Object.assign(body.style, { padding: '24px 28px 20px' });
  modal.appendChild(body);

  const titleEl = document.createElement('h3');
  Object.assign(titleEl.style, {
    fontSize: '18px', fontWeight: '700', margin: '0 0 8px', color: '#fff'
  });
  body.appendChild(titleEl);

  const descEl = document.createElement('p');
  Object.assign(descEl.style, {
    fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.6', margin: '0 0 20px'
  });
  body.appendChild(descEl);

  // ── Footer (dots + buttons) ──
  const footer = document.createElement('div');
  Object.assign(footer.style, {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
  });
  body.appendChild(footer);

  // Dots
  const dotsWrap = document.createElement('div');
  Object.assign(dotsWrap.style, { display: 'flex', gap: '6px' });
  footer.appendChild(dotsWrap);

  // Buttons
  const btnsWrap = document.createElement('div');
  Object.assign(btnsWrap.style, { display: 'flex', gap: '8px', alignItems: 'center' });
  footer.appendChild(btnsWrap);

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  // Animate in
  requestAnimationFrame(() => {
    backdrop.style.opacity = '1';
    modal.style.opacity = '1';
    modal.style.transform = 'scale(1)';
  });

  function renderSlide() {
    const slide = slides[current];

    // ── Media ──
    mediaBox.innerHTML = '';
    if (slide.media) {
      if (slide.mediaType === 'video') {
        const video = document.createElement('video');
        video.src = slide.media;
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        Object.assign(video.style, {
          width: '100%', height: '100%', objectFit: 'cover'
        });
        mediaBox.appendChild(video);
      } else {
        const img = document.createElement('img');
        img.src = slide.media;
        Object.assign(img.style, {
          width: '100%', height: '100%', objectFit: 'cover'
        });
        mediaBox.appendChild(img);
      }
    } else {
      // Fallback: big emoji + gradient bg
      const fallback = document.createElement('div');
      Object.assign(fallback.style, {
        fontSize: '64px', lineHeight: '1',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '100%', height: '100%',
        background: 'linear-gradient(135deg, rgba(212,255,89,0.08) 0%, rgba(0,0,0,0) 60%)'
      });
      fallback.textContent = slide.fallbackText;
      mediaBox.appendChild(fallback);
    }

    // ── Text ──
    titleEl.textContent = slide.title;
    descEl.innerHTML = slide.description;

    // ── Dots ──
    dotsWrap.innerHTML = '';
    slides.forEach((_, i) => {
      const dot = document.createElement('div');
      const isActive = i === current;
      Object.assign(dot.style, {
        width: isActive ? '18px' : '6px', height: '6px',
        borderRadius: '3px',
        background: isActive ? 'var(--color-primary, #d4ff59)' : 'rgba(255,255,255,0.15)',
        transition: 'all 0.3s ease', cursor: 'pointer'
      });
      dot.addEventListener('click', () => { current = i; renderSlide(); });
      dotsWrap.appendChild(dot);
    });

    // ── Buttons ──
    btnsWrap.innerHTML = '';

    const skipBtn = document.createElement('button');
    skipBtn.textContent = 'Skip';
    Object.assign(skipBtn.style, {
      background: 'none', border: 'none',
      color: 'rgba(255,255,255,0.4)', fontSize: '12px',
      cursor: 'pointer', fontWeight: '600', padding: '8px 4px'
    });
    skipBtn.addEventListener('click', finish);
    btnsWrap.appendChild(skipBtn);

    const nextBtn = document.createElement('button');
    nextBtn.textContent = current === slides.length - 1 ? 'Get Started' : 'Next';
    Object.assign(nextBtn.style, {
      background: 'var(--color-primary, #d4ff59)', border: 'none',
      color: '#000', borderRadius: '8px', padding: '8px 18px',
      fontSize: '12px', fontWeight: '700', cursor: 'pointer',
      boxShadow: '0 4px 14px rgba(212,255,89,0.25)',
      transition: 'transform 0.15s ease'
    });
    nextBtn.addEventListener('mouseenter', () => nextBtn.style.transform = 'scale(1.03)');
    nextBtn.addEventListener('mouseleave', () => nextBtn.style.transform = 'scale(1)');
    nextBtn.addEventListener('click', () => {
      if (current >= slides.length - 1) { finish(); return; }
      current++;
      renderSlide();
    });
    btnsWrap.appendChild(nextBtn);
  }

  function finish() {
    localStorage.setItem('syncraft_onboarding_completed', 'true');
    backdrop.style.opacity = '0';
    modal.style.opacity = '0';
    modal.style.transform = 'scale(0.92)';
    setTimeout(() => {
      backdrop.remove();
      onboardingActive = false;
    }, 350);
  }

  // Keyboard nav
  const keyHandler = (e) => {
    if (!onboardingActive) return;
    if (e.key === 'Escape') finish();
    if (e.key === 'ArrowRight' || e.key === 'Enter') {
      if (current >= slides.length - 1) finish();
      else { current++; renderSlide(); }
    }
    if (e.key === 'ArrowLeft' && current > 0) {
      current--;
      renderSlide();
    }
  };
  document.addEventListener('keydown', keyHandler);

  // Click outside modal to skip
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) finish();
  });

  renderSlide();
}
