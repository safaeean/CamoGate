import { getTelegramApi, getTelegramToken } from '../config/constants.js';
import { logger } from '../utils/logger.js';

export async function sendMessage(chatId, text, env, userChatId = null) {
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

export async function sendDocument(chatId, content, filename, env, userChatId = null) {
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

export async function getTelegramFileUrl(fileId, env, userChatId = null) {
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