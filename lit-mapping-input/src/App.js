import './App.css';
import React, { useState } from 'react';
import MappingInput from './MappingInput.jsx';

const sample = {
  Shopify: {
    customers: [{ id: '123', email: 'john@example.com' }],
    orders: [{ order_id: 'ORD-01', amount: 250 }],
  },
  CRM: {
    contacts: [{ name: 'Alice', email: 'alice@crm.com' }],
  },
};

export default function App() {
  const [value, setValue] = useState("1. Spaces[5] $average(Shopify.customers[].id)");
  return (
    <div style={{ padding: 24 }}>
      <h2>Lit Mapping Input Demo</h2>
      <MappingInput value={value} onChange={setValue} data={sample} />
      <div style={{ marginTop: 16 }}>
        <strong>Value:</strong> <code>{value}</code>
      </div>
    </div>
  );
}