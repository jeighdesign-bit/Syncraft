"use client";

import { useState } from 'react';

export default function ProfileAvatar({ name, url, className }) {
  const [failedUrl, setFailedUrl] = useState(null);
  return <span className={className} aria-hidden="true">
    {url && url !== failedUrl ? <img src={url} alt="" width={42} height={42} referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : (name?.[0] || 'U').toUpperCase()}
  </span>;
}
