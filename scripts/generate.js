import fs from 'fs';
import https from 'https';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// ═══ EINSTELLUNGEN ═══════════════════════════════════════════════════════
export const BUDGET = 50;          // geplanter Einsatz pro Idee in €
export const GEBUEHR_RUNDE = 2;    // Trade Republic: 1 € Kauf + 1 € Verkauf
const ARCHIV_DIR = 'public/archive';
const OBSIDIAN_DIR = 'obsidian-vault/Market Brief';
const OBSIDIAN_MAERKTE = 'obsidian-vault/Märkte';
const MAX_HALTEDAUER = 40;         // Handelstage bis "abgelaufen"
const MAX_AUSLOESE_TAGE = 10;      // so lange darf der Einstieg auf sich warten lassen

// ── HELPER ───────────────────────────────────────────────────────────────
const fetchJSON = (url) => new Promise((resolve) => {
  const timeout = setTimeout(() => resolve(null), 10000);
  https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => { clearTimeout(timeout); try { resolve(JSON.parse(data)); } catch { resolve(null); } });
  }).on('error', () => { clearTimeout(timeout); resolve(null); });
});
export const berlinDateKey = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); // YYYY-MM-DD
const isoUTC = (unix) => new Date(unix * 1000).toISOString().slice(0, 10);
const r2 = (x) => (x == null || isNaN(x)) ? null : Math.round(x * 100) / 100;

// ═══ NEWS (4 Quellen, breit über den ganzen Markt) ═══════════════════════
async function fetchGNews() {
  const key = process.env.GNEWS_API_KEY;
  if (!key) { console.log('⚠️ GNews Key fehlt'); return []; }
  const out = [];
  const queries = ['wirtschaft zinsen', 'energie öl gas', 'euro dollar währung', 'gold rohstoffe metalle', 'geopolitik handel', 'aktien börse', 'inflation notenbank'];
  for (const q of queries) {
    const data = await fetchJSON(`https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&token=${key}&lang=de&max=2`);
    if (data?.articles) data.articles.forEach(a => out.push({ title: a.title, source: a.source?.name || 'GNews', publishedAt: a.publishedAt || null, sentiment: null, tickers: [], origin: 'GNews' }));
  }
  console.log(`📡 GNews: ${out.length}`);
  return out;
}
async function fetchAlphaVantage() {
  const key = process.env.ALPHAVANTAGE_KEY;
  if (!key) { console.log('⚠️ AlphaVantage Key fehlt'); return []; }
  const topics = 'financial_markets,economy_macro,economy_monetary,energy_transportation,finance,manufacturing,real_estate,technology,life_sciences';
  const data = await fetchJSON(`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=${topics}&sort=LATEST&limit=25&apikey=${key}`);
  const out = [];
  if (data?.feed) data.feed.slice(0, 20).forEach(a => out.push({
    title: a.title, source: a.source || 'AlphaVantage', publishedAt: a.time_published || null,
    sentiment: a.overall_sentiment_label || null,
    tickers: (a.ticker_sentiment || []).slice(0, 3).map(t => `${t.ticker}(${parseFloat(t.ticker_sentiment_score).toFixed(2)})`),
    origin: 'AlphaVantage'
  }));
  console.log(`📡 AlphaVantage: ${out.length}`);
  return out;
}
async function fetchFinnhub() {
  const key = process.env.FINNHUB_KEY;
  if (!key) { console.log('⚠️ Finnhub Key fehlt'); return []; }
  const data = await fetchJSON(`https://finnhub.io/api/v1/news?category=general&token=${key}`);
  const out = [];
  if (Array.isArray(data)) data.slice(0, 15).forEach(a => out.push({ title: a.headline, source: a.source || 'Finnhub', publishedAt: a.datetime ? new Date(a.datetime * 1000).toISOString() : null, sentiment: null, tickers: [], origin: 'Finnhub' }));
  console.log(`📡 Finnhub: ${out.length}`);
  return out;
}
async function fetchMarketaux() {
  const key = process.env.MARKETAUX_KEY;
  if (!key) { console.log('⚠️ Marketaux Key fehlt'); return []; }
  const data = await fetchJSON(`https://api.marketaux.com/v1/news/all?language=en&filter_entities=true&limit=10&api_token=${key}`);
  const out = [];
  if (data?.data) data.data.forEach(a => out.push({
    title: a.title, source: a.source || 'Marketaux', publishedAt: a.published_at || null, sentiment: null,
    tickers: (a.entities || []).slice(0, 3).map(e => `${e.symbol}(${e.sentiment_score != null ? e.sentiment_score.toFixed(2) : '?'})`),
    origin: 'Marketaux'
  }));
  console.log(`📡 Marketaux: ${out.length}`);
  return out;
}
async function fetchAllNews() {
  const results = await Promise.all([fetchGNews(), fetchAlphaVantage(), fetchFinnhub(), fetchMarketaux()].map(p => p.catch(() => [])));
  const unique = {};
  results.flat().forEach(n => { if (!n.title) return; const k = n.title.toLowerCase().substring(0, 40); if (!unique[k]) unique[k] = n; });
  const news = Object.values(unique).slice(0, 30);
  console.log(`✅ News nach Dedup: ${news.length}`);
  return news;
}

// ═══ MARKTDATEN: Kurse + harte Kennzahlen (vom Code berechnet) ═══════════
export const SYMBOLE = {
  'GC=F': 'Gold', 'SI=F': 'Silber', 'HG=F': 'Kupfer', 'CL=F': 'Öl', 'NG=F': 'Erdgas', 'ZW=F': 'Weizen',
  'BTC-USD': 'Bitcoin', 'ETH-USD': 'Ethereum', '^GDAXI': 'DAX', '^GSPC': 'S&P 500', '^IXIC': 'Nasdaq',
  'EURUSD=X': 'EUR/USD', 'DX-Y.NYB': 'DXY', '^TNX': 'US 10J Zins'
};

export function kennzahlen(bars) {
  const n = bars.length;
  if (n < 2) return null;
  const c = bars.map(b => b.c);
  const last = c[n - 1];
  const pct = (a, b) => (a / b - 1) * 100;
  const zurueck = (k) => n > k ? pct(last, c[n - 1 - k]) : null;
  const fenster = bars.slice(-63); // ~3 Monate
  const hoch = Math.max(...fenster.map(b => b.h)), tief = Math.min(...fenster.map(b => b.l));
  const rets = [];
  for (let i = Math.max(1, n - 20); i < n; i++) rets.push(Math.log(c[i] / c[i - 1]));
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, rets.length - 1));
  const trs = [];
  for (let i = Math.max(1, n - 14); i < n; i++) { const b = bars[i], pc = c[i - 1]; trs.push(Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc))); }
  let g = 0, l = 0, cnt = 0;
  for (let i = Math.max(1, n - 14); i < n; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; cnt++; }
  const rsi = (g === 0 && l === 0) ? 50 : (l === 0 ? 100 : 100 - 100 / (1 + (g / cnt) / (l / cnt)));
  const sma = (k) => n >= k ? c.slice(n - k).reduce((a, b) => a + b, 0) / k : null;
  const s20 = sma(20), s50 = sma(50);
  return {
    price: last, change: r2(zurueck(1)), ch5: r2(zurueck(5)), ch20: r2(zurueck(20)),
    hoch3m: hoch, tief3m: tief, abstandHoch: r2(pct(last, hoch)), abstandTief: r2(pct(last, tief)),
    vola: r2(sd * Math.sqrt(252) * 100), atrPct: r2((trs.reduce((a, b) => a + b, 0) / trs.length) / last * 100),
    rsi: Math.round(rsi), ueberSma20: s20 ? last > s20 : null, ueberSma50: s50 ? last > s50 : null,
    stand: isoUTC(bars[n - 1].t)
  };
}

async function fetchMarktdaten() {
  const prices = {}, bars = {};
  await Promise.all(Object.entries(SYMBOLE).map(async ([sym, label]) => {
    const data = await fetchJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=6mo`);
    const res = data?.chart?.result?.[0];
    const q = res?.indicators?.quote?.[0];
    if (!res?.timestamp || !q) return;
    const b = res.timestamp.map((t, i) => ({ t, h: q.high[i], l: q.low[i], c: q.close[i] })).filter(x => x.h != null && x.l != null && x.c != null);
    const k = kennzahlen(b);
    if (k) { prices[sym] = { label, ...k }; bars[sym] = b; }
  }));
  console.log(`📊 Marktdaten: ${Object.keys(prices).length}/${Object.keys(SYMBOLE).length}`);
  return { prices, bars };
}

async function fetchFearGreed() {
  const data = await fetchJSON('https://api.alternative.me/fng/?limit=7');
  if (data?.data) return data.data.reverse().map(x => parseInt(x.value));
  return [50];
}

// ═══ PRÜFUNG + GEBÜHREN-RECHNUNG PRO IDEE (Code rechnet, nicht die KI) ════
export const parseNum = (x) => {
  if (x == null) return null;
  if (typeof x === 'number') return x;
  let s = String(x).replace(/[^\d.,-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
};

export function pruefeUndRechne(c, prices) {
  const out = { budget: BUDGET, gebuehren: GEBUEHR_RUNDE, hinweise: [], plausibel: false, verifiziert: false };
  const richtung = String(c.richtung || '').toUpperCase();
  const eintrag = Object.entries(prices).find(([, p]) => c.basiswert && p.label.toLowerCase() === String(c.basiswert).toLowerCase());
  const base = eintrag ? eintrag[1] : null;
  if (base) { out.verifiziert = true; out.symbol = eintrag[0]; out.kursAktuell = base.price; out.kursStand = base.stand; }
  if (!richtung.includes('LONG')) { out.hinweise.push('Kein Kauf-Setup (Meiden/Reduzieren) – keine Trade-Rechnung.'); return out; }

  let e = parseNum(c.einstieg), s = parseNum(c.stopLoss), z = parseNum(c.ziel);
  if (!(e && s && z)) { out.hinweise.push('Einstieg, Stop oder Ziel fehlt.'); return out; }
  // "4.023" als Tausenderpunkt gemeint? Dann skalieren (alle drei gleich)
  if (base && Math.abs(e * 1000 / base.price - 1) < 0.2) { e *= 1000; s *= 1000; z *= 1000; }
  if (!(s < e && e < z)) { out.hinweise.push('Unlogisch: Für einen Kauf muss Stop < Einstieg < Ziel gelten.'); return out; }
  out.einstieg = e; out.stop = s; out.ziel = z;

  if (base) {
    out.abstandEinstieg = r2((e / base.price - 1) * 100);
    if (Math.abs(out.abstandEinstieg) > 5) out.hinweise.push(`Einstieg liegt ${out.abstandEinstieg}% vom aktuellen Kurs entfernt – das ist eine Limit-/Stop-Order, kein Sofortkauf.`);
  } else {
    out.hinweise.push('Kein Basiswert-Kurs vorhanden – Level sind nicht gegen echte Daten geprüft.');
  }
  const verlustPct = (e - s) / e * 100, gewinnPct = (z - e) / e * 100;
  const verlustEur = BUDGET * verlustPct / 100 + GEBUEHR_RUNDE;
  const gewinnEur = BUDGET * gewinnPct / 100 - GEBUEHR_RUNDE;
  Object.assign(out, {
    verlustPct: r2(verlustPct), gewinnPct: r2(gewinnPct), verlustEur: r2(verlustEur), gewinnEur: r2(gewinnEur),
    crvBrutto: r2(gewinnPct / verlustPct), crvNetto: r2(gewinnEur > 0 ? gewinnEur / verlustEur : 0),
    breakEven: r2(gewinnEur > 0 ? verlustEur / (verlustEur + gewinnEur) * 100 : 100), plausibel: true
  });
  if (base?.atrPct) {
    out.stopInAtr = r2(verlustPct / base.atrPct);
    if (out.stopInAtr < 1) out.hinweise.push('Stop liegt innerhalb der normalen Tagesschwankung (< 1 ATR) – hohes Risiko, zufällig ausgestoppt zu werden.');
  }
  if (gewinnEur <= 0) out.hinweise.push(`Bei ${BUDGET} € fressen die Gebühren den kompletten Zielgewinn.`);
  else if (out.breakEven > 55) out.hinweise.push(`Bei ${BUDGET} € musst du über ${Math.round(out.breakEven)}% solcher Trades gewinnen, nur um bei null zu landen.`);
  return out;
}

// ═══ PROGNOSE-TRACKER: alte Ideen deterministisch gegen echte Kurse prüfen ═
export function bewerte(r, dateKey, bars) {
  const start = bars.findIndex(b => isoUTC(b.t) > dateKey);
  if (start < 0) return { status: 'offen', info: 'Noch kein Handelstag seit der Prognose.' };
  const vorher = bars[start - 1]?.c ?? r.kursAktuell ?? r.einstieg;
  const kaufStop = r.einstieg >= vorher; // Einstieg über Kurs = Ausbruchs-Kauf, sonst Limit
  let f = -1;
  for (let i = start; i < bars.length && i < start + MAX_AUSLOESE_TAGE; i++) {
    if (kaufStop ? bars[i].h >= r.einstieg : bars[i].l <= r.einstieg) { f = i; break; }
  }
  if (f < 0) {
    return bars.length - start >= MAX_AUSLOESE_TAGE
      ? { status: 'nicht_ausgeloest', info: `Einstieg innerhalb von ${MAX_AUSLOESE_TAGE} Handelstagen nie erreicht.` }
      : { status: 'offen', info: 'Einstieg noch nicht ausgelöst.' };
  }
  for (let i = f; i < bars.length; i++) {
    const tage = i - f + 1;
    if (bars[i].l <= r.stop) return { status: 'stop', am: isoUTC(bars[i].t), tage, ergebnisEur: r2(-r.verlustEur) }; // bei Doppeltreffer konservativ Stop
    if (bars[i].h >= r.ziel) return { status: 'ziel', am: isoUTC(bars[i].t), tage, ergebnisEur: r2(r.gewinnEur) };
    if (tage >= MAX_HALTEDAUER) return { status: 'abgelaufen', am: isoUTC(bars[i].t), tage, ergebnisEur: r2(BUDGET * (bars[i].c / r.einstieg - 1) - GEBUEHR_RUNDE) };
  }
  const lastC = bars[bars.length - 1].c;
  return { status: 'laeuft', seit: isoUTC(bars[f].t), tage: bars.length - f, ergebnisEur: r2(BUDGET * (lastC / r.einstieg - 1) - GEBUEHR_RUNDE) };
}

function ladeArchivTage() {
  if (!fs.existsSync(ARCHIV_DIR)) return [];
  return fs.readdirSync(ARCHIV_DIR).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map(f => {
    try { const d = JSON.parse(fs.readFileSync(`${ARCHIV_DIR}/${f}`, 'utf8')); return { ...d, dateKey: d.dateKey || f.replace('.json', '') }; } catch { return null; }
  }).filter(Boolean);
}

export function baueTracker(archivTage, bars) {
  const alt = (() => { try { return JSON.parse(fs.readFileSync('public/tracker.json', 'utf8')); } catch { return { prognosen: [] }; } })();
  const altMap = Object.fromEntries((alt.prognosen || []).map(p => [p.id, p]));
  const abgeschlossen = new Set(['ziel', 'stop', 'abgelaufen', 'nicht_ausgeloest']);
  const prognosen = [];
  for (const tag of archivTage) {
    (tag.sections?.chancen || []).forEach((c, i) => {
      const r = c.rechnung;
      if (!r?.plausibel || !r.verifiziert || !r.symbol) return;
      const id = `${tag.dateKey}#${c.rang || i + 1}`;
      const vorher = altMap[id];
      const basis = { id, datum: tag.dateKey, asset: c.asset, basiswert: c.basiswert, symbol: r.symbol, ueberzeugung: c.ueberzeugung || null, einstieg: r.einstieg, stop: r.stop, ziel: r.ziel, gewinnEur: r.gewinnEur, verlustEur: r.verlustEur, kette: c.kette || null };
      if (vorher && abgeschlossen.has(vorher.status)) { prognosen.push(vorher); return; } // Ergebnis bleibt eingefroren
      const b = bars[r.symbol];
      prognosen.push(b ? { ...basis, ...bewerte({ ...r }, tag.dateKey, b) } : { ...basis, status: 'offen', info: 'Keine Kursdaten heute.' });
    });
  }
  const zu = prognosen.filter(p => ['ziel', 'stop', 'abgelaufen'].includes(p.status));
  const treffer = zu.filter(p => p.status === 'ziel').length;
  const proStufe = {};
  for (const p of zu) {
    const k = p.ueberzeugung || 'unbekannt';
    proStufe[k] = proStufe[k] || { n: 0, ziel: 0 };
    proStufe[k].n++; if (p.status === 'ziel') proStufe[k].ziel++;
  }
  const summe = zu.reduce((a, p) => a + (p.ergebnisEur || 0), 0);
  return {
    stand: new Date().toISOString(), budget: BUDGET,
    zusammenfassung: {
      gesamt: prognosen.length, geschlossen: zu.length, ziel: treffer,
      stop: zu.filter(p => p.status === 'stop').length, abgelaufen: zu.filter(p => p.status === 'abgelaufen').length,
      nichtAusgeloest: prognosen.filter(p => p.status === 'nicht_ausgeloest').length,
      laufend: prognosen.filter(p => ['laeuft', 'offen'].includes(p.status)).length,
      trefferquote: zu.length ? r2(treffer / zu.length * 100) : null,
      summeEur: r2(summe), schnittEur: zu.length ? r2(summe / zu.length) : null, proStufe
    },
    prognosen: prognosen.sort((a, b) => b.datum.localeCompare(a.datum))
  };
}

// ═══ KI-ANALYSE ════════════════════════════════════════════════════════════
const TR_UNIVERSE = `
AKTIEN-ETFs: iShares Core MSCI World (IE00B4L5Y983), Invesco S&P 500 (IE00B3YCGJ38), iShares Nasdaq 100 (IE00B53SZB19), iShares Core MSCI EM IMI (IE00BKM4GZ66), iShares MSCI World Islamic (IE00B27YCK28).
SEKTOR/THEMEN-ETFs: iShares Automation & Robotics (IE00BYZK4552), VanEck Defense, iShares MSCI Semiconductors, VanEck Uranium & Nuclear, L&G Battery Value-Chain, iShares Healthcare, Amundi MSCI Banks.
ROHSTOFFE (ETC): Xetra-Gold (DE000A0S9GB0), WisdomTree Physical Silver (JE00B1VS3333), WisdomTree Brent Oil, WisdomTree Copper, WisdomTree Industrial Metals, WisdomTree Wheat, WisdomTree Natural Gas.
KRYPTO: Bitcoin, Ethereum.
EINZELAKTIEN (Beispiele): ASML, TSMC, Nvidia, Shell, TotalEnergies, Rheinmetall, Novo Nordisk, JPMorgan, Caterpillar, Freeport-McMoRan.`;

const fmtK = (v) => v == null ? '–' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
const fmtP = (v) => v >= 1000 ? v.toFixed(0) : v >= 10 ? v.toFixed(2) : v.toFixed(4);

function baueGedaechtnis(archivTage, tracker) {
  const z = tracker.zusammenfassung;
  const bilanz = z.geschlossen
    ? `Bisherige Bilanz deiner Ideen: ${z.geschlossen} abgeschlossen, ${z.ziel} Ziel, ${z.stop} Stop, ${z.abgelaufen} abgelaufen, Trefferquote ${z.trefferquote}%, Summe ${z.summeEur} € bei ${BUDGET} € pro Idee nach Gebühren.`
    : 'Noch keine abgeschlossenen Ideen – Bilanz folgt.';
  const offen = tracker.prognosen.filter(p => ['laeuft', 'offen'].includes(p.status)).slice(0, 8)
    .map(p => `- ${p.datum} ${p.asset} (${p.basiswert}) Einstieg ${p.einstieg} / Stop ${p.stop} / Ziel ${p.ziel} → Status: ${p.status}${p.ergebnisEur != null ? `, aktuell ${p.ergebnisEur} €` : ''}. These: ${p.kette || '–'}`).join('\n');
  const themen = archivTage.slice(-5).map(t => `- ${t.dateKey}: ${t.sections?.marktlage || (t.sections?.brief || '').slice(0, 120)}`).join('\n');
  return `${bilanz}\nOFFENE IDEEN AUS DEN LETZTEN TAGEN (nicht umschreiben, nur bewerten):\n${offen || '- keine'}\nTHEMEN DER LETZTEN TAGE (nicht einfach wiederholen):\n${themen || '- keine'}`;
}

async function generateAnalysis(news, prices, fgHistory, gedaechtnis) {
  const fg = fgHistory[fgHistory.length - 1];
  const dateStr = new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Berlin' });
  const marktCtx = Object.values(prices).map(d =>
    `${d.label}: ${fmtP(d.price)} | 1T ${fmtK(d.change)} | 5T ${fmtK(d.ch5)} | 20T ${fmtK(d.ch20)} | vom 3M-Hoch ${fmtK(d.abstandHoch)} | RSI ${d.rsi} | Vola ${d.vola}% | Tagesschwankung (ATR) ${d.atrPct}%`
  ).join('\n');
  const newsText = news.slice(0, 25).map(n => {
    let line = `[${n.origin}] ${n.source}: ${n.title}`;
    if (n.sentiment) line += ` (Stimmung: ${n.sentiment})`;
    if (n.tickers?.length) line += ` (Ticker: ${n.tickers.join(', ')})`;
    return line;
  }).join('\n');
  if (!newsText) return {};
  const basiswerte = Object.values(SYMBOLE).join(', ');

  const prompt = `Du bist ein globaler Makro-Stratege und Lehrer. Ayman (20, Anfänger, Trade Republic, halal) will verstehen, wie die Welt über Geldflüsse zusammenhängt. Er investiert klein. Du schreibst sein tägliches Briefing.

AUFGABEN:
1. EREIGNISSE: Bündle die News zu 3-6 echten Ereignissen. Fünf Artikel über dieselbe Meldung sind EIN Ereignis, keine fünf Bestätigungen. Unterscheide Fakt / Meinung / Spekulation und ob es NEU ist oder schon bekannt.
2. WIRKUNGSKETTEN: Zerlege die wichtigsten Bewegungen über den GANZEN Markt (Energie, Zinsen, Währungen, Rohstoffe, Aktien, Krypto, Agrar, Geopolitik) in Ketten: A → B → C, mit dem Mechanismus dahinter.
3. EINGEPREIST? Nutze die Marktdaten: Ist ein Asset schon stark gelaufen (20T-Performance, RSI > 70, nah am 3M-Hoch), ist die gute Nachricht wahrscheinlich eingepreist. Sag das ehrlich.
4. CHANCEN: 3-4 Ideen quer über verschiedene Assetklassen. Nicht automatisch Gold. "Kein Trade" ist erlaubt, wenn nichts überzeugt.
5. RÜCKBLICK: Bewerte deine offenen Ideen aus dem Gedächtnis unten ehrlich (bestätigt / geschwächt / widerlegt). Die alten Prognosen bleiben stehen; du darfst nicht so tun, als hättest du etwas anderes gesagt.
6. Variiere: Wiederhole kein Thema der letzten Tage ohne neuen Grund.

PREISREGEL (wichtig): Du kennst nur die Kurse der Basiswerte unten (meist USD-Futures/Indizes), NICHT die Euro-Kurse von ETCs/ETFs. Gib Einstieg, Stop und Ziel daher IMMER in Einheiten des Basiswerts an und nenne ihn im Feld "basiswert" exakt mit einem dieser Namen: ${basiswerte}. Gibt es keinen passenden Basiswert (z.B. Einzelaktie), setze "basiswert": null. Lege den Stop nicht enger als die normale Tagesschwankung (ATR).

HALAL: Begründe kurz und benenne Unsicherheit. Gold/Silber sind Riba-Güter – bei ETCs ist unter Gelehrten umstritten, ob die Bedingungen (physisch, zugeordnet, Eigentum) erfüllt sind. Banken/Zins/Alkohol/Glücksspiel dominiert = nicht halal. Leerverkauf über Derivate = nicht halal (dann "MEIDEN" oder "REDUZIEREN").

ÜBERZEUGUNG: "niedrig" / "mittel" / "hoch" – das ist deine Einschätzung der Argumente, KEINE Wahrscheinlichkeit.

ASSET-UNIVERSUM:${TR_UNIVERSE}

DATUM: ${dateStr}
FEAR & GREED: ${fg}/100

MARKTDATEN (vom Code berechnet, verlässlich):
${marktCtx}

GEDÄCHTNIS:
${gedaechtnis}

NEWS:
${newsText}

Antworte NUR mit validem JSON, alles auf Deutsch, für einen Anfänger verständlich:
{
  "brief": "4-5 Sätze Mentor-Brief: DAS Thema heute und warum",
  "marktlage": "1-2 Sätze Gesamtbild",
  "neuHeute": "Was ist heute wirklich neu – und was ist nur Wiederholung/schon eingepreist",
  "oberflaeche": ["Quelle: Headline", "Quelle: Headline", "Quelle: Headline"],
  "ereignisse": [{ "ereignis": "Was passiert ist", "quellen": 3, "typ": "Fakt/Meinung/Spekulation", "neu": true, "betroffen": "Assets/Sektoren", "wirkung": "positiv/negativ/gemischt für wen" }],
  "bewegungen": [{ "ausloeser": "...", "kette": "A → B → C", "warum": "Mechanismus für Anfänger", "betroffen": "...", "investierbar": { "asset": "...", "isin": "ISIN oder null", "richtung": "LONG/MEIDEN/REDUZIEREN", "halal": "halal/nicht-halal/fraglich", "wie": "1 Satz" } }],
  "chancen": [{
    "rang": 1, "asset": "Name", "isin": "ISIN oder null", "klasse": "Aktien-ETF/Rohstoff/Krypto/Einzelaktie/Sektor-ETF",
    "basiswert": "exakter Basiswert-Name oder null", "richtung": "LONG/MEIDEN/REDUZIEREN", "halal": "halal/nicht-halal/fraglich",
    "einstieg": 0, "stopLoss": 0, "ziel": 0, "zeitraum": "z.B. 4-8 Wochen", "ueberzeugung": "niedrig/mittel/hoch",
    "kette": "die Wirkungskette hinter der Idee",
    "pro": ["Argument dafür", "Argument dafür"], "contra": ["Argument dagegen", "Argument dagegen"],
    "eingepreist": "Ist das schon im Kurs? Mit Bezug auf die Marktdaten.",
    "erklaerung": {
      "wasIstDas": "2-3 Sätze", "warumJetzt": "2-3 Sätze", "wannKaufen": "2-3 Sätze, mit Bedingung",
      "wieViel": "2-3 Sätze zu Positionsgröße bei kleinem Budget und Gebühren", "wannRaus": "2-3 Sätze",
      "wasKannSchiefgehen": "2-3 Sätze", "woranErkenneIchFalsch": "2-3 Sätze, frühes Warnsignal", "begriffDesTrades": "2 Sätze"
    }
  }],
  "rueckblick": [{ "datum": "YYYY-MM-DD", "asset": "...", "status": "bestätigt/geschwächt/widerlegt", "warum": "1-2 Sätze" }],
  "narrativ": "...", "realitaet": "...", "macht": "...", "geopolitik": "...", "liquiditaet": "...",
  "kette": "wichtigste Kausalkette des Tages", "timing": "...", "saisonalitaet": "...", "masseFehler": "...",
  "widerspruch": "Signal-Konflikt oder 'kein'", "markt": "Kurzrichtung je Asset", "positionierung": "...",
  "reflexivitaet": "...", "metaZyklus": "...", "psychologie": "FOMO/PANIK-Warnung oder null",
  "opportunity": "beste Idee in 1 Satz oder null",
  "halalAsset": "bestes halal Instrument der Top-Idee + ISIN", "halalStatus": "halal/zweifelhaft/nicht-halal", "halalBegruendung": "1-2 Sätze inkl. Unsicherheit",
  "entscheidung": "JA/NEIN/WARTEN", "richtung": "LONG/null", "einstieg": "...", "stopLoss": "...", "ziel": "...",
  "zeitraum": "...", "exitStrategie": "...", "waehrungsrisiko": "EUR/USD-Effekt",
  "lernpunkt": "Ein Marktmechanismus heute (3 Sätze), täglich anderes Thema", "tagesfrage": "Eine Denkfrage"
}`;

  const tryModel = (model) => new Promise((resolve) => {
    const key = process.env.GEMINI_API_KEY;
    const is25 = model.includes('2.5');
    const genConfig = { temperature: 0.65, maxOutputTokens: is25 ? 24000 : 8192, responseMimeType: 'application/json' };
    if (is25) genConfig.thinkingConfig = { thinkingBudget: 0 };
    const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: genConfig });
    const timeout = setTimeout(() => resolve({ ok: false, status: 'timeout' }), 150000);
    const req = https.request(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
        let data = '';
        res.on('data', ch => data += ch);
        res.on('end', () => {
          clearTimeout(timeout);
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) return resolve({ ok: false, status: parsed.error.code || 'error', msg: parsed.error.message });
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) return resolve({ ok: false, status: 'empty', msg: parsed.candidates?.[0]?.finishReason });
            return resolve({ ok: true, data: JSON.parse(text.replace(/```json|```/g, '').trim()) });
          } catch (e) { return resolve({ ok: false, status: 'parse', msg: e.message }); }
        });
      });
    req.on('error', (e) => { clearTimeout(timeout); resolve({ ok: false, status: 'neterror', msg: e.message }); });
    req.write(body); req.end();
  });

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  for (const model of ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash']) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await tryModel(model);
      if (res.ok) { console.log(`✅ KI-Analyse (${model}), Felder: ${Object.keys(res.data).length}`); return { ...res.data, _modell: model }; }
      if ([503, 429, 'timeout'].includes(res.status)) { console.log(`⏳ ${model} (${res.status}), Versuch ${attempt}/2`); await sleep(attempt * 10000); continue; }
      console.log(`⚠️ ${model} (${res.status}): ${String(res.msg || '').substring(0, 120)}`);
      break;
    }
  }
  console.log('❌ Alle Modelle fehlgeschlagen');
  return {};
}

// ═══ SIMULATION (Marktbreite + Stimmung + Ideen) ═════════════════════════
function runSimulation(fg, prices, chancen) {
  const ch = Object.values(prices).map(p => p.change).filter(c => typeof c === 'number');
  const total = ch.length || 1;
  const longs = (chancen || []).filter(c => String(c.richtung || '').toUpperCase().includes('LONG')).length;
  const avoids = (chancen || []).filter(c => /MEIDEN|SHORT|REDUZIEREN/.test(String(c.richtung || '').toUpperCase())).length;
  let buy = Math.round(((ch.filter(c => c > 0.1).length / total) * 0.4 + (fg < 30 ? 0.3 : fg < 45 ? 0.15 : 0) + Math.min(0.3, longs * 0.1)) * 100);
  let sell = Math.round(((ch.filter(c => c < -0.1).length / total) * 0.4 + (fg > 70 ? 0.3 : fg > 55 ? 0.15 : 0) + Math.min(0.3, avoids * 0.1)) * 100);
  buy = Math.max(0, Math.min(100, buy)); sell = Math.max(0, Math.min(100 - buy, sell));
  return { buy, hold: 100 - buy - sell, sell };
}

// ═══ ARCHIV ════════════════════════════════════════════════════════════════
const analyseOk = (sec) => !!sec && Object.keys(sec).length > 5;

function sichereAlteBriefing() {
  // Einmalig: das bisherige briefing.json ins Archiv übernehmen, falls es dort fehlt
  try {
    const alt = JSON.parse(fs.readFileSync('public/briefing.json', 'utf8'));
    if (!alt?.generatedAt) return;
    const key = alt.dateKey || berlinDateKey(new Date(alt.generatedAt));
    const pfad = `${ARCHIV_DIR}/${key}.json`;
    if (!fs.existsSync(pfad)) { fs.writeFileSync(pfad, JSON.stringify({ ...alt, dateKey: key }, null, 2)); console.log(`🗂️ Altes Briefing archiviert: ${key}`); }
  } catch {}
}

function holeVerlaufAusGit() {
  // Einmalig: jede frühere Version von briefing.json aus dem Git-Verlauf als Archivtag speichern
  const marker = `${ARCHIV_DIR}/.git-import-fertig`;
  if (fs.existsSync(marker)) return;
  try {
    if (execSync('git rev-parse --is-shallow-repository', { encoding: 'utf8' }).trim() === 'true') {
      console.log('ℹ️ Git-Verlauf gekürzt (fetch-depth fehlt) – Import übersprungen.'); return;
    }
  } catch { console.log('ℹ️ Kein Git verfügbar – Import übersprungen.'); return; }
  let hashes = [];
  try { hashes = execSync('git log --format=%H -- public/briefing.json', { encoding: 'utf8', maxBuffer: 1e7 }).trim().split('\n').filter(Boolean); } catch { return; }
  const best = {};
  for (const h of hashes) {
    let d;
    try { d = JSON.parse(execSync(`git show ${h}:public/briefing.json`, { encoding: 'utf8', maxBuffer: 5e7 })); } catch { continue; }
    if (!d?.generatedAt) continue;
    const key = d.dateKey || berlinDateKey(new Date(d.generatedAt));
    const cur = best[key];
    const okNeu = analyseOk(d.sections), okAlt = cur ? analyseOk(cur.sections) : false;
    if (!cur || (okNeu && !okAlt) || (okNeu === okAlt && d.generatedAt > cur.generatedAt)) best[key] = { ...d, dateKey: key };
  }
  let n = 0;
  for (const [key, d] of Object.entries(best)) {
    const pfad = `${ARCHIV_DIR}/${key}.json`;
    if (!fs.existsSync(pfad)) { fs.writeFileSync(pfad, JSON.stringify(d, null, 2)); n++; }
  }
  fs.writeFileSync(marker, new Date().toISOString());
  console.log(`🗂️ Aus dem Git-Verlauf übernommen: ${n} Tage (aus ${hashes.length} Versionen)`);
}

function schreibeIndex() {
  const tage = ladeArchivTage();
  const idx = tage.map(t => {
    const s = t.sections || {};
    return {
      date: t.dateKey, datum: t.date, analyseOk: analyseOk(s),
      thema: (s.marktlage || s.brief || '').slice(0, 160), entscheidung: s.entscheidung || null,
      top: Array.isArray(s.chancen) && s.chancen[0] ? s.chancen[0].asset : null,
      fg: Array.isArray(t.fearGreed) ? t.fearGreed[t.fearGreed.length - 1] : null,
      news: Array.isArray(t.news) ? t.news.length : 0, chancen: Array.isArray(s.chancen) ? s.chancen.length : 0
    };
  }).sort((a, b) => b.date.localeCompare(a.date));
  fs.writeFileSync(`${ARCHIV_DIR}/index.json`, JSON.stringify(idx, null, 2));
  console.log(`🗓️ Index: ${idx.length} Tage`);
}

// ═══ OBSIDIAN: jeder Tag als lesbare Notiz, Märkte als verlinkte Knoten ═════
const linkName = (label) => String(label || '').replace(/\//g, '-').trim();
const zelle = (x) => String(x ?? '–').replace(/\|/g, '/').replace(/\n/g, ' ');
const pz = (v) => (v == null || isNaN(v)) ? '–' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)} %`;
const eur = (v) => (v == null || isNaN(v)) ? '–' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2).replace('.', ',')} €`;

export function tagAlsMarkdown(t, vorher, nachher) {
  const s = t.sections || {};
  const ok = analyseOk(s);
  const L = [];
  const chancen = Array.isArray(s.chancen) ? s.chancen : [];
  L.push('---', `datum: ${t.dateKey}`, `entscheidung: ${s.entscheidung || 'keine'}`, `top_idee: "${String(chancen[0]?.asset || '').replace(/"/g, "'")}"`,
    `fear_greed: ${Array.isArray(t.fearGreed) ? t.fearGreed[t.fearGreed.length - 1] : ''}`, `analyse_ok: ${ok}`, 'tags: [market-brief]', '---', '');
  L.push(`# Market Brief – ${t.date || t.dateKey}`, '');
  L.push(`${vorher ? `← [[${vorher}]]` : ''}${vorher && nachher ? ' · ' : ''}${nachher ? `[[${nachher}]] →` : ''}`, '');
  if (!ok) L.push('> [!warning] An diesem Tag ist die KI-Analyse ausgefallen. Gespeichert sind nur News und Kurse.', '');
  if (s.brief) L.push('## Brief', s.brief, '');
  if (s.neuHeute) L.push('## Was heute wirklich neu ist', s.neuHeute, '');
  if (Array.isArray(s.ereignisse) && s.ereignisse.length) {
    L.push('## Ereignisse');
    s.ereignisse.forEach(e => L.push(`- **${e.typ || '?'}, ${e.neu ? 'neu' : 'schon bekannt'}** – ${e.ereignis}${e.quellen != null ? ` (${e.quellen} Quellen)` : ''}${e.betroffen ? ` – betrifft: ${e.betroffen}` : ''}${e.wirkung ? `. ${e.wirkung}` : ''}`));
    L.push('');
  }
  if (Array.isArray(s.bewegungen) && s.bewegungen.length) {
    L.push('## Wirkungsketten');
    s.bewegungen.forEach(b => {
      L.push(`### ${b.ausloeser || 'Bewegung'}`);
      if (b.kette) L.push(`**Kette:** ${b.kette}`, '');
      if (b.warum) L.push(`**Warum:** ${b.warum}`, '');
      const inv = b.investierbar || {};
      if (inv.asset) L.push(`**Investierbar:** ${inv.richtung || ''} ${inv.asset}${inv.isin && inv.isin !== 'null' ? ` (${inv.isin})` : ''} – halal: ${inv.halal || '?'}. ${inv.wie || ''}`, '');
    });
  }
  if (chancen.length) {
    L.push('## Ideen');
    chancen.forEach((c, i) => {
      const r = c.rechnung || {};
      L.push(`### ${c.rang || i + 1}. ${c.asset} – ${c.richtung || ''}${c.basiswert ? ` · [[${linkName(c.basiswert)}]]` : ''}`);
      L.push(`- Klasse: ${c.klasse || '–'} · Halal: ${c.halal || '?'} · Überzeugung: ${c.ueberzeugung || '–'} (unkalibriert)`);
      if (c.einstieg != null) L.push(`- Einstieg / Stop / Ziel: ${c.einstieg} / ${c.stopLoss} / ${c.ziel}${c.basiswert ? ` (im ${c.basiswert}-Kurs)` : ''} · Zeitraum: ${c.zeitraum || '–'}`);
      if (r.plausibel) L.push(`- Rechnung bei ${r.budget} € inkl. ${r.gebuehren} € Gebühren: Stop ${eur(-r.verlustEur)} · Ziel ${eur(r.gewinnEur)} · Chance : Risiko ${r.crvNetto} : 1 · nötige Trefferquote ${Math.round(r.breakEven)} %`);
      (r.hinweise || []).forEach(h => L.push(`- ⚠️ ${h}`));
      if (c.kette) L.push(`- Kette: ${c.kette}`);
      if (Array.isArray(c.pro) && c.pro.length) L.push(`- Dafür: ${c.pro.join('; ')}`);
      if (Array.isArray(c.contra) && c.contra.length) L.push(`- Dagegen: ${c.contra.join('; ')}`);
      if (c.eingepreist) L.push(`- Schon eingepreist? ${c.eingepreist}`);
      const e = c.erklaerung || {};
      const fr = [['Was ist das?', e.wasIstDas], ['Warum jetzt?', e.warumJetzt], ['Wann kaufen?', e.wannKaufen], ['Wie viel?', e.wieViel], ['Wann wieder raus?', e.wannRaus], ['Was kann schiefgehen?', e.wasKannSchiefgehen], ['Woran erkenne ich, dass ich falsch lag?', e.woranErkenneIchFalsch], ['Begriff', e.begriffDesTrades]].filter(([, v]) => v);
      if (fr.length) { L.push('', '**Erklärung**'); fr.forEach(([f, a]) => L.push(`- *${f}* ${a}`)); }
      L.push('');
    });
  }
  if (Array.isArray(s.rueckblick) && s.rueckblick.length) {
    L.push('## Rückblick auf frühere Ideen');
    s.rueckblick.forEach(r => L.push(`- ${r.asset} (${r.datum ? `[[${r.datum}]]` : '?'}): **${r.status}** – ${r.warum || ''}`));
    L.push('');
  }
  const kurse = Object.values(t.prices || {}).filter(x => x?.label);
  if (kurse.length) {
    L.push('## Marktdaten', '| Markt | Kurs | 1T | 5T | 20T | vom Hoch | RSI | Vola |', '|---|---|---|---|---|---|---|---|');
    kurse.forEach(k => L.push(`| [[${linkName(k.label)}]] | ${k.price >= 1000 ? Math.round(k.price) : Number(k.price).toFixed(k.price >= 10 ? 2 : 4)} | ${pz(k.change)} | ${pz(k.ch5)} | ${pz(k.ch20)} | ${pz(k.abstandHoch)} | ${k.rsi ?? '–'} | ${k.vola != null ? k.vola + ' %' : '–'} |`));
    L.push('');
  }
  if (Array.isArray(t.news) && t.news.length) {
    L.push('## News');
    t.news.forEach(n => L.push(`- ${zelle(n.source)}: ${zelle(n.title)}${n.sentiment ? ` (${n.sentiment})` : ''}`));
    L.push('');
  }
  if (s.lernpunkt) L.push('## Lernpunkt', s.lernpunkt, '');
  if (s.tagesfrage) L.push('## Tagesfrage', `> ${s.tagesfrage}`, '');
  return L.join('\n');
}

function schreibeObsidian() {
  const tage = ladeArchivTage();
  fs.mkdirSync(OBSIDIAN_DIR, { recursive: true });
  fs.mkdirSync(OBSIDIAN_MAERKTE, { recursive: true });
  const keys = tage.map(t => t.dateKey);
  tage.forEach((t, i) => fs.writeFileSync(`${OBSIDIAN_DIR}/${t.dateKey}.md`, tagAlsMarkdown(t, keys[i - 1], keys[i + 1])));
  // Markt-Notizen nur einmal anlegen – du kannst dort eigene Notizen ergänzen, sie werden nie überschrieben
  Object.values(SYMBOLE).forEach(label => {
    const pfad = `${OBSIDIAN_MAERKTE}/${linkName(label)}.md`;
    if (!fs.existsSync(pfad)) fs.writeFileSync(pfad, `# ${label}\n\nAlle Tage, an denen ${label} vorkam, findest du rechts unter **Backlinks**.\n\n## Eigene Notizen\n\n`);
  });
  const uebersicht = ['# Market Brief – Übersicht', '', '| Tag | Entscheidung | Top-Idee | Thema |', '|---|---|---|---|',
    ...[...tage].reverse().map(t => { const s = t.sections || {}; return `| [[${t.dateKey}]] | ${zelle(s.entscheidung || (analyseOk(s) ? '–' : 'KI ausgefallen'))} | ${zelle(s.chancen?.[0]?.asset || '–')} | ${zelle((s.marktlage || '').slice(0, 90))} |`; })];
  fs.writeFileSync('obsidian-vault/Market Brief Übersicht.md', uebersicht.join('\n'));
  console.log(`📓 Obsidian: ${tage.length} Tagesnotizen`);
}

// ═══ MAIN ══════════════════════════════════════════════════════════════════
async function main() {
  console.log('🚀 Starte Analyse...');
  const start = Date.now();
  fs.mkdirSync(ARCHIV_DIR, { recursive: true });
  holeVerlaufAusGit();
  sichereAlteBriefing();

  const [news, markt, fgHistory] = await Promise.all([fetchAllNews(), fetchMarktdaten(), fetchFearGreed()]);
  const { prices, bars } = markt;
  const fg = fgHistory[fgHistory.length - 1];
  const dateKey = berlinDateKey();

  const archivVorher = ladeArchivTage().filter(t => t.dateKey !== dateKey);
  const trackerVorher = baueTracker(archivVorher, bars);
  const analysis = await generateAnalysis(news, prices, fgHistory, baueGedaechtnis(archivVorher, trackerVorher));

  // Code prüft jede Idee und rechnet Gebühren ein
  if (Array.isArray(analysis.chancen)) {
    analysis.chancen = analysis.chancen.map(c => ({ ...c, rechnung: pruefeUndRechne(c, prices) }));
    const top = analysis.chancen.find(c => c.rechnung?.plausibel);
    analysis.asymmetrie = top ? { verlust: top.rechnung.verlustPct, gewinn: top.rechnung.gewinnPct, ratio: top.rechnung.crvNetto, ev: null } : null;
  }

  const output = {
    date: new Date().toLocaleDateString('de-DE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Europe/Berlin' }),
    dateKey, generatedAt: new Date().toISOString(), news, sections: analysis, prices,
    fearGreed: fgHistory, simulation: runSimulation(fg, prices, analysis.chancen)
  };

  // Einen guten Tag nie mit einem fehlgeschlagenen Lauf überschreiben
  const tagPfad = `${ARCHIV_DIR}/${dateKey}.json`;
  let behalten = false;
  if (!analyseOk(analysis) && fs.existsSync(tagPfad)) {
    try { behalten = analyseOk(JSON.parse(fs.readFileSync(tagPfad, 'utf8')).sections); } catch {}
  }
  if (behalten) {
    console.log('↩️ Heute gibt es schon eine gute Analyse – bleibt erhalten.');
  } else {
    fs.writeFileSync(tagPfad, JSON.stringify(output, null, 2));
    let altesOk = false;
    try { altesOk = analyseOk(JSON.parse(fs.readFileSync('public/briefing.json', 'utf8')).sections); } catch {}
    if (analyseOk(analysis) || !altesOk) fs.writeFileSync('public/briefing.json', JSON.stringify(output, null, 2));
    else console.log('⚠️ KI-Analyse fehlgeschlagen – App zeigt weiter das letzte gute Briefing, der Tag ist trotzdem archiviert.');
  }

  schreibeIndex();
  schreibeObsidian();
  const tracker = baueTracker(ladeArchivTage(), bars);
  fs.writeFileSync('public/tracker.json', JSON.stringify(tracker, null, 2));
  const z = tracker.zusammenfassung;
  console.log(`🎯 Tracker: ${z.gesamt} Ideen, ${z.geschlossen} geschlossen, ${z.laufend} laufend`);
  console.log(`💾 Fertig in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(e => { console.error(e); process.exit(1); });
