'use client';

import { memo, useRef, useState, useEffect } from 'react';
import { CheckCircle, X } from 'lucide-react';
import SvgPreview from '@/components/SvgPreview';
import { comparePreviewLayout, previewProxyUrl } from '@/lib/workspacePreview.mjs';

/**
 * CompareModal — Before/After slider comparison modal.
 * DOM-direct clip-path manipulation for zero-lag slider dragging.
 */
const CompareModal = memo(function CompareModal({ show, project, onClose }) {
  const isDraggingCompare = useRef(false);
  const compareRef = useRef(null);
  const overlayRef = useRef(null);
  const sliderRef = useRef(null);
  const [originalAspect, setOriginalAspect] = useState(null);
  const originalProxy = project?.original_image_url
    ? previewProxyUrl(`/api/proxy?url=${encodeURIComponent(project.original_image_url)}`)
    : null;

  // Update the slider directly during dragging without rerendering the images.
  const setComparePosition = (value) => {
    const position = Math.max(0, Math.min(100, value));
    compareRef.current?.setAttribute('aria-valuenow', String(Math.round(position)));
    if (overlayRef.current) overlayRef.current.style.clipPath = `inset(0 ${100 - position}% 0 0)`;
    if (sliderRef.current) sliderRef.current.style.left = `${position}%`;
  };

  const moveCompareToPointer = (event) => {
    const container = compareRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width > 0) setComparePosition(((event.clientX - rect.left) / rect.width) * 100);
  };

  useEffect(() => {
    if (!show || !originalProxy) return;
    setOriginalAspect(null);
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth && image.naturalHeight) {
        setOriginalAspect(image.naturalWidth / image.naturalHeight);
      }
    };
    image.src = originalProxy;
    return () => {
      image.onload = null;
    };
  }, [show, originalProxy]);

  if (!show || !project) return null;

  const {
    previewAspect,
    imageStyle: compareImageStyle,
  } = comparePreviewLayout(originalAspect);

  return (
    <div
      className="modal-overlay"
      onPointerMove={(e) => {
        if (!isDraggingCompare.current) return;
        moveCompareToPointer(e);
      }}
      onPointerUp={() => {
        isDraggingCompare.current = false;
      }}
      onPointerCancel={() => {
        isDraggingCompare.current = false;
      }}
    >
      <div
        className="modal-content workspace-compare-modal"
        style={{
          maxWidth: '1400px',
          width: 'fit-content',
          padding: '0',
          overflow: 'hidden',
          borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.08)',
          background: '#111',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(10,10,10,0.8)',
            backdropFilter: 'blur(10px)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            zIndex: 20,
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CheckCircle size={18} color="#d4ff59" />
            <span
              style={{ fontWeight: '600', fontSize: '15px', color: '#fff', letterSpacing: '0.5px' }}
            >
              {project.trace_type === 'upscale' ? 'Upscale Complete' : 'Trace Complete'}
            </span>
            <span style={{ color: '#666', fontSize: '13px', marginLeft: '8px', fontWeight: '400' }}>
              Drag slider to compare
            </span>
          </div>
          <button
            aria-label="Close comparison"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px',
              minWidth: '44px',
              minHeight: '44px',
              borderRadius: '50%',
              transition: 'all 0.2s',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.color = '#fff';
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.color = '#888';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Slider Compare Area */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            background: 'repeating-conic-gradient(#1e1e1e 0% 25%, #141414 0% 50%) 0 0 / 20px 20px',
            padding: '0',
          }}
        >
          <div
            ref={compareRef}
            role="slider"
            tabIndex={0}
            aria-label="Compare original and result"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={50}
            onKeyDown={(event) => {
              const current = Number(event.currentTarget.getAttribute('aria-valuenow'));
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? 100
                    : ['ArrowLeft', 'ArrowDown'].includes(event.key)
                      ? Math.max(0, current - 5)
                      : ['ArrowRight', 'ArrowUp'].includes(event.key)
                        ? Math.min(100, current + 5)
                        : null;
              if (next == null) return;
              event.preventDefault();
              setComparePosition(next);
            }}
            style={{
              position: 'relative',
              overflow: 'hidden',
              cursor: 'ew-resize',
              userSelect: 'none',
              touchAction: 'none',
              boxShadow: '0 0 20px rgba(0,0,0,0.5)',
              width: previewAspect ? `min(85vw, calc(80vh * ${previewAspect}))` : '85vw',
              height: previewAspect ? `min(80vh, calc(85vw / ${previewAspect}))` : '80vh',
              aspectRatio: previewAspect || 'auto',
              maxWidth: '85vw',
              maxHeight: '80vh',
            }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              isDraggingCompare.current = true;
              moveCompareToPointer(e);
            }}
          >
            {/* AFTER layer */}
            {project.upscaled_image_url || project.generated_image_url ? (
              <img
                src={previewProxyUrl(
                  `/api/proxy?url=${encodeURIComponent(project.upscaled_image_url || project.generated_image_url)}`,
                )}
                data-fallback-src={project.upscaled_image_url || project.generated_image_url}
                onError={(event) => {
                  const fallback = event.currentTarget.dataset.fallbackSrc;
                  if (fallback && event.currentTarget.src !== fallback) {
                    event.currentTarget.removeAttribute('data-fallback-src');
                    event.currentTarget.src = fallback;
                  }
                }}
                style={compareImageStyle}
                alt="After"
              />
            ) : (
              <SvgPreview
                url={
                  project.svg_url ? `/api/proxy?url=${encodeURIComponent(project.svg_url)}` : null
                }
                objectFit="cover"
                style={compareImageStyle}
              />
            )}

            {/* BEFORE layer — same crop and alignment as the result */}
            <div
              ref={overlayRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                clipPath: 'inset(0 50% 0 0)',
                willChange: 'clip-path',
                transform: 'translateZ(0)',
              }}
            >
              <img draggable={false} src={originalProxy} alt="Original" style={compareImageStyle} />
            </div>

            {/* Slider Line */}
            <div
              ref={sliderRef}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: '50%',
                width: '2px',
                background: '#555',
                transform: 'translateX(-50%) translateZ(0)',
                pointerEvents: 'none',
                willChange: 'left',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '36px',
                  height: '36px',
                  background: '#333',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 12px rgba(0,0,0,0.5)',
                  border: '1px solid #555',
                  gap: '1px',
                }}
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#aaa"
                  strokeWidth="2"
                >
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#aaa"
                  strokeWidth="2"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </div>

            {/* Labels */}
            <div
              style={{
                position: 'absolute',
                bottom: '14px',
                left: '14px',
                background: 'rgba(0,0,0,0.75)',
                padding: '4px 10px',
                borderRadius: '4px',
                color: '#aaa',
                fontSize: '11px',
                pointerEvents: 'none',
                letterSpacing: '0.5px',
              }}
            >
              ORIGINAL (BEFORE)
            </div>
            <div
              style={{
                position: 'absolute',
                bottom: '14px',
                right: '14px',
                background: 'rgba(0,0,0,0.75)',
                padding: '4px 10px',
                borderRadius: '4px',
                color: '#aaa',
                fontSize: '11px',
                pointerEvents: 'none',
                letterSpacing: '0.5px',
              }}
            >
              {project.upscaled_image_url || project.generated_image_url
                ? 'AI UPSCALED (AFTER)'
                : 'VECTOR (AFTER)'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default CompareModal;
