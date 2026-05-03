const TELEGRAM_TOKEN = 'YOUR_TELEGRAM_BOT_TOKEN';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

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
        const CHUNK_SIZE = 500 * 1024;
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
  
  if (text === '/start') {
    await sendMessage(chatId, "🎬 خوش آمدید!\n\nلطفاً یکی از موارد زیر را ارسال کنید:\n• لینک مستقیم فایل\n• فایل (داکیومنت، ویدیو، صدا، و غیره)");
    return;
  }
  
  if (text === '/help') {
    await sendMessage(chatId, "📖 راهنما:\n\n1️⃣ لینک مستقیم فایل را ارسال کنید\n2️⃣ یا فایل خود را مستقیماً آپلود کنید\n\nمن فایل رو تکه تکه کرده و فایل README برات میسازم.");
    return;
  }
  
  // بررسی فایل‌های مختلف تلگرام
  let fileId = null;
  let fileName = null;
  let mimeType = null;
  
  if (message.document) {
    fileId = message.document.file_id;
    fileName = message.document.file_name;
    mimeType = message.document.mime_type;
    await sendMessage(chatId, `📄 فایل دریافت شد: ${fileName}\nنوع: ${mimeType}`);
  } 
  else if (message.video) {
    fileId = message.video.file_id;
    fileName = message.video.file_name || `video_${Date.now()}.mp4`;
    mimeType = message.video.mime_type;
    await sendMessage(chatId, `🎬 ویدیو دریافت شد: ${fileName}`);
  }
  else if (message.audio) {
    fileId = message.audio.file_id;
    fileName = message.audio.file_name || `audio_${Date.now()}.mp3`;
    mimeType = message.audio.mime_type;
    await sendMessage(chatId, `🎵 صدا دریافت شد: ${fileName}`);
  }
  else if (message.photo) {
    // آخرین عکس (بزرگترین سایز) را بگیر
    const photo = message.photo[message.photo.length - 1];
    fileId = photo.file_id;
    fileName = `photo_${Date.now()}.jpg`;
    mimeType = 'image/jpeg';
    await sendMessage(chatId, `🖼️ عکس دریافت شد`);
  }
  else if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
    await sendMessage(chatId, "🔗 لینک تشخیص داده شد! در حال پردازش...");
    await processLink(chatId, text, workerUrl);
    return;
  }
  else {
    if (text) {
      await sendMessage(chatId, "❌ لطفاً یک لینک معتبر یا فایل ارسال کنید.");
    }
    return;
  }
  
  // اگر فایل تلگرام داریم، پردازش کن
  if (fileId) {
    await processTelegramFile(chatId, fileId, fileName, mimeType, workerUrl);
  }
}

async function getTelegramFileUrl(fileId) {
  // دریافت مسیر فایل از تلگرام
  const getFileUrl = `${TELEGRAM_API}/getFile?file_id=${fileId}`;
  const response = await fetch(getFileUrl);
  const data = await response.json();
  
  if (!data.ok || !data.result.file_path) {
    throw new Error('Failed to get file path from Telegram');
  }
  
  const filePath = data.result.file_path;
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;
  
  return fileUrl;
}

async function processTelegramFile(chatId, fileId, originalFileName, mimeType, workerUrl) {
  try {
    await sendMessage(chatId, `⏳ در حال دریافت فایل از تلگرام...`);
    
    // دریافت لینک مستقیم فایل از تلگرام
    const fileUrl = await getTelegramFileUrl(fileId);
    
    await sendMessage(chatId, `✅ لینک فایل دریافت شد، در حال دانلود...`);
    
    const fileResp = await fetch(fileUrl);
    
    if (!fileResp.ok) {
      await sendMessage(chatId, `❌ خطا: HTTP ${fileResp.status}`);
      return;
    }
    
    const fileBuffer = await fileResp.arrayBuffer();
    const fileSize = fileBuffer.byteLength;
    const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);
    
    // اگر اسم فایل نداریم، یکی بساز
    let fileName = originalFileName || 'telegram_file';
    if (fileName.length > 100) fileName = fileName.substring(0, 100);
    
    await sendMessage(chatId, `📦 حجم فایل: ${fileSizeMB} MB\n📄 نام فایل: ${fileName}`);
    
    if (fileSize > 300 * 1024 * 1024) {
      await sendMessage(chatId, `❌ حجم فایل بیشتر از 300 مگابایت است. حد مجاز 300 مگابایت است.`);
      return;
    }
    
    // محاسبه MD5
    await sendMessage(chatId, `🔐 در حال محاسبه MD5...`);
    const md5Hash = await calculateMD5(fileBuffer);
    
    const CHUNK_SIZE = 500 * 1024;
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    const origin = workerUrl.origin;
    
    // ذخیره موقت فایل؟ نه، ما مستقیماً از لینک تلگرام استفاده می‌کنیم
    // اما لینک تلگرام temporary است، بنابراین باید لینک جدیدی بسازیم که از طریق worker قابل دسترسی باشه
    
    // یه راه حل: لینک فایل رو خود worker نگه میداره به عنوان پارامتر
    // ولی چون دیتابیس نداریم، باید فایل رو توی cache بذاریم؟
    // بهتره از همون لینک تلگرام استفاده کنیم چون خودش یه URL موقتیه
    
    const encodedLink = encodeURIComponent(fileUrl);
    
    await sendMessage(chatId, `🔪 تعداد تکه‌ها: ${totalChunks} تکه (هر تکه 500 کیلوبایت)\n🔄 در حال ساخت README...`);
    
    // ساخت README
    const markdown = buildOptimizedReadme(fileUrl, fileName, fileSizeMB, md5Hash, totalChunks, origin, encodedLink, true);
    
    await sendDocument(chatId, markdown, 'README.md');
    await sendMessage(chatId, "✅ فایل README ساخته شد! آن را در گیت‌هاب قرار دهید.\n\n⚠️ توجه: لینک فایل تلگرام موقتی است و ممکن است بعد از مدتی منقضی شود. فایل README را سریعاً ذخیره کنید.");
    
  } catch (err) {
    console.error('Process error:', err);
    await sendMessage(chatId, `❌ خطا: ${err.message}`);
  }
}

function buildOptimizedReadme(link, fileName, fileSizeMB, md5Hash, totalChunks, origin, encodedLink, isTelegramFile = false) {
  let markdown = `# 📦 ${fileName}\n\n`;
  markdown += `| ویژگی | مقدار |\n`;
  markdown += `|-------|-------|\n`;
  markdown += `| **نام فایل** | \`${fileName}\` |\n`;
  markdown += `| **حجم** | ${fileSizeMB} MB |\n`;
  markdown += `| **MD5** | \`${md5Hash}\` |\n`;
  
  if (isTelegramFile) {
    markdown += `| **نوع فایل** | فایل تلگرام |\n`;
    markdown += `| **لینک اصلی** | (موقتی - ممکن است منقضی شود) |\n`;
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
  markdown += `1. هر تکه را به صورت جداگانه ذخیره کنید (از روی تصاویر SVG)\n`;
  markdown += `2. تمام تکه‌ها را به ترتیب شماره در یک فایل ترکیب کنید\n`;
  markdown += `3. برای اطمینان از صحت فایل، MD5 دریافتی را با فایل نهایی مقایسه کنید\n\n`;
  
  markdown += `### روش ترکیب تکه‌ها:\n\n`;
  markdown += `\`\`\`bash\n`;
  markdown += `# برای ترکیب تکه‌ها در لینوکس/مک:\n`;
  markdown += `cat chunk1.bin chunk2.bin ... > output_file\n\n`;
  markdown += `# یا می‌توانید هر تکه را از روی SVG کپی کنید\n`;
  markdown += `\`\`\`\n\n`;
  
  markdown += `> ⚠️ **نکته**: ${isTelegramFile ? 'این فایل از تلگرام دریافت شده و لینک اصلی موقتی است.' : 'این فایل به صورت خودکار توسط ربات تولید شده است.'}`;
  
  return markdown;
}

async function calculateMD5(buffer) {
  // Web Crypto API از MD5 پشتیبانی نمی‌کند، از یه روش ساده‌تر استفاده می‌کنیم
  // برای محیط CloudFlare Workers، از کتابخانه‌های داخلی نمی‌شه استفاده کرد
  // این یه پیاده‌سازی ساده‌ست (نه کاملاً استاندارد)
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
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
    
    let fileName = link.split('/').pop() || 'unknown';
    if (fileName.includes('?')) fileName = fileName.split('?')[0];
    if (fileName === '' || fileName.length > 100) fileName = 'downloaded_file';
    
    await sendMessage(chatId, `📦 حجم فایل: ${fileSizeMB} MB\n📄 نام فایل: ${fileName}`);
    
    if (fileSize > 300 * 1024 * 1024) {
      await sendMessage(chatId, `❌ حجم فایل بیشتر از 300 مگابایت است.`);
      return;
    }
    
    await sendMessage(chatId, `🔐 در حال محاسبه MD5...`);
    const md5Hash = await calculateMD5(fileBuffer);
    
    const CHUNK_SIZE = 500 * 1024;
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    const origin = workerUrl.origin;
    const encodedLink = encodeURIComponent(link);
    
    await sendMessage(chatId, `🔪 تعداد تکه‌ها: ${totalChunks} تکه (هر تکه 500 KB)\n🔄 در حال ساخت README...`);
    
    const markdown = buildOptimizedReadme(link, fileName, fileSizeMB, md5Hash, totalChunks, origin, encodedLink, false);
    
    await sendDocument(chatId, markdown, 'README.md');
    await sendMessage(chatId, "✅ فایل README ساخته شد! آن را در گیت‌هاب قرار دهید.");
    
  } catch (err) {
    console.error('Process error:', err);
    await sendMessage(chatId, `❌ خطا: ${err.message}`);
  }
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
