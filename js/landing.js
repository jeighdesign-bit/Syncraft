// ─────────────────────────────────────────────
// LANDING PAGE CONTROLLER  –  Phase 1 + 2
// ─────────────────────────────────────────────
import { showToast, openModal } from './utils.js';
import ProjectService           from './projectService.js?v=2.0.5';
import authService              from './authService.js?v=2.0.5';

import { useAuth }              from './authContext.js';


export function initLandingPage(router) {
  console.log("Syncraft Landing Page Loaded (v1.0.5 - Global Auth Context & Dynamic Header)");

  // ── 1. LOGO → HOME ──────────────────────────
  const logo = document.querySelector('#landing-view .logo-text');
  if (logo) {
    logo.style.cursor = 'pointer';
    logo.addEventListener('click', () => router.navigate(''));
  }

  // ── 2. DESKTOP NAV LINKS ────────────────────
  // Features / Get Started / FAQ → smooth-scroll to section id
  // About Us → open modal
  // Log In   → navigate to workspace
  const navLinks = document.querySelectorAll('#landing-view .landing-nav a, #global-header .global-header-nav a');
  navLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href') || '';

      if (href === '#/workspace' || link.textContent.trim() === 'About Us') {
        e.preventDefault();
        showAboutModal();
        return;
      }

      if (href.startsWith('#/')) {
        e.preventDefault();
        router.navigate(href.slice(2));
        return;
      }

      if (href.startsWith('#')) {
        e.preventDefault();
        const target = document.getElementById(href.slice(1));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ── Helper: navigate to Dashboard (the user's home) ───
  function launchDashboard() {
    router.navigate('dashboard');
  }

  // ── Helper: render the landing page header actions based on auth state ───
  const navActionsContainer = document.querySelector('#landing-view .landing-nav-actions');

  function renderLandingHeader(state) {
    const isAuth = state ? state.isAuthenticated : authService.isAuthenticated();
    if (!navActionsContainer) return;
    navActionsContainer.innerHTML = '';

    if (isAuth) {
      // 1. Dashboard button/link
      const dbBtn = document.createElement('button');
      dbBtn.className = 'pill-button pill-button-primary';
      dbBtn.textContent = 'Dashboard';
      dbBtn.addEventListener('click', launchDashboard);
      navActionsContainer.appendChild(dbBtn);

      // 2. User Avatar
      const avatarBtn = document.createElement('div');
      avatarBtn.className = 'db-header-avatar landing-nav-avatar';
      avatarBtn.title = 'View Profile & Billing';
      avatarBtn.style.cssText = `
        cursor: pointer;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--color-surface-container-high);
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--color-outline-dim);
        flex-shrink: 0;
        transition: border-color 0.15s, background 0.15s;
      `;
      avatarBtn.innerHTML = `<i class="icon fi fi-br-user" style="font-size:15px;color:rgba(255,255,255,0.7);"></i>`;
      avatarBtn.addEventListener('mouseover', () => {
        avatarBtn.style.borderColor = 'var(--color-primary)';
        avatarBtn.style.background = 'var(--color-surface-container-highest)';
      });
      avatarBtn.addEventListener('mouseout', () => {
        avatarBtn.style.borderColor = 'var(--color-outline-dim)';
        avatarBtn.style.background = 'var(--color-surface-container-high)';
      });
      avatarBtn.addEventListener('click', () => {
        router.navigate('settings?tab=profile');
      });
      navActionsContainer.appendChild(avatarBtn);
    } else {
      // 1. Log In button
      const loginBtn = document.createElement('button');
      loginBtn.className = 'pill-button pill-button-secondary';
      loginBtn.textContent = 'Log In';
      loginBtn.style.marginRight = '8px';
      loginBtn.addEventListener('click', () => router.navigate('auth/login'));
      navActionsContainer.appendChild(loginBtn);

      // 2. Sign Up button
      const signupBtn = document.createElement('button');
      signupBtn.className = 'pill-button pill-button-primary';
      signupBtn.textContent = 'Sign Up';
      signupBtn.addEventListener('click', () => router.navigate('auth/signup'));
      navActionsContainer.appendChild(signupBtn);
    }
  }

  // Subscribe to global auth state changes to dynamically update the header components
  const unsubscribeAuth = useAuth((state) => {
    renderLandingHeader(state);
  });

  // ── 3. MOBILE HAMBURGER MENU ────────────────
  const mobileMenuBtn = document.querySelector('#landing-view .landing-header > button[aria-label="Open Menu"]');
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => openMobileMenu(router));
  }
  document.addEventListener('syncraft:openMobileMenu', () => {
    openMobileMenu(router);
  });

  // ── 4. SMOOTH SCROLL (generic fallback) ─────
  document.querySelectorAll('#landing-view a[href^="#"]:not([href^="#/"])').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href').slice(1);
      const target = document.getElementById(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ── 5. FAQ ACCORDION (one-at-a-time) ────────
  const faqItems = document.querySelectorAll('#landing-view details.faq-item');
  faqItems.forEach((item) => {
    item.addEventListener('click', () => {
      if (!item.hasAttribute('open')) {
        faqItems.forEach((other) => {
          if (other !== item) other.removeAttribute('open');
        });
      }
    });
  });

  // ── 6. ANGLED BOX CHIPS ─────────────────────
  // (Removed click handler to make angled boxes display-only)

  // ── 7. START CREATING CTA ───────────────────
  const startCta = document.querySelector('#landing-view .start-creating-cta');
  if (startCta) startCta.addEventListener('click', launchDashboard);

  // ── 8. CAPABILITY CARDS ─────────────────────
  // (Removed click handler to make capability card buttons display-only)

  // ── 9. PRICING SLIDER & BUTTONS (21st.dev Style) ──
  const landingSlider = document.getElementById('landing-pro-slider');
  const calcSliderVal = document.getElementById('calc-slider-val');
  
  const resultCard = document.getElementById('pricing-result-card');
  const resultBadge = document.getElementById('result-badge');
  const resultPlanTitle = document.getElementById('result-plan-title');
  const resultPlanDesc = document.getElementById('result-plan-desc');
  const resultPrice = document.getElementById('result-price');
  const resultFeatures = document.getElementById('result-features');
  const resultActionBtn = document.getElementById('result-action-btn');

  const sliderSteps = [
    { price: 0, tokens: 15, plan: 'Starter', badge: 'Free Trial', desc: 'Essential tools for individual operators.', btnText: 'Initialize Free' },
    { price: 250, tokens: 100, plan: 'Professional', badge: 'Optimal Deployment', desc: 'Advanced capabilities for active environments.', btnText: 'Deploy Pro' },
    { price: 315, tokens: 130, plan: 'Professional', badge: 'Optimal Deployment', desc: 'Advanced capabilities for active environments.', btnText: 'Deploy Pro' },
    { price: 380, tokens: 160, plan: 'Professional', badge: 'Optimal Deployment', desc: 'Advanced capabilities for active environments.', btnText: 'Deploy Pro' },
    { price: 445, tokens: 190, plan: 'Professional', badge: 'Optimal Deployment', desc: 'Advanced capabilities for active environments.', btnText: 'Deploy Pro' },
    { price: 510, tokens: 220, plan: 'Professional', badge: 'Optimal Deployment', desc: 'Advanced capabilities for active environments.', btnText: 'Deploy Pro' },
    { price: 575, tokens: 250, plan: 'Professional', badge: 'Optimal Deployment', desc: 'Advanced capabilities for active environments.', btnText: 'Deploy Pro' },
    { price: 640, tokens: 280, plan: 'Professional', badge: 'Optimal Deployment', desc: 'Advanced capabilities for active environments.', btnText: 'Deploy Pro' },
    { price: 705, tokens: 310, plan: 'Professional', badge: 'Optimal Deployment', desc: 'Advanced capabilities for active environments.', btnText: 'Deploy Pro' },
    { price: 770, tokens: 340, plan: 'Professional', badge: 'Optimal Deployment', desc: 'Advanced capabilities for active environments.', btnText: 'Deploy Pro' },
    { price: 835, tokens: 370, plan: 'Professional', badge: 'Optimal Deployment', desc: 'Advanced capabilities for active environments.', btnText: 'Deploy Pro' },
    { price: 899, tokens: 400, plan: 'Professional', badge: 'Optimal Deployment', desc: 'Advanced capabilities for active environments.', btnText: 'Deploy Pro' }
  ];

  if (landingSlider) {
    const updatePricingDisplay = () => {
      const stepIndex = parseInt(landingSlider.value);
      const step = sliderSteps[stepIndex];
      
      // Update selected budget display
      if (calcSliderVal) calcSliderVal.textContent = `₱${step.price}`;
      
      // Update card details
      if (resultBadge) resultBadge.textContent = step.badge;
      if (resultPlanTitle) resultPlanTitle.textContent = step.plan;
      if (resultPlanDesc) resultPlanDesc.textContent = step.desc;
      if (resultPrice) resultPrice.textContent = `₱${step.price}`;
      if (resultActionBtn) resultActionBtn.textContent = step.btnText;

      // Toggle lime-green highlight based on plan
      if (resultCard) {
        if (step.plan === 'Professional') {
          resultCard.classList.add('pricing-card-pro');
        } else {
          resultCard.classList.remove('pricing-card-pro');
        }
      }

      // Populate features dynamically
      if (resultFeatures) {
        if (step.plan === 'Starter') {
          resultFeatures.innerHTML = `
            <li class="pricing-feature-item" style="display:flex; align-items:center; gap:8px;">
              <i class="icon fi fi-br-check-circle pricing-feature-icon" style="color:var(--color-primary);"></i>
              15 free trial tokens
            </li>
            <li class="pricing-feature-item" style="display:flex; align-items:center; gap:8px;">
              <i class="icon fi fi-br-check-circle pricing-feature-icon" style="color:var(--color-primary);"></i>
              Standard response speed
            </li>
            <li class="pricing-feature-item" style="display:flex; align-items:center; gap:8px;">
              <i class="icon fi fi-br-check-circle pricing-feature-icon" style="color:var(--color-primary);"></i>
              Basic de-mockup tools
            </li>
          `;
        } else {
          resultFeatures.innerHTML = `
            <li class="pricing-feature-item" style="display:flex; align-items:center; gap:8px;">
              <i class="icon fi fi-br-check-circle pricing-feature-icon" style="color:currentColor;"></i>
              <span><strong>${step.tokens.toLocaleString()}</strong> vector tokens / mo</span>
            </li>
            <li class="pricing-feature-item" style="display:flex; align-items:center; gap:8px;">
              <i class="icon fi fi-br-check-circle pricing-feature-icon" style="color:currentColor;"></i>
              Priority queue routing
            </li>
            <li class="pricing-feature-item" style="display:flex; align-items:center; gap:8px;">
              <i class="icon fi fi-br-check-circle pricing-feature-icon" style="color:currentColor;"></i>
              Clean background patterns
            </li>
            <li class="pricing-feature-item" style="display:flex; align-items:center; gap:8px;">
              <i class="icon fi fi-br-check-circle pricing-feature-icon" style="color:currentColor;"></i>
              Unlimited downloads
            </li>
          `;
        }
      }
    };

    landingSlider.addEventListener('input', updatePricingDisplay);
    updatePricingDisplay(); // initial sync

    // Bind action button click
    if (resultActionBtn) {
      resultActionBtn.addEventListener('click', () => {
        const stepIndex = parseInt(landingSlider.value);
        const step = sliderSteps[stepIndex];
        
        if (authService.isAuthenticated()) {
          if (step.plan === 'Starter') {
            router.navigate('dashboard');
          } else {
            router.navigate(`checkout?price=${step.price}&tokens=${step.tokens}`);
          }
        } else {
          router.navigate('auth/signup');
        }
      });
    }
  }

  // Bind Enterprise contact button
  const enterpriseBtn = document.getElementById('landing-enterprise-btn');
  if (enterpriseBtn) {
    enterpriseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showContactModal();
    });
  }


  // ── 10. WATCH DEMO BUTTON ───────────────────
  const mockEditor = document.getElementById('demo-mock-editor');
  const mockPlayOverlay = document.getElementById('mock-play-overlay');
  const mockPromptInput = document.getElementById('mock-prompt-input');
  const mockPromptStatus = document.getElementById('mock-prompt-status');
  const mockCursor = document.querySelector('.mock-cursor-pointer');
  
  const mockCard1 = document.getElementById('mock-card-1');
  const mockCard2 = document.getElementById('mock-card-2');
  const mockSvg1 = document.getElementById('mock-svg-1');
  const mockSvg2 = document.getElementById('mock-svg-2');
  
  let isSimulating = false;

  function runWorkspaceSimulation() {
    if (isSimulating) return;
    isSimulating = true;

    const mockCore1 = mockCard1 ? mockCard1.querySelector('.anim-core') : null;
    const mockCore2 = mockCard2 ? mockCard2.querySelector('.anim-core') : null;

    // Reset layout states
    if (mockSvg1) mockSvg1.classList.remove('animating');
    if (mockSvg2) mockSvg2.classList.remove('animating');
    if (mockCard1) mockCard1.classList.remove('drawing');
    if (mockCard2) mockCard2.classList.remove('drawing');
    if (mockCore1) mockCore1.style.opacity = '0';
    if (mockCore2) mockCore2.style.opacity = '0';
    
    if (mockCursor) {
      mockCursor.style.top = '60%';
      mockCursor.style.left = '45%';
    }

    if (mockPromptStatus) mockPromptStatus.textContent = "Writing prompt...";

    // Hide play overlay
    if (mockPlayOverlay) mockPlayOverlay.style.opacity = '0';
    setTimeout(() => {
      if (mockPlayOverlay) mockPlayOverlay.style.pointerEvents = 'none';
    }, 300);

    // Scroll to mock editor if not in center of viewport
    if (mockEditor) {
      mockEditor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Step 1: Simulated prompt typing effect
    const promptText = "a cybernetic mascot logo, vector style, 4 images";
    let currentIdx = 0;
    if (mockPromptInput) mockPromptInput.value = "";
    
    const typingInterval = setInterval(() => {
      if (mockPromptInput && currentIdx < promptText.length) {
        mockPromptInput.value += promptText.charAt(currentIdx);
        currentIdx++;
      } else {
        clearInterval(typingInterval);
        
        // Step 2: Set status to Generating
        setTimeout(() => {
          if (mockPromptStatus) mockPromptStatus.textContent = "Generating vectors...";

          // Step 3: Move cursor to Card 1 and start drawing Card 1
          setTimeout(() => {
            if (mockCursor) {
              mockCursor.style.top = '34%';
              mockCursor.style.left = '29%';
            }

            setTimeout(() => {
              if (mockCard1) mockCard1.classList.add('drawing');
              if (mockSvg1) mockSvg1.classList.add('animating');

              setTimeout(() => {
                if (mockCore1) mockCore1.style.opacity = '1';

                // Step 4: Move cursor to Card 2 and start drawing Card 2
                setTimeout(() => {
                  if (mockCursor) {
                    mockCursor.style.top = '34%';
                    mockCursor.style.left = '45%';
                  }

                  setTimeout(() => {
                    if (mockCard2) mockCard2.classList.add('drawing');
                    if (mockSvg2) mockSvg2.classList.add('animating');

                    setTimeout(() => {
                      if (mockCore2) mockCore2.style.opacity = '1';

                      // Step 5: Completed
                      if (mockPromptStatus) mockPromptStatus.textContent = "All done";
                      
                      // Move cursor back to rest
                      setTimeout(() => {
                        if (mockCursor) {
                          mockCursor.style.top = '58%';
                          mockCursor.style.left = '50%';
                        }

                        // Simulation finished. Show overlay again after a reading delay
                        setTimeout(() => {
                          isSimulating = false;
                          if (mockPlayOverlay) {
                            mockPlayOverlay.style.pointerEvents = 'auto';
                            mockPlayOverlay.style.opacity = '1';
                          }
                        }, 4000);

                      }, 800);
                    }, 2000);
                  }, 600);
                }, 1000);
              }, 2000);
            }, 600);
          }, 800);
        }, 500);
      }
    }, 40);
  }

  const watchDemo = document.querySelector('#landing-view .cta-btn-try-free');
  if (watchDemo) {
    watchDemo.addEventListener('click', (e) => {
      e.preventDefault();
      runWorkspaceSimulation();
    });
  }

  if (mockPlayOverlay) {
    mockPlayOverlay.addEventListener('click', runWorkspaceSimulation);
  }

  // ── 11. READ DOCS BUTTON ────────────────────
  const readDocs = document.querySelector('#landing-view .cta-btn-doc');
  if (readDocs) readDocs.addEventListener('click', showDocsModal);

  // ── 12. FOOTER LINKS (privacy / terms) ──────
  document.querySelectorAll('#landing-view .footer-links a').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const page = a.textContent.trim();
      openModal(page, `
        <p style="margin-bottom:16px;">Our full ${page} policy will be available soon. We are committed to protecting your data and creative work.</p>
        <p>For questions, reach out to <strong style="color:var(--color-primary);">hello@syncraft.ai</strong></p>
      `);
    });
  });

  // ── MODAL HELPERS ────────────────────────────

  function showAboutModal() {
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

  function showContactModal() {
    openModal('Enterprise Sales', `
      <p style="margin-bottom:20px;">
        Interested in Syncraft for your organisation? Our sales team will put together a custom architecture plan tailored to your scale.
      </p>
      <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:24px;">
        <input placeholder="Your full name" style="
          width:100%; padding:12px 16px;
          background:var(--color-surface-container-highest);
          border:1px solid var(--color-outline-dim);
          border-radius:0.5rem; color:#fff; font-size:14px;
          outline:none; transition:border-color 0.15s;
        " onfocus="this.style.borderColor='var(--color-primary)'" onblur="this.style.borderColor='var(--color-outline-dim)'">
        <input placeholder="Work email" style="
          width:100%; padding:12px 16px;
          background:var(--color-surface-container-highest);
          border:1px solid var(--color-outline-dim);
          border-radius:0.5rem; color:#fff; font-size:14px;
          outline:none; transition:border-color 0.15s;
        " onfocus="this.style.borderColor='var(--color-primary)'" onblur="this.style.borderColor='var(--color-outline-dim)'">
        <textarea placeholder="Tell us about your team and requirements..." rows="3" style="
          width:100%; padding:12px 16px;
          background:var(--color-surface-container-highest);
          border:1px solid var(--color-outline-dim);
          border-radius:0.5rem; color:#fff; font-size:14px;
          outline:none; transition:border-color 0.15s; resize:vertical;
        " onfocus="this.style.borderColor='var(--color-primary)'" onblur="this.style.borderColor='var(--color-outline-dim)'"></textarea>
      </div>
      <button onclick="
        this.textContent='Request Sent ✓';
        this.style.background='var(--color-primary-dark)';
        this.disabled=true;
      " style="
        width:100%; padding:14px; border-radius:999px;
        background:var(--color-primary); color:#000;
        font-weight:800; font-size:14px; text-transform:uppercase;
        letter-spacing:0.05em; cursor:pointer; border:none;
        transition:background 0.15s, transform 0.15s;
      " onmouseover="this.style.background='var(--color-primary-light)'"
         onmouseout="if(!this.disabled) this.style.background='var(--color-primary)'">
        Send Request
      </button>
    `);
  }

  function showDemoModal() {
    openModal('Watch Demo', `
      <p style="margin-bottom:20px; color:var(--color-on-surface-variant);">See Syncraft in action — from prompt to production-ready SVG in under 10 seconds.</p>
      <div style="
        width:100%; aspect-ratio:16/9;
        background:var(--color-background);
        border-radius:0.75rem;
        border:1px solid var(--color-outline-dim);
        display:flex; align-items:center; justify-content:center;
        flex-direction:column; gap:16px;
        margin-bottom:20px;
        cursor:pointer;
        transition: border-color 0.15s;
      " onmouseover="this.style.borderColor='var(--color-primary)'"
         onmouseout="this.style.borderColor='var(--color-outline-dim)'"
         onclick="this.innerHTML='<p style=\\'color:var(--color-primary);font-weight:700;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;\\'>Demo video coming soon</p>'"
      >
        <i class="icon fi fi-br-play-circle" style="font-size:56px; color:var(--color-primary);"></i>
        <p style="font-size:13px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-on-surface-variant);">Click to play</p>
      </div>
      <p style="font-size:12px; color:var(--color-on-surface-variant); text-align:center;">Full video walkthrough will be available at launch.</p>
    `);
  }

  function showDocsModal() {
    openModal('Documentation', `
      <p style="margin-bottom:20px;">
        The Syncraft API & design documentation is currently in early access. Here's what's available:
      </p>
      <ul style="display:flex; flex-direction:column; gap:12px; list-style:none; padding:0;">
        ${[
          ['Getting Started', 'Set up your workspace and generate your first vector.'],
          ['Prompt Engineering', 'Best practices for writing effective vector prompts.'],
          ['Export Formats', 'SVG, EPS, PDF, PNG — output options explained.'],
          ['API Reference', 'Integrate Syncraft into your existing workflow.'],
        ].map(([title, desc]) => `
          <li style="
            padding:14px 16px;
            background:var(--color-surface-container-highest);
            border-radius:0.5rem;
            border:1px solid var(--color-outline-dim);
            cursor:pointer;
            transition: border-color 0.15s;
          " onmouseover="this.style.borderColor='var(--color-primary)'"
             onmouseout="this.style.borderColor='var(--color-outline-dim)'">
            <div style="font-weight:700; color:#fff; font-size:14px; margin-bottom:4px;">${title}</div>
            <div style="font-size:13px; color:var(--color-on-surface-variant);">${desc}</div>
          </li>
        `).join('')}
      </ul>
    `);
  }

  // ── 13. INTERACTIVE CARD SWAP (GSAP React Bits Style) ────────────────
  const cardStack = document.getElementById('card-swap-stack');
  const cards = Array.from(document.querySelectorAll('.swap-card'));
  const activeIcon = document.getElementById('swap-active-icon');
  const activeTitle = document.getElementById('swap-active-title');
  const activeDesc = document.getElementById('swap-active-desc');
  const activeBtn = document.getElementById('swap-active-btn');
  const activeDetails = document.getElementById('swap-active-details');

  let autoplayTimer = null;
  let isSwapping = false;
  let cardOrder = [...cards]; // Array keeping track of the visual order: [Front, Middle, Back]

  // Configuration for 3D stack
  const cardDistance = 28;
  const verticalDistance = 32;
  const skewAmount = 6;
  const swapDelay = 5000;

  const config = {
    ease: "elastic.out(0.65, 0.85)",
    durDrop: 1.2,
    durMove: 1.2,
    durReturn: 1.2,
    promoteOverlap: 0.85,
    returnDelay: 0.05,
  };

  function makeSlot(i, total) {
    return {
      x: i * cardDistance,
      y: -i * verticalDistance,
      z: -i * cardDistance * 1.5,
      zIndex: total - i,
    };
  }

  function applySlotStyles(el, slot, animate = false, delayTime = 0) {
    if (animate) {
      gsap.to(el, {
        x: slot.x,
        y: slot.y,
        z: slot.z,
        skewY: skewAmount,
        zIndex: slot.zIndex,
        duration: config.durMove,
        ease: config.ease,
        delay: delayTime,
        overwrite: "auto",
      });
    } else {
      gsap.set(el, {
        x: slot.x,
        y: slot.y,
        z: slot.z,
        skewY: skewAmount,
        transformOrigin: "center center",
        zIndex: slot.zIndex,
        force3D: true,
      });
    }
  }

  function initCards() {
    if (cardOrder.length === 0) return;
    cardOrder.forEach((el, i) => {
      const slot = makeSlot(i, cardOrder.length);
      applySlotStyles(el, slot, false);
      
      // Update DOM classes for visual styling (borders, backgrounds, pointer-events)
      el.classList.remove('card-pos-0', 'card-pos-1', 'card-pos-2');
      el.classList.add(`card-pos-${i}`);
    });
    
    // Initial sync of active details panel on the left
    updateActiveDetails(cardOrder[0], true);
  }

  function updateActiveDetails(card, immediate = false) {
    if (!card) return;
    const title = card.getAttribute('data-title');
    const desc = card.getAttribute('data-desc');
    const btnText = card.getAttribute('data-btn');
    const iconClass = card.getAttribute('data-icon');

    if (immediate) {
      if (activeTitle) activeTitle.textContent = title;
      if (activeDesc) activeDesc.textContent = desc;
      if (activeBtn) activeBtn.textContent = btnText;
      if (activeIcon) activeIcon.className = `icon fi ${iconClass}`;
      if (activeDetails) {
        activeDetails.style.opacity = '1';
        activeDetails.style.transform = 'translateY(0)';
      }
      return;
    }

    // Fade details out
    if (activeDetails) {
      activeDetails.style.opacity = '0';
      activeDetails.style.transform = 'translateY(10px)';
    }

    setTimeout(() => {
      if (activeTitle) activeTitle.textContent = title;
      if (activeDesc) activeDesc.textContent = desc;
      if (activeBtn) activeBtn.textContent = btnText;
      if (activeIcon) {
        activeIcon.className = `icon fi ${iconClass}`;
      }

      // Fade details in
      if (activeDetails) {
        activeDetails.style.opacity = '1';
        activeDetails.style.transform = 'translateY(0)';
      }
    }, 200);
  }

  function swapTopCard() {
    if (isSwapping || cardOrder.length < 2) return;
    isSwapping = true;

    const elFront = cardOrder[0];
    const rest = cardOrder.slice(1);

    // 1. Front card drops down and fades out
    const tl = gsap.timeline({
      onComplete: () => {
        // Re-order array: [Middle, Back, Front]
        cardOrder = [...rest, elFront];
        isSwapping = false;
      }
    });

    // Drop down transition (elastic drop-down look)
    tl.to(elFront, {
      y: "+=360",
      skewY: skewAmount - 8,
      rotation: -8,
      opacity: 0,
      duration: config.durDrop * 0.45,
      ease: "power2.in",
    });

    // 2. Shift remaining cards forward ( Middle -> Front, Back -> Middle )
    tl.addLabel("promote", `-=${config.durDrop * 0.2}`);
    
    rest.forEach((el, i) => {
      const slot = makeSlot(i, cardOrder.length);
      
      // Update DOM classes at start of movement for correct border/glow styling
      tl.call(() => {
        el.classList.remove('card-pos-0', 'card-pos-1', 'card-pos-2');
        el.classList.add(`card-pos-${i}`);
      }, null, "promote");

      tl.to(el, {
        x: slot.x,
        y: slot.y,
        z: slot.z,
        zIndex: slot.zIndex,
        skewY: skewAmount,
        duration: config.durMove,
        ease: config.ease,
      }, `promote+=${i * 0.1}`);
    });

    // 3. Return original front card to the back of the stack
    const backIndex = cardOrder.length - 1;
    const backSlot = makeSlot(backIndex, cardOrder.length);
    
    tl.addLabel("return", `promote+=${config.durMove * config.returnDelay}`);
    
    // Move front card to back slot coordinate/zIndex/class immediately while transparent
    tl.call(() => {
      elFront.classList.remove('card-pos-0', 'card-pos-1', 'card-pos-2');
      elFront.classList.add(`card-pos-${backIndex}`);
    }, null, "return");
    
    tl.set(elFront, {
      x: backSlot.x,
      z: backSlot.z,
      zIndex: backSlot.zIndex,
      skewY: skewAmount,
      rotation: 0,
    }, "return");

    // Rise up to final position
    tl.to(elFront, {
      y: backSlot.y,
      opacity: 1,
      duration: config.durReturn,
      ease: config.ease,
    }, "return");

    // Sync left details panel to match new top card (which is rest[0])
    updateActiveDetails(rest[0]);
  }

  // Initialize card stack placement
  if (cardStack && cards.length > 0) {
    initCards();

    // Bind clicks to manual swap
    cardStack.addEventListener('click', () => {
      swapTopCard();
      resetAutoplay();
    });

    // Autoplay implementation
    startAutoplay();

    cardStack.addEventListener('mouseenter', stopAutoplay);
    cardStack.addEventListener('mouseleave', startAutoplay);
  }

  // Bind dynamic details button click to route accordingly
  if (activeBtn) {
    activeBtn.addEventListener('click', () => {
      const topCard = cardOrder[0];
      if (topCard) {
        const action = topCard.getAttribute('data-action');
        if (action === 'workspace') {
          router.navigate('workspace');
        } else {
          router.navigate('dashboard');
        }
      }
    });
  }

  function startAutoplay() {
    if (!autoplayTimer && cardStack) {
      autoplayTimer = setInterval(swapTopCard, swapDelay);
    }
  }

  function stopAutoplay() {
    if (autoplayTimer) {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
  }

  function resetAutoplay() {
    stopAutoplay();
    startAutoplay();
  }
}

// ─────────────────────────────────────────────
// MOBILE MENU OVERLAY
// ─────────────────────────────────────────────
function openMobileMenu(router) {
  let overlay = document.getElementById('mobile-nav-overlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mobile-nav-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: var(--color-background);
      z-index: 9000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 28px;
      padding: 40px;
      opacity: 0;
      transform: translateY(-16px);
      transition: opacity 0.25s ease, transform 0.3s ease;
      pointer-events: none;
    `;

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = `
      position: absolute; top: 28px; right: 28px;
      background: none; border: none; color: var(--color-on-surface-variant);
      cursor: pointer; padding: 8px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      transition: color 0.15s, background 0.15s;
    `;
    closeBtn.innerHTML = '<i class="icon fi fi-br-cross" style="font-size:28px;"></i>';
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.color = '#fff';
      closeBtn.style.background = 'rgba(255,255,255,0.1)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.color = 'var(--color-on-surface-variant)';
      closeBtn.style.background = 'none';
    });
    closeBtn.addEventListener('click', close);
    overlay.appendChild(closeBtn);

    // Nav items
    const items = [
      { label: 'Features',    action: () => scrollTo('features') },
      { label: 'Get Started', action: () => scrollTo('pricing')  },
      { label: 'FAQ',         action: () => scrollTo('faq')      },
      { label: 'About Us',    action: () => {
          close();
          import('./landing.js').then(() => {
            // Inline about modal copy
            const { openModal } = { openModal: window._openModal };
            showToast('Opening About Us…');
          });
        }
      },
    ];

    items.forEach(({ label, action }) => {
      const a = document.createElement('a');
      a.textContent = label;
      a.style.cssText = `
        font-family: var(--font-family-display);
        font-size: 26px;
        font-weight: 800;
        text-transform: uppercase;
        color: var(--color-on-surface-variant);
        cursor: pointer;
        letter-spacing: -0.02em;
        transition: color 0.15s;
      `;
      a.addEventListener('mouseenter', () => a.style.color = 'var(--color-primary)');
      a.addEventListener('mouseleave', () => a.style.color = 'var(--color-on-surface-variant)');
      a.addEventListener('click', () => { close(); action(); });
      overlay.appendChild(a);
    });

    // Dynamic Auth Buttons for mobile menu
    function renderMobileAuthButtons() {
      // Remove any existing mobile-auth-btn items
      overlay.querySelectorAll('.mobile-auth-btn').forEach(btn => btn.remove());

      const isAuth = authService.isAuthenticated();
      const btnStyle = `
        margin-top: 12px;
        padding: 16px 56px;
        border-radius: 9999px;
        font-family: var(--font-family-display);
        font-size: 18px; font-weight: 800;
        text-transform: uppercase; letter-spacing: 0.05em;
        cursor: pointer; border: none;
        transition: background 0.15s, transform 0.15s;
        width: 100%;
        max-width: 280px;
        text-align: center;
      `;

      if (isAuth) {
        // 1. Dashboard Button
        const dbBtn = document.createElement('button');
        dbBtn.className = 'mobile-auth-btn';
        dbBtn.textContent = 'Dashboard';
        dbBtn.style.cssText = btnStyle + `
          background: var(--color-primary);
          color: var(--color-on-primary);
        `;
        dbBtn.addEventListener('mouseenter', () => {
          dbBtn.style.background = 'var(--color-primary-light)';
          dbBtn.style.transform = 'translateY(-2px)';
        });
        dbBtn.addEventListener('mouseleave', () => {
          dbBtn.style.background = 'var(--color-primary)';
          dbBtn.style.transform = 'translateY(0)';
        });
        dbBtn.addEventListener('click', () => { close(); router.navigate('dashboard'); });
        overlay.appendChild(dbBtn);

        // 2. Profile Button
        const profBtn = document.createElement('button');
        profBtn.className = 'mobile-auth-btn';
        profBtn.textContent = 'Profile & Billing';
        profBtn.style.cssText = btnStyle + `
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.15);
        `;
        profBtn.addEventListener('mouseenter', () => {
          profBtn.style.background = 'rgba(255, 255, 255, 0.18)';
          profBtn.style.transform = 'translateY(-2px)';
        });
        profBtn.addEventListener('mouseleave', () => {
          profBtn.style.background = 'rgba(255, 255, 255, 0.1)';
          profBtn.style.transform = 'translateY(0)';
        });
        profBtn.addEventListener('click', () => { close(); router.navigate('settings?tab=profile'); });
        overlay.appendChild(profBtn);
      } else {
        // 1. Log In Button
        const loginBtn = document.createElement('button');
        loginBtn.className = 'mobile-auth-btn';
        loginBtn.textContent = 'Log In';
        loginBtn.style.cssText = btnStyle + `
          background: rgba(255, 255, 255, 0.1);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.15);
        `;
        loginBtn.addEventListener('mouseenter', () => {
          loginBtn.style.background = 'rgba(255, 255, 255, 0.18)';
          loginBtn.style.transform = 'translateY(-2px)';
        });
        loginBtn.addEventListener('mouseleave', () => {
          loginBtn.style.background = 'rgba(255, 255, 255, 0.1)';
          loginBtn.style.transform = 'translateY(0)';
        });
        loginBtn.addEventListener('click', () => { close(); router.navigate('auth/login'); });
        overlay.appendChild(loginBtn);

        // 2. Sign Up Button
        const signupBtn = document.createElement('button');
        signupBtn.className = 'mobile-auth-btn';
        signupBtn.textContent = 'Sign Up';
        signupBtn.style.cssText = btnStyle + `
          background: var(--color-primary);
          color: var(--color-on-primary);
        `;
        signupBtn.addEventListener('mouseenter', () => {
          signupBtn.style.background = 'var(--color-primary-light)';
          signupBtn.style.transform = 'translateY(-2px)';
        });
        signupBtn.addEventListener('mouseleave', () => {
          signupBtn.style.background = 'var(--color-primary)';
          signupBtn.style.transform = 'translateY(0)';
        });
        signupBtn.addEventListener('click', () => { close(); router.navigate('auth/signup'); });
        overlay.appendChild(signupBtn);
      }
    }

    // Attach renderer to overlay for external triggering
    overlay._renderAuth = renderMobileAuthButtons;

    // Initial render
    renderMobileAuthButtons();

    document.body.appendChild(overlay);

    function scrollTo(id) {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function close() {
      overlay.style.opacity = '0';
      overlay.style.transform = 'translateY(-16px)';
      overlay.style.pointerEvents = 'none';
    }

    overlay._close = close;
  }

  // Update button in case auth state changed since creation/last open
  if (overlay && typeof overlay._renderAuth === 'function') {
    overlay._renderAuth();
  }

  // Open
  overlay.style.pointerEvents = 'auto';
  overlay.style.opacity = '1';
  overlay.style.transform = 'translateY(0)';
}
