// ─────────────────────────────────────────────
// Application Bootstrap & Router
// ─────────────────────────────────────────────
import { initLandingPage } from './landing.js?v=3.3.2';
import { initDashboard }   from './dashboard.js?v=2.0.3';
import { initWorkspace }   from './workspace.js?v=2.2.4';
import { initAuthView }    from './auth.js?v=2.0.2';
import { initSettingsPage } from './settings.js?v=2.1.1';
import { initCheckoutPage } from './checkout.js?v=2.1.0';
import mainLayout          from './MainLayout.js?v=1.0.5';
import ProjectService      from './projectService.js?v=2.0.5';
import authService         from './authService.js?v=2.1.0';
import { showToast }        from './utils.js';

class AppRouter {
  constructor() {
    // Route hash → view element ID
    this.routes = {
      '':               'landing-view',
      '/':              'landing-view',
      'dashboard':      'dashboard-view',
      'workspace':      'workspace-view',
      'auth/login':     'auth-view',
      'auth/signup':    'auth-view',
      'auth/recovery':  'auth-view',
      'settings':       'settings-view',
      'checkout':       'checkout-view',
    };

    this.currentRoute = '';
    this.previousRoute = '';

    this.views = {
      'landing-view':   document.getElementById('landing-view'),
      'dashboard-view': document.getElementById('dashboard-view'),
      'workspace-view': document.getElementById('workspace-view'),
      'auth-view':      document.getElementById('auth-view'),
      'settings-view':  document.getElementById('settings-view'),
      'checkout-view':  document.getElementById('checkout-view'),
    };

    this.landingInitialized   = false;
    this.dashboardInitialized = false;
    this.workspaceInitialized = false;
    this.authInitialized      = false;
    this.settingsInitialized   = false;
    this.checkoutInitialized   = false;

    // ── Bootstrap persisted state ────────────
    ProjectService.bootstrap();

    // ── Warn before unload if dirty ──────────
    window.addEventListener('beforeunload', () => {
      if (ProjectService.hasUnsavedChanges()) {
        ProjectService.saveNow();
      }
    });

    window.addEventListener('hashchange', () => this.handleRouting());
    window.addEventListener('load',       () => this.handleRouting());

    // ── Listen to Auth State Changes (Google OAuth redirects, etc) ──
    document.addEventListener('syncraft:authChange', (e) => {
      const eventType = e?.detail?.event;
      if (eventType === 'SIGNED_OUT') {
        this.navigate('');
      } else {
        this.handleRouting();
      }
    });

    // ── Listen to Database Sync Errors ──
    document.addEventListener('syncraft:syncError', (e) => {
      showToast(`Database Sync Error: ${e.detail?.message || 'Unknown error'}`, true);
    });
  }

  navigate(route) {
    window.location.hash = route === '' ? '/' : `/${route}`;
  }

  handleRouting() {
    const raw     = window.location.hash.replace(/^#\/?/, '') || '';
    const hash    = raw.replace(/^\//, '');
    const baseRoute = hash.split('?')[0];
    let viewKey   = this.routes[baseRoute] ?? 'landing-view';

    // Track return route: when entering settings, remember where we came from
    if (baseRoute === 'settings') {
      const cameFrom = this.currentRoute.split('?')[0];
      if (cameFrom && cameFrom !== 'settings') {
        this.previousRoute = cameFrom;
      }
    }
    this.currentRoute = hash;

    // Route Guards
    const authenticated = authService.isAuthenticated();
    const isAuthRoute = baseRoute.startsWith('auth/');
    const isProtectedRoute = baseRoute === 'dashboard' || baseRoute === 'workspace' || baseRoute === 'settings';

    if (isProtectedRoute && !authenticated) {
      this.navigate('auth/login');
      return;
    }

    if (isAuthRoute && authenticated) {
      this.navigate('dashboard');
      return;
    }

    // Auto-redirect authenticated users from OAuth callback hashes to dashboard
    if (window.location.hash.includes('access_token') && authenticated) {
      this.navigate('dashboard');
      return;
    }

    // Render global unified header first so dynamic slots exist in DOM
    mainLayout.render(baseRoute, this);

    Object.keys(this.views).forEach((key) => {
      const view = this.views[key];
      if (!view) return;
      if (key === viewKey) {
        view.classList.remove('hidden');
        this.triggerViewInit(key, hash);
      } else {
        view.classList.add('hidden');
      }
    });

    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  triggerViewInit(viewKey, hash) {
    if (viewKey === 'landing-view' && !this.landingInitialized) {
      initLandingPage(this);
      this.landingInitialized = true;

    } else if (viewKey === 'dashboard-view') {
      // Always re-init dashboard so project list stays fresh
      initDashboard(this);
      this.dashboardInitialized = true;

    } else if (viewKey === 'workspace-view') {
      if (!this.workspaceInitialized) {
        initWorkspace(this);
        this.workspaceInitialized = true;
      } else {
        const project = ProjectService.getCurrentProject();
        if (project) {
          document.dispatchEvent(new CustomEvent('syncraft:projectOpened', { detail: project }));
        }
      }

    } else if (viewKey === 'auth-view') {
      if (!this.authInitialized) {
        initAuthView(this);
        this.authInitialized = true;
      }
      if (typeof this.updateAuthSubRoute === 'function') {
        this.updateAuthSubRoute(hash);
      }
    } else if (viewKey === 'settings-view') {
      // Always re-init settings so current user data/keys are fresh
      initSettingsPage(this, hash);
      this.settingsInitialized = true;
    } else if (viewKey === 'checkout-view') {
      // Always re-init checkout so current parameters are fresh
      initCheckoutPage(this, hash);
      this.checkoutInitialized = true;
    }
  }
}

const router = new AppRouter();
export default router;
