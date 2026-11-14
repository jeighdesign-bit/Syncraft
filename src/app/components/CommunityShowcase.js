'use client';

import { useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import styles from './CommunityShowcase.module.css';

export function CommunityLogos({ businesses }) {
  const [paused, setPaused] = useState(false);
  if (!businesses.length) return null;
  const scrolling = businesses.length >= 6;
  return <section className={styles.section} aria-labelledby="community-heading">
    <h2 id="community-heading" className={styles.heading}>Meet Our Community</h2>
    <div className={`${styles.viewport} ${scrolling ? styles.scrolling : styles.static}`} data-paused={paused}>
      <div className={styles.track} style={{ '--community-duration': `${businesses.length * 8}s` }}>
        {[0, ...(scrolling ? [1] : [])].map(copy => <ul className={styles.group} key={copy} aria-hidden={copy === 1 ? true : undefined}>
          {businesses.map(business => {
            const Logo = business.website ? 'a' : 'span';
            return <li key={business.id}><Logo className={styles.logo} {...(business.website ? { href: business.website, target: '_blank', rel: 'noopener noreferrer', tabIndex: copy === 1 ? -1 : undefined, 'aria-label': `Visit ${business.business_name}` } : {})} title={business.business_name}><img src={business.logo_url} alt={business.business_name} width="140" height="48" loading="lazy" /></Logo></li>;
          })}
        </ul>)}
      </div>
    </div>
    {scrolling && <button type="button" className={styles.pause} aria-label={paused ? 'Resume scrolling' : 'Pause scrolling'} title={paused ? 'Resume scrolling' : 'Pause scrolling'} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}</button>}
  </section>;
}

export default function CommunityShowcase() {
  const [businesses, setBusinesses] = useState([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/community', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) return;
      const data = await response.json();
      if (!controller.signal.aborted && Array.isArray(data.businesses)) setBusinesses(data.businesses);
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  return <CommunityLogos businesses={businesses} />;
}
