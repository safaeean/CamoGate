import { sendMessage, sendDocument, getTelegramFileUrl } from '../services/telegramApi.js';
import { downloadFile, processFile } from '../services/fileProcessor.js';
import { buildOptimizedReadme } from '../services/readmeBuilder.js';
import { logger } from '../utils/logger.js';
import { CHUNK_SIZE, getTelegramToken } from '../config/constants.js';

export async function handleTelegramUpdate(update, workerUrl, env) {
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