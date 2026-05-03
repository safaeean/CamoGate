/******/ // The require scope
/******/ var __webpack_require__ = {};
/******/ 
/************************************************************************/
/******/ /* webpack/runtime/define property getters */
/******/ (() => {
/******/ 	// define getter functions for harmony exports
/******/ 	__webpack_require__.d = (exports, definition) => {
/******/ 		for(var key in definition) {
/******/ 			if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 				Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 			}
/******/ 		}
/******/ 	};
/******/ })();
/******/ 
/******/ /* webpack/runtime/hasOwnProperty shorthand */
/******/ (() => {
/******/ 	__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ })();
/******/ 
/************************************************************************/

;// ./src/config/constants.js
const CHUNK_SIZE = 500 * 1024; // 500 KB
const MAX_FILE_SIZE = 300 * 1024 * 1024; // 300 MB
const WEB_PAGE_TITLE = 'Telegram File Splitter';
const VERSION = '2.0.0';

// تابع کمکی برای گرفتن توکن
function getTelegramToken(env, chatId = null) {
    // اول چک کن env از Cloudflare اومده
    if (env && env.TELEGRAM_TOKEN) {
        return env.TELEGRAM_TOKEN;
    }
}

// تابع کمکی برای ساخت API URL
function getTelegramApi(env, chatId = null) {
    const token = getTelegramToken(env, chatId);
    return `https://api.telegram.org/bot${token}`;
}
;// ./src/utils/logger.js
const DEBUG = true;

const logger = {
  log(...args) {
    if (DEBUG) console.log(...args);
  },
  error(...args) {
    console.error(...args);
  },
  info(...args) {
    if (DEBUG) console.info(...args);
  },
  debug(...args) {
    if (DEBUG) console.debug(...args);
  }
};

;// ./src/services/telegramApi.js



async function sendMessage(chatId, text, env, userChatId = null) {
  const apiUrl = getTelegramApi(env, userChatId);
  const url = `${apiUrl}/sendMessage`;
  const body = { chat_id: chatId, text: text };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!data.ok) {
      logger.error('Telegram API error:', data.description);
    }
    return data;
  } catch (err) {
    logger.error('Send error:', err);
    throw err;
  }
}

async function sendDocument(chatId, content, filename, env, userChatId = null) {
  const apiUrl = getTelegramApi(env, userChatId);
  const formData = new FormData();
  const blob = new Blob([content], { type: 'text/markdown' });
  formData.append('chat_id', chatId);
  formData.append('document', blob, filename);

  try {
    const response = await fetch(`${apiUrl}/sendDocument`, {
      method: 'POST',
      body: formData
    });
    const data = await response.json();
    if (!data.ok) {
      logger.error('Send document error:', data.description);
    }
    return data;
  } catch (err) {
    logger.error('Send document error:', err);
    throw err;
  }
}

async function getTelegramFileUrl(fileId, env, userChatId = null) {
  try {
    const apiUrl = getTelegramApi(env, userChatId);
    const getFileUrl = `${apiUrl}/getFile?file_id=${fileId}`;
    const response = await fetch(getFileUrl);
    const data = await response.json();

    if (!data.ok || !data.result.file_path) {
      throw new Error(`Failed to get file path: ${data.description || 'Unknown error'}`);
    }

    const token = getTelegramToken(env, userChatId);
    const filePath = data.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;

    return fileUrl;
  } catch (err) {
    logger.error('Error in getTelegramFileUrl:', err);
    throw err;
  }
}
;// ./src/utils/crypto.js
async function calculateHash(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 32);
}

function escapeXml(str) {
  return str.replace(/[<>&]/g, (m) => {
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    if (m === '&') return '&amp;';
    return m;
  });
}

;// ./src/services/fileProcessor.js




async function downloadFile(url) {
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

async function processFile(fileBuffer, fileName) {
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

function getChunk(fileBuffer, chunkIndex) {
  const start = chunkIndex * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, fileBuffer.byteLength);
  
  if (start >= fileBuffer.byteLength) {
    throw new Error('Chunk index out of range');
  }
  
  return fileBuffer.slice(start, end);
}

;// ./src/services/readmeBuilder.js
function buildOptimizedReadme(link, fileName, fileSizeMB, hashHex, totalChunks, origin, encodedLink, isTelegramFile = false) {
  let markdown = `# 📦 ${fileName}\n\n`;
  markdown += `| ویژگی | مقدار |\n`;
  markdown += `|-------|-------|\n`;
  markdown += `| **نام فایل** | \`${fileName}\` |\n`;
  markdown += `| **حجم** | ${fileSizeMB} MB |\n`;
  markdown += `| **هش (SHA-256)** | \`${hashHex}\` |\n`;
  
  if (isTelegramFile) {
    markdown += `| **نوع فایل** | فایل تلگرام (موقتی) |\n`;
    markdown += `| **⚠️ هشدار** | لینک فایل موقتی است و ممکن است منقضی شود |\n`;
  } else {
    markdown += `| **لینک اصلی** | [${link}](${link}) |\n`;
  }
  
  markdown += `| **تعداد تکه‌ها** | ${totalChunks} تکه |\n`;
  markdown += `| **حجم هر تکه** | 500 KB |\n\n`;
  
  markdown += `---\n\n`;
  markdown += `## 🧩 تکه‌های فایل\n\n`;
  markdown += `برای بازسازی فایل اصلی، همه تکه‌های زیر را جمع‌آوری کرده و به ترتیب کنار هم قرار دهید:\n\n`;
  
  for (let i = 0; i < totalChunks; i++) {
    const chunkUrl = `${origin}/chunk${i}.svg?file=${encodedLink}`;
    markdown += `<details>\n`;
    markdown += `<summary><b>🔹 تکه ${i+1} از ${totalChunks}</b></summary>\n\n`;
    markdown += `<img src="${chunkUrl}" alt="chunk${i+1}"/>\n\n`;
    markdown += `</details>\n\n`;
  }
  
  markdown += `---\n\n`;
  markdown += `## 📌 راهنمای بازسازی\n\n`;
  markdown += `1. هر تکه را از روی تصاویر SVG کپی کنید\n`;
  markdown += `2. تمام تکه‌ها را به ترتیب شماره در یک فایل ترکیب کنید\n`;
  markdown += `3. صحت فایل را با مقایسه هش SHA-256 بررسی کنید\n\n`;
  
  return markdown;
}

;// ./src/handlers/telegram.js






async function handleTelegramUpdate(update, workerUrl, env) {
  const message = update.message;
  if (!message) return;

  const chatId = message.chat.id;
  const text = message.text || '';

  // بررسی توکن ربات
  const botToken = getTelegramToken(env, chatId);
  if (!botToken || botToken === 'YOUR_BOT_TOKEN') {
    await sendMessage(chatId, "⚠️ ربات تنظیم نشده است!\n\nلطفاً با ادمین تماس بگیرید.", env, chatId);
    return;
  }

  if (text === '/start') {
    await sendMessage(chatId, "🎬 خوش آمدید!\n\nلطفاً یکی از موارد زیر را ارسال کنید:\n• لینک مستقیم فایل\n• فایل (داکیومنت، ویدیو، صدا، عکس)", env, chatId);
    return;
  }

  if (text === '/help') {
    await sendMessage(chatId, "📖 راهنما:\n\n1️⃣ لینک مستقیم فایل را ارسال کنید\n2️⃣ یا فایل خود را مستقیماً آپلود کنید", env, chatId);
    return;
  }

  // بررسی انواع فایل
  let fileId = null;
  let fileName = null;
  let mimeType = null;

  if (message.document) {
    fileId = message.document.file_id;
    fileName = message.document.file_name;
    mimeType = message.document.mime_type;
  }
  else if (message.video) {
    fileId = message.video.file_id;
    fileName = message.video.file_name || `video_${Date.now()}.mp4`;
    mimeType = message.video.mime_type;
  }
  else if (message.audio) {
    fileId = message.audio.file_id;
    fileName = message.audio.file_name || `audio_${Date.now()}.mp3`;
    mimeType = message.audio.mime_type;
  }
  else if (message.photo) {
    const photo = message.photo[message.photo.length - 1];
    fileId = photo.file_id;
    fileName = `photo_${Date.now()}.jpg`;
    mimeType = 'image/jpeg';
  }
  else if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
    await processLink(chatId, text, workerUrl, env);
    return;
  }
  else {
    if (text) {
      await sendMessage(chatId, "❌ لطفاً یک لینک معتبر یا فایل ارسال کنید.", env, chatId);
    }
    return;
  }

  if (fileId) {
    await processTelegramFile(chatId, fileId, fileName, mimeType, workerUrl, env);
  }
}

async function processTelegramFile(chatId, fileId, fileName, mimeType, workerUrl, env) {
  try {
    await sendMessage(chatId, `⏳ در حال دریافت فایل از تلگرام...`, env, chatId);

    const fileUrl = await getTelegramFileUrl(fileId, env, chatId);
    const fileBuffer = await downloadFile(fileUrl);
    const fileInfo = await processFile(fileBuffer, fileName);

    await sendMessage(chatId, `📦 حجم فایل: ${fileInfo.fileSizeMB} MB\n📄 نام فایل: ${fileName}`, env, chatId);

    const totalChunks = fileInfo.totalChunks;
    const origin = workerUrl.origin;
    const encodedLink = encodeURIComponent(fileUrl);

    const markdown = buildOptimizedReadme(fileUrl, fileName, fileInfo.fileSizeMB, fileInfo.hash, totalChunks, origin, encodedLink, true);

    await sendDocument(chatId, markdown, 'README.md', env, chatId);
    await sendMessage(chatId, "✅ فایل README ساخته شد!", env, chatId);

  } catch (err) {
    logger.error('Process error:', err);
    await sendMessage(chatId, `❌ خطا: ${err.message}`, env, chatId);
  }
}

async function processLink(chatId, link, workerUrl, env) {
  try {
    await sendMessage(chatId, `⏳ در حال دانلود: ${link}`, env, chatId);

    const fileBuffer = await downloadFile(link);

    let fileName = link.split('/').pop() || 'unknown';
    if (fileName.includes('?')) fileName = fileName.split('?')[0];

    const fileInfo = await processFile(fileBuffer, fileName);

    await sendMessage(chatId, `📦 حجم فایل: ${fileInfo.fileSizeMB} MB\n📄 نام فایل: ${fileName}`, env, chatId);

    const totalChunks = fileInfo.totalChunks;
    const origin = workerUrl.origin;
    const encodedLink = encodeURIComponent(link);

    const markdown = buildOptimizedReadme(link, fileName, fileInfo.fileSizeMB, fileInfo.hash, totalChunks, origin, encodedLink, false);

    await sendDocument(chatId, markdown, 'README.md', env, chatId);
    await sendMessage(chatId, "✅ فایل README ساخته شد!", env, chatId);

  } catch (err) {
    logger.error('Process error:', err);
    await sendMessage(chatId, `❌ خطا: ${err.message}`, env, chatId);
  }
}
;// ./src/utils/base64.js
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

;// ./src/utils/svgBuilder.js


function buildSVG(base64Data, chunkIndex) {
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

;// ./src/handlers/chunks.js





async function handleChunkRequest(url) {
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

;// ./src/handlers/web.js







function handleWebRequest(url, env, request = null) {
  // صفحه اصلی
  if (url.pathname === '/' || url.pathname === '/web') {
    return serveWebPage(env);
  }

  // API پردازش لینک
  if (url.pathname === '/api/process' && request) {
    return processLinkApi(request, env);
  }

  // دانلود README
  if (url.pathname === '/api/download-readme' && request) {
    return downloadReadme(request, env);
  }

  // دریافت تکه فایل
  if (url.pathname.startsWith('/chunks/')) {
    return serveChunk(url, env);
  }

  return null;
}

function serveWebPage(env) {
  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>تبدیل لینک به README | ربات تلگرام</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Vazir', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 900px;
            margin: 0 auto;
        }
        
        .card {
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            margin-bottom: 20px;
        }
        
        h1 {
            color: #333;
            margin-bottom: 10px;
            text-align: center;
            font-size: 28px;
        }
        
        .subtitle {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
            font-size: 14px;
        }
        
        .input-group {
            margin: 20px 0;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            color: #555;
            font-weight: bold;
        }
        
        input[type="text"], textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 10px;
            font-size: 14px;
            transition: border-color 0.3s;
            font-family: monospace;
        }
        
        input[type="text"]:focus, textarea:focus {
            outline: none;
            border-color: #667eea;
        }
        
        button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 30px;
            border-radius: 10px;
            font-size: 16px;
            cursor: pointer;
            transition: transform 0.2s;
            width: 100%;
            font-weight: bold;
        }
        
        button:hover:not(:disabled) {
            transform: translateY(-2px);
        }
        
        button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        
        .progress {
            display: none;
            margin: 20px 0;
        }
        
        .progress-bar {
            width: 100%;
            height: 30px;
            background: #f0f0f0;
            border-radius: 15px;
            overflow: hidden;
            position: relative;
        }
        
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
            width: 0%;
            transition: width 0.3s;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 12px;
            font-weight: bold;
        }
        
        .result {
            display: none;
            margin-top: 30px;
        }
        
        .info-box {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 15px;
            margin: 15px 0;
            border-right: 4px solid #667eea;
        }
        
        .info-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e0e0e0;
        }
        
        .info-label {
            font-weight: bold;
            color: #555;
        }
        
        .info-value {
            color: #333;
            font-family: monospace;
            word-break: break-all;
            text-align: left;
            direction: ltr;
        }
        
        .chunks-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 10px;
            margin: 20px 0;
            max-height: 400px;
            overflow-y: auto;
            padding: 10px;
            background: #f5f5f5;
            border-radius: 10px;
        }
        
        .chunk-item {
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            padding: 10px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        .chunk-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        
        .chunk-number {
            font-weight: bold;
            color: #667eea;
            font-size: 14px;
        }
        
        .chunk-size {
            font-size: 11px;
            color: #888;
            margin-top: 5px;
        }
        
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            z-index: 1000;
            justify-content: center;
            align-items: center;
        }
        
        .modal-content {
            background: white;
            border-radius: 20px;
            max-width: 90%;
            max-height: 90%;
            overflow: auto;
            padding: 20px;
        }
        
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #f0f0f0;
        }
        
        .close-modal {
            cursor: pointer;
            font-size: 24px;
            color: #999;
        }
        
        .action-buttons {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        
        .btn-secondary {
            background: #6c757d;
        }
        
        .alert {
            padding: 12px;
            border-radius: 8px;
            margin: 15px 0;
            display: none;
        }
        
        .alert-success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .alert-error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        
        .alert-info {
            background: #d1ecf1;
            color: #0c5460;
            border: 1px solid #bee5eb;
        }
        
        @media (max-width: 600px) {
            .card {
                padding: 20px;
            }
            
            .chunks-grid {
                grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <h1>📦 تبدیل لینک به README</h1>
            <div class="subtitle">لینک فایل خود را وارد کنید تا转换为 فایل README + تکه‌های قابل مشاهده</div>
            
            <div class="input-group">
                <label>🔗 لینک فایل:</label>
                <input type="text" id="fileUrl" placeholder="https://example.com/file.zip" dir="ltr">
            </div>
            
            <div class="input-group">
                <label>📝 نام فایل (اختیاری):</label>
                <input type="text" id="fileName" placeholder="در صورت تمایل نام فایل را وارد کنید">
            </div>
            
            <button id="processBtn" onclick="processLink()">🚀 شروع پردازش</button>
            
            <div class="progress" id="progress">
                <div class="progress-bar">
                    <div class="progress-fill" id="progressFill">0%</div>
                </div>
                <p style="text-align: center; margin-top: 10px; font-size: 14px;" id="progressText">در حال آماده‌سازی...</p>
            </div>
            
            <div id="alert" class="alert"></div>
        </div>
        
        <div class="card" id="result" style="display: none;">
            <h3>✅ نتیجه پردازش</h3>
            
            <div class="info-box" id="fileInfo"></div>
            
            <h4>🧩 تکه‌های فایل (${CHUNK_SIZE / 1024} KB هر تکه)</h4>
            <div class="chunks-grid" id="chunksGrid"></div>
            
            <div class="action-buttons">
                <button id="downloadReadmeBtn" onclick="downloadReadme()">📥 دانلود README.md</button>
                <button id="copyMarkdownBtn" onclick="copyMarkdown()">📋 کپی Markdown</button>
            </div>
        </div>
    </div>
    
    <!-- Modal برای نمایش تکه -->
    <div id="chunkModal" class="modal" onclick="closeModal()">
        <div class="modal-content" onclick="event.stopPropagation()">
            <div class="modal-header">
                <h3 id="modalTitle">تکه</h3>
                <span class="close-modal" onclick="closeModal()">&times;</span>
            </div>
            <div id="modalContent"></div>
        </div>
    </div>
    
    <script>
        let currentFileData = null;
        const CHUNK_SIZE = 500 * 1024;
        
        async function processLink() {
            const url = document.getElementById('fileUrl').value.trim();
            const fileName = document.getElementById('fileName').value.trim();
            
            if (!url) {
                showAlert('لطفاً لینک فایل را وارد کنید', 'error');
                return;
            }
            
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                showAlert('لطفاً لینک معتبر وارد کنید (با http:// یا https:// شروع شود)', 'error');
                return;
            }
            
            // نمایش progress
            document.getElementById('progress').style.display = 'block';
            document.getElementById('result').style.display = 'none';
            document.getElementById('processBtn').disabled = true;
            updateProgress(0, 'در حال بررسی لینک...');
            
            try {
                const response = await fetch('/api/process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url, fileName })
                });
                
                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'خطا در پردازش');
                }
                
                const data = await response.json();
                currentFileData = data;
                
                updateProgress(30, 'در حال آماده‌سازی اطلاعات...');
                await displayResult(data);
                
                updateProgress(100, 'پردازش کامل شد!');
                setTimeout(() => {
                    document.getElementById('progress').style.display = 'none';
                }, 1000);
                
                showAlert('فایل با موفقیت پردازش شد!', 'success');
                
            } catch (error) {
                showAlert(error.message, 'error');
                document.getElementById('progress').style.display = 'none';
            } finally {
                document.getElementById('processBtn').disabled = false;
            }
        }
        
        function updateProgress(percent, text) {
            const fill = document.getElementById('progressFill');
            fill.style.width = percent + '%';
            fill.textContent = percent + '%';
            document.getElementById('progressText').textContent = text;
        }
        
        async function displayResult(data) {
            // نمایش اطلاعات فایل
            const infoHtml = \`
                <div class="info-row">
                    <span class="info-label">نام فایل:</span>
                    <span class="info-value">\${data.fileName}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">حجم فایل:</span>
                    <span class="info-value">\${data.fileSizeMB} MB</span>
                </div>
                <div class="info-row">
                    <span class="info-label">هش SHA-256:</span>
                    <span class="info-value">\${data.hash}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">تعداد تکه‌ها:</span>
                    <span class="info-value">\${data.totalChunks} تکه</span>
                </div>
                <div class="info-row">
                    <span class="info-label">لینک اصلی:</span>
                    <span class="info-value"><a href="\${data.originalUrl}" target="_blank">\${data.originalUrl}</a></span>
                </div>
            \`;
            document.getElementById('fileInfo').innerHTML = infoHtml;
            
            // نمایش تکه‌ها
            const chunksGrid = document.getElementById('chunksGrid');
            chunksGrid.innerHTML = '';
            
            for (let i = 0; i < data.totalChunks; i++) {
                const chunkDiv = document.createElement('div');
                chunkDiv.className = 'chunk-item';
                chunkDiv.onclick = () => showChunk(i);
                chunkDiv.innerHTML = \`
                    <div class="chunk-number">🧩 تکه \${i + 1}</div>
                    <div class="chunk-size">از \${data.totalChunks}</div>
                \`;
                chunksGrid.appendChild(chunkDiv);
            }
            
            document.getElementById('result').style.display = 'block';
        }
        
        async function showChunk(chunkIndex) {
            const modal = document.getElementById('chunkModal');
            const modalTitle = document.getElementById('modalTitle');
            const modalContent = document.getElementById('modalContent');
            
            modalTitle.textContent = \`🧩 تکه \${chunkIndex + 1} از \${currentFileData.totalChunks}\`;
            modalContent.innerHTML = '<div style="text-align: center;">⏳ در حال بارگذاری...</div>';
            modal.style.display = 'flex';
            
            try {
                const response = await fetch(\`/chunks/\${chunkIndex}?file=\${encodeURIComponent(currentFileData.encodedUrl)}\`);
                if (!response.ok) throw new Error('خطا در دریافت تکه');
                
                const svgText = await response.text();
                modalContent.innerHTML = \`
                    <div style="max-width: 100%; overflow-x: auto;">
                        \${svgText}
                    </div>
                    <div style="margin-top: 15px;">
                        <button onclick="downloadChunk(\${chunkIndex})" style="margin-left: 10px;">💾 دانلود تکه</button>
                        <button onclick="copyChunk(\${chunkIndex})">📋 کپی محتوا</button>
                    </div>
                \`;
            } catch (error) {
                modalContent.innerHTML = '<div style="color: red;">❌ خطا در بارگذاری تکه</div>';
            }
        }
        
        async function downloadReadme() {
            if (!currentFileData) return;
            
            const response = await fetch('/api/download-readme', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentFileData)
            });
            
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'README.md';
            a.click();
            URL.revokeObjectURL(url);
            
            showAlert('فایل README دانلود شد!', 'success');
        }
        
        async function copyMarkdown() {
            if (!currentFileData) return;
            
            try {
                const response = await fetch('/api/download-readme', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(currentFileData)
                });
                
                const markdown = await response.text();
                await navigator.clipboard.writeText(markdown);
                showAlert('Markdown کپی شد!', 'success');
            } catch (error) {
                showAlert('خطا در کپی کردن', 'error');
            }
        }
        
        function downloadChunk(chunkIndex) {
            const url = \`/chunks/\${chunkIndex}?file=\${encodeURIComponent(currentFileData.encodedUrl)}\`;
            window.open(url, '_blank');
        }
        
        async function copyChunk(chunkIndex) {
            try {
                const response = await fetch(\`/chunks/\${chunkIndex}?file=\${encodeURIComponent(currentFileData.encodedUrl)}\`);
                const svgText = await response.text();
                
                // استخراج محتوای Base64 از SVG
                const match = svgText.match(/<text[^>]*>(.*?)<\\/text>/gs);
                if (match) {
                    let base64 = '';
                    for (let line of match) {
                        const textMatch = line.match(/>([^<]+)</);
                        if (textMatch) base64 += textMatch[1];
                    }
                    await navigator.clipboard.writeText(base64);
                    showAlert('محتوای تکه کپی شد!', 'success');
                }
            } catch (error) {
                showAlert('خطا در کپی کردن', 'error');
            }
        }
        
        function showAlert(message, type) {
            const alert = document.getElementById('alert');
            alert.className = \`alert alert-\${type}\`;
            alert.textContent = message;
            alert.style.display = 'block';
            
            setTimeout(() => {
                alert.style.display = 'none';
            }, 5000);
        }
        
        function closeModal() {
            document.getElementById('chunkModal').style.display = 'none';
        }
    </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
async function processLinkApi(request, env) {
  try {
    const body = await request.json();
    const { url: fileUrl, fileName: customFileName } = body;

    console.log('Processing URL:', fileUrl); // دیباگ

    if (!fileUrl) {
      return new Response(JSON.stringify({ error: 'لینک الزامی است' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // دانلود فایل
    const fileBuffer = await downloadFile(fileUrl);

    // پردازش فایل
    let fileName = customFileName || fileUrl.split('/').pop() || 'downloaded_file';
    if (fileName.includes('?')) fileName = fileName.split('?')[0];
    if (fileName.length > 100) fileName = fileName.substring(0, 100);

    const fileInfo = await processFile(fileBuffer, fileName);

    // بازگشت نتیجه
    const result = {
      fileName: fileInfo.fileName,
      fileSizeMB: fileInfo.fileSizeMB,
      hash: fileInfo.hash,
      totalChunks: fileInfo.totalChunks,
      originalUrl: fileUrl,
      encodedUrl: encodeURIComponent(fileUrl)
    };

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    logger.error('Process API error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function serveChunk(url, env) {
  const match = url.pathname.match(/^\/chunks\/(\d+)$/);
  if (!match) return null;

  const chunkIndex = parseInt(match[1]);
  const fileUrl = url.searchParams.get('file');

  if (!fileUrl) {
    return new Response('Missing file parameter', { status: 400 });
  }

  try {
    const decodedUrl = decodeURIComponent(fileUrl);
    const fileResp = await fetch(decodedUrl);

    if (!fileResp.ok) {
      return new Response(`Failed to download: ${fileResp.status}`, { status: 500 });
    }

    const fileBuffer = await fileResp.arrayBuffer();
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, fileBuffer.byteLength);

    if (start >= fileBuffer.byteLength) {
      return new Response('Chunk out of range', { status: 404 });
    }

    const chunk = fileBuffer.slice(start, end);
    const base64Data = arrayBufferToBase64(chunk);
    const svg = buildSVG(base64Data, chunkIndex);

    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-cache'
      }
    });

  } catch (err) {
    logger.error('Chunk error:', err);
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}

async function downloadReadme(request, env) {
  try {
    const data = await request.json();

    // ساخت README
    const markdown = buildOptimizedReadme(
        data.originalUrl,
        data.fileName,
        data.fileSizeMB,
        data.hash,
        data.totalChunks,
        new URL(request.url).origin,
        data.encodedUrl,
        false
    );

    return new Response(markdown, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': 'attachment; filename="README.md"'
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
;// ./src/index.js





/* harmony default export */ const src = ({
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    logger.log(`📨 Request: ${method} ${url.pathname}`);

    // 1. اول چک کن Webhook تلگرام هست؟
    if (url.pathname === '/webhook' && method === 'POST') {
      try {
        const update = await request.json();
        ctx.waitUntil(handleTelegramUpdate(update, url, env));
        return new Response('OK', { status: 200 });
      } catch (err) {
        logger.error('Webhook error:', err);
        return new Response('Error', { status: 500 });
      }
    }

    // 2. بعد چک کن درخواست‌های API وب هست؟
    // این باید قبل از chunk handler بیاد
    if (url.pathname === '/api/process' && method === 'POST') {
      const webResponse = handleWebRequest(url, env, request);
      if (webResponse) return webResponse;
    }

    if (url.pathname === '/api/download-readme' && method === 'POST') {
      const webResponse = handleWebRequest(url, env, request);
      if (webResponse) return webResponse;
    }

    // 3. بعد چک کن درخواست صفحات وب هست؟
    if (url.pathname === '/' || url.pathname === '/web') {
      const webResponse = handleWebRequest(url, env);
      if (webResponse) return webResponse;
    }

    // 4. بعد چک کن درخواست chunk هست؟
    const chunkResponse = await handleChunkRequest(url, env);
    if (chunkResponse) return chunkResponse;

    // 5. در نهایت پاسخ پیش‌فرض
    return new Response('Bot is running', { status: 200 });
  }
});
export { src as default };
