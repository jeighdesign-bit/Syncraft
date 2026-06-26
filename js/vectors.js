// High-fidelity responsive vector artwork library for Syncraft simulator

const vectors = {
  'default': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="100%" height="100%">
      <!-- Grid Background -->
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0, 0, 0, 0.05)" stroke-width="1"/>
        </pattern>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#d4ff59" stop-opacity="0.15" />
          <stop offset="100%" stop-color="#d4ff59" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
      
      <!-- Ambient Glow -->
      <circle cx="400" cy="300" r="250" fill="url(#glow)" />
      
      <!-- Geometric construction lines -->
      <circle cx="400" cy="300" r="160" fill="none" stroke="rgba(0, 0, 0, 0.1)" stroke-width="1" />
      <circle cx="400" cy="300" r="120" fill="none" stroke="rgba(0, 0, 0, 0.1)" stroke-dasharray="4,4" stroke-width="1.5" />
      <circle cx="400" cy="300" r="80" fill="none" stroke="rgba(0, 0, 0, 0.15)" stroke-width="1" />
      
      <!-- Technical Crosshairs -->
      <line x1="400" y1="80" x2="400" y2="520" stroke="rgba(0, 0, 0, 0.1)" stroke-width="1" stroke-dasharray="5,5" />
      <line x1="180" y1="300" x2="620" y2="300" stroke="rgba(0, 0, 0, 0.1)" stroke-width="1" stroke-dasharray="5,5" />
      
      <!-- Outer Hexagon Structure -->
      <polygon points="400,140 538,220 538,380 400,460 262,380 262,220" fill="none" stroke="#222222" stroke-width="2" />
      
      <!-- Inner Glowing Geometric Art -->
      <g transform="translate(400, 300)">
        <!-- Rotating shapes -->
        <polygon points="0,-100 86,50 -86,50" fill="none" stroke="#8b5cf6" stroke-width="3" stroke-linejoin="round" />
        <polygon points="0,100 86,-50 -86,-50" fill="none" stroke="#d4ff59" stroke-width="3" stroke-linejoin="round" />
        <circle cx="0" cy="0" r="30" fill="#131313" stroke="#222222" stroke-width="3" />
        <!-- Tech dots -->
        <circle cx="0" cy="-100" r="5" fill="#8b5cf6" />
        <circle cx="86" cy="50" r="5" fill="#8b5cf6" />
        <circle cx="-86" cy="50" r="5" fill="#8b5cf6" />
        <circle cx="0" cy="100" r="5" fill="#d4ff59" />
        <circle cx="86" cy="-50" r="5" fill="#d4ff59" />
        <circle cx="-86" cy="-50" r="5" fill="#d4ff59" />
      </g>
      
      <!-- Technical labels -->
      <text x="50" y="550" font-family="monospace" font-size="10" fill="rgba(0,0,0,0.4)">ENGINE PROTOCOL: V_0.4.9</text>
      <text x="650" y="550" font-family="monospace" font-size="10" fill="rgba(0,0,0,0.4)">COORD: 400.300.Z</text>
    </svg>
  `,
  'studio lighting': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="100%" height="100%">
      <defs>
        <linearGradient id="lightBeam1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.6" />
          <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="lightBeam2" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#d4ff59" stop-opacity="0.6" />
          <stop offset="100%" stop-color="#d4ff59" stop-opacity="0" />
        </linearGradient>
        <filter id="blurFilter">
          <feGaussianBlur stdDeviation="15" />
        </filter>
      </defs>
      
      <rect width="100%" height="100%" fill="#131313" />
      
      <!-- Studio Grid floor -->
      <g opacity="0.15">
        <path d="M 0 450 L 800 450 M 0 500 L 800 500 M 0 550 L 800 550" stroke="#ffffff" stroke-width="1"/>
        <path d="M 100 400 L 0 600 M 250 400 L 100 600 M 400 400 L 400 600 M 550 400 L 700 600 M 700 400 L 800 600" stroke="#ffffff" stroke-width="1"/>
      </g>
      
      <!-- Studio Lights Beams -->
      <polygon points="100,50 350,450 150,450" fill="url(#lightBeam1)" />
      <polygon points="700,50 650,450 450,450" fill="url(#lightBeam2)" />
      
      <!-- Glowing Target Orb in Center -->
      <g transform="translate(400, 260)">
        <!-- Shadow -->
        <ellipse cx="0" cy="190" rx="100" ry="20" fill="#000000" opacity="0.8" />
        
        <!-- Soft back-glow -->
        <circle cx="0" cy="0" r="110" fill="#8b5cf6" opacity="0.3" filter="url(#blurFilter)" />
        <circle cx="0" cy="0" r="70" fill="#d4ff59" opacity="0.2" filter="url(#blurFilter)" />
        
        <!-- Main metallic Sphere construction lines -->
        <circle cx="0" cy="0" r="80" fill="none" stroke="#ffffff" stroke-width="2" />
        <ellipse cx="0" cy="0" rx="80" ry="25" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="5,3" />
        <ellipse cx="0" cy="0" rx="25" ry="80" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="5,3" />
        
        <!-- Bright highlights -->
        <circle cx="-30" cy="-30" r="8" fill="#ffffff" opacity="0.8" filter="url(#blurFilter)" />
        <circle cx="20" cy="40" r="5" fill="#d4ff59" opacity="0.9" />
        
        <!-- Glowing Core -->
        <circle cx="0" cy="0" r="12" fill="#ffffff" />
        <circle cx="0" cy="0" r="18" fill="none" stroke="#d4ff59" stroke-width="2" />
      </g>
      
      <!-- Light Fixtures -->
      <circle cx="100" cy="50" r="20" fill="#353534" />
      <circle cx="100" cy="50" r="10" fill="#8b5cf6" />
      <circle cx="700" cy="50" r="20" fill="#353534" />
      <circle cx="700" cy="50" r="10" fill="#d4ff59" />
      
      <!-- Tech specs -->
      <text x="50" y="80" font-family="monospace" font-size="12" fill="#8b5cf6" font-weight="bold">SOURCE_A: ACTIVE [75%]</text>
      <text x="600" y="80" font-family="monospace" font-size="12" fill="#d4ff59" font-weight="bold">SOURCE_B: ACTIVE [90%]</text>
    </svg>
  `,
  'vector art': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="100%" height="100%">
      <rect width="100%" height="100%" fill="#ffffff" />
      
      <!-- Vector Grid -->
      <defs>
        <pattern id="vectorGrid" width="20" height="20" patternUnits="userSpaceOnUse">
          <rect width="20" height="20" fill="none" stroke="#eeeeee" stroke-width="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#vectorGrid)" />
      
      <!-- Anchor points and lines illustrating "Vector Art" editing -->
      <g>
        <!-- Background decorative polygon path -->
        <path d="M 150 150 L 380 100 L 650 220 L 520 480 L 250 420 Z" fill="rgba(139, 92, 246, 0.05)" stroke="#8b5cf6" stroke-width="2" stroke-dasharray="8,4" />
        
        <!-- Primary styled path -->
        <path d="M 220 380 Q 400 120 580 380 T 700 480" fill="none" stroke="#131313" stroke-width="8" stroke-linecap="round" />
        
        <!-- Intersection guidelines -->
        <line x1="220" y1="380" x2="400" y2="120" stroke="#d4ff59" stroke-width="2" />
        <line x1="580" y1="380" x2="400" y2="120" stroke="#d4ff59" stroke-width="2" />
        
        <!-- Bezier Control handles -->
        <circle cx="400" cy="120" r="6" fill="#ffffff" stroke="#d4ff59" stroke-width="3" />
        <circle cx="220" cy="380" r="5" fill="#131313" />
        <circle cx="580" cy="380" r="5" fill="#131313" />
        
        <!-- Secondary Vector Elements (overlapping icons) -->
        <g transform="translate(380, 360)">
          <rect x="-60" y="-60" width="120" height="120" rx="15" fill="#8b5cf6" />
          <polygon points="0,-40 35,30 -35,30" fill="#d4ff59" />
          <circle cx="0" cy="10" r="18" fill="#131313" />
          <circle cx="0" cy="10" r="6" fill="#ffffff" />
          
          <!-- Outer vectors anchor markers -->
          <rect x="-64" y="-64" width="8" height="8" fill="#ffffff" stroke="#8b5cf6" stroke-width="1.5" />
          <rect x="56" y="-64" width="8" height="8" fill="#ffffff" stroke="#8b5cf6" stroke-width="1.5" />
          <rect x="-64" y="56" width="8" height="8" fill="#ffffff" stroke="#8b5cf6" stroke-width="1.5" />
          <rect x="56" y="56" width="8" height="8" fill="#ffffff" stroke="#8b5cf6" stroke-width="1.5" />
        </g>
        
        <!-- Text details -->
        <text x="310" y="520" font-family="sans-serif" font-weight="bold" font-size="14" fill="#131313">VECTOR ENGINE CALIBRATION</text>
        <text x="365" y="540" font-family="monospace" font-size="10" fill="rgba(0,0,0,0.5)">spline_interpolation: ON</text>
      </g>
    </svg>
  `,
  'cyberpunk noir': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="100%" height="100%">
      <rect width="100%" height="100%" fill="#09090b" />
      
      <!-- Perspective Grid -->
      <defs>
        <linearGradient id="gridFade" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.3" />
          <stop offset="50%" stop-color="#d4ff59" stop-opacity="0.05" />
          <stop offset="100%" stop-color="#d4ff59" stop-opacity="0" />
        </linearGradient>
      </defs>
      
      <!-- Horizon -->
      <line x1="0" y1="300" x2="800" y2="300" stroke="#8b5cf6" stroke-width="1" opacity="0.3"/>
      
      <!-- Grid lines going to horizon center -->
      <g stroke="url(#gridFade)" stroke-width="1.5">
        <line x1="-200" y1="600" x2="400" y2="300" />
        <line x1="0" y1="600" x2="400" y2="300" />
        <line x1="200" y1="600" x2="400" y2="300" />
        <line x1="400" y1="600" x2="400" y2="300" />
        <line x1="600" y1="600" x2="400" y2="300" />
        <line x1="800" y1="600" x2="400" y2="300" />
        <line x1="1000" y1="600" x2="400" y2="300" />
        
        <!-- Horizontal grid spacing -->
        <line x1="0" y1="305" x2="800" y2="305" />
        <line x1="0" y1="315" x2="800" y2="315" />
        <line x1="0" y1="330" x2="800" y2="330" />
        <line x1="0" y1="355" x2="800" y2="355" />
        <line x1="0" y1="395" x2="800" y2="395" />
        <line x1="0" y1="460" x2="800" y2="460" />
        <line x1="0" y1="560" x2="800" y2="560" />
      </g>
      
      <!-- Synthwave Sun in center horizon -->
      <g transform="translate(400, 300)" opacity="0.8">
        <!-- Sun shape with horizontal slices -->
        <path d="M -80,-10 A 80,80 0 0,1 80,-10 Z" fill="#8b5cf6" />
        <rect x="-80" y="2" width="160" height="6" fill="#8b5cf6" />
        <rect x="-80" y="12" width="160" height="4" fill="#8b5cf6" />
        <rect x="-80" y="20" width="160" height="2" fill="#8b5cf6" />
      </g>
      
      <!-- Cyberpunk Skyline silhouettes -->
      <g fill="#0c0a0f" stroke="rgba(212, 255, 89, 0.4)" stroke-width="1">
        <!-- Left buildings -->
        <rect x="50" y="150" width="60" height="150" />
        <rect x="90" y="180" width="50" height="120" />
        <polygon points="130,220 160,220 160,300 130,300" />
        <rect x="180" y="120" width="40" height="180" />
        <!-- Right buildings -->
        <rect x="580" y="100" width="50" height="200" />
        <line x1="605" y1="100" x2="605" y2="40" stroke="#d4ff59" stroke-width="1.5" />
        <rect x="650" y="160" width="80" height="140" />
        <rect x="710" y="130" width="40" height="170" />
      </g>
      
      <!-- Neon text overlay -->
      <g transform="translate(400, 160)">
        <text text-anchor="middle" font-family="'Sora', sans-serif" font-weight="900" font-size="36" fill="#d4ff59" letter-spacing="8" opacity="0.9">CYBERPUNK</text>
        <text text-anchor="middle" font-family="'Sora', sans-serif" font-weight="900" font-size="36" fill="none" stroke="#8b5cf6" stroke-width="1" letter-spacing="8" y="45">N O I R</text>
      </g>
      
      <!-- Cyberpunk details -->
      <rect x="360" y="270" width="80" height="10" fill="#d4ff59" opacity="0.3" />
      <text x="375" y="278" font-family="monospace" font-size="8" fill="#131313" font-weight="bold">SYSTEM OK</text>
    </svg>
  `,
  'brutalist svg': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="100%" height="100%">
      <rect width="100%" height="100%" fill="#d4ff59" />
      
      <!-- Heavy Grid Lines -->
      <line x1="0" y1="100" x2="800" y2="100" stroke="#000000" stroke-width="6" />
      <line x1="0" y1="500" x2="800" y2="500" stroke="#000000" stroke-width="6" />
      <line x1="200" y1="0" x2="200" y2="600" stroke="#000000" stroke-width="6" />
      <line x1="600" y1="0" x2="600" y2="600" stroke="#000000" stroke-width="6" />
      
      <!-- Brutalist Text Layout -->
      <g transform="translate(400, 300)" text-anchor="middle">
        <!-- Giant overlapping letters -->
        <rect x="-170" y="-170" width="340" height="340" fill="#000000" />
        
        <text x="0" y="70" font-family="'Sora', sans-serif" font-weight="900" font-size="190" fill="#d4ff59" letter-spacing="-10">RAW</text>
        
        <!-- Secondary text blocks -->
        <rect x="-170" y="190" width="340" height="60" fill="#8b5cf6" stroke="#000000" stroke-width="4" />
        <text x="0" y="228" font-family="'Sora', sans-serif" font-weight="800" font-size="24" fill="#ffffff" letter-spacing="4">BRUTALIST V.01</text>
      </g>
      
      <!-- Tech specs and warning labels -->
      <g transform="translate(50, 50)">
        <text font-family="monospace" font-size="14" fill="#000000" font-weight="bold">NO SHADOWS</text>
        <text y="20" font-family="monospace" font-size="14" fill="#000000" font-weight="bold">HIGH CONFLICT</text>
      </g>
      
      <g transform="translate(630, 50)">
        <text font-family="monospace" font-size="14" fill="#000000" font-weight="bold">SYNCRAFT</text>
        <text y="20" font-family="monospace" font-size="14" fill="#000000" font-weight="bold">GRID SYSTEM</text>
      </g>
      
      <!-- Diagonal Stripe Boxes -->
      <g transform="translate(50, 420)">
        <line x1="0" y1="0" x2="100" y2="0" stroke="#000000" stroke-width="4" />
        <line x1="0" y1="15" x2="100" y2="15" stroke="#000000" stroke-width="4" />
        <line x1="0" y1="30" x2="100" y2="30" stroke="#000000" stroke-width="4" />
        <line x1="0" y1="45" x2="100" y2="45" stroke="#000000" stroke-width="4" />
      </g>
    </svg>
  `
};

export default vectors;
