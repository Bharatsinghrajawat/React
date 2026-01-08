import React from 'react';

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

function buildPath(prefix, key, value) {
  if (Array.isArray(value)) {
    return prefix ? `${prefix}.${key}[]` : `${key}[]`;
  }
  return prefix ? `${prefix}.${key}` : `${key}`;
}

function TreeNode({ data, path, onSelect }) {
  if (Array.isArray(data)) {
    const first = data[0];
    return (
      <div style={{ marginLeft: 12 }}>
        <div style={{ cursor: 'pointer', color: '#111827' }} onClick={() => onSelect(path)}>
          {path}
        </div>
        {first !== undefined && (
          <TreeNode data={first} path={`${path}`} onSelect={onSelect} />
        )}
      </div>
    );
  }
  if (isPlainObject(data)) {
    return (
      <div style={{ marginLeft: 12 }}>
        {Object.entries(data).map(([k, v]) => (
          <div key={k}>
            <div
              style={{ cursor: 'pointer', color: '#1f2937' }}
              onClick={() => onSelect(buildPath(path, k, v))}
            >
              {buildPath(path, k, v)}
            </div>
            <TreeNode data={v} path={buildPath(path, k, v)} onSelect={onSelect} />
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export default function MappingModal({ open, onClose, data, onSelect }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{ background: 'white', minWidth: 520, maxHeight: '70vh', overflow: 'auto', borderRadius: 8, padding: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Insert mapping</h3>
          <button onClick={onClose}>Close</button>
        </div>
        <div style={{ marginTop: 8 }}>
          <TreeNode data={data} path="" onSelect={(p) => onSelect(p)} />
        </div>
      </div>
    </div>
  );
}


