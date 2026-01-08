import React, { useMemo, useRef, useState, useCallback } from 'react';
import ImtCoderReact from './react/ImtCoderReact.jsx';
import MappingModal from './components/MappingModal.jsx';

export default function MappingInput({ value, onChange, data }) {
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(value || '');
  const ref = useRef();

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  const handleSelect = useCallback((path) => {
    const el = ref.current;
    if (el && typeof el.insertMapping === 'function') {
      el.insertMapping(path);
    }
    setOpen(false);
  }, []);

  const handleChange = useCallback(() => {
    const el = ref.current;
    const newVal = el?.value ?? '';
    setInternal(newVal);
    onChange?.(newVal);
  }, [onChange]);

  return (
    <div>
      <ImtCoderReact
        ref={ref}
        value={internal}
        focused-placeholder="Enter text or type '/' to search"
        onOpenMappingModal={handleOpen}
        onChange={handleChange}
        style={{ width: '100%' }}
      />

      <MappingModal open={open} onClose={handleClose} onSelect={handleSelect} data={data} />
    </div>
  );
}


