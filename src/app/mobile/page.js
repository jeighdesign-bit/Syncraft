import Link from 'next/link';

export default function MobileUploadRetired() {
  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#171717', color: '#eee' }}>
    <div style={{ maxWidth: 420, lineHeight: 1.7 }}><h1>Phone scanning has retired.</h1><p>You can still upload images directly from your device. Explore Logo Studio to create a logo from text, an image, or a sketch.</p><Link href="/logo-studio" style={{ color: '#d4ff59' }}>Open Logo Studio →</Link><p><Link href="/">Back to Syncraft</Link></p></div>
  </main>;
}
