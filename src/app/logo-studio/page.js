import LogoStudio from './LogoStudio';
import { LOGO_EXAMPLES } from '@/lib/logoExamples.mjs';

export const metadata = { title: 'Logo Studio', description: 'Create, refine and export your logo from text, images or sketches.' };

export default async function Page({ searchParams }) {
  const { example } = await searchParams;
  const initialExample = LOGO_EXAMPLES.find(item => item.id === example) || null;
  return <LogoStudio initialExample={initialExample} />;
}
