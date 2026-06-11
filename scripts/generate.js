import fs from 'fs';
import https from 'https';

const fetchJSON = (url) => new Promise((resolve) => {
  const timeout = setTimeout(() => resolve(null), 5000);
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => { clearTimeout(timeout); try { resolve(JSON.parse(data)); } catch { resolve(null); } });
  }).on('error', () => { clearTimeout(timeout); resolve(null); });
});

// ── KURSE ──────────────────────────────────────────────────────────────────
async function fetchPrices() {
  const symbols = ['GC=F','SI=F','BTC-USD','^GDAXI','EURUSD=X','CL=F'];
  const labels  = {'GC=F':'Gold','SI=F':'Silber','BTC-USD':'Bitcoin','^GDAXI':'DAX','EURUSD=X':'EUR/USD','CL=F':'Öl'};
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
async function generateAnalysis(prices, fgHistory) {
  const fg = fgHistory[fgHistory.length - 1];
  const priceCtx = Object.values(prices).map(d => `${d.label}: ${d.price > 100 ? d.price.toFixed(0) : d.price.toFixed(4)} (${d.change >= 0 ? '+' : ''}${d.change.toFixed(2)}%)`).join(', ');
  const dateStr = new Date().toLocaleDateString('de-DE', {weekday:'long',year:'numeric',month:'long',day:'numeric'});

  const prompt = `Du bist ein Hype-Analyst. Fokus: SpaceX, Quantencomputer, Rohstoffe.

DATEN:
Datum: ${dateStr}
Kurse: ${priceCtx}
Fear & Greed: ${fg}/100

Analyse in JSON:
{
  "hypeCenter": "Was ist heute der größte Markt-Hype?",
  "peripherEffect": "Welche kleinen Assets profitieren davon?",
  "entscheidung": "JA oder NEIN",
  "einstieg": "30.50€",
  "stopLoss": "28.10€",
  "ziel": "36.00€",
  "brief": "Kurzer Brief an Ayman"
}`;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
  });

  return new Promise((resolve) => {
    const key = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${key}`;
    const timeout = setTimeout(() => resolve({}), 15000);
    
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
          resolve(JSON.parse(text.replace(/```json|```/g, '').trim()));
        } catch (e) { resolve({}); }
      });
    });
    
    req.on('error', () => { clearTimeout(timeout); resolve({}); });
    req.write(body);
    req.end();
  });
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Starte Analyse...');

  const [prices, fgHistory] = await Promise.all([
    fetchPrices(),
    fetchFearGreed()
  ]);

  console.log(`📊 ${Object.keys(prices).length} Kurse geholt`);
  console.log(`😱 Fear & Greed: ${fgHistory[fgHistory.length-1]}`);

  const analysis = await generateAnalysis(prices, fgHistory);
  console.log('✅ Analyse fertig');

  const fg = fgHistory[fgHistory.length - 1];
  const goldMomentum = prices['GC=F']?.change || 0;
  const sim = runSimulation(fg, goldMomentum);
  const dateStr = new Date().toLocaleDateString('de-DE', {weekday:'long',year:'numeric',month:'long',day:'numeric'});

  if (!fs.existsSync('public')) fs.mkdirSync('public');
  const output = {
    date: dateStr,
    generatedAt: new Date().toISOString(),
    sections: analysis,
    prices,
    fearGreed: fgHistory,
    simulation: sim
  };
  fs.writeFileSync('public/briefing.json', JSON.stringify(output, null, 2));
  console.log('💾 Gespeichert!');
  console.log('✅ Fertig!');
}

main().catch(console.error);
