import { handleTelegramUpdate } from './handlers/telegram.js';
import { handleChunkRequest } from './handlers/chunks.js';
import { handleWebRequest } from './handlers/web.js';
import { logger } from './utils/logger.js';

export default {
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
};