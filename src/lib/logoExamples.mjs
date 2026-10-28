import { LOGO_EXAMPLE_ADDITIONS } from './logoExampleAdditions.mjs';
import { LOGO_EXAMPLE_REFRESH } from './logoExampleRefresh.mjs';
import { LOGO_EXAMPLE_FEATURED } from './logoExampleFeatured.mjs';

// Keep the approved clean collection. Earlier gallery examples are no longer published.
export const LOGO_EXAMPLES = [...LOGO_EXAMPLE_ADDITIONS, ...LOGO_EXAMPLE_REFRESH, ...LOGO_EXAMPLE_FEATURED];
