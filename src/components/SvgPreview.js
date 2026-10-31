'use client';

import { useEffect, useState } from 'react';
import { svgPreviewUrl } from '@/lib/workspacePreview.mjs';
import GenerationLoading from './GenerationLoading';

// A cached lossless display image keeps thousands of SVG paths out of the page
// layout/paint tree. Editing and downloads still use the original vector file.
export default function SvgPreview({ url, style, objectFit = 'contain', contentScale = 1 }) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState({ source: null, ready: false, failed: false });
  const preview = svgPreviewUrl(url);
  const source = preview ? `${preview}${attempt ? `&preview_retry=${attempt}` : ''}` : null;
  const ready = status.source === source && status.ready;
  const failed = status.source === source && status.failed;
  useEffect(() => {
    if (!source || ready || failed) return;
    const timer = setTimeout(() => setStatus({ source, ready: false, failed: true }), 60_000);
    return () => clearTimeout(timer);
  }, [source, ready, failed]);
  if (!source) return null;
  return (
    <div
      style={{
        position: 'relative',
        ...style,
        overflow: 'hidden',
        transform: `${style?.transform || ''} scale(${contentScale})`,
        transformOrigin: 'center',
      }}
      aria-busy={!ready && !failed}
    >
      <img
        key={source}
        src={source}
        alt="SVG artwork preview"
        draggable={false}
        decoding="async"
        onLoad={(event) =>
          setStatus({
            source,
            ready: !!event.currentTarget.naturalWidth,
            failed: !event.currentTarget.naturalWidth,
          })
        }
        onError={() => setStatus({ source, ready: false, failed: true })}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit,
          objectPosition: 'center',
          visibility: ready ? 'visible' : 'hidden',
        }}
      />
      {!ready && (
        <div
          role={failed ? 'alert' : 'status'}
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            background: '#151515',
            color: '#ccc',
            fontSize: 13,
          }}
        >
          {failed ? (
            <>
              <span>Preview couldn't load. Your saved SVG is safe.</span>
              <button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
                style={{
                  minHeight: 44,
                  padding: '8px 16px',
                  border: 0,
                  borderRadius: 6,
                  background: '#d4ff59',
                  color: '#151515',
                  cursor: 'pointer',
                  pointerEvents: 'auto',
                }}
              >
                Retry preview
              </button>
            </>
          ) : (
            <GenerationLoading label="Loading SVG preview" />
          )}
        </div>
      )}
    </div>
  );
}
