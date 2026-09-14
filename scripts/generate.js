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

// ── QUELLE 1: GNEWS – BREIT über den ganzen Markt ──────────────────────────
async function fetchGNews() {
  const key = process.env.GNEWS_API_KEY;
  if (!key) { console.log('⚠️ GNews Key fehlt'); return []; }
  const out = [];
  // Breit gestreut: Energie, Zinsen, Währungen, Rohstoffe, Geopolitik, Banken, Industrie
  const queries = ['wirtschaft zinsen', 'energie öl gas', 'euro dollar währung', 'gold rohstoffe metalle', 'geopolitik handel', 'aktien börse', 'inflation notenbank'];
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

// ── QUELLE 2: ALPHA VANTAGE – BREITE Topics + Sentiment/Ticker ─────────────
async function fetchAlphaVantage() {
  const key = process.env.ALPHAVANTAGE_KEY;
  if (!key) { console.log('⚠️ AlphaVantage Key fehlt'); return []; }
  // Alle wichtigen Sektoren, nicht nur Tech
  const topics = 'financial_markets,economy_macro,economy_monetary,energy_transportation,finance,manufacturing,real_estate,technology,life_sciences';
  const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=${topics}&sort=LATEST&limit=25&apikey=${key}`;
  const data = await fetchJSON(url);
  const out = [];
  if (data?.feed) {
    data.feed.slice(0, 20).forEach(a => {
      const tickers = (a.ticker_sentiment || []).slice(0, 3).map(t => `${t.ticker}(${parseFloat(t.ticker_sentiment_score).toFixed(2)})`);
      out.push({
        title: a.title, source: a.source || 'AlphaVantage',
        sentiment: a.overall_sentiment_label || null, tickers, origin: 'AlphaVantage'
      });
    });
  }
  console.log(`📡 AlphaVantage: ${out.length} News (mit Sentiment)`);
  return out;
}

// ── QUELLE 3: FINNHUB – Markt-News ─────────────────────────────────────────
async function fetchFinnhub() {
  const key = process.env.FINNHUB_KEY;
  if (!key) { console.log('⚠️ Finnhub Key fehlt'); return []; }
  const url = `https://finnhub.io/api/v1/news?category=general&token=${key}`;
  const data = await fetchJSON(url);
  const out = [];
  if (Array.isArray(data)) {
    data.slice(0, 15).forEach(a => out.push({
      title: a.headline, source: a.source || 'Finnhub', sentiment: null, tickers: [], origin: 'Finnhub'
    }));
  }
  console.log(`📡 Finnhub: ${out.length} News`);
  return out;
}

// ── QUELLE 4: MARKETAUX – News + Entity Sentiment ──────────────────────────
async function fetchMarketaux() {
  const key = process.env.MARKETAUX_KEY;
  if (!key) { console.log('⚠️ Marketaux Key fehlt'); return []; }
  const url = `https://api.marketaux.com/v1/news/all?language=en&filter_entities=true&limit=10&api_token=${key}`;
  const data = await fetchJSON(url);
  const out = [];
  if (data?.data) {
    data.data.forEach(a => {
      const tickers = (a.entities || []).slice(0, 3).map(e => `${e.symbol}(${e.sentiment_score != null ? e.sentiment_score.toFixed(2) : '?'})`);
      out.push({ title: a.title, source: a.source || 'Marketaux', sentiment: null, tickers, origin: 'Marketaux' });
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
  const unique = {};
  all.forEach(n => { if (!n.title) return; const k = n.title.toLowerCase().substring(0, 40); if (!unique[k]) unique[k] = n; });
  const deduped = Object.values(unique);
  console.log(`✅ Gesamt: ${all.length} News, nach Dedup: ${deduped.length}`);
  return deduped.slice(0, 30);
}

// ── KURSE – breiteres Universum ────────────────────────────────────────────
async function fetchPrices() {
  const symbols = ['GC=F','SI=F','HG=F','CL=F','NG=F','BTC-USD','ETH-USD','^GDAXI','^GSPC','^IXIC','EURUSD=X','DX-Y.NYB','^TNX','ZW=F'];
  const labels  = {'GC=F':'Gold','SI=F':'Silber','HG=F':'Kupfer','CL=F':'Öl','NG=F':'Erdgas','BTC-USD':'Bitcoin','ETH-USD':'Ethereum','^GDAXI':'DAX','^GSPC':'S&P 500','^IXIC':'Nasdaq','EURUSD=X':'EUR/USD','DX-Y.NYB':'DXY','^TNX':'US 10J Zins','ZW=F':'Weizen'};
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

// ── SIMULATION – jetzt marktbreit + an Analyse gekoppelt ───────────────────
function runSimulation(fg, prices, chancen) {
  // Marktbreite: wie viele Assets steigen vs fallen
  const changes = Object.values(prices).map(p => p.change).filter(c => typeof c === 'number');
  const up = changes.filter(c => c > 0.1).length;
  const down = changes.filter(c => c < -0.1).length;
  const total = changes.length || 1;
  const breadthBuy = up / total;      // 0..1
  const breadthSell = down / total;

  // Stimmung: Fear = Kaufgelegenheit (contrarian), Greed = Vorsicht
  const fgBuy = fg < 30 ? 0.3 : fg < 45 ? 0.15 : 0;
  const fgSell = fg > 70 ? 0.3 : fg > 55 ? 0.15 : 0;

  // Analyse-Signal: Anzahl LONG-Chancen der KI
  const longs = (chancen || []).filter(c => (c.richtung || '').toUpperCase().includes('LONG')).length;
  const avoids = (chancen || []).filter(c => /MEIDEN|SHORT|REDUZIEREN/.test((c.richtung || '').toUpperCase())).length;
  const convBuy = Math.min(0.3, longs * 0.1);
  const convSell = Math.min(0.3, avoids * 0.1);

  let buy = Math.round((breadthBuy * 0.4 + fgBuy + convBuy) * 100);
  let sell = Math.round((breadthSell * 0.4 + fgSell + convSell) * 100);
  buy = Math.max(0, Math.min(100, buy));
  sell = Math.max(0, Math.min(100, sell));
  let hold = Math.max(0, 100 - buy - sell);
  return { buy, hold, sell };
}

// ── TRADE REPUBLIC ASSET-UNIVERSUM (dem Modell als Auswahl geben) ──────────
const TR_UNIVERSE = `
AKTIEN-ETFs: iShares Core MSCI World (IE00B4L5Y983), Invesco S&P 500 (IE00B3YCGJ38), iShares Nasdaq 100 (IE00B53SZB19), iShares Core MSCI EM IMI (IE00BKM4GZ66), iShares MSCI World Islamic (IE00B27YCK28), HANetf S&P Global Clean Energy.
SEKTOR/THEMEN-ETFs: iShares Automation & Robotics (IE00BYZK4552), VanEck Defense (IE000YYE6WK5), iShares MSCI Semiconductors, VanEck Uranium & Nuclear, L&G Battery Value-Chain, iShares Healthcare, Amundi MSCI Banks.
ROHSTOFFE (ETC): Xetra-Gold (DE000A0S9GB0), WisdomTree Physical Silver (JE00B1VS3333), WisdomTree Brent Oil, WisdomTree Copper, WisdomTree Industrial Metals, WisdomTree Wheat, WisdomTree Natural Gas.
KRYPTO: Bitcoin, Ethereum (Spot auf TR).
EINZELAKTIEN (Beispiele): ASML, TSMC, Nvidia, Shell, TotalEnergies, Rheinmetall, Novo Nordisk, JPMorgan, Caterpillar, Freeport-McMoRan.
ZINS/ANLEIHEN (meist NICHT halal – nur zur Einordnung): iShares US Treasury ETFs.
`;

// ── GEMINI ANALYSE ──────────────────────────────────────────────────────────
async function generateAnalysis(news, prices, fgHistory) {
  const fg = fgHistory[fgHistory.length - 1];
  const priceCtx = Object.values(prices).map(d => `${d.label}: ${d.price > 100 ? d.price.toFixed(0) : d.price.toFixed(4)} (${d.change >= 0 ? '+' : ''}${d.change.toFixed(2)}%)`).join(', ');
  const dateStr = new Date().toLocaleDateString('de-DE', {weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const newsText = news.slice(0, 25).map(n => {
    let line = `[${n.origin}] ${n.source}: ${n.title}`;
    if (n.sentiment) line += ` (Stimmung: ${n.sentiment})`;
    if (n.tickers && n.tickers.length) line += ` (Ticker: ${n.tickers.join(', ')})`;
    return line;
  }).join('\n');

  if (!newsText) return { entscheidung: 'WARTEN', brief: 'Keine aktuellen News verfügbar.' };

  const prompt = `Du bist ein globaler Makro-Stratege, der dem 20-jährigen Ayman beibringt, wie die Welt über Geldflüsse zusammenhängt. Er investiert klein (ca. 50€) über Trade Republic und will HALAL bleiben, aber vor allem VERSTEHEN.

DEINE AUFGABE HEUTE:
1. Nimm das GESAMTE Marktgeschehen aus den News und Kursen – Energie, Zinsen, Währungen, Rohstoffe, Aktien, Krypto, Geopolitik, Agrar. NICHT nur Tech/KI.
2. Zerlege die wichtigsten Bewegungen in KLARE WIRKUNGSKETTEN: Wenn A passiert, was folgt für B, C, D? (z.B. "Ölpreis steigt -> Fluglinien-Kosten hoch -> Airlines fallen, aber Energiewerte steigen -> Inflationsdruck -> Anleihen fallen -> Gold profitiert").
3. Für JEDE Kette: was ist daraus KONKRET investierbar auf Trade Republic?
4. Gib eine RANGLISTE von 3-5 Chancen quer über VERSCHIEDENE Assetklassen. NICHT jeden Tag dasselbe. NICHT automatisch Gold – erwähne Gold nur wenn die News es wirklich hergeben.

WICHTIGE REGELN:
- Erklär jede Verbindung so, dass ein Anfänger den Mechanismus versteht ("warum" nicht nur "was").
- Sei konkret mit Zahlen (Einstieg, Stop, Ziel) aus den echten Kursen.
- Halal: Aktien/ETFs die Zins/Alkohol/Waffen/Glücksspiel dominieren = nicht halal. Gold/Silber/Industrie/Tech/Gesundheit meist ok. Short über Derivate = haram (stattdessen "MEIDEN/REDUZIEREN"). Kennzeichne jede Chance mit halal-Status.
- Variiere Tag für Tag. Wenn heute Energie das Thema ist, red über Energie – nicht über Gold.

VERFÜGBARES ASSET-UNIVERSUM (wähle daraus):${TR_UNIVERSE}

DATEN:
Datum: ${dateStr}
Kurse: ${priceCtx}
Fear & Greed: ${fg}/100

NEWS (4 Quellen, mit Sentiment/Ticker wo vorhanden):
${newsText}

Antworte NUR mit validem JSON (alle Felder ausfüllen, deutsch):
{
  "brief": "4-5 Sätze Mentor-Brief an Ayman: was ist heute DAS Thema und warum",
  "marktlage": "1-2 Sätze Gesamtbild des Tages",
  "oberflaeche": ["Quelle: Headline 1", "Quelle: Headline 2", "Quelle: Headline 3"],
  "bewegungen": [
    {
      "ausloeser": "Was ist passiert (aus News/Kursen)",
      "kette": "A steigt -> B faellt -> C steigt (klare Mechanik)",
      "warum": "Warum diese Kette funktioniert – für Anfänger erklärt",
      "betroffen": "Welche Sektoren/Assets konkret betroffen sind",
      "investierbar": { "asset": "Instrument auf TR", "isin": "ISIN oder null", "richtung": "LONG/MEIDEN/REDUZIEREN", "halal": "halal/nicht-halal/fraglich", "wie": "1 Satz konkret" }
    }
  ],
  "chancen": [
    { "rang": 1, "asset": "Name", "isin": "ISIN oder null", "klasse": "Aktien-ETF/Rohstoff/Krypto/Einzelaktie/Sektor-ETF", "richtung": "LONG/MEIDEN/REDUZIEREN", "halal": "halal/nicht-halal/fraglich", "einstieg": "Preis", "stopLoss": "Preis", "ziel": "Preis", "zeitraum": "z.B. 4-8 Wochen", "kette": "die Wirkungskette die diese Chance erzeugt", "konfidenz": 65 }
  ],
  "narrativ": "Was die Masse glaubt",
  "realitaet": "Was wirklich dahinter steckt",
  "macht": "Wer profitiert konkret",
  "geopolitik": "Geopolitische Treiber",
  "liquiditaet": "Wohin fließt Kapital",
  "kette": "Die wichtigste Kausalkette des Tages",
  "timing": "Wo im Zyklus",
  "saisonalitaet": "Saisonales Muster",
  "masseFehler": "Was 95% falsch sehen",
  "widerspruch": "Signal-Konflikt oder 'kein'",
  "markt": "Kurzrichtung je Asset",
  "positionierung": "Smart Money aus Sentiment-Daten",
  "reflexivitaet": "Feedback-Loop",
  "metaZyklus": "Stagflation/Wachstum/Krise/Umbruch",
  "psychologie": "FOMO/PANIK Warnung oder null",
  "halalAsset": "Bestes halal Instrument der Top-Chance + ISIN",
  "halalStatus": "halal/zweifelhaft/nicht-halal",
  "halalBegruendung": "1 Satz",
  "entscheidung": "JA/NEIN/WARTEN (basierend auf bester HALAL Chance)",
  "richtung": "LONG/null",
  "einstieg": "Preis der Top-Chance",
  "stopLoss": "Preis",
  "ziel": "Preis",
  "einsatz": 3.13,
  "exitStrategie": "Konkrete Exit-Regel",
  "waehrungsrisiko": "EUR/USD Effekt",
  "asymmetrie": { "verlust": 8, "gewinn": 18, "ratio": 2.3, "ev": 0.12 },
  "lernpunkt": "Ein Marktmechanismus heute erklärt (3 Sätze) – variiere das Thema täglich",
  "tagesfrage": "Eine Denkfrage"
}`;

  const tryModel = (model) => new Promise((resolve) => {
    const key = process.env.GEMINI_API_KEY;
    const genConfig = { temperature: 0.65, maxOutputTokens: 8192, responseMimeType: "application/json" };
    if (model.includes('2.5')) genConfig.thinkingConfig = { thinkingBudget: 0 };
    const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: genConfig });
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const timeout = setTimeout(() => resolve({ ok: false, status: 'timeout' }), 60000);
    const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        clearTimeout(timeout);
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return resolve({ ok: false, status: parsed.error.code || 'error', msg: parsed.error.message });
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) return resolve({ ok: false, status: 'empty' });
          return resolve({ ok: true, data: JSON.parse(text.replace(/```json|```/g, '').trim()) });
        } catch (e) { return resolve({ ok: false, status: 'parse', msg: e.message }); }
      });
    });
    req.on('error', (e) => { clearTimeout(timeout); resolve({ ok: false, status: 'neterror', msg: e.message }); });
    req.write(body); req.end();
  });

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const models = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash'];
  console.log('🤖 Starte KI-Analyse...');
  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await tryModel(model);
      if (res.ok) { console.log(`✅ KI-Analyse fertig (${model}), Felder: ${Object.keys(res.data).length}`); return res.data; }
      if (res.status === 503 || res.status === 'timeout' || res.status === 429) {
        console.log(`⏳ ${model} überlastet (${res.status}), Versuch ${attempt}/2, warte...`);
        await sleep(attempt * 10000); continue;
      }
      console.log(`⚠️ ${model} Fehler (${res.status}): ${(res.msg || '').substring(0, 120)} → nächstes Modell`);
      break;
    }
  }
  console.log('❌ Alle Modelle fehlgeschlagen');
  return {};
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Starte Multi-Source Analyse...');
  const start = Date.now();
  const [news, prices, fgHistory] = await Promise.all([fetchAllNews(), fetchPrices(), fetchFearGreed()]);
  console.log(`😱 Fear & Greed: ${fgHistory[fgHistory.length-1]}`);

  const analysis = await generateAnalysis(news, prices, fgHistory);

  const fg = fgHistory[fgHistory.length - 1];
  const sim = runSimulation(fg, prices, analysis.chancen);
  const dateStr = new Date().toLocaleDateString('de-DE', {weekday:'long',year:'numeric',month:'long',day:'numeric'});

  if (!fs.existsSync('public')) fs.mkdirSync('public');
  const output = { date: dateStr, generatedAt: new Date().toISOString(), news, sections: analysis, prices, fearGreed: fgHistory, simulation: sim };
  fs.writeFileSync('public/briefing.json', JSON.stringify(output, null, 2));
  const dur = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`💾 Gespeichert · ⏱️ ${dur}s · ✅ Fertig!`);
}

main().catch(console.error);
