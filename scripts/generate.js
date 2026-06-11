import fs from 'fs';
import https from 'https';

const fetchJSON = (url) => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
  }).on('error', reject);
});

const fetchText = (url) => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => resolve(data));
  }).on('error', reject);
});

// ── NEWS HOLEN - RSS + NEWSAPI FALLBACK ────────────────────────────────────
async function fetchNews() {
  const news = [];
  const keywords = ['SpaceX', 'Starship', 'Quantum', 'Gold', 'Bitcoin', 'Tesla', 'Rohstoffe'];

  // Versuche NewsAPI zuerst
  try {
    const key = process.env.NEWSAPI_KEY;
    if (key) {
      const url = `https://newsapi.org/v2/everything?q=${keywords.join(' OR ')}&sortBy=publishedAt&language=de,en&pageSize=10&apiKey=${key}`;
      const data = await fetchJSON(url);
      if (data?.articles) {
        data.articles.slice(0, 10).forEach(a => {
          news.push({
            title: a.title,
            source: a.source.name,
            url: a.url,
            publishedAt: new Date(a.publishedAt).toLocaleDateString('de-DE')
          });
        });
        console.log(`✅ NewsAPI: ${data.articles.length} News geholt`);
      }
    }
  } catch (e) {
    console.log('NewsAPI offline, nutze RSS...');
  }

  // Fallback: RSS Feeds
  if (news.length < 5) {
    const rssFeeds = [
      { name: 'Reuters', url: 'https://www.reuters.com/finance' },
      { name: 'Bloomberg', url: 'https://www.bloomberg.com/markets' },
      { name: 'Tagesschau', url: 'https://www.tagesschau.de/wirtschaft/rss2' },
    ];

    for (const feed of rssFeeds) {
      try {
        const rss = await fetchText(feed.url);
        const titles = [...rss.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)];
        titles.slice(0, 3).forEach(m => {
          news.push({
            title: m[1],
            source: feed.name,
            url: feed.url,
            publishedAt: new Date().toLocaleDateString('de-DE')
          });
        });
      } catch (e) {
        console.log(`RSS Fehler ${feed.name}:`, e.message);
      }
    }
  }

  // Kurze Zusammenfassung
  const dedup = {};
  news.forEach(n => { if (!dedup[n.title]) dedup[n.title] = n; });
  return Object.values(dedup).slice(0, 15);
}

// ── KURSE ──────────────────────────────────────────────────────────────────
async function fetchPrices() {
  const symbols = ['GC=F','SI=F','BTC-USD','^GDAXI','EURUSD=X','CL=F','GLD'];
  const labels  = {'GC=F':'Gold','SI=F':'Silber','BTC-USD':'Bitcoin','^GDAXI':'DAX','EURUSD=X':'EUR/USD','CL=F':'Öl','GLD':'MSCI World Islamic'};
  const prices = {};
  
  await Promise.all(symbols.map(async sym => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`;
      const data = await fetchJSON(url);
      const result = data?.chart?.result?.[0];
      if (result) {
        const closes = result.indicators.quote[0].close.filter(Boolean);
        const price = closes[closes.length - 1];
        const prev  = closes[closes.length - 2] || price;
        prices[sym] = { label: labels[sym], price, change: ((price - prev) / prev) * 100 };
      }
    } catch (e) {}
  }));
  return prices;
}

// ── FEAR & GREED ──────────────────────────────────────────────────────────
async function fetchFearGreed() {
  try {
    const data = await fetchJSON('https://api.alternative.me/fng/?limit=7');
    if (data?.data) return data.data.reverse().map(x => parseInt(x.value));
  } catch (e) {}
  return [50];
}

// ── SIMULATION ────────────────────────────────────────────────────────────
function runSimulation(fg, goldMomentum) {
  let buy = 0, hold = 0, sell = 0;
  for (let i = 0; i < 1000; i++) {
    const type = i < 100 ? 'f' : i < 400 ? 'c' : 'n';
    let score = 0;
    if (type === 'f') score += (fg < 30 ? 15 : fg > 70 ? -15 : 0);
    else if (type === 'c') score += goldMomentum > 2 ? 1.5 : goldMomentum < -2 ? -1.5 : 0;
    else score += (Math.random() - 0.5) * 2;
    if (score > 1) buy++; else if (score < -1) sell++; else hold++;
  }
  return { buy: Math.round(buy/10), hold: Math.round(hold/10), sell: Math.round(sell/10) };
}

// ── GEMINI ANALYSE ────────────────────────────────────────────────────────
async function generateAnalysis(news, prices, fgHistory) {
  const fg = fgHistory[fgHistory.length - 1];
  const priceCtx = Object.values(prices).map(d => `${d.label}: ${d.price > 100 ? d.price.toFixed(0) : d.price.toFixed(4)} (${d.change >= 0 ? '+' : ''}${d.change.toFixed(2)}%)`).join(', ');
  const dateStr = new Date().toLocaleDateString('de-DE', {weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const newsCtx = news.slice(0, 10).map(n => `${n.source}: ${n.title}`).join('\n');

  const prompt = `Du bist ein Hype-Analyst. Fokus: SpaceX/Space Tech, Quantencomputer, Rohstoffe.

KERNFRAGE: Wenn X bullish ist – welche PERIPHEREN Assets profitieren?

DATEN:
Datum: ${dateStr}
Kurse: ${priceCtx}
Fear & Greed: ${fg}/100

TOP NEWS:
${newsCtx}

Antworte NUR mit JSON:
{
  "hypeNews": [{"quelle": "Reuters", "thema": "SpaceX Starship", "bullish": true}],
  "hypeCenter": "SpaceX/Space Tech ist der größte Hype",
  "peripherEffect": "Kupfer/Metalle für Raumfahrt steigen",
  "entscheidung": "JA",
  "einstieg": "30.50€",
  "stopLoss": "28.10€",
  "ziel": "36.00€",
  "brief": "Ayman, Space Tech ist der Hype. Peripher: Rohstoffe profitieren länger."
}`;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
  });

  return new Promise((resolve, reject) => {
    const key = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${key}`;
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
          resolve(JSON.parse(text.replace(/```json|```/g, '').trim()));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Starte Hype-Analyse...');

  const [news, prices, fgHistory] = await Promise.all([
    fetchNews(),
    fetchPrices(),
    fetchFearGreed()
  ]);

  console.log(`📰 ${news.length} Nachrichten geholt`);
  console.log(`📊 ${Object.keys(prices).length} Kurse geholt`);
  console.log(`😱 Fear & Greed: ${fgHistory[fgHistory.length-1]}`);

  let analysis = {};
  try {
    analysis = await generateAnalysis(news, prices, fgHistory);
    console.log('✅ KI-Analyse erfolgreich');
  } catch (e) {
    console.log('❌ KI-Fehler:', e.message);
    analysis = { entscheidung: 'WARTEN', brief: 'Analyse fehler.' };
  }

  const fg = fgHistory[fgHistory.length - 1];
  const goldMomentum = prices['GC=F']?.change || 0;
  const sim = runSimulation(fg, goldMomentum);
  const dateStr = new Date().toLocaleDateString('de-DE', {weekday:'long',year:'numeric',month:'long',day:'numeric'});

  if (!fs.existsSync('public')) fs.mkdirSync('public');
  const output = {
    date: dateStr,
    generatedAt: new Date().toISOString(),
    news: news,
    sections: analysis,
    prices,
    fearGreed: fgHistory,
    simulation: sim
  };
  fs.writeFileSync('public/briefing.json', JSON.stringify(output, null, 2));
  console.log('💾 public/briefing.json gespeichert');
  console.log('✅ Fertig!');
}

main().catch(console.error);
