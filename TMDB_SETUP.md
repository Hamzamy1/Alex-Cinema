# تشغيل نظام جلب الأفلام من TMDB

## 1- احصل على API Key (مجاني)
- روح على https://www.themoviedb.org/settings/api
- اعمل حساب (لو معندكش)
- اطلب API Key (API Key (v3 auth))
- هتاخد حاجتين:
  - **API Key (v3)** - سلسلة حروف وأرقام
  - **API Read Access Token (v4)** - longer token

## 2- ضبط المفاتيح
افتح `fetch-movies.js` وحط المفاتيح في أول سطرين:
```js
const TMDB_KEY = 'حط_API_Key_هنا';
const TMDB_READ_TOKEN = '';  // حط الـ Token هنا (أو سيبه فاضي لو عايز تستخدم API Key)
```

## 3- أضف أفلامك
افتح `movies-source.json` وضيف أفلامك:
```json
{ "tmdb_id": 550, "watch_link": "رابط_المشاهدة" }
```

**إزاي تعرف tmdb_id؟**
- افتح https://www.themoviedb.org
- دوّر على الفيلم
- رقم الـ ID في الرابط: `https://www.themoviedb.org/movie/550` => الـ ID = 550

## 4- شغّل السكريبت
```bash
node fetch-movies.js
```

هيجب كل البيانات تلقائيًا ويحفظها في `movies.json`

## 5- افتح الموقع
افتح `index.html` في المتصفح - كل الأفلام هتظهر بالبيانات الكاملة
