# github_camo_downloader_final.py
import re
import requests
import base64
import sys
import time
import hashlib
import os
from urllib.parse import urlparse, unquote, urljoin

def find_readme_from_github_page(github_url):
    """اگر کاربر لینک صفحه گیت‌هاب را داده باشد، README.md را پیدا می‌کند"""
    print(f"🔍 جستجوی README در: {github_url}")
    
    # نرمالایز کردن لینک
    if '/blob/' in github_url:
        # تبدیل blob به raw
        raw_url = github_url.replace('github.com', 'raw.githubusercontent.com')
        raw_url = raw_url.replace('/blob/', '/')
        return raw_url
    
    if '/tree/' in github_url:
        # اگر لینک به دایرکتوری است
        parts = github_url.split('/tree/')
        repo_path = parts[0].replace('github.com', 'raw.githubusercontent.com')
        branch_path = parts[1]
        return f"{repo_path}/{branch_path}/README.md"
    
    # اگر فقط آدرس ریپازیتوری است (مثل https://github.com/username/repo)
    match = re.match(r'(https?://)?(www\.)?github\.com/([^/]+)/([^/]+)/?', github_url)
    if match:
        username = match.group(3)
        repo = match.group(4)
        # امتحان کردن مسیرهای مختلف برای README
        possible_paths = [
            f"https://raw.githubusercontent.com/{username}/{repo}/main/README.md",
            f"https://raw.githubusercontent.com/{username}/{repo}/master/README.md",
            f"https://raw.githubusercontent.com/{username}/{repo}/main/readme.md",
            f"https://raw.githubusercontent.com/{username}/{repo}/master/readme.md",
        ]
        
        for path in possible_paths:
            try:
                resp = requests.head(path, timeout=5)
                if resp.status_code == 200:
                    print(f"✅ README پیدا شد: {path}")
                    return path
            except:
                continue
        
        raise Exception("README.md در ریپازیتوری پیدا نشد!")
    
    raise Exception("لینک معتبر گیت‌هاب نیست!")

def extract_info_from_readme(readme_url):
    """استخراج نام فایل، MD5 و لینک‌های Camo از README.md"""
    print(f"📥 دریافت README: {readme_url}")
    headers = {'User-Agent': 'Mozilla/5.0'}
    response = requests.get(readme_url, headers=headers)
    response.raise_for_status()
    
    content = response.text
    
    # استخراج نام فایل از جدول
    filename_match = re.search(r'\|\s*\*\*نام فایل\*\*\s*\|\s*`([^`]+)`\s*\|', content)
    if not filename_match:
        # حالت پشتیبان: از لینک اصلی استخراج کن
        filename_match = re.search(r'\|\s*\*\*لینک اصلی\*\*\s*\|\s*\[[^\]]+\]\(([^)]+)\)\s*\|', content)
        if filename_match:
            original_url = filename_match.group(1)
            filename_match = re.search(r'/([^/]+)$', original_url)
            if filename_match:
                filename = unquote(filename_match.group(1))
            else:
                filename = "restored_file"
        else:
            filename = "restored_file"
    else:
        filename = filename_match.group(1)
    
    # استخراج MD5
    md5_match = re.search(r'\|\s*\*\*MD5\*\*\s*\|\s*`([a-fA-F0-9]{32})`\s*\|', content)
    if not md5_match:
        print("⚠️ هش MD5 در README یافت نشد")
        expected_md5 = None
    else:
        expected_md5 = md5_match.group(1).lower()
        print(f"🔐 MD5 مورد انتظار: {expected_md5}")
    
    # استخراج لینک‌های Camo از تگ‌های <img>
    camo_urls = re.findall(r'<img[^>]+src="(https://camo\.githubusercontent\.com/[^"]+)"', content)
    
    # اگر در تگ img نبود، از تگ a (حالت قدیمی) استفاده کن
    if not camo_urls:
        camo_urls = re.findall(r'<a[^>]+href="(https://camo\.githubusercontent\.com/[^"]+)"', content)
    
    # حذف تکراری‌ها
    camo_urls = list(dict.fromkeys(camo_urls))
    
    print(f"📄 نام فایل: {filename}")
    print(f"🔍 {len(camo_urls)} لینک Camo یافت شد.")
    
    return filename, expected_md5, camo_urls

def extract_camo_urls_from_raw(page_url):
    """استخراج لینک‌های Camo از تگ‌های <a> دور <img> (حالت قدیمی برای compatibility)"""
    print(f"📥 دریافت صفحه: {page_url}")
    headers = {'User-Agent': 'Mozilla/5.0'}
    response = requests.get(page_url, headers=headers)
    response.raise_for_status()

    pattern = r'<a[^>]+href="(https://camo\.githubusercontent\.com/[^"]+)"[^>]*>.*?<img.*?</a>'
    camo_urls = re.findall(pattern, response.text, re.DOTALL)

    if not camo_urls:
        camo_urls = re.findall(r'https://camo\.githubusercontent\.com/[a-f0-9]+/[^"\s]+', response.text)
        camo_urls = list(dict.fromkeys(camo_urls))

    return camo_urls

def download_and_decode_chunk(camo_url, index):
    """دانلود SVG از Camo و بازگرداندن داده باینری دیکد شده قطعه"""
    headers = {'User-Agent': 'Mozilla/5.0'}
    print(f"⬇️ دانلود قطعه {index+1}: {camo_url[:80]}...")
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            resp = requests.get(camo_url, headers=headers, timeout=30)
            resp.raise_for_status()
            break
        except Exception as e:
            if attempt == max_retries - 1:
                raise
            print(f"   ⚠️ تلاش مجدد {attempt+2}/{max_retries}...")
            time.sleep(2)
    
    svg_content = resp.text
    
    # استخراج همه <text>...</text>
    texts = re.findall(r'<text[^>]*>(.*?)</text>', svg_content, re.DOTALL)
    
    if not texts:
        raise ValueError(f"هیچ تگ متنی در SVG قطعه {index+1} یافت نشد")
    
    # تصفیه متن: حذف خطوط کمکی
    clean_parts = []
    for t in texts:
        t = t.strip()
        if t and not any(keyword in t for keyword in ["Chunk", "end of chunk", "--", "start of chunk"]):
            clean_parts.append(t)
    
    if not clean_parts:
        clean_parts = texts  # fallback
    
    b64_str = "".join(clean_parts)
    # حذف whitespace و newline
    b64_str = re.sub(r'\s+', '', b64_str)
    
    # اضافه کردن padding معتبر برای Base64
    missing_padding = len(b64_str) % 4
    if missing_padding:
        b64_str += "=" * (4 - missing_padding)
    
    try:
        binary_data = base64.b64decode(b64_str)
        print(f"   ✅ قطعه {index+1}: {len(binary_data)} بایت")
        return binary_data
    except Exception as e:
        raise ValueError(f"خطا در دیکد قطعه {index+1}: {e}")

def reconstruct_file_from_binary_chunks(chunks_data, output_filename):
    """چسباندن داده‌های باینری قطعات به یکدیگر"""
    if not chunks_data:
        raise ValueError("هیچ داده‌ای برای بازسازی وجود ندارد")
    
    total_size = sum(len(chunk) for chunk in chunks_data)
    print(f"\n🔧 در حال بازسازی {len(chunks_data)} قطعه (مجموعاً {total_size:,} بایت)...")
    
    output_filename = sanitize_filename(output_filename)
    
    with open(output_filename, "wb") as f:
        for i, chunk in enumerate(chunks_data):
            f.write(chunk)
            print(f"   📝 نوشته شد: قطعه {i+1} ({len(chunk):,} بایت)")
    
    return total_size

def sanitize_filename(filename):
    """پاکسازی نام فایل از کاراکترهای غیرمجاز"""
    # حذف کاراکترهای ممنوع در نام فایل
    filename = re.sub(r'[<>:"/\\|?*]', '_', filename)
    # حذف whitespace از اول و آخر
    filename = filename.strip()
    # محدودیت طول نام فایل
    if len(filename) > 200:
        name, ext = os.path.splitext(filename)
        filename = name[:195] + ext
    return filename

def verify_md5(file_path, expected_md5):
    """بررسی هش MD5 فایل بازسازی شده"""
    if not expected_md5:
        print("\n⚠️ MD5 برای بررسی وجود ندارد")
        return None
    
    print(f"\n🔐 در حال محاسبه MD5 فایل بازسازی شده...")
    hash_md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    calculated_md5 = hash_md5.hexdigest().lower()
    
    print(f"📊 MD5 محاسبه شده: {calculated_md5}")
    print(f"📋 MD5 مورد انتظار: {expected_md5}")
    
    if calculated_md5 == expected_md5:
        print("\n✅ تأیید هش: فایل به درستی بازسازی شده است!")
        return True
    else:
        print("\n❌ تأیید هش: فایل بازسازی شده با اصل مطابقت ندارد!")
        return False

def is_github_url(url):
    """تشخیص لینک گیت‌هاب"""
    return 'github.com' in url.lower()

def is_readme_url(url):
    """تشخیص لینک README"""
    return 'readme.md' in url.lower() or 'README.md' in url.lower()

def normalize_input_url(url):
    """نرمالایز کردن لینک ورودی"""
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    
    # اگر لینک گیت‌هاب هست ولی فول نیست
    if 'github.com' in url and not url.endswith('.md'):
        if '/blob/' in url:
            # تبدیل به raw
            url = url.replace('github.com', 'raw.githubusercontent.com')
            url = url.replace('/blob/', '/')
        elif '/raw/' not in url:
            # احتمالاً لینک ریپازیتوری
            pass
    
    return url

def main():
    print("="*60)
    print("🚀 بازسازی فایل از لینک‌های Camo GitHub")
    print("="*60)
    
    # دریافت لینک از کاربر
    if len(sys.argv) > 1:
        input_url = sys.argv[1]
    else:
        print("\n📌 لطفاً لینک را وارد کنید:")
        print("   (لینک README.md یا صفحه گیت‌هاب)")
        input_url = input("> ").strip()
        if not input_url:
            input_url = "https://github.com/safaeean/Kurdeus/blob/main/README.md"
            print(f"   استفاده از لینک پیش‌فرض: {input_url}")
    
    print(f"\n📌 آدرس وارد شده: {input_url}\n")
    
    try:
        # نرمالایز کردن لینک
        input_url = normalize_input_url(input_url)
        
        # پیدا کردن README اگر کاربر لینک مستقیم نداده
        if is_github_url(input_url) and not is_readme_url(input_url):
            print("🔄 لینک مستقیم README نیست، در حال جستجو...")
            readme_url = find_readme_from_github_page(input_url)
            print(f"✅ README پیدا شد: {readme_url}\n")
        else:
            readme_url = input_url
        
        # استخراج اطلاعات از README
        filename, expected_md5, camo_urls = extract_info_from_readme(readme_url)
        
        if not camo_urls:
            print("❌ لینکی یافت نشد (احتمالاً منقضی شده). README جدید بگیر.")
            return
        
        # جلوگیری از نام فایل تکراری
        if os.path.exists(filename):
            base, ext = os.path.splitext(filename)
            counter = 1
            while os.path.exists(f"{base}_{counter}{ext}"):
                counter += 1
            filename = f"{base}_{counter}{ext}"
            print(f"📝 نام فایل تغییر کرد به: {filename}")
        
        binary_chunks = []
        total_chunks = len(camo_urls)
        
        print(f"\n📦 شروع دانلود {total_chunks} قطعه...\n")
        
        for i, cu in enumerate(camo_urls):
            print(f"🔄 قطعه {i+1}/{total_chunks}")
            binary_data = download_and_decode_chunk(cu, i)
            binary_chunks.append(binary_data)
            time.sleep(0.3)  # تاخیر برای جلوگیری از محدودیت
        
        # بازسازی فایل
        total_bytes = reconstruct_file_from_binary_chunks(binary_chunks, filename)
        
        # بررسی MD5
        if expected_md5:
            verify_md5(filename, expected_md5)
        else:
            print("\n💡 نکته: برای تأیید صحت فایل، می‌توانید MD5 را手动 محاسبه کنید:")
            print(f"   md5sum {filename}  # لینوکس/Mac")
            print(f"   certutil -hashfile {filename} MD5  # ویندوز")
        
        # نمایش اطلاعات نهایی
        print("\n" + "="*60)
        print("✅ عملیات با موفقیت انجام شد!")
        print(f"📁 فایل خروجی: {filename}")
        print(f"📊 حجم نهایی: {total_bytes:,} بایت ({total_bytes/1024:.2f} KB, {total_bytes/1024/1024:.2f} MB)")
        print("="*60)
        
    except KeyboardInterrupt:
        print("\n\n⚠️ عملیات توسط کاربر متوقف شد.")
    except Exception as e:
        print(f"\n❌ خطا: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
