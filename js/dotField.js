/**
 * Dynamic Interactive Dot Field Background Animation
 * Styled for Syncraft Workspace Background
 */

export function initDotField(canvasId = 'workspace-dot-field-canvas', parentId = 'result-display') {
  const canvas = document.getElementById(canvasId);
  const parent = document.getElementById(parentId);

  if (!canvas || !parent) {
    console.warn(`DotField: Canvas (${canvasId}) or Parent (${parentId}) not found.`);
    return null;
  }

  const ctx = canvas.getContext('2d');
  let dots = [];
  let animationFrameId = null;
  let isRunning = false;

  // Customization Options
  const options = {
    dotSpacing: 18,
    dotRadius: 1.2,
    cursorRadius: 320,
    bulgeStrength: 42,
    spring: 0.065,
    friction: 0.86,
    dotColor: 'rgba(255, 255, 255, 0.12)',
    glowRadius: 240,
    glowMaxAlpha: 0.07 // Maximum opacity of the cursor spotlight glow
  };

  // Mouse & Glow state
  const mouse = {
    x: 0,
    y: 0,
    active: false,
    glowAlpha: 0 // Used to smoothly fade in/out the spotlight glow
  };

  // 1. Get Brand Color from CSS Variables dynamically
  function getBrandColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#d4ff59';
  }

  // 2. Setup Dots Grid based on bounding box
  function setupGrid() {
    dots = [];
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Scale canvas buffer for high-DPI screens
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Padding around the grid to prevent popping in/out at viewport borders
    const padding = 60;
    const spacing = options.dotSpacing;

    const cols = Math.ceil((width + padding * 2) / spacing);
    const rows = Math.ceil((height + padding * 2) / spacing);

    const startX = -padding + (width + padding * 2 - (cols - 1) * spacing) / 2;
    const startY = -padding + (height + padding * 2 - (rows - 1) * spacing) / 2;

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const x = startX + c * spacing;
        const y = startY + r * spacing;
        dots.push({
          x0: x,
          y0: y,
          x: x,
          y: y,
          vx: 0,
          vy: 0
        });
      }
    }
  }

  // 3. Resize handler
  let resizeTimeout;
  function handleResize() {
    // Debounce resize to prevent stuttering
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      setupGrid();
    }, 100);
  }

  // 4. Mouse event listeners
  function onMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    mouse.active = true;
  }

  function onMouseEnter() {
    mouse.active = true;
  }

  function onMouseLeave() {
    mouse.active = false;
  }

  // 5. Update and Draw Loop
  function tick() {
    if (!isRunning) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    // Update glow opacity smoothly
    const targetGlowAlpha = mouse.active ? options.glowMaxAlpha : 0;
    mouse.glowAlpha += (targetGlowAlpha - mouse.glowAlpha) * 0.08;

    // Draw spotlight glow (only when visible)
    if (mouse.glowAlpha > 0.001) {
      ctx.save();
      ctx.globalAlpha = mouse.glowAlpha;
      const brandColor = getBrandColor();
      const gradient = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, options.glowRadius);
      gradient.addColorStop(0, brandColor);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(mouse.x - options.glowRadius, mouse.y - options.glowRadius, options.glowRadius * 2, options.glowRadius * 2);
      ctx.restore();
    }

    // Physics constants
    const mx = mouse.x;
    const my = mouse.y;
    const active = mouse.active;
    const radius = options.cursorRadius;
    const strength = options.bulgeStrength;
    const spring = options.spring;
    const friction = options.friction;

    // Draw all dots efficiently in a single batch path
    ctx.fillStyle = options.dotColor;
    ctx.beginPath();

    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      let targetX = d.x0;
      let targetY = d.y0;

      if (active) {
        const dx = d.x0 - mx;
        const dy = d.y0 - my;
        const distSq = dx * dx + dy * dy;

        if (distSq < radius * radius) {
          const dist = Math.sqrt(distSq);
          const force = (radius - dist) / radius;
          const influence = force * force; // cubic/exponential curve
          const displacement = influence * strength;

          const dirX = dx / (dist || 1);
          const dirY = dy / (dist || 1);

          targetX = d.x0 + dirX * displacement;
          targetY = d.y0 + dirY * displacement;
        }
      }

      // Spring physics logic
      const ax = (targetX - d.x) * spring;
      const ay = (targetY - d.y) * spring;
      d.vx = (d.vx + ax) * friction;
      d.vy = (d.vy + ay) * friction;
      d.x += d.vx;
      d.y += d.vy;

      // Batch drawing path
      ctx.moveTo(d.x + options.dotRadius, d.y);
      ctx.arc(d.x, d.y, options.dotRadius, 0, Math.PI * 2);
    }

    ctx.fill();

    animationFrameId = requestAnimationFrame(tick);
  }

  // 6. Animation control methods
  function start() {
    if (isRunning) return;
    isRunning = true;
    setupGrid();
    animationFrameId = requestAnimationFrame(tick);
  }

  function stop() {
    if (!isRunning) return;
    isRunning = false;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }

  // 7. Route Visibility observer (MutationObserver)
  const workspaceView = document.getElementById('workspace-view');
  let observer = null;

  if (workspaceView) {
    observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          const isHidden = workspaceView.classList.contains('hidden');
          if (isHidden) {
            stop();
          } else {
            start();
          }
        }
      });
    });

    observer.observe(workspaceView, { attributes: true });
  }

  // 8. Bind Events
  parent.addEventListener('mousemove', onMouseMove);
  parent.addEventListener('mouseenter', onMouseEnter);
  parent.addEventListener('mouseleave', onMouseLeave);
  window.addEventListener('resize', handleResize);

  // Initialize
  if (workspaceView && !workspaceView.classList.contains('hidden')) {
    start();
  }

  // Return clean-up handler
  return {
    destroy: () => {
      stop();
      parent.removeEventListener('mousemove', onMouseMove);
      parent.removeEventListener('mouseenter', onMouseEnter);
      parent.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('resize', handleResize);
      if (observer) {
        observer.disconnect();
      }
    }
  };
}
