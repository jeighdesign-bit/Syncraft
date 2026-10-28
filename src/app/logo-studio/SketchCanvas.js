'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Eraser, Grid3X3, ImagePlus, Maximize2, MousePointer2, PaintBucket, Palette, Pencil, Redo2, Square, Trash2, Type, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { floodFillSketchPixels, mirroredSketchPositions, SKETCH_SIZE, smoothSketchPoints } from './sketchDrawing.mjs';
import styles from './studio.module.css';

const SWATCHES = ['#171717', '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
const SHAPES = ['rectangle', 'ellipse', 'triangle', 'star', 'line'];
const ZOOMS = [0.75, 1, 1.25, 1.5, 2];

function channels(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
}
function bounds(action) {
  if (action.type === 'stroke' || action.type === 'eraser') {
    if (!action.points?.length) return null;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const [x, y] of action.points) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    const pad = Math.max(10, action.width / 2);
    return { x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
  }
  if (action.type === 'shape') {
    const pad = Math.max(8, action.width / 2);
    return { x: Math.min(action.start[0], action.end[0]) - pad, y: Math.min(action.start[1], action.end[1]) - pad,
      width: Math.abs(action.end[0] - action.start[0]) + pad * 2, height: Math.abs(action.end[1] - action.start[1]) + pad * 2 };
  }
  if (action.type === 'text') return { x: action.x, y: action.y - action.size, width: action.text.length * action.size * 0.65, height: action.size * 1.3 };
  if (action.type === 'image') return { x: action.x, y: action.y, width: action.width, height: action.height };
  return null;
}
function moved(action, dx, dy) {
  if (action.type === 'stroke' || action.type === 'eraser') return { ...action, points: action.points.map(([x, y]) => [x + dx, y + dy]) };
  if (action.type === 'shape') return { ...action, start: [action.start[0] + dx, action.start[1] + dy], end: [action.end[0] + dx, action.end[1] + dy] };
  if (action.type === 'text' || action.type === 'image') return { ...action, x: action.x + dx, y: action.y + dy };
  return action;
}
function draw(ctx, action, background, imageCache) {
  if (action.type === 'fill') {
    const image = ctx.getImageData(0, 0, SKETCH_SIZE, SKETCH_SIZE);
    for (const [x, y] of mirroredSketchPositions(action.x, action.y, action.vertical, action.horizontal))
      floodFillSketchPixels(image.data, SKETCH_SIZE, SKETCH_SIZE, x, y, channels(action.color));
    ctx.putImageData(image, 0, 0);
    return;
  }
  if (action.type === 'image') {
    const image = imageCache.get(action.src);
    if (image?.complete && image.naturalWidth) ctx.drawImage(image, action.x, action.y, action.width, action.height);
    return;
  }
  const variants = [[false, false]];
  if (action.vertical) variants.push([true, false]);
  if (action.horizontal) variants.push([false, true]);
  if (action.vertical && action.horizontal) variants.push([true, true]);
  for (const [vertical, horizontal] of variants) {
    ctx.save();
    if (vertical || horizontal) { ctx.translate(vertical ? SKETCH_SIZE : 0, horizontal ? SKETCH_SIZE : 0); ctx.scale(vertical ? -1 : 1, horizontal ? -1 : 1); }
    ctx.strokeStyle = action.type === 'eraser' ? background : action.color;
    ctx.fillStyle = action.type === 'eraser' ? background : action.color;
    ctx.lineWidth = action.width || 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (action.type === 'stroke' || action.type === 'eraser') {
      const points = smoothSketchPoints(action.points, action.smoothness);
      if (points.length === 1) { ctx.beginPath(); ctx.arc(points[0][0], points[0][1], action.width / 2, 0, Math.PI * 2); ctx.fill(); }
      else if (points.length > 1) {
        ctx.beginPath(); ctx.moveTo(...points[0]);
        if (action.smoothness > 0 && points.length > 2) {
          for (let i = 1; i < points.length - 1; i++) ctx.quadraticCurveTo(points[i][0], points[i][1], (points[i][0] + points[i + 1][0]) / 2, (points[i][1] + points[i + 1][1]) / 2);
          ctx.lineTo(...points.at(-1));
        } else for (const point of points.slice(1)) ctx.lineTo(...point);
        ctx.stroke();
      }
    } else if (action.type === 'shape') {
      const [x1, y1] = action.start; const [x2, y2] = action.end;
      const left = Math.min(x1, x2); const top = Math.min(y1, y2);
      const width = Math.abs(x2 - x1); const height = Math.abs(y2 - y1);
      ctx.beginPath();
      if (action.shape === 'rectangle') ctx.rect(left, top, width, height);
      else if (action.shape === 'ellipse') ctx.ellipse(left + width / 2, top + height / 2, Math.max(width / 2, 0.1), Math.max(height / 2, 0.1), 0, 0, Math.PI * 2);
      else if (action.shape === 'line') { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
      else {
        const sides = action.shape === 'triangle' ? 3 : 10;
        const cx = left + width / 2; const cy = top + height / 2;
        for (let i = 0; i < sides; i++) {
          const radius = action.shape === 'star' && i % 2 ? 0.44 : 1;
          const angle = -Math.PI / 2 + i * Math.PI * 2 / sides;
          const x = cx + Math.cos(angle) * width / 2 * radius;
          const y = cy + Math.sin(angle) * height / 2 * radius;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.closePath();
      }
      if (action.filled && action.shape !== 'line') ctx.fill(); else ctx.stroke();
    } else if (action.type === 'text') {
      ctx.font = `600 ${action.size}px Arial, sans-serif`; ctx.textBaseline = 'alphabetic'; ctx.fillText(action.text, action.x, action.y);
    }
    ctx.restore();
  }
}

export default function SketchCanvas({ onChange, disabled }) {
  const canvasRef = useRef(null); const imageInputRef = useRef(null); const textInputRef = useRef(null);
  const imageCache = useRef(new Map());
  const scene = useRef({ actions: [], background: '#ffffff' });
  const history = useRef([scene.current]); const historyIndex = useRef(0); const active = useRef(null);
  const [, setRevision] = useState(0);
  const [expanded, setExpanded] = useState(false); const [tool, setTool] = useState('brush'); const [panel, setPanel] = useState(null);
  const [brushSize, setBrushSize] = useState(12); const [eraserSize, setEraserSize] = useState(28); const [smoothness, setSmoothness] = useState(45);
  const [shape, setShape] = useState('ellipse'); const [filled, setFilled] = useState(false); const [fontSize, setFontSize] = useState(40);
  const [drawColor, setDrawColor] = useState('#171717'); const [grid, setGrid] = useState(false); const [snap, setSnap] = useState(false); const [gridSize, setGridSize] = useState(50);
  const [vertical, setVertical] = useState(false); const [horizontal, setHorizontal] = useState(false); const [zoomIndex, setZoomIndex] = useState(1);
  const [selectedIndex, setSelectedIndex] = useState(null); const [pendingText, setPendingText] = useState(null); const [message, setMessage] = useState('');

  function redraw(preview = null, previewScene = scene.current) {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = previewScene.background; ctx.fillRect(0, 0, SKETCH_SIZE, SKETCH_SIZE);
    for (const action of previewScene.actions) draw(ctx, action, previewScene.background, imageCache.current);
    if (preview) draw(ctx, preview, previewScene.background, imageCache.current);
  }
  function emit() { redraw(); onChange(scene.current.actions.length ? canvasRef.current?.toDataURL('image/png') : null); setRevision(value => value + 1); }
  function commit(next) {
    history.current = history.current.slice(0, historyIndex.current + 1); history.current.push(next);
    if (history.current.length > 50) history.current.shift();
    historyIndex.current = history.current.length - 1; scene.current = next; emit();
  }
  function restore(index) {
    if (index < 0 || index >= history.current.length) return;
    historyIndex.current = index; scene.current = history.current[index]; setSelectedIndex(null); emit();
  }
  function point(event, gridSnap = false) {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(SKETCH_SIZE, (event.clientX - rect.left) / rect.width * SKETCH_SIZE));
    const y = Math.max(0, Math.min(SKETCH_SIZE, (event.clientY - rect.top) / rect.height * SKETCH_SIZE));
    return gridSnap && snap ? [Math.round(x / gridSize) * gridSize, Math.round(y / gridSize) * gridSize] : [x, y];
  }
  function begin(event) {
    if (disabled) return;
    event.preventDefault();
    const [x, y] = point(event, tool === 'shape' || tool === 'text');
    if (tool === 'text') { setPendingText({ x, y, text: '' }); return; }
    if (tool === 'fill') { commit({ ...scene.current, actions: [...scene.current.actions, { type: 'fill', x, y, color: drawColor, vertical, horizontal }] }); return; }
    if (tool === 'select') {
      const index = scene.current.actions.findLastIndex(action => { const box = bounds(action); return box && x >= box.x && y >= box.y && x <= box.x + box.width && y <= box.y + box.height; });
      setSelectedIndex(index < 0 ? null : index);
      if (index >= 0) { active.current = { kind: 'move', index, start: [x, y], original: scene.current.actions[index] }; event.currentTarget.setPointerCapture(event.pointerId); }
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const action = tool === 'shape'
      ? { type: 'shape', shape, filled, start: [x, y], end: [x, y], width: brushSize, color: drawColor, vertical, horizontal }
      : { type: tool === 'eraser' ? 'eraser' : 'stroke', points: [[x, y]], width: tool === 'eraser' ? eraserSize : brushSize,
        smoothness: tool === 'eraser' ? 35 : smoothness, color: drawColor, vertical, horizontal };
    active.current = { kind: 'draw', action }; redraw(action);
  }
  function move(event) {
    if (!active.current || disabled) return;
    if (active.current.kind === 'move') {
      const [x, y] = point(event); const { index, start, original } = active.current;
      redraw(null, { ...scene.current, actions: scene.current.actions.map((action, n) => n === index ? moved(original, x - start[0], y - start[1]) : action) });
      return;
    }
    const action = active.current.action;
    if (action.type === 'shape') action.end = point(event, true);
    else {
      const samples = event.getCoalescedEvents?.();
      for (const sample of samples?.length ? samples : [event]) {
        const next = point(sample); const previous = action.points.at(-1);
        if (Math.hypot(next[0] - previous[0], next[1] - previous[1]) >= 1) action.points.push(next);
      }
    }
    redraw(action);
  }
  function finish(event) {
    if (!active.current) return;
    const current = active.current; active.current = null;
    if (current.kind === 'move') {
      const [x, y] = point(event); const [sx, sy] = current.start;
      if (Math.hypot(x - sx, y - sy) < 2) { redraw(); return; }
      commit({ ...scene.current, actions: scene.current.actions.map((action, n) => n === current.index ? moved(current.original, x - sx, y - sy) : action) });
    } else {
      if (current.action.type === 'shape') current.action.end = point(event, true);
      commit({ ...scene.current, actions: [...scene.current.actions, current.action] });
    }
  }
  function saveText() {
    if (!pendingText) return;
    const value = pendingText.text.trim();
    if (value) commit({ ...scene.current, actions: [...scene.current.actions, { type: 'text', x: pendingText.x, y: pendingText.y, text: value.slice(0, 60), size: fontSize, color: drawColor, vertical, horizontal }] });
    setPendingText(null);
  }
  async function importImage(file) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) { setMessage('Choose a PNG, JPG or WebP image up to 4 MB.'); return; }
    const src = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }).catch(() => null);
    if (!src) { setMessage('Could not open this image.'); return; }
    const image = new Image(); image.src = src;
    try { await image.decode(); } catch { setMessage('Could not open this image.'); return; }
    imageCache.current.set(src, image);
    const scale = Math.min(460 / image.naturalWidth, 460 / image.naturalHeight);
    const width = image.naturalWidth * scale; const height = image.naturalHeight * scale;
    commit({ ...scene.current, actions: [...scene.current.actions, { type: 'image', src, x: (SKETCH_SIZE - width) / 2, y: (SKETCH_SIZE - height) / 2, width, height }] });
    setTool('select'); setSelectedIndex(scene.current.actions.length - 1); setMessage('Image added. Select and drag to move it.');
  }
  function chooseTool(next) { setTool(next); setSelectedIndex(null); setPanel(old => old === next ? null : ['brush', 'eraser', 'shape', 'text'].includes(next) ? next : null); }
  function close() { saveText(); setExpanded(false); setPanel(null); }
  function download() { if (!scene.current.actions.length) return; redraw(); const link = document.createElement('a'); link.href = canvasRef.current.toDataURL('image/png'); link.download = 'logo-sketch.png'; link.click(); }
  useEffect(() => { redraw(); }, [expanded]);
  useEffect(() => { if (pendingText) textInputRef.current?.focus(); }, [pendingText?.x, pendingText?.y]);
  useEffect(() => {
    if (!expanded) return;
    const onKey = event => {
      if (event.key === 'Escape') { setPendingText(null); setExpanded(false); setPanel(null); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) { event.preventDefault(); restore(historyIndex.current + (event.shiftKey ? 1 : -1)); }
    };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [expanded]);

  const selection = selectedIndex == null ? null : bounds(scene.current.actions[selectedIndex]);
  const canUndo = historyIndex.current > 0; const canRedo = historyIndex.current < history.current.length - 1;
  const toolButton = (name, label, icon) => <button key={name} type="button" disabled={disabled} aria-label={label} title={label} aria-pressed={tool === name} onClick={() => chooseTool(name)}>{icon}</button>;
  const surface = <div className={styles.sketchSurface} style={expanded ? { width: `${ZOOMS[zoomIndex] * 100}%` } : undefined}>
    <canvas ref={canvasRef} width={SKETCH_SIZE} height={SKETCH_SIZE} aria-label="Sketch your logo" onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} />
    {grid && <div className={styles.sketchGrid} aria-hidden="true" style={{ backgroundSize: `${gridSize / SKETCH_SIZE * 100}% ${gridSize / SKETCH_SIZE * 100}%` }} />}
    {vertical && <div className={`${styles.sketchAxis} ${styles.sketchAxisVertical}`} aria-hidden="true" />}
    {horizontal && <div className={`${styles.sketchAxis} ${styles.sketchAxisHorizontal}`} aria-hidden="true" />}
    {selection && tool === 'select' && <div className={styles.sketchSelection} aria-hidden="true" style={{ left: `${selection.x / 6}%`, top: `${selection.y / 6}%`, width: `${selection.width / 6}%`, height: `${selection.height / 6}%` }} />}
    {pendingText && <input ref={textInputRef} className={styles.sketchTextInput} style={{ left: `${pendingText.x / 6}%`, top: `${pendingText.y / 6}%` }} aria-label="Text to add to sketch" maxLength={60} value={pendingText.text}
      onChange={event => setPendingText(old => ({ ...old, text: event.target.value }))} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } if (event.key === 'Escape') setPendingText(null); }} onBlur={saveText} />}
  </div>;
  const editor = <div className={expanded ? styles.sketchOverlay : styles.sketch} role={expanded ? 'dialog' : undefined} aria-modal={expanded ? 'true' : undefined} aria-label={expanded ? 'Sketch editor' : undefined}>
    <div className={expanded ? styles.sketchModal : undefined}>
      <div className={styles.sketchHeader}><strong>{expanded ? 'Sketch editor' : 'Draw your idea'}</strong><div>
        {expanded && <span>Draw freely, then use your sketch to generate a logo.</span>}
        <button type="button" disabled={disabled} aria-label={expanded ? 'Close sketch editor' : 'Open larger sketch editor'} title={expanded ? 'Close editor' : 'Open larger editor'} onClick={() => expanded ? close() : setExpanded(true)}>{expanded ? <X size={16} /> : <Maximize2 size={15} />}</button>
      </div></div>
      <div className={styles.sketchStage}>{surface}</div>
      <div className={styles.sketchTools} role="toolbar" aria-label="Sketch tools">
        {expanded && toolButton('select', 'Select and move', <MousePointer2 size={16} />)}
        {toolButton('brush', 'Brush', <Pencil size={16} />)}
        {toolButton('eraser', 'Eraser', <Eraser size={16} />)}
        {expanded && <>{toolButton('fill', 'Fill an area', <PaintBucket size={16} />)}{toolButton('shape', 'Shapes', <Square size={16} />)}{toolButton('text', 'Add text', <Type size={16} />)}
          <button type="button" disabled={disabled} aria-label="Import image into sketch" title="Import image" onClick={() => imageInputRef.current?.click()}><ImagePlus size={16} /></button>
          <button type="button" disabled={disabled} aria-label="Brush and background colors" title="Colors" aria-expanded={panel === 'colors'} onClick={() => setPanel(panel === 'colors' ? null : 'colors')}><Palette size={16} /></button></>}
        {!expanded && <label className={styles.sketchCompactSize}>Size <input type="range" min="2" max="48" value={brushSize} disabled={disabled} aria-label="Brush size" onChange={event => setBrushSize(Number(event.target.value))} /></label>}
        <span className={styles.sketchToolDivider} aria-hidden="true" />
        <button type="button" disabled={disabled || !canUndo} aria-label="Undo sketch action" title="Undo" onClick={() => restore(historyIndex.current - 1)}><Undo2 size={16} /></button>
        <button type="button" disabled={disabled || !canRedo} aria-label="Redo sketch action" title="Redo" onClick={() => restore(historyIndex.current + 1)}><Redo2 size={16} /></button>
        {expanded && <><button type="button" disabled={disabled} aria-label="Grid options" title="Grid" aria-expanded={panel === 'grid'} onClick={() => setPanel(panel === 'grid' ? null : 'grid')}><Grid3X3 size={16} /></button>
          <button type="button" disabled={disabled} aria-label="Symmetry options" title="Symmetry" aria-expanded={panel === 'symmetry'} onClick={() => setPanel(panel === 'symmetry' ? null : 'symmetry')}><span className={styles.sketchSymmetryIcon}>◫</span></button>
          <button type="button" disabled={disabled || !scene.current.actions.length} aria-label="Download sketch PNG" title="Download sketch" onClick={download}><Download size={16} /></button></>}
        <button type="button" disabled={disabled || !scene.current.actions.length} aria-label="Clear sketch" title="Clear sketch" onClick={() => { setSelectedIndex(null); commit({ actions: [], background: '#ffffff' }); }}><Trash2 size={16} /></button>
      </div>
      {expanded && panel && <div className={styles.sketchPanel} aria-label={`${panel} settings`}>
        {panel === 'brush' && <><label>Brush size <strong>{brushSize}</strong><input type="range" min="2" max="80" value={brushSize} onChange={event => setBrushSize(Number(event.target.value))} /></label>
          <label>Smoothness <strong>{smoothness}</strong><input type="range" min="0" max="100" value={smoothness} onChange={event => setSmoothness(Number(event.target.value))} /></label></>}
        {panel === 'eraser' && <label>Eraser size <strong>{eraserSize}</strong><input type="range" min="4" max="100" value={eraserSize} onChange={event => setEraserSize(Number(event.target.value))} /></label>}
        {panel === 'shape' && <><div className={styles.sketchChoices}>{SHAPES.map(item => <button key={item} type="button" aria-pressed={shape === item} onClick={() => setShape(item)}>{item}</button>)}</div>
          <div className={styles.sketchChoices}><button type="button" aria-pressed={!filled} onClick={() => setFilled(false)}>Outline</button><button type="button" aria-pressed={filled} onClick={() => setFilled(true)}>Filled</button></div></>}
        {panel === 'text' && <label>Text size <strong>{fontSize}</strong><input type="range" min="14" max="100" value={fontSize} onChange={event => setFontSize(Number(event.target.value))} /></label>}
        {panel === 'colors' && <><div className={styles.sketchColorFields}><label>Draw color <input type="color" value={drawColor} onChange={event => setDrawColor(event.target.value)} /></label>
          <label>Background <input type="color" value={scene.current.background} onChange={event => commit({ ...scene.current, background: event.target.value })} /></label></div>
          <div className={styles.sketchSwatches}>{SWATCHES.map(color => <button key={color} type="button" style={{ background: color }} aria-label={`Use ${color} drawing color`} aria-pressed={drawColor === color} onClick={() => setDrawColor(color)} />)}</div></>}
        {panel === 'grid' && <><label className={styles.sketchToggle}><input type="checkbox" checked={grid} onChange={event => setGrid(event.target.checked)} /> Show grid</label>
          <label className={styles.sketchToggle}><input type="checkbox" checked={snap} onChange={event => { setSnap(event.target.checked); if (event.target.checked) setGrid(true); }} /> Snap shapes to grid</label>
          <label>Grid size <strong>{gridSize}</strong><input type="range" min="25" max="100" step="5" value={gridSize} onChange={event => setGridSize(Number(event.target.value))} /></label></>}
        {panel === 'symmetry' && <><label className={styles.sketchToggle}><input type="checkbox" checked={vertical} onChange={event => setVertical(event.target.checked)} /> Vertical</label>
          <label className={styles.sketchToggle}><input type="checkbox" checked={horizontal} onChange={event => setHorizontal(event.target.checked)} /> Horizontal</label></>}
      </div>}
      {expanded && <div className={styles.sketchBottom}><div className={styles.sketchZoom}><button type="button" aria-label="Zoom out" disabled={zoomIndex === 0} onClick={() => setZoomIndex(zoomIndex - 1)}><ZoomOut size={15} /></button><span>{Math.round(ZOOMS[zoomIndex] * 100)}%</span><button type="button" aria-label="Zoom in" disabled={zoomIndex === ZOOMS.length - 1} onClick={() => setZoomIndex(zoomIndex + 1)}><ZoomIn size={15} /></button></div>
        <span>{message || 'Tip: choose Brush, then adjust Smoothness for cleaner curves.'}</span></div>}
      {!expanded && <p>Use the larger editor for smooth strokes, shapes, colors and symmetry.</p>}
      <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => { importImage(event.target.files?.[0]); event.target.value = ''; }} />
    </div>
  </div>;
  return expanded && typeof document !== 'undefined' ? createPortal(editor, document.body) : editor;
}
