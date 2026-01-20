// Tokenizer that handles nested mappings and function calls
// Supported examples:
// Shopify.customers[].id
// Node.Array[3]
// $Function(Node.Key)
// $Concat('Hello', Node.Array[index].Object.Key)

export function tokenizeExpression(input) {
  if (!input) return [];
  const tokens = [];
  let i = 0;
  console.log({input})
  while (i < input.length) {

    // Skip whitespace (will be preserved as text)
    if (/\s/.test(input[i])) {
      let start = i;
      while (i < input.length && /\s/.test(input[i])) i++;
      tokens.push({ kind: 'text', text: input.slice(start, i) });
      continue;
    }
    
    // Check for function call: $FunctionName(...)
    if (input[i] === '$' && /^\$[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(input.slice(i))) {
      const funcToken = parseFunction(input, i);
      if (funcToken) {
        tokens.push(funcToken.token);
        i = funcToken.nextIndex;
        continue;
      }
    }
    
    // Check for mapping/path: Node.Key or Node.Array[index]
    if (/^[A-Za-z_][A-Za-z0-9_]*/.test(input.slice(i))) {
    
      const mappingToken = parseMapping(input, i);
      if (mappingToken) {
        tokens.push(mappingToken.token);
        i = mappingToken.nextIndex;
        continue;
      }
    }
    
    // Default: treat as text
    tokens.push({ kind: 'text', text: input[i] });
    i++;
  }
  
  return mergeAdjacentText(tokens);
}

function parseFunction(input, start) {
  const funcMatch = input.slice(start).match(/^\$([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
  if (!funcMatch) return null;
  
  const funcName = funcMatch[1];
  let i = start + funcMatch[0].length; // After "$funcName("
  const segments = [
    { text: '$' + funcName + '(', kind: 'static' }
  ];
  
  // Parse arguments until closing paren
  let depth = 1;
  let argStart = i;
  
  while (i < input.length && depth > 0) {
    if (input[i] === '(') depth++;
    else if (input[i] === ')') {
      depth--;
      if (depth === 0) {
        // Parse content between parentheses
        const argContent = input.slice(argStart, i);
        if (argContent.trim()) {
          // Recursively parse arguments (can contain nested mappings)
          const argTokens = tokenizeExpression(argContent);
          // Flatten nested tokens into segments
          for (const argToken of argTokens) {
            if (argToken.kind === 'text') {
              segments.push({ text: argToken.text, kind: 'static' });
            } else if (argToken.kind === 'mapping') {
              // Add all segments from nested mapping
              segments.push(...argToken.segments);
            }
          }
        }
        segments.push({ text: ')', kind: 'static' });
        i++;
        break;
      }
    } else if (input[i] === ',' && depth === 1) {
      // Argument separator - parse this argument
      const argContent = input.slice(argStart, i);
      if (argContent.trim()) {
        const argTokens = tokenizeExpression(argContent);
        for (const argToken of argTokens) {
          if (argToken.kind === 'text') {
            segments.push({ text: argToken.text, kind: 'static' });
          } else if (argToken.kind === 'mapping') {
            segments.push(...argToken.segments);
          }
        }
      }
      segments.push({ text: ',', kind: 'static' });
      i++;
      argStart = i;
      continue;
    }
    i++;
  }
  
  return {
    token: {
      kind: 'mapping',
      type: 'function',
      raw: input.slice(start, i),
      segments
    },
    nextIndex: i
  };
}

// function parseMapping(input, start) {
//   let i = start;
//   const segments = [];
//   let currentPart = '';
  
//   while (i < input.length) {
//     const ch = input[i];
//     debugger
//     if (ch === '[') {
//       // Add current part as static
//       if (currentPart) {
//         segments.push({ text: currentPart, kind: 'static' });
//         currentPart = '';
//       }
//       // Parse index
//       segments.push({ text: '[', kind: 'static' });
//       i++;
//       let indexContent = '';
//       while (i < input.length && input[i] !== ']') {
//         indexContent += input[i];
//         i++;
//       }
//       if (i < input.length) {
//         segments.push({ text: sanitizeIndex(indexContent), kind: 'index' });
//         segments.push({ text: ']', kind: 'static' });
//         i++;
//       }
//     } else if (ch === '.') {
//       if (currentPart) {
//         segments.push({ text: currentPart, kind: 'static' });
//         currentPart = '';
//       }
//       segments.push({ text: '.', kind: 'static' });
//       i++;
//     } else if (/[A-Za-z0-9_]/.test(ch)) {
//       currentPart += ch;
//       i++;
//     } else {
//       // End of mapping
//       break;
//     }
//   }
  
//   if (currentPart) {
//     segments.push({ text: currentPart, kind: 'static' });
//   }
  
//   if (segments.length === 0) return null;
  
//   return {
//     token: {
//       kind: 'mapping',
//       type: 'path',
//       raw: input.slice(start, i),
//       segments
//     },
//     nextIndex: i
//   };
// }
function parseMapping(input, start) {
  let i = start;
  const segments = [];
  let currentPart = '';

  while (i < input.length) {
    const ch = input[i];

    // Handle array index
    if (ch === '[') {
      if (currentPart) {
        segments.push({ text: currentPart, kind: 'static' });
        currentPart = '';
      }
      segments.push({ text: '[', kind: 'bracket' });
      i++;

      let indexContent = '';
      while (i < input.length && input[i] !== ']') {
        indexContent += input[i];
        i++;
      }

      if (i < input.length) {
        segments.push({ text: sanitizeIndex(indexContent), kind: 'index' });
        segments.push({ text: ']', kind: 'bracket' });
        i++;
      }
    }

    // Handle dot
    else if (ch === '.') {
      if (currentPart) {
        segments.push({ text: currentPart, kind: 'static' });
        currentPart = '';
      }
      segments.push({ text: '.', kind: 'static' });
      i++;
    }

    // 🔥 HANDLE COLON (THIS IS THE KEY FIX)
    else if (ch === ':') {
      if (currentPart) {
        segments.push({ text: currentPart, kind: 'static' });
        currentPart = '';
      }
      segments.push({ text: ':', kind: 'static' });
      i++;
    }

    // Normal identifier characters
    else if (/[A-Za-z0-9_]/.test(ch)) {
      currentPart += ch;
      i++;
    }

    // Stop mapping only on whitespace or unknown chars
    else {
      break;
    }
  }

  if (currentPart) {
    segments.push({ text: currentPart, kind: 'static' });
  }

  if (segments.length === 0) return null;

  return {
    token: {
      kind: 'mapping',
      type: 'path',
      raw: input.slice(start, i),
      segments
    },
    nextIndex: i
  };
}

function mergeAdjacentText(list) {
  const out = [];
  for (const t of list) {
    if (out.length && out[out.length - 1].kind === 'text' && t.kind === 'text') {
      out[out.length - 1].text += t.text;
    } else {
      out.push(t);
    }
  }
  return out;
}


function sanitizeIndex(s) {
  // Keep only digits for editable segment
  return (s || '').replace(/[^0-9]/g, '');
}

export function joinTokens(tokens) {
  return tokens
    .map((t) => (t.kind === 'text' ? t.text : t.segments.map((s) => s.text).join('')))
    .join('');
}

export function isIndexEditableRange(node) {
  if (!node) return false;
  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  const seg = el?.getAttribute?.('data-seg');
  return seg === 'index';
}


