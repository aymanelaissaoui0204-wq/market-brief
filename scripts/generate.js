import fs from 'fs';
import https from 'https';

// ── HELPERS ──────────────────────────────────────────────────────────────────
const fetchJSON = (url) => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { resolve(null); }
    });
  }).on('error', reject);
});

const fetchText = (url) => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => resolve(data));
  }).on('error', reject);
});

// ── NEWS HOLEN ────────────────────────────────────────────────────────────────
async function fetchNews() {
  const news = [];

  // NewsData.io (Deutsch)
  try {
    const key = process.env.NEWSDATA_API_KEY;
    const url = `https://newsdata.io/api/1/news?apikey=${key}&language=de&category=business&q=wirtschaft+finanzen+inflation+zins`;
    const data = await fetchJSON(url);
    if (data?.results) {
      data.results.slice(0, 5).forEach(a => {
        news.push(`${a.source_id}: ${a.title}`);
      });
    }
  } catch (e) { console.log('NewsData Fehler:', e.message); }

  // RSS Tagesschau Wirtschaft (kein Key nötig)
  try {
    const rss = await fetchText('https://www.tagesschau.de/wirtschaft/rss2');
    const titles = [...rss.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)].slice(1, 5);
    titles.forEach(m => news.push(`Tagesschau: ${m[1]}`));
  } catch (e) { console.log('Tagesschau RSS Fehler:', e.message); }

  // EZB RSS (kein Key nötig)
  try {
    const rss = await fetchText('https://www.ecb.europa.eu/rss/press.html');
    const titles = [...rss.matchAll(/<title>(.*?)<\/title>/g)].slice(1, 3);
    titles.forEach(m => news.push(`EZB: ${m[1].replace(/<[^>]*>/g, '')}`));
  } catch (e) { console.log('EZB RSS Fehler:', e.message); }

  return news.filter(Boolean).slice(0, 10);
}

// ── KURSE HOLEN ───────────────────────────────────────────────────────────────
async function fetchPrices() {
  const symbols = ['GC=F', 'SI=F', 'CL=F', 'HG=F', 'BTC-USD', '^GDAXI', 'DX-Y.NYB', 'EURUSD=X', '^TNX'];
  const prices = {};

  await Promise.all(symbols.map(async (sym) => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`;
      const data = await fetchJSON(url);
      const result = data?.chart?.result?.[0];
      if (result) {
        const closes = result.indicators.quote[0].close.filter(Boolean);
        const price = closes[closes.length - 1];
        const prev = closes[closes.length - 2] || price;
        prices[sym] = {
          price: price,
          change: ((price - prev) / prev) * 100,
          high52: result.meta?.fiftyTwoWeekHigh || null,
          low52: result.meta?.fiftyTwoWeekLow || null
        };
      }
    } catch (e) { console.log(`Preis Fehler ${sym}:`, e.message); }
  }));

  return prices;
}

// ── FEAR & GREED ──────────────────────────────────────────────────────────────
async function fetchFearGreed() {
  try {
    const data = await fetchJSON('https://api.alternative.me/fng/?limit=7');
    if (data?.data) {
      return data.data.reverse().map(x => parseInt(x.value));
    }
  } catch (e) { console.log('Fear&Greed Fehler:', e.message); }
  return [50];
}

// ── GEMINI ANALYSE ────────────────────────────────────────────────────────────
async function generateAnalysis(news, prices, fgHistory) {
  const fg = fgHistory[fgHistory.length - 1];
  const fgTrend = fgHistory.length > 1 ? (fgHistory[fgHistory.length-1] > fgHistory[0] ? 'steigend' : 'fallend') : 'neutral';

  const priceCtx = Object.entries(prices).map(([sym, d]) => {
    const labels = {'GC=F':'Gold','SI=F':'Silber','CL=F':'Öl','HG=F':'Kupfer','BTC-USD':'Bitcoin','^GDAXI':'DAX','DX-Y.NYB':'DXY','EURUSD=X':'EUR/USD','^TNX':'10Y-Rendite'};
    return `${labels[sym]||sym}: ${d.price > 100 ? d.price.toFixed(0) : d.price.toFixed(4)} (${d.change >= 0 ? '+' : ''}${d.change.toFixed(2)}%)`;
  }).join(', ');

  const prompt = `Du bist ein globaler Makro-Analyst mit islamischer Ethik und Insider-Denken.

KERNPRINZIP: Die Nachricht ist die Oberfläche. Das Geld zeigt die Wahrheit.
80% der News irrelevant. 15% manipulativ. 5% sind Gold.
Kein Trade ist oft die beste Entscheidung.

AKTUELLE DATEN:
Datum: ${new Date().toLocaleDateString('de-DE', {weekday:'long',year:'numeric',month:'long',day:'numeric'})}
Kurse: ${priceCtx}
Fear & Greed: ${fg}/100 (Trend: ${fgTrend})

NACHRICHTEN:
${news.join('\n')}

Analysiere auf 20 Ebenen und antworte NUR mit validem JSON:
{
  "oberflaeche": ["Quelle: Headline"],
  "narrativ": "Was die Masse glaubt",
  "realitaet": "Was wirklich passiert",
  "macht": "Wer profitiert konkret",
  "geopolitik": "Ressourcen, Allianzen, BRICS, De-Dollarisierung",
  "liquiditaet": "Wohin fließt Kapital konkret",
  "kette": "A → B → C → D",
  "timing": "Früh/Mitte/Spät/Wendepunkt",
  "saisonalitaet": "Historisches Muster diesen Monat",
  "masseFehler": "Was 95% falsch sehen",
  "widerspruch": "Signal-Konflikt ja/nein + Erklärung",
  "markt": "Gold ↑↓ | Silber ↑↓ | Öl ↑↓ | Kupfer ↑↓ | Bitcoin ↑↓ | DAX ↑↓ | DXY ↑↓ | EUR/USD ↑↓ | 10Y ↑↓",
  "opportunity": "Konkrete Chance oder null",
  "positionierung": "COT Smart Money Signal",
  "reflexivitaet": "Feedback-Loop beschreiben",
  "asymmetrie": {"verlust": 8, "gewinn": 18, "ratio": 2.3, "ev": 0.12},
  "metaZyklus": "Stagflation/Wachstum/Krise/Umbruch",
  "halalAsset": "Asset Name + ISIN",
  "halalStatus": "halal",
  "halalBegruendung": "AAOIFI 1 Satz",
  "purification": "0.00",
  "entscheidung": "JA/NEIN/WARTEN",
  "richtung": "LONG/SHORT/null",
  "einstieg": "Konkreter Preis mit € oder $",
  "stopLoss": "ATR-basierter Preis mit € oder $",
  "ziel": "Zielpreis mit € oder $",
  "zeitraum": "2-4 Wochen",
  "einsatz": 3.13,
  "exitStrategie": "Konkrete Exit-Regel",
  "waehrungsrisiko": "EUR/USD Effekt auf Trade",
  "psychologie": "FOMO/PANIK Warnung oder null",
  "ruhigerTag": false,
  "lernpunkt": "Begriff: 3 Sätze Erklärung",
  "tagesfrage": "Denkfrage ohne Antwortpflicht",
  "brief": "4-5 Sätze Mentor-Brief an Ayman"
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
          const clean = text.replace(/```json|```/g, '').trim();
          resolve(JSON.parse(clean));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── SIMULATION ────────────────────────────────────────────────────────────────
function runSimulation(fearGreed, goldMomentum, cotSignal) {
  let buy = 0, hold = 0, sell = 0;
  for (let i = 0; i < 1000; i++) {
    const type = i < 100 ? 'fundamental' : i < 400 ? 'chartist' : 'noise';
    const weight = type === 'fundamental' ? 10 : type === 'chartist' ? 1.5 : 1.0;
    let score = 0;
    if (type === 'fundamental') {
      score += (cotSignal === 'buy' ? 2 : cotSignal === 'sell' ? -2 : 0) * weight;
      score += (fearGreed < 30 ? 1.5 : fearGreed > 70 ? -1.5 : 0) * weight;
    } else if (type === 'chartist') {
      score += (goldMomentum > 2 ? 1 : goldMomentum < -2 ? -1 : 0) * weight;
    } else {
      score += (Math.random() - 0.5) * weight;
    }
    if (score > 1.5) buy++;
    else if (score < -1.5) sell++;
    else hold++;
  }
  return { buy: Math.round(buy/10), hold: Math.round(hold/10), sell: Math.round(sell/10) };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Starte tägliche Analyse...');

  const [news, prices, fgHistory] = await Promise.all([
    fetchNews(),
    fetchPrices(),
    fetchFearGreed()
  ]);

  console.log(`📰 ${news.length} News geholt`);
  console.log(`📊 ${Object.keys(prices).length} Kurse geholt`);
  console.log(`😱 Fear & Greed: ${fgHistory[fgHistory.length-1]}`);

  let analysis = {};
  try {
    analysis = await generateAnalysis(news, prices, fgHistory);
    console.log('✅ KI-Analyse erfolgreich');
  } catch (e) {
    console.log('❌ KI-Analyse Fehler:', e.message);
    analysis = { entscheidung: 'WARTEN', ruhigerTag: true, brief: 'Heute konnte keine Analyse erstellt werden. Bitte manuell News eingeben.' };
  }

  const fg = fgHistory[fgHistory.length - 1];
  const goldMomentum = prices['GC=F']?.change || 0;
  const sim = runSimulation(fg, goldMomentum, 'neutral');

  const output = {
    date: new Date().toLocaleDateString('de-DE', {weekday:'long',year:'numeric',month:'long',day:'numeric'}),
    generatedAt: new Date().toISOString(),
    sections: analysis,
    prices,
    fearGreed: fgHistory,
    simulation: sim,
    news
  };

  // Public Ordner erstellen falls nicht vorhanden
  if (!fs.existsSync('public')) fs.mkdirSync('public');
  fs.writeFileSync('public/briefing.json', JSON.stringify(output, null, 2));
  console.log('💾 briefing.json gespeichert');
  console.log('✅ Fertig!');
}

main().catch(console.error);
