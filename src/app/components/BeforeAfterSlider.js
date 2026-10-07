"use client";

import { useState, useEffect } from 'react';

/** Fetches SVG text and injects inline for reliable cross-browser SVG rendering */
function InlineSVG({ url, style, objectFit = 'cover' }) {
  const [svgHtml, setSvgHtml] = useState(null);
  const [isSvg, setIsSvg] = useState(true);

  useEffect(() => {
    if (!url) { setSvgHtml(null); return; }
    
    // If it's explicitly not an SVG (e.g. png fallback), fallback to img tag immediately
    if (!url.toLowerCase().endsWith('.svg') && !url.includes('svg')) {
      setIsSvg(false);
      return;
    }

    setSvgHtml(null);
    setIsSvg(true);
    fetch(url)
      .then(r => r.text())
      .then(text => {
        const safe = text
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/\son\w+="[^"]*"/gi, '')
          .replace(/\son\w+='[^']*'/gi, '');
        if (safe.includes('<svg')) {
          const scaled = safe.replace(/<svg([^>]*?)>/i, (_, attrs) => {
            let clean = attrs;
            const wMatch = attrs.match(/\swidth=["']([^"']+)["']/i);
            const hMatch = attrs.match(/\sheight=["']([^"']+)["']/i);
            const vMatch = attrs.match(/\sviewBox=["']([^"']+)["']/i);

            clean = clean.replace(/\s+width=["'][^"']*["']/gi, '')
                         .replace(/\s+height=["'][^"']*["']/gi, '')
                         .replace(/\s+preserveAspectRatio=["'][^"']*["']/gi, '')
                         .replace(/\s+style=["'][^"']*["']/gi, '');

            if (!vMatch && wMatch && hMatch) {
              const w = parseFloat(wMatch[1].replace(/px/i, ''));
              const h = parseFloat(hMatch[1].replace(/px/i, ''));
              if (!isNaN(w) && !isNaN(h)) {
                clean += ` viewBox="0 0 ${w} ${h}"`;
              }
            }
            const preserve = objectFit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice';
            return `<svg${clean} style="width:100%;height:100%;display:block;" preserveAspectRatio="${preserve}">`;
          });
          setSvgHtml(scaled);
        } else {
          // If fetch succeeds but it's not SVG text, fallback
          setIsSvg(false);
        }
      })
      .catch(err => {
        console.error('[InlineSVG] fetch failed:', err);
        setIsSvg(false);
      });
  }, [url]);

  if (!isSvg) {
    return <img src={url} alt="" width="1200" height="800" loading="lazy" decoding="async" style={style} />;
  }

  if (!svgHtml) {
    return (
      <div style={{ ...style, background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#888', fontSize: '11px', letterSpacing: '1px' }}>LOADING VECTOR...</span>
      </div>
    );
  }

  return <div style={{ ...style, overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: svgHtml }} />;
}

export default function BeforeAfterSlider({
  title,
  rasterUrl,
  vectorUrl,
  height = '400px',
  objectFit = 'cover',
  originalLabel = 'Original Photo',
  resultLabel = 'Vectorized SVG',
  minimal = false,
}) {
  const [sliderPosition, setSliderPosition] = useState(50);

  return (
    <div style={{ textAlign: 'center', width: '100%' }}>
      
      <div style={{ position: 'relative', width: '100%', height, background: 'transparent', overflow: 'hidden', border: minimal ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.08)', borderRadius: minimal ? '12px' : '16px' }}>
        
        {/* Original Image (Background / Right Side) */}
        <img 
          src={rasterUrl} 
          alt={`${title || 'Sample'} original reference`}
          width="1200"
          height="800"
          loading="lazy"
          decoding="async"
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit }} 
        />
        <span style={{ position: 'absolute', top: 12, right: 12, background: minimal ? 'rgba(12,12,12,0.76)' : 'rgba(0,0,0,0.7)', padding: minimal ? '5px 9px' : '4px 10px', border: minimal ? '1px solid rgba(255,255,255,0.12)' : 'none', fontSize: minimal ? '10px' : '11px', fontWeight: minimal ? 650 : 400, letterSpacing: minimal ? '0.02em' : 'normal', color: minimal ? 'rgba(255,255,255,0.78)' : '#fff', borderRadius: minimal ? '999px' : '0', backdropFilter: minimal ? 'blur(10px)' : 'none', zIndex: 1 }}>{originalLabel}</span>
        
        {/* Vectorized SVG (Foreground / Left Side) */}
        <InlineSVG 
          url={vectorUrl} 
          objectFit={objectFit}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit, clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)`, zIndex: 2 }} 
        />
        <span style={{ position: 'absolute', top: 12, left: 12, background: minimal ? 'rgba(12,12,12,0.76)' : '#d4ff59', padding: minimal ? '5px 9px' : '4px 10px', border: minimal ? '1px solid rgba(212,255,89,0.38)' : 'none', fontSize: minimal ? '10px' : '11px', color: minimal ? '#d4ff59' : '#000', fontWeight: minimal ? 700 : 'bold', letterSpacing: minimal ? '0.02em' : 'normal', borderRadius: minimal ? '999px' : '0', backdropFilter: minimal ? 'blur(10px)' : 'none', zIndex: 3, opacity: sliderPosition > 10 ? 1 : 0, transition: 'opacity 0.2s' }}>{resultLabel}</span>

        {/* Slider Divider Line */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${sliderPosition}%`, width: minimal ? '1px' : '2px', background: '#d4ff59', boxShadow: minimal ? '0 0 12px rgba(212,255,89,0.22)' : 'none', transform: 'translateX(-50%)', zIndex: 3, pointerEvents: 'none' }}></div>
        
        {/* Slider Handle Visual */}
        <div style={{ position: 'absolute', top: '50%', left: `${sliderPosition}%`, transform: 'translate(-50%, -50%)', width: minimal ? '30px' : '32px', height: minimal ? '30px' : '32px', background: minimal ? 'rgba(15,15,15,0.9)' : '#d4ff59', border: minimal ? '1px solid rgba(212,255,89,0.72)' : 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3, pointerEvents: 'none', boxShadow: minimal ? '0 6px 18px rgba(0,0,0,0.38)' : '0 2px 10px rgba(0,0,0,0.5)' }}>
          <div style={{ display: 'flex', gap: '2px' }}>
            <div style={{ width: minimal ? '1px' : '2px', height: minimal ? '10px' : '12px', background: minimal ? '#d4ff59' : '#000' }}></div>
            <div style={{ width: minimal ? '1px' : '2px', height: minimal ? '10px' : '12px', background: minimal ? '#d4ff59' : '#000' }}></div>
          </div>
        </div>

        {/* Invisible Range Input for Interaction */}
        <input 
          type="range" 
          aria-label={`Compare ${title || 'sample'} original and result`}
          min="0" max="100" 
          value={sliderPosition} 
          onChange={e => setSliderPosition(e.target.value)} 
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'ew-resize', zIndex: 4, margin: 0 }} 
        />
        
      </div>
    </div>
  );
}
