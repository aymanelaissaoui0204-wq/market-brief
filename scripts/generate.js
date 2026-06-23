import fs from 'fs';
import https from 'https';

const fetchJSON = (url) => new Promise((resolve) => {
  const timeout = setTimeout(() => { console.log('⏱️ Timeout auf:', url); resolve(null); }, 8000);
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => { clearTimeout(timeout); try { resolve(JSON.parse(data)); } catch { resolve(null); } });
  }).on('error', (e) => { clearTimeout(timeout); console.log('❌ Fetch Error:', e.message); resolve(null); });
});

// ── TOP 10 WIRTSCHAFTS-NEWS VON GNEWS ──────────────────────────────────────
async function fetchEconomicsNews() {
  const key = process.env.GNEWS_API_KEY;
  if (!key) {
    console.log('⚠️ GNEWS_API_KEY fehlt');
    return [];
  }

  const keywords = ['wirtschaft', 'finanzen', 'gold', 'spacex', 'quantencomputer'];
  const allNews = [];

  // Mehrere Anfragen für verschiedene Keywords
  for (const keyword of keywords) {
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(keyword)}&token=${key}&lang=de&max=3`;
    console.log(`📡 Hole News für "${keyword}"...`);
    
    const data = await fetchJSON(url);
    if (data?.articles) {
      data.articles.forEach(a => {
        allNews.push({
          title: a.title,
          source: a.source.name,
          pubDate: a.publishedAt,
          content: a.description || a.title,
          url: a.url
        });
      });
    }
  }

  // Deduplizieren und Top 10 nehmen
  const unique = {};
  allNews.forEach(n => {
    const key = n.title.substring(0, 50);
    if (!unique[key]) unique[key] = n;
  });
  
  const news = Object.values(unique).slice(0, 10);
  console.log(`✅ ${news.length} News geholt`);
  return news;
}

// ── KURSE ──────────────────────────────────────────────────────────────────
async function fetchPrices() {
  const symbols = ['GC=F','SI=F','BTC-USD','^GDAXI','EURUSD=X','CL=F'];
  const labels  = {'GC=F':'Gold','SI=F':'Silber','BTC-USD':'Bitcoin','^GDAXI':'DAX','EURUSD=X':'EUR/USD','CL=F':'Öl'};
  const prices = {};
  
  console.log('📊 Hole Kurse...');
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
  console.log(`✅ ${Object.keys(prices).length} Kurse geholt`);
  return prices;
}

// ── FEAR & GREED ──────────────────────────────────────────────────────────
async function fetchFearGreed() {
  console.log('😱 Hole Fear & Greed...');
  try {
    const data = await fetchJSON('https://api.alternative.me/fng/?limit=7');
    if (data?.data) {
      const vals = data.data.reverse().map(x => parseInt(x.value));
      console.log(`✅ F&G: ${vals[vals.length-1]}`);
      return vals;
    }
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

// ── GEMINI ANALYSE MIT NEWS ────────────────────────────────────────────────
async function generateAnalysis(news, prices, fgHistory) {
  const fg = fgHistory[fgHistory.length - 1];
  const priceCtx = Object.values(prices).map(d => `${d.label}: ${d.price > 100 ? d.price.toFixed(0) : d.price.toFixed(4)} (${d.change >= 0 ? '+' : ''}${d.change.toFixed(2)}%)`).join(', ');
  const dateStr = new Date().toLocaleDateString('de-DE', {weekday:'long',year:'numeric',month:'long',day:'numeric'});
  
  const newsText = news.slice(0, 10).map(n => `${n.source}: ${n.title}`).join('\n');
  if (!newsText) {
    console.log('⚠️ Keine News für Analyse');
    return { entscheidung: 'WARTEN', brief: 'Keine aktuellen News verfügbar.' };
  }

  const prompt = `Du bist ein Hype-Analyst für Märkte. Fokus: Space Tech (SpaceX), Quantencomputer, Rohstoffe.

KERNFRAGE: Wenn X bullish ist – welche PERIPHEREN Assets profitieren?

DATEN:
Datum: ${dateStr}
Kurse: ${priceCtx}
Fear & Greed: ${fg}/100

TOP 10 WIRTSCHAFTS-NEWS:
${newsText}

Analysiere die News und antworte NUR mit JSON ohne Backticks:
{
  "hypeNews": ["SpaceX News", "Quantum News"],
  "hypeCenter": "Welcher Hype ist am stärksten?",
  "peripherEffect": "Welche kleineren Assets profitieren davon?",
  "entscheidung": "JA oder NEIN",
  "richtung": "LONG oder SHORT",
  "einstieg": "30.50€",
  "stopLoss": "28.10€",
  "ziel": "36.00€",
  "zeitraum": "4-8 Wochen",
  "einsatz": 3.13,
  "exitStrategie": "Bei +10% Hälfte verkaufen",
  "brief": "4-5 Sätze Mentor-Brief an Ayman über die News"
}`;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
  });

  console.log('🤖 Starte KI-Analyse...');
  
  return new Promise((resolve) => {
    const key = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${key}`;
    const timeout = setTimeout(() => { console.log('⏱️ Gemini Timeout'); resolve({}); }, 15000);
    
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        clearTimeout(timeout);
        try {
          const parsed = JSON.parse(data);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
          const analyzed = JSON.parse(text.replace(/```json|```/g, '').trim());
          console.log('✅ KI-Analyse fertig');
          resolve(analyzed);
        } catch (e) { 
          console.log('❌ Analyse Parse Error:', e.message);
          resolve({}); 
        }
      });
    });
    
    req.on('error', (e) => { clearTimeout(timeout); console.log('❌ Gemini Error:', e.message); resolve({}); });
    req.write(body);
    req.end();
  });
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Starte Hype-Analyse mit News...');
  const startTime = Date.now();

  const [news, prices, fgHistory] = await Promise.all([
    fetchEconomicsNews(),
    fetchPrices(),
    fetchFearGreed()
  ]);

  const analysis = await generateAnalysis(news, prices, fgHistory);

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
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`💾 public/briefing.json gespeichert`);
  console.log(`⏱️ Fertig in ${duration}s`);
  console.log('✅ Briefing generiert!');
}

main().catch(console.error);
