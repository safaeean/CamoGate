import { escapeXml } from './crypto.js';

export function buildSVG(base64Data, chunkIndex) {
  const lines = [];
  for (let i = 0; i < base64Data.length; i += 50) {
    lines.push(base64Data.slice(i, Math.min(i + 50, base64Data.length)));
  }
  
  const textLines = lines.map((line, idx) => 
    `<text x="10" y="${20 + idx * 14}" font-family="monospace" font-size="11" fill="#333">${escapeXml(line)}</text>`
  ).join('\n');
  
  const height = Math.max(60, lines.length * 14 + 45);
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="520" height="${height}" viewBox="0 0 520 ${height}">
  <rect width="100%" height="100%" fill="#f5f5f5" rx="8" />
  <rect x="0" y="0" width="100%" height="28" fill="#2196F3" rx="8" />
  <text x="10" y="19" font-family="monospace" font-size="13" fill="white" font-weight="bold">Chunk ${chunkIndex + 1}</text>
  ${textLines}
  <text x="10" y="${height - 9}" font-family="monospace" font-size="9" fill="#999">-- end of chunk ${chunkIndex + 1} --</text>
</svg>`;
}
