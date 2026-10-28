import LogoStudio from '../LogoStudio';

export const metadata = { title: 'Logo Studio' };

export default async function Page({ params }) {
  const { id } = await params;
  return <LogoStudio projectId={id} />;
}
