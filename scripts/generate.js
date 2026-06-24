import fs from 'fs';
import https from 'https';

// ── HELPER: fetch mit Timeout ──────────────────────────────────────────────
const fetchJSON = (url) => new Promise((resolve) => {
  const timeout = setTimeout(() => resolve(null), 8000);
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => { clearTimeout(timeout); try { resolve(JSON.parse(data)); } catch { resolve(null); } });
  }).on('error', () => { clearTimeout(timeout); resolve(null); });
});

// ── QUELLE 1: GNEWS (deutsche + englische Schlagzeilen) ────────────────────
async function fetchGNews() {
  const key = process.env.GNEWS_API_KEY;
  if (!key) { console.log('⚠️ GNews Key fehlt'); return []; }
  const out = [];
  const queries = ['wirtschaft finanzen', 'gold rohstoffe', 'spacex space', 'quantum computing', 'bitcoin krypto'];
  for (const q of queries) {
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&token=${key}&lang=de&max=2`;
    const data = await fetchJSON(url);
    if (data?.articles) data.articles.forEach(a => out.push({
      title: a.title, source: a.source?.name || 'GNews', sentiment: null, tickers: [], origin: 'GNews'
    }));
  }
  console.log(`📡 GNews: ${out.length} News`);
  return out;
}

// ── QUELLE 2: ALPHA VANTAGE (News + Sentiment + Ticker) ────────────────────
async function fetchAlphaVantage() {
  const key = process.env.ALPHAVANTAGE_KEY;
  if (!key) { console.log('⚠️ AlphaVantage Key fehlt'); return []; }
  // Topics: technology, finance, economy_macro, financial_markets
  const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=technology,financial_markets,economy_macro&sort=LATEST&limit=15&apikey=${key}`;
  const data = await fetchJSON(url);
  const out = [];
  if (data?.feed) {
    data.feed.slice(0, 15).forEach(a => {
      const tickers = (a.ticker_sentiment || []).slice(0, 3).map(t => `${t.ticker}(${parseFloat(t.ticker_sentiment_score).toFixed(2)})`);
      out.push({
        title: a.title,
        source: a.source || 'AlphaVantage',
        sentiment: a.overall_sentiment_label || null,
        tickers,
        origin: 'AlphaVantage'
      });
    });
  }
  console.log(`📡 AlphaVantage: ${out.length} News (mit Sentiment)`);
  return out;
}

// ── QUELLE 3: FINNHUB (Markt-News) ─────────────────────────────────────────
async function fetchFinnhub() {
  const key = process.env.FINNHUB_KEY;
  if (!key) { console.log('⚠️ Finnhub Key fehlt'); return []; }
  const url = `https://finnhub.io/api/v1/news?category=general&token=${key}`;
  const data = await fetchJSON(url);
  const out = [];
  if (Array.isArray(data)) {
    data.slice(0, 12).forEach(a => out.push({
      title: a.headline, source: a.source || 'Finnhub', sentiment: null, tickers: [], origin: 'Finnhub'
    }));
  }
  console.log(`📡 Finnhub: ${out.length} News`);
  return out;
}

// ── QUELLE 4: MARKETAUX (News + Entity Sentiment) ──────────────────────────
async function fetchMarketaux() {
  const key = process.env.MARKETAUX_KEY;
  if (!key) { console.log('⚠️ Marketaux Key fehlt'); return []; }
  const url = `https://api.marketaux.com/v1/news/all?language=en&filter_entities=true&limit=10&api_token=${key}`;
  const data = await fetchJSON(url);
  const out = [];
  if (data?.data) {
    data.data.forEach(a => {
      const tickers = (a.entities || []).slice(0, 3).map(e => `${e.symbol}(${e.sentiment_score != null ? e.sentiment_score.toFixed(2) : '?'})`);
      out.push({
        title: a.title, source: a.source || 'Marketaux', sentiment: null, tickers, origin: 'Marketaux'
      });
    });
  }
  console.log(`📡 Marketaux: ${out.length} News (mit Entities)`);
  return out;
}

// ── ALLE QUELLEN PARALLEL + DEDUP ──────────────────────────────────────────
async function fetchAllNews() {
  const results = await Promise.all([
    fetchGNews().catch(() => []),
    fetchAlphaVantage().catch(() => []),
    fetchFinnhub().catch(() => []),
    fetchMarketaux().catch(() => []),
  ]);
  const all = results.flat();

  // Deduplizieren über die ersten 40 Zeichen des Titels
  const unique = {};
  all.forEach(n => {
    if (!n.title) return;
    const k = n.title.toLowerCase().substring(0, 40);
    if (!unique[k]) unique[k] = n;
  });
  const deduped = Object.values(unique);
  console.log(`✅ Gesamt: ${all.length} News, nach Dedup: ${deduped.length}`);
  return deduped.slice(0, 25);
}

// ── KURSE ──────────────────────────────────────────────────────────────────
async function fetchPrices() {
  const symbols = ['GC=F','SI=F','BTC-USD','^GDAXI','EURUSD=X','CL=F'];
  const labels  = {'GC=F':'Gold','SI=F':'Silber','BTC-USD':'Bitcoin','^GDAXI':'DAX','EURUSD=X':'EUR/USD','CL=F':'Öl'};
  const prices = {};
  await Promise.all(symbols.map(async sym => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=2d`;
    const data = await fetchJSON(url);
    const result = data?.chart?.result?.[0];
    if (result) {
      const closes = result.indicators.quote[0].close.filter(Boolean);
      const price = closes[closes.length - 1];
      const prev  = closes[closes.length - 2] || price;
      prices[sym] = { label: labels[sym], price, change: ((price - prev) / prev) * 100 };
    }
  }));
  console.log(`📊 ${Object.keys(prices).length} Kurse`);
  return prices;
}

// ── FEAR & GREED ──────────────────────────────────────────────────────────
async function fetchFearGreed() {
  const data = await fetchJSON('https://api.alternative.me/fng/?limit=7');
  if (data?.data) return data.data.reverse().map(x => parseInt(x.value));
  return [50];
}

// ── SIMULATION ─────────────────────────────────────────────────────────────
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

// ── GEMINI ANALYSE ──────────────────────────────────────────────────────────
async function generateAnalysis(news, prices, fgHistory) {
  const fg = fgHistory[fgHistory.length - 1];
  const priceCtx = Object.values(prices).map(d => `${d.label}: ${d.price > 100 ? d.price.toFixed(0) : d.price.toFixed(4)} (${d.change >= 0 ? '+' : ''}${d.change.toFixed(2)}%)`).join(', ');
  const dateStr = new Date().toLocaleDateString('de-DE', {weekday:'long',year:'numeric',month:'long',day:'numeric'});

  // News mit Sentiment + Ticker an die KI geben
  const newsText = news.slice(0, 20).map(n => {
    let line = `[${n.origin}] ${n.source}: ${n.title}`;
    if (n.sentiment) line += ` (Stimmung: ${n.sentiment})`;
    if (n.tickers && n.tickers.length) line += ` (Ticker: ${n.tickers.join(', ')})`;
    return line;
  }).join('\n');

  if (!newsText) {
    console.log('⚠️ Keine News für Analyse');
    return { entscheidung: 'WARTEN', brief: 'Keine aktuellen News verfügbar.' };
  }

  const prompt = `Du bist ein globaler Makro- und Hype-Analyst mit islamischer Ethik und Insider-Denken.
Fokus: Space Tech (SpaceX), Quantencomputer, KI, Rohstoffe, Halbleiter.

KERNPRINZIP: Die Nachricht ist die Oberfläche. Das Geld zeigt die Wahrheit.
KERNFRAGE: Wenn ein Sektor bullish ist – welche PERIPHEREN, oft übersehenen Assets profitieren mit Verzögerung?
Beispiel: SpaceX-Hype -> Kupfer, Spezialmetalle, Satelliten-Zulieferer steigen später nach.
Du bekommst News aus 4 Quellen, teils MIT Sentiment-Score und betroffenen Ticker-Symbolen. Nutze diese Sentiment-Daten um die Marktstimmung präzise einzuschätzen.

DATEN:
Datum: ${dateStr}
Kurse: ${priceCtx}
Fear & Greed: ${fg}/100

NEWS (4 Quellen, mit Sentiment/Ticker wo vorhanden):
${newsText}

Analysiere ALLE Felder gründlich. Antworte NUR mit validem JSON ohne Backticks:
{
  "oberflaeche": ["Quelle: Headline 1", "Quelle: Headline 2", "Quelle: Headline 3"],
  "hypeNews": ["Kurzthema 1", "Kurzthema 2"],
  "hypeCenter": "Welcher Sektor ist heute der stärkste Hype und warum",
  "peripherEffect": "Welche kleineren/verzögerten Assets profitieren vom Hype",
  "narrativ": "Was die Masse aus diesen News glaubt",
  "realitaet": "Was wirklich dahinter steckt und verschwiegen wird",
  "macht": "Wer konkret profitiert – Firmen, Institutionen",
  "geopolitik": "Ressourcen, Allianzen, BRICS vs G7, De-Dollarisierung",
  "liquiditaet": "Wohin fließt das Kapital konkret",
  "kette": "Ereignis A -> B -> C -> D",
  "timing": "Früh/Mitte/Spät im Trend + Begründung",
  "saisonalitaet": "Historisches Muster für diesen Monat",
  "masseFehler": "Was 95 Prozent falsch sehen – der Edge",
  "widerspruch": "Signal-Konflikt ja/nein + Erklärung",
  "markt": "Gold steigt/faellt | Silber | Öl | Bitcoin | DAX | EUR/USD – kurze Richtung je Asset",
  "opportunity": "Konkrete Chance oder null",
  "positionierung": "Smart Money / Sentiment-Einschätzung aus den Ticker-Daten",
  "reflexivitaet": "Feedback-Loop konkret",
  "asymmetrie": { "verlust": 8, "gewinn": 18, "ratio": 2.3, "ev": 0.12 },
  "metaZyklus": "Stagflation/Wachstum/Krise/Umbruch",
  "halalAsset": "Asset + ISIN (z.B. Xetra-Gold DE000A0S9GB0)",
  "halalStatus": "halal",
  "halalBegruendung": "AAOIFI-konform in 1 Satz",
  "purification": "0.00",
  "entscheidung": "JA/NEIN/WARTEN",
  "richtung": "LONG/SHORT/null",
  "einstieg": "Preis z.B. 30.50€",
  "stopLoss": "Preis z.B. 28.10€",
  "ziel": "Preis z.B. 36.00€",
  "zeitraum": "z.B. 4-8 Wochen",
  "einsatz": 3.13,
  "exitStrategie": "Konkrete Exit-Regel",
  "waehrungsrisiko": "EUR/USD Effekt auf den Trade",
  "psychologie": "FOMO/PANIK Warnung oder null",
  "ruhigerTag": false,
  "lernpunkt": "Begriff: 3 Sätze Erklärung für Einsteiger",
  "tagesfrage": "Eine Denkfrage ohne Antwortpflicht",
  "brief": "4-5 Sätze persönlicher Mentor-Brief an Ayman über die heutigen News"
}`;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192, responseMimeType: "application/json" }
  });

  console.log('🤖 Starte KI-Analyse...');
  return new Promise((resolve) => {
    const key = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
    const timeout = setTimeout(() => { console.log('⏱️ Gemini Timeout'); resolve({}); }, 30000);
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
          if (parsed.error) {
            console.log('❌ Gemini API Fehler:', JSON.stringify(parsed.error).substring(0, 300));
            return resolve({});
          }
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) {
            console.log('❌ Gemini leere Antwort. Rohdaten:', data.substring(0, 300));
            return resolve({});
          }
          const analyzed = JSON.parse(text.replace(/```json|```/g, '').trim());
          console.log('✅ KI-Analyse fertig, Felder:', Object.keys(analyzed).length);
          resolve(analyzed);
        } catch (e) { console.log('❌ Parse Error:', e.message, '| Rohdaten:', data.substring(0, 200)); resolve({}); }
      });
    });
    req.on('error', (e) => { clearTimeout(timeout); console.log('❌ Gemini Error:', e.message); resolve({}); });
    req.write(body);
    req.end();
  });
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Starte Multi-Source Analyse...');
  const start = Date.now();

  const [news, prices, fgHistory] = await Promise.all([
    fetchAllNews(),
    fetchPrices(),
    fetchFearGreed()
  ]);
  console.log(`😱 Fear & Greed: ${fgHistory[fgHistory.length-1]}`);

  const analysis = await generateAnalysis(news, prices, fgHistory);

  const fg = fgHistory[fgHistory.length - 1];
  const goldMomentum = prices['GC=F']?.change || 0;
  const sim = runSimulation(fg, goldMomentum);
  const dateStr = new Date().toLocaleDateString('de-DE', {weekday:'long',year:'numeric',month:'long',day:'numeric'});

  if (!fs.existsSync('public')) fs.mkdirSync('public');
  const output = {
    date: dateStr,
    generatedAt: new Date().toISOString(),
    news,
    sections: analysis,
    prices,
    fearGreed: fgHistory,
    simulation: sim
  };
  fs.writeFileSync('public/briefing.json', JSON.stringify(output, null, 2));
  const dur = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`💾 Gespeichert · ⏱️ ${dur}s · ✅ Fertig!`);
}

main().catch(console.error);
