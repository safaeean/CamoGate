export const CHUNK_SIZE = 500 * 1024; // 500 KB
export const MAX_FILE_SIZE = 300 * 1024 * 1024; // 300 MB
export const WEB_PAGE_TITLE = 'Telegram File Splitter';
export const VERSION = '2.0.0';

// تابع کمکی برای گرفتن توکن
export function getTelegramToken(env, chatId = null) {
    // اول چک کن env از Cloudflare اومده
    if (env && env.TELEGRAM_TOKEN) {
        return env.TELEGRAM_TOKEN;
    }
}

// تابع کمکی برای ساخت API URL
export function getTelegramApi(env, chatId = null) {
    const token = getTelegramToken(env, chatId);
    return `https://api.telegram.org/bot${token}`;
}