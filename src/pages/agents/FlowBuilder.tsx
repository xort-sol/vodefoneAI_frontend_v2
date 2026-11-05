import React, { useEffect, useRef, useState } from 'react';
import { Cable, GitBranch, Flag, Play, Plus, RotateCcw, Trash2, ZoomIn, ZoomOut, Circle, X, MousePointer2 } from 'lucide-react';
import { Badge, Button, Field, Segmented, useConfirm, EmptyState } from '../../components/ui';
import { defaultFlow, uid, FLOW_NODE_W, type Builder, type FlowNode, type NodeType } from './model';

const NODE_W = FLOW_NODE_W; const NODE_H = 60;
const CANVAS_W = 1340; const CANVAS_H = 540;
const TYPE_META: Record<NodeType, { label: string; color: string; icon: React.ReactNode }> = {
  start: { label: 'Start', color: '#16A34A', icon: <Play size={10} /> },
  step: { label: 'Step', color: '#2563EB', icon: <Circle size={10} /> },
  branch: { label: 'Branch', color: '#EA580C', icon: <GitBranch size={10} /> },
  end: { label: 'End', color: '#7C3AED', icon: <Flag size={10} /> },
};

type Flow = Builder['flow'];

function edgeGeom(a: FlowNode, b: FlowNode) {
  const ac = { x: a.x + NODE_W / 2, y: a.y + NODE_H / 2 }; const bc = { x: b.x + NODE_W / 2, y: b.y + NODE_H / 2 };
  const dx = bc.x - ac.x; const dy = bc.y - ac.y;
  let p0, p3, c1, c2;
  if (Math.abs(dx) > Math.abs(dy) * 1.2) {
    const s = Math.sign(dx) || 1;
    p0 = { x: ac.x + (s * NODE_W) / 2, y: ac.y }; p3 = { x: bc.x - (s * NODE_W) / 2, y: bc.y };
    const k = Math.max(40, Math.abs(p3.x - p0.x) / 2);
    c1 = { x: p0.x + s * k, y: p0.y }; c2 = { x: p3.x - s * k, y: p3.y };
  } else {
    const s = Math.sign(dy) || 1;
    p0 = { x: ac.x, y: ac.y + (s * NODE_H) / 2 }; p3 = { x: bc.x, y: bc.y - (s * NODE_H) / 2 };
    const k = Math.max(30, Math.abs(p3.y - p0.y) / 2);
    c1 = { x: p0.x, y: p0.y + s * k }; c2 = { x: p3.x, y: p3.y - s * k };
  }
  const mid = { x: (p0.x + 3 * c1.x + 3 * c2.x + p3.x) / 8, y: (p0.y + 3 * c1.y + 3 * c2.y + p3.y) / 8 };
  return { d: `M${p0.x},${p0.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p3.x},${p3.y}`, mid };
}

export default function FlowBuilder({ flow, onChange, readOnly }: { flow: Flow; onChange: (f: Flow) => void; readOnly?: boolean }) {
  const confirm = useConfirm();
  const [zoom, setZoom] = useState(0.8);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fit = () => { const w = canvasRef.current?.clientWidth ?? 900; setZoom(Math.max(0.5, Math.min(1, +((w - 8) / CANVAS_W).toFixed(2)))); };
  useEffect(() => { fit(); }, []);
  const [sel, setSel] = useState<{ kind: 'node' | 'edge'; id: string } | null>({ kind: 'node', id: 'n5' });
  const [mode, setMode] = useState<'select' | 'connect'>('select');
  const [source, setSource] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; ox: number; oy: number; moved: boolean } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const selNode = sel?.kind === 'node' ? byId.get(sel.id) : undefined;
  const selEdge = sel?.kind === 'edge' ? flow.edges.find((e) => e.id === sel.id) : undefined;

  const toCanvas = (e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  };
  const patchNode = (id: string, p: Partial<FlowNode>) => onChange({ ...flow, nodes: flow.nodes.map((n) => (n.id === id ? { ...n, ...p } : n)) });

  const onNodeDown = (e: React.PointerEvent, n: FlowNode) => {
    e.stopPropagation();
    if (mode === 'connect') {
      if (readOnly) return;
      if (!source) { setSource(n.id); return; }
      if (source === n.id) { setSource(null); return; }
      if (!flow.edges.some((x) => x.from === source && x.to === n.id)) {
        const id = uid('e');
        onChange({ ...flow, edges: [...flow.edges, { id, from: source, to: n.id, label: '' }] });
        setSel({ kind: 'edge', id });
      }
      setSource(null); return;
    }
    setSel({ kind: 'node', id: n.id });
    if (readOnly) return;
    const p = toCanvas(e);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: n.id, ox: p.x - n.x, oy: p.y - n.y, moved: false });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toCanvas(e);
    const x = Math.max(0, Math.min(CANVAS_W - NODE_W, Math.round(p.x - drag.ox)));
    const y = Math.max(0, Math.min(CANVAS_H - NODE_H, Math.round(p.y - drag.oy)));
    const n = byId.get(drag.id);
    if (n && (n.x !== x || n.y !== y)) { patchNode(drag.id, { x, y }); if (!drag.moved) setDrag({ ...drag, moved: true }); }
  };
  const onUp = () => setDrag(null);

  const addNode = (type: NodeType) => {
    const id = uid('n');
    const base = selNode ?? flow.nodes[0];
    const node: FlowNode = { id, title: type === 'branch' ? 'New branch' : 'New step', type, x: Math.min(CANVAS_W - NODE_W, (base?.x ?? 40) + 40), y: Math.min(CANVAS_H - NODE_H, (base?.y ?? 40) + 100), prompt: '', conditions: '' };
    const edges = base ? [...flow.edges, { id: uid('e'), from: base.id, to: id, label: '' }] : flow.edges;
    onChange({ nodes: [...flow.nodes, node], edges });
    setSel({ kind: 'node', id });
  };
  const deleteNode = async (n: FlowNode) => {
    const links = flow.edges.filter((e) => e.from === n.id || e.to === n.id).length;
    const ok = await confirm({ title: `Delete “${n.title}”?`, desc: `This removes the node and ${links} connection${links === 1 ? '' : 's'}. Save the draft to keep the change.`, danger: true, confirmLabel: 'Delete node' });
    if (!ok) return;
    onChange({ nodes: flow.nodes.filter((x) => x.id !== n.id), edges: flow.edges.filter((e) => e.from !== n.id && e.to !== n.id) });
    setSel(null);
  };
  const reset = async () => {
    const ok = await confirm({ title: 'Reset conversation flow?', desc: 'Restores the default Vodafone outbound flow and layout. Custom nodes and connections will be removed from the draft.', confirmLabel: 'Reset layout', danger: true });
    if (ok) { onChange(defaultFlow()); setSel(null); fit(); }
  };

  return (
    <div>
      <div className="row-wrap" style={{ marginBottom: 10 }}>
        <Segmented value={mode} onChange={(m) => { setMode(m); setSource(null); }} options={[{ value: 'select', label: <span className="row gap-4"><MousePointer2 size={13} />Select</span> }, { value: 'connect', label: <span className="row gap-4"><Cable size={13} />Connect</span> }]} />
        <Button size="sm" icon={<Plus />} onClick={() => addNode('step')} disabled={readOnly}>Step</Button>
        <Button size="sm" icon={<GitBranch />} onClick={() => addNode('branch')} disabled={readOnly}>Branch</Button>
        <div style={{ marginLeft: 'auto' }} className="row">
          <div className="btn-group">
            <Button size="sm" iconOnly icon={<ZoomOut />} onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))} aria-label="Zoom out" />
            <Button size="sm" onClick={fit} aria-label="Fit to view" title="Fit to view"><span className="mono">{Math.round(zoom * 100)}%</span></Button>
            <Button size="sm" iconOnly icon={<ZoomIn />} onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))} aria-label="Zoom in" />
          </div>
          <Button size="sm" icon={<RotateCcw />} onClick={reset} disabled={readOnly}>Reset layout</Button>
        </div>
      </div>
      {mode === 'connect' && <div className="banner info" style={{ marginBottom: 10 }}><Cable />{source ? <>Source <b>&nbsp;{byId.get(source)?.title}&nbsp;</b> selected — click a target node to connect, or click it again to cancel.</> : 'Connect mode: click a source node, then a target node.'}</div>}

      <div className="flow-builder-grid">
        <div ref={canvasRef} className="flow-canvas dotgrid" style={{ height: Math.min(560, CANVAS_H * zoom + 24) }} onPointerDown={() => { if (mode === 'select') setSel(null); }}>
          <div ref={wrapRef} style={{ position: 'relative', width: CANVAS_W * zoom, height: CANVAS_H * zoom }} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: CANVAS_W, height: CANVAS_H, transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
              <svg width={CANVAS_W} height={CANVAS_H} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
                <defs>
                  <marker id="fb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#A3A3A3" /></marker>
                  <marker id="fb-arrow-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#2563EB" /></marker>
                </defs>
                {flow.edges.map((ed) => {
                  const a = byId.get(ed.from); const b = byId.get(ed.to);
                  if (!a || !b) return null;
                  const g = edgeGeom(a, b); const on = sel?.kind === 'edge' && sel.id === ed.id;
                  const branchy = a.type === 'branch' || b.type === 'branch';
                  return (
                    <g key={ed.id} style={{ cursor: 'pointer' }} onPointerDown={(e) => { e.stopPropagation(); setSel({ kind: 'edge', id: ed.id }); }}>
                      <path d={g.d} fill="none" stroke="transparent" strokeWidth={12} />
                      <path d={g.d} fill="none" stroke={on ? '#2563EB' : '#C8C8C8'} strokeWidth={on ? 2 : 1.5} strokeDasharray={branchy ? '5 4' : undefined} markerEnd={`url(#${on ? 'fb-arrow-sel' : 'fb-arrow'})`} />
                    </g>
                  );
                })}
              </svg>
              {flow.nodes.map((n) => {
                const m = TYPE_META[n.type];
                const on = sel?.kind === 'node' && sel.id === n.id;
                return (
                  <div key={n.id} className={`flow-node ${on ? 'selected' : ''} ${drag?.id === n.id && drag.moved ? 'dragging' : ''}`}
                    style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H, borderLeft: `3px solid ${m.color}`, outline: source === n.id ? '2px dashed #2563EB' : undefined, outlineOffset: 2, cursor: mode === 'connect' ? 'crosshair' : undefined, touchAction: 'none' }}
                    onPointerDown={(e) => onNodeDown(e, n)} role="button" aria-label={`${m.label}: ${n.title}`}>
                    <div className="flow-node-type" style={{ color: m.color }}>{m.icon}{m.label}</div>
                    <div className="flow-node-title truncate">{n.title}</div>
                  </div>
                );
              })}
              <svg width={CANVAS_W} height={CANVAS_H} style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
                {flow.edges.map((ed) => {
                  const a = byId.get(ed.from); const b = byId.get(ed.to);
                  if (!a || !b || !ed.label) return null;
                  const g = edgeGeom(a, b); const on = sel?.kind === 'edge' && sel.id === ed.id;
                  return (
                    <g key={ed.id} transform={`translate(${g.mid.x},${g.mid.y})`} style={{ pointerEvents: 'all', cursor: 'pointer' }} onPointerDown={(e) => { e.stopPropagation(); setSel({ kind: 'edge', id: ed.id }); }}>
                      <rect x={-(ed.label.length * 3.1 + 8)} y={-9} width={ed.label.length * 6.2 + 16} height={18} rx={9} fill="#fff" stroke={on ? '#2563EB' : '#E5E5E5'} />
                      <text textAnchor="middle" dy={3.5} fontSize={10.5} fill={on ? '#1E40AF' : '#525252'} fontFamily="var(--font-ui)">{ed.label}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>

        <div className="card" style={{ alignSelf: 'start' }}>
          {selNode ? (
            <div className="fb-insp">
              <div className="row between fb-full"><span className="label">Node inspector</span><Badge tone="outline">{selNode.id}</Badge></div>
              <Field label="Title"><input className="input sm" value={selNode.title} disabled={readOnly} onChange={(e) => patchNode(selNode.id, { title: e.target.value })} /></Field>
              <Field label="Type">
                <select className="select sm" value={selNode.type} disabled={readOnly} onChange={(e) => patchNode(selNode.id, { type: e.target.value as NodeType })}>
                  {(Object.keys(TYPE_META) as NodeType[]).map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
                </select>
              </Field>
              <Field label="Agent prompt" hint="What the agent does or says at this step">
                <textarea className="textarea" rows={3} value={selNode.prompt} disabled={readOnly} onChange={(e) => patchNode(selNode.id, { prompt: e.target.value })} placeholder="e.g. Ask how the customer uses their connection…" />
              </Field>
              <Field label="Entry conditions" hint="When the conversation moves into this node">
                <textarea className="textarea" style={{ minHeight: 60 }} value={selNode.conditions} disabled={readOnly} onChange={(e) => patchNode(selNode.id, { conditions: e.target.value })} placeholder="e.g. intent ≥ 60 and no objection raised" />
              </Field>
              <div className="fb-full">
                <div className="label" style={{ marginBottom: 6 }}>Connections</div>
                <div className="col gap-4">
                  {flow.edges.filter((e) => e.from === selNode.id || e.to === selNode.id).map((e) => (
                    <button key={e.id} className="row small btn ghost xs" style={{ justifyContent: 'flex-start' }} onClick={() => setSel({ kind: 'edge', id: e.id })}>
                      {e.from === selNode.id ? '→' : '←'} {byId.get(e.from === selNode.id ? e.to : e.from)?.title}{e.label && <span className="muted">· {e.label}</span>}
                    </button>
                  ))}
                  {!flow.edges.some((e) => e.from === selNode.id || e.to === selNode.id) && <span className="small muted">Not connected</span>}
                </div>
              </div>
              <div className="fb-full"><Button size="sm" variant="danger" icon={<Trash2 />} disabled={readOnly} onClick={() => deleteNode(selNode)}>Delete node</Button></div>
            </div>
          ) : selEdge ? (
            <div className="col gap-12">
              <div className="row between"><span className="label">Connection</span><Button size="xs" variant="ghost" iconOnly icon={<X />} onClick={() => setSel(null)} aria-label="Close" /></div>
              <div className="small"><b>{byId.get(selEdge.from)?.title}</b> → <b>{byId.get(selEdge.to)?.title}</b></div>
              <Field label="Label" hint="Shown on the edge, e.g. the customer response that triggers it">
                <input className="input sm" value={selEdge.label} disabled={readOnly} onChange={(e) => onChange({ ...flow, edges: flow.edges.map((x) => (x.id === selEdge.id ? { ...x, label: e.target.value } : x)) })} />
              </Field>
              <Button size="sm" variant="danger" icon={<Trash2 />} disabled={readOnly} onClick={() => { onChange({ ...flow, edges: flow.edges.filter((x) => x.id !== selEdge.id) }); setSel(null); }}>Delete connection</Button>
            </div>
          ) : (
            <EmptyState icon={<MousePointer2 size={18} />} title="Nothing selected" desc="Select a node or connection to edit it. Drag nodes to rearrange." />
          )}
          <div className="divider" />
          <div className="row-wrap xs muted">{(Object.keys(TYPE_META) as NodeType[]).map((t) => <span key={t} className="row gap-4"><i style={{ width: 8, height: 8, borderRadius: 2, background: TYPE_META[t].color, display: 'inline-block' }} />{TYPE_META[t].label}</span>)}<span>· {flow.nodes.length} nodes · {flow.edges.length} connections</span></div>
        </div>
      </div>
      <style>{`.flow-builder-grid{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:12px}.fb-insp{display:flex;flex-direction:column;gap:12px}@media(max-width:1600px){.flow-builder-grid{grid-template-columns:minmax(0,1fr)}.fb-insp{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.fb-full{grid-column:1/-1}}@media(max-width:720px){.fb-insp{grid-template-columns:minmax(0,1fr)}}`}</style>
    </div>
  );
}
