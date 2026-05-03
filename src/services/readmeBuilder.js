export function buildOptimizedReadme(link, fileName, fileSizeMB, hashHex, totalChunks, origin, encodedLink, isTelegramFile = false) {
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
