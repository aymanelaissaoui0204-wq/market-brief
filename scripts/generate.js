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

// ── NEWS HOLEN ────────────────────────────────────────────────────────────────
async function fetchNews() {
  const news = [];

  // NewsData.io
  try {
    const key = process.env.NEWSDATA_API_KEY;
    const url = `https://newsdata.io/api/1/news?apikey=${key}&language=de&category=business&q=wirtschaft+finanzen+inflation+zins`;
    const data = await fetchJSON(url);
    if (data?.results) {
      data.results.slice(0, 5).forEach(a => news.push(`${a.source_id}: ${a.title}`));
    }
  } catch (e) { console.log('NewsData Fehler:', e.message); }

  // Tagesschau RSS
  try {
    const rss = await fetchText('https://www.tagesschau.de/wirtschaft/rss2');
    const titles = [...rss.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)].slice(1, 5);
    titles.forEach(m => news.push(`Tagesschau: ${m[1]}`));
  } catch (e) { console.log('Tagesschau Fehler:', e.message); }

  // EZB RSS
  try {
    const rss = await fetchText('https://www.ecb.europa.eu/rss/press.html');
    const titles = [...rss.matchAll(/<title>(.*?)<\/title>/g)].slice(1, 3);
    titles.forEach(m => news.push(`EZB: ${m[1].replace(/<[^>]*>/g, '')}`));
  } catch (e) { console.log('EZB Fehler:', e.message); }

  // Fed RSS
  try {
    const rss = await fetchText('https://www.federalreserve.gov/feeds/press_all.xml');
    const titles = [...rss.matchAll(/<title>(.*?)<\/title>/g)].slice(1, 3);
    titles.forEach(m => news.push(`Fed: ${m[1].replace(/<[^>]*>/g, '')}`));
  } catch (e) { console.log('Fed Fehler:', e.message); }

  return news.filter(Boolean).slice(0, 10);
}

// ── KURSE HOLEN ───────────────────────────────────────────────────────────────
async function fetchPrices() {
  const symbols = ['GC=F','SI=F','CL=F','HG=F','BTC-USD','^GDAXI','DX-Y.NYB','EURUSD=X','^TNX'];
  const labels  = {'GC=F':'Gold','SI=F':'Silber','CL=F':'Öl','HG=F':'Kupfer','BTC-USD':'Bitcoin','^GDAXI':'DAX','DX-Y.NYB':'DXY','EURUSD=X':'EUR/USD','^TNX':'10Y'};
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

// ── GEMINI ANALYSE ────────────────────────────────────────────────────────────
async function generateAnalysis(news, prices, fgHistory) {
  const fg = fgHistory[fgHistory.length - 1];
  const fgTrend = fgHistory.length > 1 ? (fgHistory[fgHistory.length-1] > fgHistory[0] ? 'steigend' : 'fallend') : 'neutral';
  const priceCtx = Object.values(prices).map(d => `${d.label}: ${d.price > 100 ? d.price.toFixed(0) : d.price.toFixed(4)} (${d.change >= 0 ? '+' : ''}${d.change.toFixed(2)}%)`).join(', ');
  const dateStr = new Date().toLocaleDateString('de-DE', {weekday:'long',year:'numeric',month:'long',day:'numeric'});

  const prompt = `Du bist ein globaler Makro-Analyst mit islamischer Ethik und Insider-Denken.

KERNPRINZIP: Die Nachricht ist die Oberfläche. Das Geld zeigt die Wahrheit.
80% der News irrelevant. 15% manipulativ. 5% sind Gold.
Kein Trade ist oft die beste Entscheidung.

DATEN:
Datum: ${dateStr}
Kurse: ${priceCtx}
Fear & Greed: ${fg}/100 (Trend: ${fgTrend})

NACHRICHTEN:
${news.join('\n')}

Antworte NUR mit validem JSON ohne Markdown-Backticks:
{
  "oberflaeche": ["Quelle: Headline"],
  "narrativ": "Was die Masse glaubt",
  "realitaet": "Was wirklich passiert",
  "macht": "Wer profitiert konkret",
  "geopolitik": "Ressourcen, Allianzen, BRICS, De-Dollarisierung",
  "liquiditaet": "Wohin fließt Kapital",
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
  "einstieg": "Preis mit €/$",
  "stopLoss": "ATR-basierter Preis",
  "ziel": "Zielpreis",
  "zeitraum": "z.B. 4-8 Wochen",
  "einsatz": 3.13,
  "exitStrategie": "Konkrete Exit-Regel",
  "waehrungsrisiko": "EUR/USD Effekt",
  "psychologie": "FOMO/PANIK Warnung oder null",
  "ruhigerTag": false,
  "lernpunkt": "Begriff: 3 Sätze Erklärung",
  "tagesfrage": "Eine Denkfrage",
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
          resolve(JSON.parse(text.replace(/```json|```/g, '').trim()));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── OBSIDIAN MARKDOWN GENERIEREN ─────────────────────────────────────────────
function generateObsidianMarkdown(date, analysis, prices, fg, sim) {
  const dateISO = new Date().toISOString().slice(0, 10);
  const priceLines = Object.values(prices).map(d =>
    `| ${d.label} | ${d.price > 100 ? d.price.toFixed(0) : d.price.toFixed(4)} | ${d.change >= 0 ? '+' : ''}${d.change.toFixed(2)}% |`
  ).join('\n');

  const entscheidungEmoji = analysis.entscheidung === 'JA' ? '✅' : analysis.entscheidung === 'NEIN' ? '❌' : '⏳';

  return `---
date: ${dateISO}
tags: [market-brief, trading, halal]
entscheidung: ${analysis.entscheidung || 'WARTEN'}
asset: "${analysis.halalAsset || ''}"
---

# 📊 Market Brief – ${date}

## ✉️ Persönlicher Brief
${analysis.brief || ''}

---

## 📰 Oberfläche
${(analysis.oberflaeche || []).map(n => `- ${n}`).join('\n')}

## 🎭 Narrativ
${analysis.narrativ || ''}

## 🧠 Realität
${analysis.realitaet || ''}

## 🧑‍💼 Macht & Interessen
${analysis.macht || ''}

## 🌐 Geopolitik
${analysis.geopolitik || ''}

## 💸 Liquiditäts-Fluss
${analysis.liquiditaet || ''}

## 🔗 Kettenreaktion
${analysis.kette || ''}

## ⏱ Timing
${analysis.timing || ''}

## ⚠️ Masse-Fehler
${analysis.masseFehler || ''}

---

## 📊 Marktreaktionen
${analysis.markt || ''}

### Kurse
| Asset | Kurs | Änderung |
|-------|------|----------|
${priceLines}

### Fear & Greed Index
${fg}/100

### 1000-Agenten-Simulation
| Kaufen | Halten | Verkaufen |
|--------|--------|-----------|
| ${sim.buy}% | ${sim.hold}% | ${sim.sell}% |

---

## 🎯 Entscheidung ${entscheidungEmoji}

**${analysis.entscheidung || 'WARTEN'}**

${analysis.entscheidung === 'JA' ? `
| Feld | Wert |
|------|------|
| Asset | ${analysis.halalAsset || ''} |
| Richtung | ${analysis.richtung || ''} |
| Einstieg | ${analysis.einstieg || ''} |
| Stop-Loss | ${analysis.stopLoss || ''} |
| Ziel | ${analysis.ziel || ''} |
| Zeitraum | ${analysis.zeitraum || ''} |
| Einsatz | ${analysis.einsatz || 3.13}€ |

**Exit Strategie:** ${analysis.exitStrategie || ''}

**Währungsrisiko:** ${analysis.waehrungsrisiko || ''}
` : '_Kein Trade heute._'}

---

## ☪️ Halal Check
**${analysis.halalStatus === 'halal' ? '✅' : analysis.halalStatus === 'zweifelhaft' ? '⚠️' : '❌'} ${analysis.halalAsset || ''}**

${analysis.halalBegruendung || ''}

${parseFloat(analysis.purification || '0') > 0 ? `**Reinigung:** ${analysis.purification}€ pro 100€ Dividende spenden.` : ''}

---

## ⚖️ Asymmetrie
- Verlust-Risiko: ${analysis.asymmetrie?.verlust || 0}%
- Gewinn-Potenzial: ${analysis.asymmetrie?.gewinn || 0}%
- Ratio: 1:${analysis.asymmetrie?.ratio || 0}
- Expected Value: ${analysis.asymmetrie?.ev || 0}

---

## 🌀 Meta-Zyklus
${analysis.metaZyklus || ''}

## 🧬 Smart Money (COT)
${analysis.positionierung || ''}

## 🔄 Reflexivität
${analysis.reflexivitaet || ''}

---

## 📖 Lernpunkt
${analysis.lernpunkt || ''}

## ❓ Tagesfrage
> ${analysis.tagesfrage || ''}

---
*Generiert um ${new Date().toLocaleTimeString('de-DE')} Uhr · Kein Finanzrat · ☪️ Halal only*
`;
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
    analysis = {
      entscheidung: 'WARTEN',
      ruhigerTag: true,
      brief: 'Heute konnte keine Analyse erstellt werden. Bitte manuell News eingeben.'
    };
  }

  const fg = fgHistory[fgHistory.length - 1];
  const goldMomentum = prices['GC=F']?.change || 0;
  const sim = runSimulation(fg, goldMomentum);
  const dateStr = new Date().toLocaleDateString('de-DE', {weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const dateISO = new Date().toISOString().slice(0, 10);

  // ── JSON für die App speichern ──
  if (!fs.existsSync('public')) fs.mkdirSync('public');
  const output = {
    date: dateStr,
    generatedAt: new Date().toISOString(),
    sections: analysis,
    prices,
    fearGreed: fgHistory,
    simulation: sim,
    news
  };
  fs.writeFileSync('public/briefing.json', JSON.stringify(output, null, 2));
  console.log('💾 public/briefing.json gespeichert');

  // ── Markdown für Obsidian speichern ──
  const obsidianDir = 'obsidian-vault/Market Brief';
  if (!fs.existsSync('obsidian-vault')) fs.mkdirSync('obsidian-vault');
  if (!fs.existsSync(obsidianDir)) fs.mkdirSync(obsidianDir, { recursive: true });
  const markdown = generateObsidianMarkdown(dateStr, analysis, prices, fg, sim);
  fs.writeFileSync(`${obsidianDir}/${dateISO}.md`, markdown);
  console.log(`📓 Obsidian Markdown gespeichert: ${dateISO}.md`);

  console.log('✅ Fertig!');
}

main().catch(console.error);
