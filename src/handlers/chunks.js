import { getChunk } from '../services/fileProcessor.js';
import { arrayBufferToBase64 } from '../utils/base64.js';
import { buildSVG } from '../utils/svgBuilder.js';
import { logger } from '../utils/logger.js';

export async function handleChunkRequest(url) {
  const chunkMatch = url.pathname.match(/^\/chunk(\d+)\.svg$/);
  if (!chunkMatch) return null;
  
  const chunkIndex = parseInt(chunkMatch[1]);
  let fileUrl = url.searchParams.get('file');
  
  if (!fileUrl) {
    return new Response('Missing "file" parameter', { status: 400 });
  }
  
  try {
    fileUrl = decodeURIComponent(fileUrl);
  } catch(e) {}
  
  logger.log(`📥 Chunk request: ${chunkIndex} from ${fileUrl}`);
  
  try {
    const fileResp = await fetch(fileUrl);
    if (!fileResp.ok) {
      return new Response(`Failed to download: ${fileResp.status}`, { status: 500 });
    }
    
    const fileBuffer = await fileResp.arrayBuffer();
    const chunk = getChunk(fileBuffer, chunkIndex);
    const base64Data = arrayBufferToBase64(chunk);
    const svg = buildSVG(base64Data, chunkIndex);
    
    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
    
  } catch (err) {
    logger.error('Chunk error:', err);
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}
