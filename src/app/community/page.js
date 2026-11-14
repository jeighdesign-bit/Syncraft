import { redirect } from 'next/navigation';

export const metadata = { title: 'Submit Your Logo', robots: { index: false, follow: false } };
export default function CommunityPage() { redirect('/?community=submit'); }
