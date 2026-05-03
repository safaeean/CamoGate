// worker-debug.js - نسخه دیباگ ساده

const TELEGRAM_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const update = await request.json();
        await handleTelegramUpdate(update, url);
        return new Response('OK', { status: 200 });
      } catch (err) {
        console.error('Error:', err);
        return new Response('Error', { status: 500 });
      }
    }

    const chunkMatch = url.pathname.match(/^\/chunk(\d+)\.svg$/);
    if (chunkMatch) {
      const chunkIndex = parseInt(chunkMatch[1]);
      let fileUrl = url.searchParams.get('file');
      
      if (!fileUrl) {
        return new Response('Missing "file" parameter', { status: 400 });
      }
      
      try {
        fileUrl = decodeURIComponent(fileUrl);
      } catch(e) {}
      
      console.log(`📥 Chunk request: ${chunkIndex} from ${fileUrl}`);
      
      try {
        const fileResp = await fetch(fileUrl);
        if (!fileResp.ok) {
          return new Response(`Failed to download: ${fileResp.status}`, { status: 500 });
        }
        
        const fileBuffer = await fileResp.arrayBuffer();
        const CHUNK_SIZE = 100 * 1024;
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, fileBuffer.byteLength);
        
        if (start >= fileBuffer.byteLength) {
          return new Response('Chunk index out of range', { status: 404 });
        }
        
        const chunk = fileBuffer.slice(start, end);
        const base64Data = arrayBufferToBase64(chunk);
        const svg = buildSVG(base64Data, chunkIndex);
        
        return new Response(svg, {
          headers: {
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          }
        });
        
      } catch (err) {
        console.error('Chunk error:', err);
        return new Response(`Error: ${err.message}`, { status: 500 });
      }
    }
    
    return new Response('Bot is running', { status: 200 });
  }
};

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

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

function escapeXml(str) {
  return str.replace(/[<>&]/g, (m) => {
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    if (m === '&') return '&amp;';
    return m;
  });
}

async function handleTelegramUpdate(update, workerUrl) {
  const message = update.message;
  if (!message) return;
  
  const chatId = message.chat.id;
  const text = message.text || '';
  
  console.log(`📨 [DEBUG] Received message: "${text}"`);
  console.log(`📨 [DEBUG] Length: ${text.length}`);
  console.log(`📨 [DEBUG] Starts with http: ${text.startsWith('http://')}`);
  console.log(`📨 [DEBUG] Starts with https: ${text.startsWith('https://')}`);
  console.log(`📨 [DEBUG] Has space: ${text.includes(' ')}`);
  
  await sendMessage(chatId, `🔍 [DEBUG] پیام شما: "${text}"\n\nhttp? ${text.startsWith('http://')}\nhttps? ${text.startsWith('https://')}\nفاصله؟ ${text.includes(' ')}`);
  
  if (text === '/start') {
    await sendMessage(chatId, "🎬 خوش آمدید! لینک مستقیم فایل را بفرستید.");
    return;
  }
  
  if (text === '/help') {
    await sendMessage(chatId, "📖 لینک مستقیم فایل را ارسال کنید.\n\nمثال:\nhttps://example.com/file.zip");
    return;
  }
  
  if (text.startsWith('http://') || text.startsWith('https://')) {
    await sendMessage(chatId, "🔗 لینک تشخیص داده شد! در حال پردازش...");
    await processLink(chatId, text, workerUrl);
  } else {
    await sendMessage(chatId, "❌ این یک لینک معتبر نیست. لطفاً با http:// یا https:// شروع کنید.");
  }
}

async function processLink(chatId, link, workerUrl) {
  try {
    await sendMessage(chatId, `⏳ در حال دانلود: ${link}`);
    
    const fileResp = await fetch(link);
    
    if (!fileResp.ok) {
      await sendMessage(chatId, `❌ خطا: HTTP ${fileResp.status}`);
      return;
    }
    
    const fileBuffer = await fileResp.arrayBuffer();
    const fileSize = fileBuffer.byteLength;
    const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);
    
    // استخراج نام فایل از لینک
    let fileName = link.split('/').pop() || 'unknown';
    if (fileName.includes('?')) fileName = fileName.split('?')[0];
    if (fileName === '' || fileName.length > 100) fileName = 'downloaded_file';
    
    await sendMessage(chatId, `📦 حجم فایل: ${fileSizeMB} MB\n📄 نام فایل: ${fileName}`);
    
    if (fileSize > 50 * 1024 * 1024) {
      await sendMessage(chatId, `❌ حجم فایل بیشتر از 50 مگابایت است.`);
      return;
    }
    
    // محاسبه MD5
    await sendMessage(chatId, `🔐 در حال محاسبه MD5...`);
    const md5Hash = await calculateMD5(fileBuffer);
    
    const CHUNK_SIZE = 100 * 1024;
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    const origin = workerUrl.origin;
    const encodedLink = encodeURIComponent(link);
    
    await sendMessage(chatId, `🔪 تعداد تکه‌ها: ${totalChunks} تکه (هر تکه 100 KB)\n🔄 در حال ساخت README...`);
    
    // ساخت README بهینه برای ربات
    const markdown = buildOptimizedReadme(link, fileName, fileSizeMB, md5Hash, totalChunks, origin, encodedLink);
    
    await sendDocument(chatId, markdown, 'README.md');
    await sendMessage(chatId, "✅ فایل README ساخته شد! آن را در گیت‌هاب قرار دهید.");
    
  } catch (err) {
    console.error('Process error:', err);
    await sendMessage(chatId, `❌ خطا: ${err.message}`);
  }
}

function buildOptimizedReadme(link, fileName, fileSizeMB, md5Hash, totalChunks, origin, encodedLink) {
  let markdown = `# 📦 ${fileName}\n\n`;
  markdown += `| ویژگی | مقدار |\n`;
  markdown += `|-------|-------|\n`;
  markdown += `| **نام فایل** | \`${fileName}\` |\n`;
  markdown += `| **حجم** | ${fileSizeMB} MB |\n`;
  markdown += `| **MD5** | \`${md5Hash}\` |\n`;
  markdown += `| **لینک اصلی** | [${link}](${link}) |\n`;
  markdown += `| **تعداد تکه‌ها** | ${totalChunks} تکه |\n`;
  markdown += `| **حجم هر تکه** | 100 KB |\n\n`;
  
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
  markdown += `1. هر تکه را به صورت جداگانه ذخیره کنید\n`;
  markdown += `2. تمام تکه‌ها را به ترتیب شماره در یک فایل ترکیب کنید\n`;
  markdown += `3. برای اطمینان از صحت فایل، MD5 دریافتی را با فایل نهایی مقایسه کنید\n\n`;
  
  markdown += `> ⚠️ **نکته**: این فایل به صورت خودکار توسط ربات تولید شده است.`;
  
  return markdown;
}

async function calculateMD5(buffer) {
  // استفاده از Web Crypto API
  const hashBuffer = await crypto.subtle.digest('MD5', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

async function sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const body = { chat_id: chatId, text: text };
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    console.log(`📤 Sent message response: ${response.status}`);
  } catch (err) {
    console.error('Send error:', err);
  }
}

async function sendDocument(chatId, content, filename) {
  const formData = new FormData();
  const blob = new Blob([content], { type: 'text/markdown' });
  formData.append('chat_id', chatId);
  formData.append('document', blob, filename);
  
  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendDocument`, {
      method: 'POST',
      body: formData
    });
    console.log(`📤 Sent document response: ${response.status}`);
  } catch (err) {
    console.error('Send document error:', err);
  }
}
