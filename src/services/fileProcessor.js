import { CHUNK_SIZE, MAX_FILE_SIZE } from '../config/constants.js';
import { calculateHash } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';

export async function downloadFile(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const buffer = await response.arrayBuffer();
  const size = buffer.byteLength;
  
  if (size > MAX_FILE_SIZE) {
    throw new Error(`File size (${size} bytes) exceeds maximum (${MAX_FILE_SIZE} bytes)`);
  }
  
  return buffer;
}

export async function processFile(fileBuffer, fileName) {
  const fileSize = fileBuffer.byteLength;
  const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);
  const hash = await calculateHash(fileBuffer);
  
  const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
  
  return {
    fileName,
    fileSize,
    fileSizeMB,
    hash,
    totalChunks,
    chunks: []
  };
}

export function getChunk(fileBuffer, chunkIndex) {
  const start = chunkIndex * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, fileBuffer.byteLength);
  
  if (start >= fileBuffer.byteLength) {
    throw new Error('Chunk index out of range');
  }
  
  return fileBuffer.slice(start, end);
}
