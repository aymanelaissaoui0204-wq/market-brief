import fs from 'fs';
import https from 'https';

// ── HELPERS ──────────────────────────────────────────────────────────────────
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

// ── NEWS HOLEN - HYPE KEYWORDS ────────────────────────────────────────────────
async function fetchNews() {
  const news = [];
  const keywords = [
    'SpaceX', 'Starship', 'Space Tech',
    'Quantencomputer', 'Quantum Computing',
    'Gold', 'Rohstoffe', 'Kupfer', 'Öl', 'Lithium',
    'Tesla', 'Bitcoin', 'AI', 'Halbleiter'
  ];

  // NewsAPI.org – kostenlos und zuverlässig
  try {
    const key = process.env.NEWSAPI_KEY;
    if (!key) throw new Error('NewsAPI Key fehlt');
    
    const promises = keywords.map(keyword =>
      fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(keyword)}&sortBy=publishedAt&language=de,en&pageSize=3&apiKey=${key}`)
        .then(r => r.json())
        .then(d => d.articles || [])
        .catch(() => [])
    );
    
    const allArticles = await Promise.all(promises);
    const flattened = allArticles.flat();
    
    // Deduplizieren und Top 15 nehmen
    const unique = {};
    flattened.forEach(a => {
      const key = a.title.substring(0, 30);
      if (!unique[key]) unique[key] = a;
    });
    
    Object.values(unique).slice(0, 15).forEach(a => {
      news.push({
        title: a.title,
        source: a.source.name,
        url: a.url,
        publishedAt: new Date(a.publishedAt).toLocaleDateString('de-DE')
      });
    });
  } catch (e) {
    console.log('NewsAPI Fehler:', e.message);
  }

  return news;
}

// ── KURSE HOLEN ───────────────────────────────────────────────────────────────
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
    } catch (e) { console.log(`Preis Fehler ${sym}:`, e.message); }
  }));
  return prices;
}

// ── FEAR & GREED ──────────────────────────────────────────────────────────────
async function fetchFearGreed() {
  try {
    const data = await fetchJSON('https://api.alternative.me/fng/?limit=7');
    if (data?.data) return data.data.reverse().map(x => parseInt(x.value));
  } catch (e) { console.log('F&G Fehler:', e.message); }
  return [50];
}

// ── SIMULATION ────────────────────────────────────────────────────────────────
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

// ── GEMINI ANALYSE MIT HYPE-FOKUS ────────────────────────────────────────────
async function generateAnalysis(news, prices, fgHistory) {
  const fg = fgHistory[fgHistory.length - 1];
  const priceCtx = Object.values(prices).map(d => `${d.label}: ${d.price > 100 ? d.price.toFixed(0) : d.price.toFixed(4)} (${d.change >= 0 ? '+' : ''}${d.change.toFixed(2)}%)`).join(', ');
  const dateStr = new Date().toLocaleDateString('de-DE', {weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const newsCtx = news.slice(0, 10).map(n => `${n.source}: ${n.title}`).join('\n');

  const prompt = `Du bist ein Hype-Analyst für Märkte. Fokus: SpaceX/Space Tech, Quantencomputer, Rohstoffe.

KERNFRAGE: Wenn X bullish ist – welche PERIPHEREN Assets profitieren?
Beispiel: Wenn SpaceX News bullish → Satelliten, Raumfahrtzulieferer, aber auch Kupfer, Spezialmetalle steigen.

DATEN:
Datum: ${dateStr}
Kurse: ${priceCtx}
Fear & Greed: ${fg}/100

TOP NEWS (Hype-Quellen):
${newsCtx}

ANALYSIERE:
1. **Hype-Center**: Welche News sind am bullishesten? (SpaceX, Quantum, Rohstoffe)
2. **Peripher-Effekt**: Wenn Hype A steigt → welche kleineren/verwandten Assets profitieren?
3. **Konkrete Trade**: 1 Asset das direkt profitiert, 1 Asset das PERIPHER profitiert

Antworte NUR mit JSON ohne Backticks:
{
  "hypeNews": [
    {"quelle": "Reuters", "thema": "SpaceX Starship", "bullish": true},
    {"quelle": "Bloomberg", "thema": "Quantencomputer", "bullish": true}
  ],
  "hypeCenter": "SpaceX/Space Tech ist der größte Hype heute",
  "peripherEffect": "Wenn Space Tech bullish ist → Kupfer/Materialien für Raketen steigen, Satelliten-ETFs profitieren",
  "trade1": {
    "asset": "Xetra-Gold (peripherer Play auf Raumfahrt-Metalle)",
    "grund": "Raumfahrtindustrie braucht spezielle Metalle + Rohstoff-Inflation"
  },
  "trade2": {
    "asset": "Tech-Semiconductors (direct Play)",
    "grund": "Quantencomputer brauchen neue Chips"
  },
  "entscheidung": "JA",
  "einstieg": "30.50€",
  "stopLoss": "28.10€",
  "ziel": "36.00€",
  "psychologie": "FOMO Warnung: Hype kann schnell drehen",
  "brief": "Ayman, heute ist Space Tech der Hype. Aber die periphere Waffe ist Rohstoffe – wer Raumfahrts-Metalle kauft, profitiert länger als die flüchtigen Tech-Stocks."
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

// ── MAIN ──────────────────────────────────────────────────────────────────────
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
    console.log('❌ KI-Analyse Fehler:', e.message);
    analysis = { entscheidung: 'WARTEN', brief: 'Analyse konnte nicht erstellt werden.' };
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
