export const DEFAULT_SIGN_IN_PATH = "/workspace";

// Public homepage visits never redirect; only a completed sign-in uses this target.
export function getSignInDestination(origin, next) {
  const fallback = new URL(DEFAULT_SIGN_IN_PATH, origin);
  try {
    const destination = new URL(next || DEFAULT_SIGN_IN_PATH, origin);
    if (destination.origin !== fallback.origin || destination.username || destination.password) return fallback;
    return destination;
  } catch {
    return fallback;
  }
}
