import { useState, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// MASTER PROMPT
// ═══════════════════════════════════════════════════════════════════════════
const MASTER_PROMPT = `Du bist ein globaler Makro-Analyst mit Insider-Denken und islamischer Ethik.

KERNPRINZIP: "Die Nachricht ist die Oberfläche. Das Geld zeigt die Wahrheit."
→ 80% der News irrelevant. 15% manipulativ. 5% sind Gold.
→ Kein Trade ist oft die beste Entscheidung.
→ Zentralbanken und Hedgefonds handeln BEVOR die News erscheint.

ANALYSE-KETTE: Ereignis → Wer profitiert? → Wohin fließt Kapital? → Was glaubt die Masse falsch? → Ist Risiko asymmetrisch genug?

Antworte NUR mit validem JSON:
{
  "oberflaeche": ["Quelle: Headline 1", "Quelle: Headline 2", "Quelle: Headline 3"],
  "narrativ": "Was die Masse glaubt",
  "realitaet": "Was wirklich passiert und verschwiegen wird",
  "macht": "Wer profitiert konkret – Namen, Institutionen",
  "geopolitik": "Ressourcen, Handelsrouten, BRICS vs G7, De-Dollarisierung",
  "liquiditaet": "Wohin fließt Kapital konkret – welche Assets",
  "kette": "A → B → C → D",
  "timing": "Früh/Mitte/Spät/Wendepunkt + Begründung",
  "saisonalitaet": "Historisches Muster für diesen Monat",
  "masseFehler": "Was 95% falsch sehen – der Edge",
  "widerspruch": "Signal-Konflikt ja/nein + Erklärung",
  "markt": "Gold ↑↓ | Silber ↑↓ | Öl ↑↓ | Kupfer ↑↓ | Bitcoin ↑↓ | DAX ↑↓ | DXY ↑↓ | EUR/USD ↑↓ | 10Y ↑↓",
  "opportunity": "Konkrete Chance oder null",
  "positionierung": "COT Smart Money Signal",
  "reflexivitaet": "Feedback-Loop konkret beschreiben",
  "asymmetrie": { "verlust": 8, "gewinn": 18, "ratio": 2.3, "ev": 0.12 },
  "metaZyklus": "Stagflation/Wachstum/Krise/Umbruch",
  "halalAsset": "Asset Name + ISIN wenn möglich",
  "halalStatus": "halal",
  "halalBegruendung": "AAOIFI 1 Satz",
  "purification": "0.00",
  "entscheidung": "JA/NEIN/WARTEN",
  "richtung": "LONG/SHORT/null",
  "einstieg": "Konkreter Preis z.B. 30.50€",
  "stopLoss": "ATR-basierter Preis z.B. 28.10€",
  "ziel": "Zielpreis z.B. 36.00€",
  "zeitraum": "z.B. 4-8 Wochen",
  "einsatz": 3.13,
  "exitStrategie": "z.B. Bei +10% die Hälfte verkaufen, Rest mit Trailing Stop",
  "waehrungsrisiko": "EUR/USD Effekt auf diesen Trade",
  "psychologie": "FOMO/PANIK Warnung oder null",
  "ruhigerTag": false,
  "lernpunkt": "Begriff: 3 Sätze Erklärung für Einsteiger",
  "tagesfrage": "Eine Denkfrage ohne Antwortpflicht",
  "brief": "4-5 Sätze Mentor-Brief an Ayman"
}

HALAL (AAOIFI): ✅ Gold/Silber/Halal-ETFs ⚠️ Krypto/Tech <33% Zins ❌ Anleihen/Banken/Futures
TRADE REPUBLIC HALAL: Xetra-Gold (DE000A0S9GB0) ✅ | iShares MSCI World Islamic (IE00B27YCK28) ✅ | Silber ETC (DE000A0N62F2) ✅
RISIKO: Quarter Kelly = 3.13€ | Max 2% pro Trade | EV > 0 | Ratio min 1:2
SPRACHE: Deutsch. Kurze Sätze. Profi-Denken, Einsteiger-Sprache.`;

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════
// Nur Assets die auf Trade Republic verfügbar sind
const TICKERS = [
  { symbol: "GC=F",     label: "Gold",       emoji: "🥇", color: "#FFD700",  tr: "Xetra-Gold ETC" },
  { symbol: "SI=F",     label: "Silber",     emoji: "🥈", color: "#C0C0C0",  tr: "Silber ETC" },
  { symbol: "BTC-USD",  label: "Bitcoin",    emoji: "₿",  color: "#F7931A",  tr: "Bitcoin" },
  { symbol: "^GDAXI",   label: "DAX",        emoji: "📈", color: "#00C896",  tr: "iShares Core DAX" },
  { symbol: "EURUSD=X", label: "EUR/USD",    emoji: "💶", color: "#4ECDC4",  tr: "Kurs-Indikator" },
  { symbol: "CL=F",     label: "Öl",         emoji: "🛢️", color: "#FF8C00",  tr: "WisdomTree Oil ETC" },
  { symbol: "GLD",      label: "MSCI World", emoji: "🌍", color: "#6C8EFF",  tr: "iShares MSCI World Islamic" },
];

const TV_CHARTS = [
  { label: "🥇 Gold (Xetra-Gold)",           symbol: "TVC:GOLD" },
  { label: "🥈 Silber ETC",                  symbol: "TVC:SILVER" },
  { label: "₿ Bitcoin",                      symbol: "BINANCE:BTCUSDT" },
  { label: "📈 DAX (iShares Core DAX)",      symbol: "XETRA:DAX" },
  { label: "🛢️ Öl (WisdomTree Oil)",         symbol: "TVC:USOIL" },
  { label: "🌍 MSCI World Islamic",          symbol: "SP:SPX" },
  { label: "💶 EUR/USD",                     symbol: "FX:EURUSD" },
];

// Kein fake Sample – App zeigt klaren Hinweis wenn noch kein Briefing da ist
const EMPTY_STATE = null;

const ASSET_TO_TV = {
  "xetra-gold": "TVC:GOLD", "gold": "TVC:GOLD", "silber": "TVC:SILVER",
  "öl": "TVC:USOIL", "oil": "TVC:USOIL", "bitcoin": "BINANCE:BTCUSDT",
  "btc": "BINANCE:BTCUSDT", "dax": "XETRA:DAX", "kupfer": "TVC:COPPER",
  "eur": "FX:EURUSD", "copper": "TVC:COPPER",
};

const ZENTRALBANK_TERMINE = [
  { datum: "2026-06-11", event: "EZB Zinsentscheidung" },
  { datum: "2026-06-17", event: "Fed FOMC" },
  { datum: "2026-07-23", event: "EZB Zinsentscheidung" },
  { datum: "2026-07-28", event: "Fed FOMC" },
  { datum: "2026-09-10", event: "EZB Zinsentscheidung" },
  { datum: "2026-09-15", event: "Fed FOMC" },
];

const GLOSSAR = {
  "ATR": "Average True Range – misst die durchschnittliche tägliche Schwankung. Basis für Stop-Loss Berechnung.",
  "COT": "Commitment of Traders – zeigt wie Profis und Spekulanten positioniert sind. Erscheint wöchentlich.",
  "DXY": "Dollar Index – misst den US-Dollar gegen 6 Währungen. Steigt DXY, fallen meist Gold und Rohstoffe.",
  "Kelly": "Mathematische Formel für optimale Positionsgröße. Quarter Kelly = 25% davon für sicheres Trading.",
  "Sharpe Ratio": "Risiko-Rendite-Verhältnis. Über 1.0 ist gut, über 2.0 ist exzellent.",
  "Expectancy": "Erwartungswert pro Trade. Muss positiv sein damit eine Strategie langfristig profitiert.",
  "Reflexivität": "Soros-Theorie: Märkte verändern die Realität selbst. Loop zwischen Meinung und Fundamentals.",
  "AAOIFI": "Islamische Buchhaltungsorganisation die Sharia-Standards für Finanzen festlegt.",
  "Purification": "Reinigung – Anteil von Dividenden aus Zinseinnahmen der gespendet werden muss.",
  "Stagflation": "Hohe Inflation + niedriges Wachstum. Schlimmste Kombination für Notenbanken.",
  "De-Dollarisierung": "Trend weg vom US-Dollar. Treiber für Gold und alternative Assets.",
  "FOMO": "Fear Of Missing Out – Angst etwas zu verpassen. Führt zu schlechten Einstiegszeitpunkten.",
  "Drawdown": "Maximaler Verlust vom Hoch bis zum Tief. Wichtigste Risikokennzahl.",
  "EV": "Expected Value – EV = (Gewinnchance × Gewinn) - (Verlustchance × Verlust). Muss > 0 sein.",
  "Long": "Du kaufst ein Asset weil du steigende Kurse erwartest.",
  "Stop-Loss": "Automatischer Verkaufsbefehl wenn Kurs unter X fällt. Begrenzt Verluste.",
  "Support": "Preiszone wo viele Käufer warten. Kurs prallt oft davon ab.",
  "Resistance": "Preiszone wo viele Verkäufer warten. Kurs dreht oft dort um.",
};

// ═══════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════
const ls = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const today = () => new Date().toLocaleDateString("de-DE", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
const tagesBis = (d) => Math.ceil((new Date(d) - new Date()) / 86400000);
const naechsterTermin = () => ZENTRALBANK_TERMINE.find(t => tagesBis(t.datum) >= 0) || null;

function runSimulation(fg, momentum) {
  let buy = 0, hold = 0, sell = 0;
  for (let i = 0; i < 1000; i++) {
    const type = i < 100 ? "f" : i < 400 ? "c" : "n";
    let score = 0;
    if (type === "f") { score += (fg < 30 ? 15 : fg > 70 ? -15 : 0); }
    else if (type === "c") { score += momentum > 2 ? 1.5 : momentum < -2 ? -1.5 : 0; }
    else { score += (Math.random() - 0.5) * 2; }
    if (score > 1) buy++; else if (score < -1) sell++; else hold++;
  }
  return { buy: Math.round(buy / 10), hold: Math.round(hold / 10), sell: Math.round(sell / 10) };
}

function calcMetrics(trades) {
  const closed = (trades || []).filter(t => t.result !== null);
  if (!closed.length) return null;
  const wins = closed.filter(t => t.result > 0);
  const losses = closed.filter(t => t.result <= 0);
  const wr = wins.length / closed.length;
  const aw = wins.length ? wins.reduce((s, t) => s + t.result, 0) / wins.length : 0;
  const al = losses.length ? Math.abs(losses.reduce((s, t) => s + t.result, 0) / losses.length) : 0;
  const exp = (wr * aw) - ((1 - wr) * al);
  let peak = 0, mdd = 0, eq = 0;
  closed.forEach(t => { eq += t.result; if (eq > peak) peak = eq; const dd = peak > 0 ? (peak - eq) / peak : 0; if (dd > mdd) mdd = dd; });
  return { wr, aw, al, exp, mdd, total: closed.length };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function PinScreen({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [stored] = useState(ls.get("pin", null));
  const [mode] = useState(ls.get("pin", null) ? "enter" : "set");
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState("");

  const handleKey = (k) => {
    if (k === "⌫") { setPin(p => p.slice(0, -1)); return; }
    if (pin.length >= 6) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 6) {
      setTimeout(() => {
        if (mode === "set") {
          if (!newPin) { setNewPin(next); setPin(""); }
          else if (next === newPin) { ls.set("pin", next); onUnlock(); }
          else { setError("PINs stimmen nicht überein."); setPin(""); setNewPin(""); }
        } else {
          if (next === stored) onUnlock();
          else { setError("Falsche PIN."); setPin(""); }
        }
      }, 150);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#07070F", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px", fontFamily: "'DM Mono'" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500;600&display=swap'); *{box-sizing:border-box}`}</style>
      <div style={{ fontSize: "9px", letterSpacing: "4px", color: "rgba(255,215,0,0.4)", marginBottom: "6px" }}>AYMAN'S</div>
      <div style={{ fontSize: "26px", fontWeight: "800", fontFamily: "'Syne'", background: "linear-gradient(135deg,#FFD700,#FF8C00)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: "40px" }}>Market Brief</div>
      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", marginBottom: "10px" }}>
        {mode === "set" ? (newPin ? "PIN bestätigen:" : "PIN festlegen (6 Ziffern):") : "PIN eingeben:"}
      </div>
      <div style={{ display: "flex", gap: "10px", marginBottom: "8px" }}>
        {[...Array(6)].map((_, i) => <div key={i} style={{ width: "13px", height: "13px", borderRadius: "50%", background: i < pin.length ? "#FFD700" : "rgba(255,255,255,0.1)", transition: "all .15s" }} />)}
      </div>
      {error && <div style={{ fontSize: "11px", color: "#FF5050", marginBottom: "8px" }}>{error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 62px)", gap: "10px", marginTop: "20px" }}>
        {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => (
          <button key={i} onClick={() => k && handleKey(k)} style={{ height: "62px", borderRadius: "14px", border: k ? "1px solid rgba(255,255,255,0.08)" : "none", cursor: k ? "pointer" : "default", background: k ? "rgba(255,255,255,0.05)" : "transparent", color: k === "⌫" ? "#FFD700" : "white", fontSize: k === "⌫" ? "20px" : "22px", fontFamily: "'Syne'", fontWeight: "700" }}>{k}</button>
        ))}
      </div>
    </div>
  );
}

function TickerBar({ prices }) {
  return (
    <div style={{ display: "flex", gap: "5px", overflowX: "auto", scrollbarWidth: "none" }}>
      {TICKERS.map(t => {
        const d = prices[t.symbol];
        const up = d?.change >= 0;
        return (
          <div key={t.symbol} style={{ flexShrink: 0, background: "rgba(255,255,255,0.03)", border: `1px solid ${d ? (up ? "rgba(0,200,100,0.18)" : "rgba(255,80,80,0.18)") : "rgba(255,255,255,0.05)"}`, borderRadius: "9px", padding: "7px 9px", minWidth: "68px" }}>
            <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono'" }}>{t.emoji} {t.label}</div>
            <div style={{ fontSize: "12px", fontWeight: "600", color: t.color, fontFamily: "'DM Mono'", marginTop: "2px" }}>
              {d ? (d.price > 1000 ? d.price.toLocaleString("de-DE", { maximumFractionDigits: 0 }) : d.price.toFixed(2)) : "—"}
            </div>
            <div style={{ fontSize: "9px", color: d ? (up ? "#00C896" : "#FF5050") : "rgba(255,255,255,0.2)", fontFamily: "'DM Mono'" }}>
              {d ? `${up ? "+" : ""}${d.change.toFixed(2)}%` : "—"}
            </div>
            <div style={{ fontSize: "7px", color: "rgba(255,215,0,0.25)", fontFamily: "'DM Mono'", marginTop: "1px" }}>TR ✓</div>
          </div>
        );
      })}
    </div>
  );
}

function KernLeiste({ s, fg, prices, sim }) {
  const nt = naechsterTermin();
  const ec = s?.entscheidung === "JA" ? "#00C896" : s?.entscheidung === "NEIN" ? "#FF5050" : "#FFB800";
  const fgc = fg < 40 ? "#FF5050" : fg > 60 ? "#00C896" : "#FFB800";
  return (
    <div style={{ background: "linear-gradient(135deg,rgba(255,215,0,0.06),rgba(255,140,0,0.03))", border: "1px solid rgba(255,215,0,0.18)", borderRadius: "14px", padding: "13px 14px", marginBottom: "12px" }}>
      <div style={{ fontSize: "8px", letterSpacing: "3px", color: "rgba(255,215,0,0.45)", fontFamily: "'DM Mono'", marginBottom: "10px" }}>⚡ KERN – 5 SIGNALE</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "7px", marginBottom: "8px" }}>
        {[
          ["GOLD", prices["GC=F"] ? `${prices["GC=F"].change >= 0 ? "+" : ""}${prices["GC=F"].change.toFixed(1)}%` : "—", "#FFD700"],
          ["DXY", prices["DX-Y.NYB"] ? `${prices["DX-Y.NYB"].change >= 0 ? "+" : ""}${prices["DX-Y.NYB"].change.toFixed(1)}%` : "—", "#6C8EFF"],
          ["F&G", fg ?? "—", fgc],
        ].map(([k, v, c]) => (
          <div key={k} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "9px", padding: "9px", textAlign: "center" }}>
            <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono'" }}>{k}</div>
            <div style={{ fontSize: "14px", color: c, fontWeight: "700", fontFamily: "'DM Mono'" }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px" }}>
        <div style={{ background: `rgba(${s?.entscheidung === "JA" ? "0,200,100" : s?.entscheidung === "NEIN" ? "255,80,80" : "255,184,0"},0.08)`, border: `1px solid ${ec}33`, borderRadius: "9px", padding: "9px", textAlign: "center" }}>
          <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono'" }}>TRADE</div>
          <div style={{ fontSize: "16px", color: ec, fontWeight: "800", fontFamily: "'Syne'" }}>{s?.entscheidung || "—"}</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: "9px", padding: "9px", textAlign: "center" }}>
          <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono'" }}>NÄCHSTER TERMIN</div>
          <div style={{ fontSize: "11px", color: "#FFB800", fontWeight: "600", fontFamily: "'DM Mono'" }}>{nt ? `in ${tagesBis(nt.datum)}d` : "—"}</div>
          <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono'" }}>{nt?.event?.split(" ")[0] || ""}</div>
        </div>
      </div>
      {sim && (
        <div style={{ marginTop: "9px", padding: "10px", background: "rgba(255,255,255,0.02)", borderRadius: "9px" }}>
          <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.25)", fontFamily: "'DM Mono'", marginBottom: "6px" }}>1000 AGENTEN SIMULATION</div>
          <div style={{ display: "flex", borderRadius: "4px", overflow: "hidden", height: "7px" }}>
            <div style={{ flex: sim.buy, background: "#00C896" }} />
            <div style={{ flex: sim.hold, background: "rgba(255,255,255,0.15)" }} />
            <div style={{ flex: sim.sell, background: "#FF5050" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
            <span style={{ fontSize: "9px", color: "#00C896", fontFamily: "'DM Mono'" }}>Kauf {sim.buy}%</span>
            <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.25)", fontFamily: "'DM Mono'" }}>Halt {sim.hold}%</span>
            <span style={{ fontSize: "9px", color: "#FF5050", fontFamily: "'DM Mono'" }}>Verk. {sim.sell}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Block({ icon, title, children, accent, warning }) {
  const [open, setOpen] = useState(true);
  if (!children) return null;
  return (
    <div style={{ background: warning ? "rgba(255,80,80,0.04)" : "rgba(255,255,255,0.025)", border: `1px solid ${warning ? "rgba(255,80,80,0.3)" : accent || "rgba(255,215,0,0.1)"}`, borderRadius: "11px", marginBottom: "8px", overflow: "hidden" }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 13px", cursor: "pointer" }}>
        <div style={{ display: "flex", gap: "7px", alignItems: "center" }}>
          <span style={{ fontSize: "14px" }}>{icon}</span>
          <span style={{ fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", fontFamily: "'DM Mono'", color: warning ? "#FF5050" : accent || "rgba(255,215,0,0.5)", fontWeight: "600" }}>{title}</span>
        </div>
        <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.2)" }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ padding: "0 13px 11px", fontSize: "12px", lineHeight: "1.8", color: "rgba(255,255,255,0.78)", fontFamily: "'DM Mono'" }}
          dangerouslySetInnerHTML={{
            __html: String(children)
              .replace(/\*\*(.*?)\*\*/g, '<strong style="color:#FFD700">$1</strong>')
              .replace(/✅/g, '<span style="color:#00C896">✅</span>')
              .replace(/⚠️/g, '<span style="color:#FFB800">⚠️</span>')
              .replace(/❌/g, '<span style="color:#FF5050">❌</span>')
              .replace(/→/g, '<span style="color:rgba(255,215,0,0.5)">→</span>')
          }} />
      )}
    </div>
  );
}

function AsymmetrieCard({ a }) {
  if (!a) return null;
  const gut = a.ratio >= 2;
  return (
    <div style={{ background: gut ? "rgba(0,200,100,0.04)" : "rgba(255,80,80,0.04)", border: `1px solid ${gut ? "rgba(0,200,100,0.22)" : "rgba(255,80,80,0.22)"}`, borderRadius: "11px", padding: "13px", marginBottom: "8px" }}>
      <div style={{ fontSize: "9px", letterSpacing: "2px", fontFamily: "'DM Mono'", color: gut ? "#00C896" : "#FF5050", marginBottom: "9px" }}>
        ⚖️ ASYMMETRIE {gut ? "✅ GUTES SETUP" : "❌ SCHLECHTES SETUP"}
      </div>
      <div style={{ display: "flex", gap: "7px" }}>
        {[["Verlust", `${a.verlust}%`, "#FF5050"], ["Gewinn", `${a.gewinn}%`, "#00C896"], ["Ratio", `1:${a.ratio}`, gut ? "#00C896" : "#FF5050"], ["EV", a.ev > 0 ? `+${a.ev.toFixed(2)}` : String(a.ev?.toFixed(2)), a.ev > 0 ? "#00C896" : "#FF5050"]].map(([k, v, c]) => (
          <div key={k} style={{ flex: 1, background: "rgba(255,255,255,0.03)", borderRadius: "7px", padding: "7px", textAlign: "center" }}>
            <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.28)", fontFamily: "'DM Mono'" }}>{k}</div>
            <div style={{ fontSize: "13px", fontWeight: "700", color: c, fontFamily: "'DM Mono'" }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StopLossErklarung({ einstieg, stopLoss, ziel, einsatz }) {
  const parse = (s) => parseFloat((s || "").replace(/[^0-9.,]/g, "").replace(",", ".")) || null;
  const e = parse(einstieg), sl = parse(stopLoss), t = parse(ziel);
  if (!e || !sl) return null;
  const slPct = (((e - sl) / e) * 100).toFixed(1);
  const tPct = t ? (((t - e) / e) * 100).toFixed(1) : null;
  const maxV = einsatz ? ((parseFloat(slPct) / 100) * einsatz).toFixed(2) : null;
  return (
    <div style={{ marginTop: "9px", padding: "12px", background: "rgba(255,80,80,0.04)", borderRadius: "9px", border: "1px solid rgba(255,80,80,0.15)" }}>
      <div style={{ fontSize: "9px", letterSpacing: "2px", color: "#FF5050", fontFamily: "'DM Mono'", marginBottom: "8px" }}>🛡️ STOP-LOSS ERKLÄRT</div>
      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.78)", fontFamily: "'DM Mono'", lineHeight: "1.9" }}>
        <div>Einstieg: <strong style={{ color: "#FFD700" }}>{einstieg}</strong></div>
        <div>Stop-Loss: <strong style={{ color: "#FF5050" }}>{stopLoss}</strong> = -{slPct}% unter Einstieg</div>
        {tPct && <div>Ziel: <strong style={{ color: "#00C896" }}>{ziel}</strong> = +{tPct}% über Einstieg</div>}
        {maxV && <div style={{ marginTop: "6px", padding: "6px 8px", background: "rgba(255,80,80,0.08)", borderRadius: "6px" }}>Max. Verlust bei {einsatz}€: <strong style={{ color: "#FF5050" }}>-{maxV}€</strong></div>}
      </div>
      <div style={{ marginTop: "10px", padding: "10px", background: "rgba(255,255,255,0.02)", borderRadius: "8px" }}>
        <div style={{ fontSize: "9px", color: "rgba(255,215,0,0.4)", fontFamily: "'DM Mono'", marginBottom: "6px" }}>📱 SO AUF TRADE REPUBLIC SETZEN:</div>
        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", fontFamily: "'DM Mono'", lineHeight: "1.9" }}>
          1. Asset öffnen → "Verkaufen" tippen{"\n"}
          2. Order-Typ: "Stop-Loss" wählen{"\n"}
          3. Stop-Preis: <strong style={{ color: "#FF5050" }}>{stopLoss}</strong>{"\n"}
          4. Menge: alle gekauften Anteile{"\n"}
          5. Bestätigen → läuft automatisch
        </div>
      </div>
      <div style={{ marginTop: "8px", fontSize: "10px", color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono'", lineHeight: "1.7", fontStyle: "italic" }}>
        💡 Stop-Loss = dein Sicherheitsnetz. Kurs fällt auf {stopLoss} → Trade Republic verkauft automatisch. Du verlierst nie mehr als geplant.
      </div>
    </div>
  );
}

function StrategieErklarung({ richtung }) {
  if (richtung === "SHORT") return (
    <div style={{ marginTop: "9px", padding: "12px", background: "rgba(255,80,80,0.04)", borderRadius: "9px", border: "1px solid rgba(255,80,80,0.15)" }}>
      <div style={{ fontSize: "9px", letterSpacing: "2px", color: "#FF5050", fontFamily: "'DM Mono'", marginBottom: "6px" }}>⚠️ SHORT – NICHT EMPFOHLEN</div>
      <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.65)", fontFamily: "'DM Mono'", lineHeight: "1.8" }}>Short-Positionen über Futures/Optionen sind Gharar (islamisch verboten). Stattdessen: Cash halten oder in sichere Halal-Assets wechseln.</div>
    </div>
  );
  return (
    <div style={{ marginTop: "9px", padding: "12px", background: "rgba(0,200,100,0.03)", borderRadius: "9px", border: "1px solid rgba(0,200,100,0.15)" }}>
      <div style={{ fontSize: "9px", letterSpacing: "2px", color: "#00C896", fontFamily: "'DM Mono'", marginBottom: "6px" }}>📗 LONG – SCHRITT FÜR SCHRITT</div>
      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.65)", fontFamily: "'DM Mono'", lineHeight: "1.9" }}>
        1. Trade Republic öffnen{"\n"}
        2. Asset suchen (Name oder ISIN){"\n"}
        3. "Kaufen" tippen{"\n"}
        4. Betrag eingeben (laut Einsatz){"\n"}
        5. Sofort danach Stop-Loss setzen (siehe oben){"\n"}
        6. Täglich kurz checken – nicht emotional handeln
      </div>
    </div>
  );
}

function EntscheidungCard({ b }) {
  const isJa = b?.entscheidung === "JA";
  const isNein = b?.entscheidung === "NEIN";
  const c = isJa ? "#00C896" : isNein ? "#FF5050" : "#FFB800";
  return (
    <div style={{ background: `rgba(${isJa ? "0,200,100" : isNein ? "255,80,80" : "255,184,0"},0.04)`, border: `1px solid ${c}33`, borderRadius: "13px", padding: "15px", marginBottom: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "11px" }}>
        <span style={{ fontSize: "9px", letterSpacing: "2px", fontFamily: "'DM Mono'", color: c }}>🎯 ENTSCHEIDUNG</span>
        <span style={{ fontSize: "18px", fontWeight: "800", fontFamily: "'Syne'", color: c }}>{b?.entscheidung || "—"}</span>
      </div>
      {isJa && b && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px" }}>
            {[["Richtung", b.richtung, "white"], ["Einstieg", b.einstieg, "#FFD700"], ["Stop-Loss", b.stopLoss, "#FF5050"], ["Ziel", b.ziel, "#00C896"], ["Zeitraum", b.zeitraum, "white"], ["Einsatz", `${b.einsatz}€`, "#FFD700"]].map(([k, v, col]) => v && (
              <div key={k} style={{ background: k === "Stop-Loss" ? "rgba(255,80,80,0.07)" : k === "Ziel" ? "rgba(0,200,100,0.07)" : "rgba(255,255,255,0.03)", borderRadius: "8px", padding: "8px 9px", border: k === "Stop-Loss" ? "1px solid rgba(255,80,80,0.18)" : k === "Ziel" ? "1px solid rgba(0,200,100,0.18)" : "none" }}>
                <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.28)", fontFamily: "'DM Mono'" }}>{k}</div>
                <div style={{ fontSize: "12px", color: col, fontFamily: "'DM Mono'", marginTop: "2px", fontWeight: k === "Stop-Loss" || k === "Ziel" ? "700" : "400" }}>{v}</div>
              </div>
            ))}
          </div>
          <StopLossErklarung einstieg={b.einstieg} stopLoss={b.stopLoss} ziel={b.ziel} einsatz={b.einsatz} />
          <StrategieErklarung richtung={b.richtung} />
          {b.exitStrategie && (
            <div style={{ marginTop: "9px", padding: "10px", background: "rgba(255,215,0,0.03)", borderRadius: "8px", border: "1px solid rgba(255,215,0,0.1)" }}>
              <div style={{ fontSize: "8px", color: "rgba(255,215,0,0.4)", fontFamily: "'DM Mono'", marginBottom: "4px" }}>🚪 EXIT STRATEGIE</div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.65)", fontFamily: "'DM Mono'", lineHeight: "1.7" }}>{b.exitStrategie}</div>
            </div>
          )}
          {b.waehrungsrisiko && (
            <div style={{ marginTop: "8px", padding: "10px", background: "rgba(108,142,255,0.03)", borderRadius: "8px", border: "1px solid rgba(108,142,255,0.12)" }}>
              <div style={{ fontSize: "8px", color: "rgba(108,142,255,0.5)", fontFamily: "'DM Mono'", marginBottom: "4px" }}>💶 WÄHRUNGSRISIKO</div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.6)", fontFamily: "'DM Mono'", lineHeight: "1.7" }}>{b.waehrungsrisiko}</div>
            </div>
          )}
        </>
      )}
      {!isJa && (
        <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.55)", fontFamily: "'DM Mono'", lineHeight: "1.7" }}>
          {isNein ? "Kein Setup heute. Kein Trade ist auch eine Entscheidung – und oft die richtige." : "Beobachten. Setup noch nicht bestätigt. Geduld ist eine Strategie."}
        </div>
      )}
    </div>
  );
}

function TradingViewChart({ asset, stopLoss, ziel, einstieg }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const assetKey = Object.keys(ASSET_TO_TV).find(k => (asset || "").toLowerCase().includes(k));
  const symbol = assetKey ? ASSET_TO_TV[assetKey] : "TVC:GOLD";

  useEffect(() => {
    if (!open || !ref.current) return;
    ref.current.innerHTML = "";
    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    s.async = true;
    s.innerHTML = JSON.stringify({
      autosize: true, symbol, interval: "D",
      timezone: "Europe/Berlin", theme: "dark", style: "1",
      locale: "de_DE", hide_top_toolbar: false, save_image: false,
      backgroundColor: "rgba(7,7,15,1)", gridColor: "rgba(255,255,255,0.05)",
    });
    ref.current.appendChild(s);
  }, [open, symbol]);

  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,215,0,0.12)", borderRadius: "11px", marginBottom: "8px", overflow: "hidden" }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 13px", cursor: "pointer" }}>
        <div style={{ display: "flex", gap: "7px", alignItems: "center" }}>
          <span style={{ fontSize: "14px" }}>📈</span>
          <span style={{ fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", fontFamily: "'DM Mono'", color: "rgba(255,215,0,0.5)", fontWeight: "600" }}>CHART – {asset || "Asset"}</span>
        </div>
        <div style={{ display: "flex", gap: "7px", alignItems: "center" }}>
          {stopLoss && <span style={{ fontSize: "9px", color: "#FF5050", fontFamily: "'DM Mono'" }}>SL {stopLoss}</span>}
          {ziel && <span style={{ fontSize: "9px", color: "#00C896", fontFamily: "'DM Mono'" }}>Ziel {ziel}</span>}
          <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.2)" }}>{open ? "▲" : "▼"}</span>
        </div>
      </div>
      {open && (
        <>
          <div style={{ display: "flex", gap: "10px", padding: "0 13px 9px", flexWrap: "wrap" }}>
            {einstieg && <div style={{ display: "flex", gap: "4px", alignItems: "center" }}><div style={{ width: "10px", height: "2px", background: "#FFD700" }} /><span style={{ fontSize: "9px", color: "#FFD700", fontFamily: "'DM Mono'" }}>Ein: {einstieg}</span></div>}
            {stopLoss && <div style={{ display: "flex", gap: "4px", alignItems: "center" }}><div style={{ width: "10px", height: "2px", background: "#FF5050" }} /><span style={{ fontSize: "9px", color: "#FF5050", fontFamily: "'DM Mono'" }}>SL: {stopLoss}</span></div>}
            {ziel && <div style={{ display: "flex", gap: "4px", alignItems: "center" }}><div style={{ width: "10px", height: "2px", background: "#00C896" }} /><span style={{ fontSize: "9px", color: "#00C896", fontFamily: "'DM Mono'" }}>Ziel: {ziel}</span></div>}
          </div>
          <div style={{ height: "380px" }} ref={ref} />
          <div style={{ padding: "9px 13px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <a href={`https://www.tradingview.com/chart/?symbol=${symbol}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "10px", color: "rgba(255,215,0,0.35)", fontFamily: "'DM Mono'", textDecoration: "none" }}>🔗 Auf TradingView öffnen →</a>
          </div>
        </>
      )}
    </div>
  );
}

function ChartBlock({ label, symbol }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open || !ref.current) return;
    ref.current.innerHTML = "";
    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    s.async = true;
    s.innerHTML = JSON.stringify({
      autosize: true, symbol, interval: "D",
      timezone: "Europe/Berlin", theme: "dark", style: "1",
      locale: "de_DE", hide_top_toolbar: false, save_image: false,
      backgroundColor: "rgba(7,7,15,1)", gridColor: "rgba(255,255,255,0.05)",
    });
    ref.current.appendChild(s);
  }, [open, symbol]);
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "11px", marginBottom: "7px", overflow: "hidden" }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 13px", cursor: "pointer" }}>
        <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.72)", fontFamily: "'DM Mono'" }}>{label}</span>
        <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.2)" }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && <div style={{ height: "340px" }} ref={ref} />}
    </div>
  );
}

function HypeAnalysis({ hypeCenter, peripherEffect, hypeNews }) {
  const [open, setOpen] = useState(false);
  if (!hypeCenter && !peripherEffect) return null;
  return (
    <div style={{ background: "linear-gradient(135deg,rgba(255,140,0,0.08),rgba(200,100,50,0.04))", border: "1px solid rgba(255,140,0,0.2)", borderRadius: "13px", padding: "14px", marginBottom: "11px", overflow: "hidden" }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: open ? "9px" : "0" }}>
        <div style={{ display: "flex", gap: "7px", alignItems: "center" }}>
          <span style={{ fontSize: "16px" }}>🚀</span>
          <span style={{ fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", fontFamily: "'DM Mono'", color: "rgba(255,140,0,0.6)", fontWeight: "600" }}>Hype-Analyse</span>
        </div>
        <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.2)" }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && <>
        {hypeCenter && (
          <div style={{ padding: "10px", background: "rgba(255,140,0,0.05)", borderRadius: "9px", marginBottom: "9px" }}>
            <div style={{ fontSize: "8px", color: "rgba(255,140,0,0.5)", fontFamily: "'DM Mono'", marginBottom: "4px" }}>🎯 HYPE-CENTER</div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)", fontFamily: "'DM Mono'", lineHeight: "1.5" }}>{hypeCenter}</div>
          </div>
        )}
        {peripherEffect && (
          <div style={{ padding: "10px", background: "rgba(200,100,100,0.05)", borderRadius: "9px", marginBottom: "9px" }}>
            <div style={{ fontSize: "8px", color: "rgba(200,150,100,0.5)", fontFamily: "'DM Mono'", marginBottom: "4px" }}>🔄 PERIPHER-EFFEKT</div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)", fontFamily: "'DM Mono'", lineHeight: "1.5" }}>{peripherEffect}</div>
          </div>
        )}
      </>}
    </div>
  );
}

function NewsBoard({ news }) {
  if (!news || news.length === 0) return null;
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: "rgba(255,215,0,0.03)", border: "1px solid rgba(255,215,0,0.12)", borderRadius: "13px", marginBottom: "11px", overflow: "hidden" }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", cursor: "pointer" }}>
        <div style={{ display: "flex", gap: "7px", alignItems: "center" }}>
          <span style={{ fontSize: "16px" }}>📰</span>
          <span style={{ fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", fontFamily: "'DM Mono'", color: "rgba(255,215,0,0.5)", fontWeight: "600" }}>Hype-News ({news.length})</span>
        </div>
        <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.2)" }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,215,0,0.1)", maxHeight: "300px", overflowY: "auto" }}>
          {news.slice(0, 8).map((n, i) => (
            <div key={i} style={{ padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontSize: "11px", lineHeight: "1.6", color: "rgba(255,255,255,0.65)", fontFamily: "'DM Mono'" }}>
              <div style={{ color: "rgba(255,215,0,0.4)", fontSize: "9px", marginBottom: "3px" }}>{n.source}</div>
              <div style={{ color: "rgba(255,255,255,0.78)" }}>{n.title}</div>
              <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.22)", marginTop: "2px" }}>{n.publishedAt}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Brief({ text, date }) {
  return (
    <div style={{ background: "linear-gradient(135deg,rgba(255,215,0,0.07),rgba(255,140,0,0.03))", border: "1px solid rgba(255,215,0,0.18)", borderRadius: "13px", padding: "15px 17px", marginBottom: "11px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, right: 0, width: "90px", height: "90px", background: "radial-gradient(circle,rgba(255,215,0,0.06) 0%,transparent 70%)", transform: "translate(30%,-30%)", borderRadius: "50%" }} />
      <div style={{ fontSize: "8px", letterSpacing: "2px", color: "rgba(255,215,0,0.4)", fontFamily: "'DM Mono'", marginBottom: "9px" }}>✉️ PERSÖNLICHER BRIEF · {date}</div>
      <p style={{ fontSize: "13px", lineHeight: "1.85", color: "rgba(255,255,255,0.88)", margin: 0, fontStyle: "italic", fontFamily: "'DM Mono'" }}>{text}</p>
    </div>
  );
}

function Kalender({ history, onSelect }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState(null);

  // Build map: "YYYY-MM-DD" -> briefing
  const briefingMap = {};
  history.forEach(item => {
    if (!item.date) return;
    // Try to parse German date format
    try {
      const parts = item.date.split(", ")[1]?.split(" ");
      if (parts && parts.length >= 3) {
        const months = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
        const d = parseInt(parts[0]);
        const m = months.indexOf(parts[1]);
        const y = parseInt(parts[2]);
        if (d && m >= 0 && y) {
          const key = `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
          briefingMap[key] = item;
        }
      }
    } catch {}
  });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const monthNames = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
  const dayNames = ["Mo","Di","Mi","Do","Fr","Sa","So"];
  const todayKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y-1); } else setMonth(m => m-1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y+1); } else setMonth(m => m+1); };

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,215,0,0.12)", borderRadius: "14px", padding: "14px", marginBottom: "12px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <button onClick={prevMonth} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", fontSize: "18px", cursor: "pointer", padding: "4px 8px" }}>‹</button>
        <span style={{ fontSize: "12px", fontWeight: "600", color: "#FFD700", fontFamily: "'DM Mono'", letterSpacing: "1px" }}>{monthNames[month]} {year}</span>
        <button onClick={nextMonth} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", fontSize: "18px", cursor: "pointer", padding: "4px 8px" }}>›</button>
      </div>

      {/* Day names */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", marginBottom: "4px" }}>
        {dayNames.map(d => <div key={d} style={{ textAlign: "center", fontSize: "9px", color: "rgba(255,255,255,0.25)", fontFamily: "'DM Mono'", padding: "2px 0" }}>{d}</div>)}
      </div>

      {/* Days grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const key = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const hasBriefing = !!briefingMap[key];
          const isToday = key === todayKey;
          const isSelected = selected === key;
          return (
            <div key={key} onClick={() => { if (hasBriefing) { setSelected(key); onSelect(briefingMap[key]); } }}
              style={{
                aspectRatio: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                borderRadius: "8px", cursor: hasBriefing ? "pointer" : "default",
                background: isSelected ? "rgba(255,215,0,0.2)" : isToday ? "rgba(255,215,0,0.08)" : hasBriefing ? "rgba(0,200,100,0.08)" : "transparent",
                border: isSelected ? "1px solid rgba(255,215,0,0.5)" : isToday ? "1px solid rgba(255,215,0,0.25)" : hasBriefing ? "1px solid rgba(0,200,100,0.2)" : "1px solid transparent",
                transition: "all .15s"
              }}>
              <span style={{ fontSize: "11px", color: isSelected ? "#FFD700" : isToday ? "#FFD700" : hasBriefing ? "#00C896" : "rgba(255,255,255,0.35)", fontFamily: "'DM Mono'", fontWeight: hasBriefing || isToday ? "600" : "400" }}>{day}</span>
              {hasBriefing && <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: isSelected ? "#FFD700" : "#00C896", marginTop: "1px" }} />}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: "12px", marginTop: "10px", justifyContent: "center" }}>
        <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#00C896" }} />
          <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.35)", fontFamily: "'DM Mono'" }}>Briefing vorhanden</span>
        </div>
        <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#FFD700" }} />
          <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.35)", fontFamily: "'DM Mono'" }}>Heute</span>
        </div>
      </div>

      {selected && briefingMap[selected] && (
        <div style={{ marginTop: "10px", padding: "10px", background: "rgba(255,215,0,0.05)", border: "1px solid rgba(255,215,0,0.15)", borderRadius: "9px" }}>
          <div style={{ fontSize: "9px", color: "rgba(255,215,0,0.5)", fontFamily: "'DM Mono'", marginBottom: "5px" }}>📌 AUSGEWÄHLT</div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)", fontFamily: "'DM Mono'" }}>{briefingMap[selected].date}</div>
          <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", marginTop: "4px", fontFamily: "'DM Mono'" }}>{briefingMap[selected].sections?.brief?.slice(0, 80)}...</div>
          <button onClick={() => onSelect(briefingMap[selected])} style={{ marginTop: "8px", width: "100%", padding: "8px", background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.2)", borderRadius: "7px", color: "#FFD700", fontSize: "11px", cursor: "pointer", fontFamily: "'DM Mono'" }}>
            Briefing öffnen →
          </button>
        </div>
      )}
    </div>
  );
}

function GlossarModal({ term, onClose }) {
  if (!term) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "flex-end", padding: "16px" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#0F0F1A", border: "1px solid rgba(255,215,0,0.2)", borderRadius: "16px", padding: "20px", width: "100%", maxWidth: "480px", margin: "0 auto" }}>
        <div style={{ fontSize: "9px", letterSpacing: "2px", color: "rgba(255,215,0,0.45)", fontFamily: "'DM Mono'", marginBottom: "7px" }}>📖 GLOSSAR</div>
        <div style={{ fontSize: "18px", fontWeight: "800", fontFamily: "'Syne'", color: "#FFD700", marginBottom: "11px" }}>{term}</div>
        <div style={{ fontSize: "13px", lineHeight: "1.75", color: "rgba(255,255,255,0.7)", fontFamily: "'DM Mono'" }}>{GLOSSAR[term] || "Begriff nicht im Glossar."}</div>
        <button onClick={onClose} style={{ marginTop: "15px", width: "100%", padding: "12px", background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.2)", borderRadius: "9px", color: "#FFD700", fontFamily: "'Syne'", fontSize: "13px", cursor: "pointer" }}>Schließen</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════
export default function App() {
  const [unlocked, setUnlocked] = useState(ls.get("unlocked", false));
  const [tab, setTab] = useState("heute");
  const [briefing, setBriefing] = useState(ls.get("last_briefing", null));
  const [history, setHistory] = useState(ls.get("history", []));
  const [prices, setPrices] = useState({});
  const [fg, setFg] = useState(ls.get("fg_hist", [42]).slice(-1)[0]);
  const [fgHist, setFgHist] = useState(ls.get("fg_hist", [42]));
  const [sim, setSim] = useState(null);
  const [newsInput, setNewsInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [trades, setTrades] = useState(ls.get("trades", []));
  const [vorhersagen, setVorhersagen] = useState(ls.get("vorhersagen", []));
  const [lernBegriffe, setLernBegriffe] = useState(ls.get("lern_begriffe", []));
  const [glossarTerm, setGlossarTerm] = useState(null);
  const [newTrade, setNewTrade] = useState({ asset: "", entry: "", sl: "", target: "" });
  const [newVorhersage, setNewVorhersage] = useState("");
  const [schnell, setSchnell] = useState(false);
  const [disclaimer, setDisclaimer] = useState(ls.get("disclaimer", false));
  const [news, setNews] = useState(null);

  const s = briefing?.sections || null;
  const fgc = fg < 40 ? "#FF5050" : fg > 60 ? "#00C896" : "#FFB800";
  const fgLabel = fg < 25 ? "Ext. Angst" : fg < 45 ? "Angst" : fg < 55 ? "Neutral" : fg < 75 ? "Gier" : "Ext. Gier";
  const metrics = calcMetrics(trades);

  // Fetch prices
  useEffect(() => {
    if (!unlocked) return;
    const fetchPrices = async () => {
      const np = {};
      await Promise.all(TICKERS.map(async t => {
        try {
          const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t.symbol)}?interval=1d&range=2d`);
          const d = await r.json();
          const res = d?.chart?.result?.[0];
          if (res) {
            const closes = res.indicators.quote[0].close.filter(Boolean);
            const price = closes[closes.length - 1];
            const prev = closes[closes.length - 2] || price;
            np[t.symbol] = { price, change: ((price - prev) / prev) * 100 };
          }
        } catch {}
      }));
      setPrices(np);
      const gold = np["GC=F"]?.change || 0;
      setSim(runSimulation(fg ?? 42, gold));
    };
    fetchPrices();
    const iv = setInterval(fetchPrices, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [unlocked]);

  // Fetch F&G
  useEffect(() => {
    if (!unlocked) return;
    fetch("https://api.alternative.me/fng/?limit=7")
      .then(r => r.json())
      .then(d => {
        if (d?.data) {
          const vals = d.data.reverse().map(x => parseInt(x.value));
          setFgHist(vals); setFg(vals[vals.length - 1]);
          ls.set("fg_hist", vals);
        }
      }).catch(() => {});
  }, [unlocked]);

  // Lade briefing.json von public/ Ordner
  useEffect(() => {
    if (!unlocked) return;
    fetch('/market-brief/public/briefing.json')
      .then(r => r.json())
      .then(data => {
        if (data?.sections) {
          const nb = { date: data.date || today(), sections: data.sections };
          setBriefing(nb);
          ls.set("last_briefing", nb);
          if (data.fearGreed) { setFgHist(data.fearGreed); setFg(data.fearGreed[data.fearGreed.length - 1]); }
          if (data.simulation) setSim(data.simulation);
          if (data.news) setNews(data.news);
        }
      })
      .catch(() => {});
  }, [unlocked]);

  const handleUnlock = () => { ls.set("unlocked", true); setUnlocked(true); };

  const generate = async () => {
    if (!newsInput.trim()) return;
    setGenerating(true); setError(null);
    try {
      const pc = TICKERS.map(t => { const d = prices[t.symbol]; return d ? `${t.label}: ${d.price > 100 ? d.price.toFixed(0) : d.price.toFixed(4)} (${d.change >= 0 ? "+" : ""}${d.change.toFixed(2)}%)` : ""; }).filter(Boolean).join(", ");
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          system: MASTER_PROMPT,
          messages: [{ role: "user", content: `DATUM: ${today()}\nKURSE: ${pc}\nFEAR & GREED: ${fg}/100\nNACHRICHTEN:\n${newsInput}\n\nNur JSON zurückgeben.` }]
        })
      });
      const data = await resp.json();
      const text = data.content?.[0]?.text || "{}";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      const nb = { date: today(), sections: parsed };
      setBriefing(nb); ls.set("last_briefing", nb);
      const nh = [nb, ...history.slice(0, 29)];
      setHistory(nh); ls.set("history", nh);
      if (parsed.lernpunkt) {
        const b = [...new Set([...lernBegriffe, parsed.lernpunkt.split(":")[0]])].slice(0, 50);
        setLernBegriffe(b); ls.set("lern_begriffe", b);
      }
      setTab("heute");
    } catch (e) { setError("Fehler: " + e.message); }
    setGenerating(false);
  };

  const addTrade = () => {
    if (!newTrade.asset) return;
    const t = { ...newTrade, id: Date.now(), result: null };
    const u = [t, ...trades]; setTrades(u); ls.set("trades", u);
    setNewTrade({ asset: "", entry: "", sl: "", target: "" });
  };

  const closeTrade = (id, result) => {
    const u = trades.map(t => t.id === id ? { ...t, result: parseFloat(result) } : t);
    setTrades(u); ls.set("trades", u);
  };

  const addVorhersage = () => {
    if (!newVorhersage.trim()) return;
    const v = { text: newVorhersage, date: today(), checkDate: new Date(Date.now() + 7 * 86400000).toLocaleDateString("de-DE") };
    const u = [v, ...vorhersagen.slice(0, 19)]; setVorhersagen(u); ls.set("vorhersagen", u);
    setNewVorhersage("");
  };

  const TABS = [
    { id: "heute", label: "Heute" },
    { id: "realitaet", label: "Realität" },
    { id: "geldfluss", label: "Geld" },
    { id: "aktion", label: "Aktion" },
    { id: "charts", label: "Charts" },
    { id: "lernen", label: "Lernen" },
    { id: "verlauf", label: "Verlauf" },
    { id: "neu", label: "+ Neu" },
  ];

  if (!unlocked) return <PinScreen onUnlock={handleUnlock} />;

  return (
    <div style={{ minHeight: "100vh", background: "#07070F", color: "white", fontFamily: "'DM Mono'", maxWidth: "480px", margin: "0 auto" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { display: none; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .fade { animation: fadeUp .3s ease; }
        button:active { transform: scale(0.97); }
      `}</style>

      {/* DISCLAIMER */}
      {!disclaimer && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "#0F0F1A", border: "1px solid rgba(255,215,0,0.2)", borderRadius: "18px", padding: "22px", maxWidth: "400px" }}>
            <div style={{ fontSize: "20px", fontWeight: "800", fontFamily: "'Syne'", color: "#FFD700", marginBottom: "14px" }}>Wichtiger Hinweis</div>
            <p style={{ fontSize: "13px", lineHeight: "1.8", color: "rgba(255,255,255,0.68)", marginBottom: "14px" }}>Dies ist ein <strong style={{ color: "white" }}>Lern- und Analyse-Tool</strong>. Keine Finanzberatung. Du investierst auf eigene Verantwortung.</p>
            <p style={{ fontSize: "13px", lineHeight: "1.8", color: "rgba(255,255,255,0.68)", marginBottom: "18px" }}>50€ zu verlieren lehrt mehr als 50€ zu lesen. Starte klein. Denke langfristig.</p>
            <button onClick={() => { setDisclaimer(true); ls.set("disclaimer", true); }} style={{ width: "100%", padding: "13px", background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.25)", borderRadius: "10px", color: "#FFD700", fontSize: "14px", fontFamily: "'Syne'", fontWeight: "700", cursor: "pointer" }}>
              Verstanden – App öffnen
            </button>
          </div>
        </div>
      )}

      <GlossarModal term={glossarTerm} onClose={() => setGlossarTerm(null)} />

      {/* HEADER */}
      <div style={{ padding: "15px 14px 11px", position: "sticky", top: 0, zIndex: 100, background: "rgba(7,7,15,0.95)", backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(255,215,0,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "11px" }}>
          <div>
            <div style={{ fontSize: "8px", letterSpacing: "3px", color: "rgba(255,215,0,0.4)", marginBottom: "2px" }}>AYMAN'S</div>
            <div style={{ fontSize: "18px", fontWeight: "800", fontFamily: "'Syne'", background: "linear-gradient(135deg,#FFD700,#FF8C00)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Market Brief</div>
          </div>
          <div style={{ display: "flex", gap: "6px" }}>
            <button onClick={() => setSchnell(m => !m)} style={{ padding: "5px 9px", borderRadius: "8px", border: `1px solid ${schnell ? "rgba(255,215,0,0.35)" : "rgba(255,255,255,0.08)"}`, background: schnell ? "rgba(255,215,0,0.08)" : "transparent", color: schnell ? "#FFD700" : "rgba(255,255,255,0.35)", fontSize: "9px", cursor: "pointer" }}>
              {schnell ? "⚡" : "🧠"}
            </button>
            <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${fgc}33`, borderRadius: "9px", padding: "5px 8px", textAlign: "center" }}>
              <div style={{ fontSize: "7px", color: "rgba(255,255,255,0.22)" }}>F&G</div>
              <div style={{ fontSize: "12px", fontWeight: "700", color: fgc }}>{fg ?? "—"}</div>
            </div>
            <div style={{ background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.14)", borderRadius: "9px", padding: "5px 8px", textAlign: "center" }}>
              <div style={{ fontSize: "7px", color: "rgba(255,255,255,0.22)" }}>Budget</div>
              <div style={{ fontSize: "12px", fontWeight: "700", color: "#FFD700" }}>50€</div>
            </div>
          </div>
        </div>
        <TickerBar prices={prices} />
        <div style={{ display: "flex", gap: "3px", marginTop: "9px", overflowX: "auto" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "5px 11px", borderRadius: "18px", border: "none", cursor: "pointer", fontSize: "11px", fontFamily: "'DM Mono'", whiteSpace: "nowrap", background: tab === t.id ? "rgba(255,215,0,0.1)" : "transparent", color: tab === t.id ? "#FFD700" : "rgba(255,255,255,0.27)", outline: tab === t.id ? "1px solid rgba(255,215,0,0.2)" : "none", transition: "all .2s" }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* CONTENT */}
      <div className="fade" style={{ padding: "13px 13px 100px" }}>

        {/* ── HEUTE ── */}
        {tab === "heute" && <>
          <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.18)", marginBottom: "11px" }}>{briefing?.date || today()}</div>

          {/* Kein Briefing vorhanden */}
          {!s && (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: "40px", marginBottom: "16px" }}>📭</div>
              <div style={{ fontSize: "16px", fontWeight: "700", fontFamily: "'Syne'", color: "#FFD700", marginBottom: "10px" }}>Noch kein Briefing</div>
              <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", fontFamily: "'DM Mono'", lineHeight: "1.8", marginBottom: "20px" }}>
                Kein vorgeschriebener Inhalt.{"\n"}
                Echte Analyse kommt täglich um 06:00 Uhr{"\n"}
                wenn GitHub Actions eingerichtet ist.
              </div>
              <button onClick={() => setTab("neu")} style={{ padding: "12px 24px", background: "linear-gradient(135deg,rgba(255,215,0,0.15),rgba(255,140,0,0.1))", border: "1px solid rgba(255,215,0,0.3)", borderRadius: "12px", color: "#FFD700", fontSize: "13px", fontFamily: "'Syne'", fontWeight: "700", cursor: "pointer" }}>
                ⚡ Jetzt manuell generieren
              </button>
            </div>
          )}

          {s && s.widerspruch && !s.widerspruch.toLowerCase().startsWith("kein") && (
            <div style={{ background: "rgba(255,80,80,0.07)", border: "1px solid rgba(255,80,80,0.3)", borderRadius: "11px", padding: "11px 13px", marginBottom: "11px" }}>
              <div style={{ fontSize: "9px", letterSpacing: "2px", color: "#FF5050", marginBottom: "5px" }}>⚠️ SIGNAL-WIDERSPRUCH</div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.72)" }}>{s.widerspruch}</div>
            </div>
          )}

          {s && s.psychologie && (
            <div style={{ background: "rgba(255,184,0,0.06)", border: "1px solid rgba(255,184,0,0.28)", borderRadius: "11px", padding: "11px 13px", marginBottom: "11px" }}>
              <div style={{ fontSize: "9px", letterSpacing: "2px", color: "#FFB800", marginBottom: "5px" }}>🧠 PSYCHOLOGIE-WARNUNG</div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.72)" }}>{s.psychologie}</div>
            </div>
          )}

          {s && s.ruhigerTag && (
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "11px", padding: "11px 13px", marginBottom: "11px" }}>
              <div style={{ fontSize: "9px", letterSpacing: "2px", color: "rgba(255,255,255,0.28)", marginBottom: "5px" }}>😴 RUHIGER TAG</div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)" }}>Heute keine relevanten Makro-Ereignisse. Beobachten, nicht handeln.</div>
            </div>
          )}

          {s && <KernLeiste s={s} fg={fg} prices={prices} sim={sim} />}

          <HypeAnalysis hypeCenter={s?.hypeCenter} peripherEffect={s?.peripherEffect} hypeNews={s?.hypeNews} />

          <NewsBoard news={news} />

          {s && !schnell && <>
            <Brief text={s.brief} date={briefing?.date || today()} />
            <div style={{ marginBottom: "8px" }}>
              <div style={{ fontSize: "8px", letterSpacing: "2px", color: "rgba(255,255,255,0.22)", marginBottom: "7px" }}>📰 OBERFLÄCHE</div>
              {(s.oberflaeche || []).map((item, i) => (
                <div key={i} style={{ display: "flex", gap: "8px", padding: "8px 10px", marginBottom: "4px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: "8px" }}>
                  <span style={{ fontSize: "8px", color: "rgba(255,215,0,0.32)", minWidth: "52px", flexShrink: 0, marginTop: "1px" }}>{String(item).split(":")[0]}</span>
                  <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.62)", lineHeight: "1.5" }}>{String(item).split(":").slice(1).join(":")}</span>
                </div>
              ))}
            </div>
            <Block icon="📊" title="Marktreaktion" accent="rgba(100,200,255,0.18)">{s.markt}</Block>
          </>}
        </>}

        {/* ── REALITÄT ── */}
        {tab === "realitaet" && <>
          {!s ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: "40px", marginBottom: "16px" }}>📭</div>
              <div style={{ fontSize: "16px", fontWeight: "700", fontFamily: "'Syne'", color: "#FFD700", marginBottom: "10px" }}>Noch kein Briefing</div>
              <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", fontFamily: "'DM Mono'", lineHeight: "1.8" }}>
                Analyse kommt täglich um 06:00 Uhr.
              </div>
            </div>
          ) : <>
          <Block icon="🎭" title="Narrativ – Was die Masse glaubt" accent="rgba(200,100,255,0.2)">{s.narrativ}</Block>
          {!schnell && <>
            <Block icon="🧠" title="Realität – Was wirklich passiert" accent="rgba(150,100,255,0.22)">{s.realitaet}</Block>
            <Block icon="🧑‍💼" title="Macht & Interessen" accent="rgba(255,100,100,0.2)">{s.macht}</Block>
            <Block icon="🌐" title="Geopolitik" accent="rgba(0,200,255,0.2)">{s.geopolitik}</Block>
            <Block icon="⚠️" title="Masse-Fehler – Dein Edge" accent="rgba(255,120,0,0.22)">{s.masseFehler}</Block>
            <Block icon="🔄" title="Reflexivität" accent="rgba(180,100,255,0.2)">{s.reflexivitaet}</Block>
            <Block icon="🌀" title="Meta-Zyklus" accent="rgba(100,200,150,0.2)">{s.metaZyklus}</Block>
          </>}
          </>}
        </>}

        {/* ── GELD ── */}
        {tab === "geldfluss" && <>
          {!s ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: "40px", marginBottom: "16px" }}>📭</div>
              <div style={{ fontSize: "16px", fontWeight: "700", fontFamily: "'Syne'", color: "#FFD700", marginBottom: "10px" }}>Noch kein Briefing</div>
              <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", fontFamily: "'DM Mono'", lineHeight: "1.8" }}>
                Datenfluss-Analyse kommt täglich um 06:00 Uhr.
              </div>
            </div>
          ) : <>
          <Block icon="💸" title="Liquiditäts-Fluss" accent="rgba(0,255,150,0.2)">{s.liquiditaet}</Block>
          {!schnell && <>
            <Block icon="🔗" title="Kettenreaktion" accent="rgba(255,215,0,0.15)">{s.kette}</Block>
            <Block icon="⏱" title="Timing" accent="rgba(255,180,0,0.2)">{s.timing}</Block>
            <Block icon="📅" title="Saisonalität" accent="rgba(150,200,255,0.2)">{s.saisonalitaet}</Block>
            <Block icon="🧬" title="Smart Money (COT)" accent="rgba(0,200,255,0.2)">{s.positionierung}</Block>
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "11px", padding: "13px", marginBottom: "8px" }}>
              <div style={{ fontSize: "8px", letterSpacing: "2px", color: "rgba(255,255,255,0.22)", marginBottom: "9px" }}>😱 FEAR & GREED TREND (7 TAGE)</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "48px" }}>
                {fgHist.map((v, i) => <div key={i} style={{ flex: 1, borderRadius: "3px", background: v < 40 ? "#FF5050" : v > 60 ? "#00C896" : "#FFB800", height: `${v}%`, opacity: i === fgHist.length - 1 ? 1 : 0.4 }} />)}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "5px" }}>
                <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.22)" }}>7d ago</span>
                <span style={{ fontSize: "9px", color: fgc, fontWeight: "600" }}>{fg} – {fgLabel}</span>
              </div>
            </div>
          </>}
          </>}
        </>}

        {/* ── AKTION ── */}
        {tab === "aktion" && <>
          {!s ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: "40px", marginBottom: "16px" }}>📭</div>
              <div style={{ fontSize: "16px", fontWeight: "700", fontFamily: "'Syne'", color: "#FFD700", marginBottom: "10px" }}>Noch kein Briefing</div>
              <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", fontFamily: "'DM Mono'", lineHeight: "1.8" }}>
                Echte Entscheidungen und Charts kommen nach dem ersten automatischen Briefing um 06:00 Uhr.
              </div>
            </div>
          ) : <>
          <Block icon="💡" title="Opportunity" accent="rgba(255,215,0,0.22)">{s.opportunity || "Kein klares Setup heute."}</Block>
          <AsymmetrieCard a={s.asymmetrie} />
          {s.entscheidung === "JA" && <TradingViewChart asset={s.halalAsset} stopLoss={s.stopLoss} ziel={s.ziel} einstieg={s.einstieg} />}
          <Block icon="☪️" title={`Halal – ${s.halalStatus === "halal" ? "✅" : s.halalStatus === "zweifelhaft" ? "⚠️" : "❌"} ${s.halalAsset || ""}`} accent="rgba(0,200,100,0.2)">{s.halalBegruendung}</Block>
          <EntscheidungCard b={s} />
          {!schnell && (
            <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "11px", padding: "13px", marginBottom: "8px" }}>
              <div style={{ fontSize: "8px", letterSpacing: "2px", color: "rgba(255,255,255,0.22)", marginBottom: "9px" }}>📅 ZENTRALBANK-KALENDER</div>
              {ZENTRALBANK_TERMINE.map((t, i) => {
                const d = tagesBis(t.datum);
                if (d < 0) return null;
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize: "11px", color: d <= 7 ? "#FFB800" : "rgba(255,255,255,0.48)" }}>{t.event}</span>
                    <span style={{ fontSize: "11px", color: d <= 7 ? "#FFB800" : "rgba(255,255,255,0.28)", fontWeight: d <= 7 ? "600" : "400" }}>in {d}d</span>
                  </div>
                );
              })}
            </div>
          )}
          </>}
        </>}

        {/* ── CHARTS ── */}
        {tab === "charts" && <>
          <div style={{ fontSize: "8px", letterSpacing: "2px", color: "rgba(255,255,255,0.2)", marginBottom: "13px" }}>📈 CHARTS – TIPPE UM ZU ÖFFNEN</div>
          {TV_CHARTS.map(({ label, symbol }) => <ChartBlock key={symbol} label={label} symbol={symbol} />)}
          <div style={{ marginTop: "12px", padding: "12px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "11px" }}>
            <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono'", lineHeight: "1.7" }}>
              💡 Charts werden live von TradingView geladen. Kostenlos, kein Account nötig. Tippe auf einen Chart um ihn zu öffnen.
            </div>
          </div>
        </>}

        {/* ── LERNEN ── */}
        {tab === "lernen" && <>
          {!s ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: "40px", marginBottom: "16px" }}>📭</div>
              <div style={{ fontSize: "16px", fontWeight: "700", fontFamily: "'Syne'", color: "#FFD700", marginBottom: "10px" }}>Noch kein Briefing</div>
              <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", fontFamily: "'DM Mono'", lineHeight: "1.8" }}>
                Tagesfrage und Lernpunkt kommen mit dem ersten Briefing um 06:00 Uhr.
              </div>
            </div>
          ) : <>
          <Block icon="📖" title="Lernpunkt heute" accent="rgba(150,150,255,0.2)">{s.lernpunkt}</Block>
          <div style={{ background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.1)", borderRadius: "11px", padding: "13px", marginBottom: "8px" }}>
            <div style={{ fontSize: "8px", letterSpacing: "2px", color: "rgba(255,215,0,0.4)", marginBottom: "7px" }}>❓ TAGESFRAGE</div>
            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.78)", lineHeight: "1.7" }}>{s.tagesfrage}</div>
            <div style={{ marginTop: "9px", padding: "9px", background: "rgba(255,255,255,0.02)", borderRadius: "7px" }}>
              <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.28)", marginBottom: "4px" }}>💡 DIREKTE ERKLÄRUNG</div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", lineHeight: "1.7" }}>{s.lernpunkt}</div>
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "11px", padding: "13px", marginBottom: "8px" }}>
            <div style={{ fontSize: "8px", letterSpacing: "2px", color: "rgba(255,255,255,0.22)", marginBottom: "9px" }}>🔮 VORHERSAGE TRACKING</div>
            <div style={{ display: "flex", gap: "7px", marginBottom: "9px" }}>
              <input value={newVorhersage} onChange={e => setNewVorhersage(e.target.value)} placeholder="Deine Vorhersage..." style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "8px 9px", color: "white", fontSize: "12px", fontFamily: "'DM Mono'", outline: "none" }} />
              <button onClick={addVorhersage} style={{ padding: "8px 12px", background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.18)", borderRadius: "8px", color: "#FFD700", fontSize: "13px", cursor: "pointer" }}>+</button>
            </div>
            {vorhersagen.slice(0, 5).map((v, i) => (
              <div key={i} style={{ padding: "8px 9px", background: "rgba(255,255,255,0.02)", borderRadius: "7px", marginBottom: "4px" }}>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.58)" }}>{v.text}</div>
                <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.22)", marginTop: "3px" }}>Gesetzt: {v.date} · Prüfen: {v.checkDate}</div>
              </div>
            ))}
          </div>
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "11px", padding: "13px", marginBottom: "8px" }}>
            <div style={{ fontSize: "8px", letterSpacing: "2px", color: "rgba(255,255,255,0.22)", marginBottom: "9px" }}>📚 GLOSSAR – TIPPE AUF EINEN BEGRIFF</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
              {Object.keys(GLOSSAR).map(term => (
                <button key={term} onClick={() => setGlossarTerm(term)} style={{ padding: "4px 9px", borderRadius: "18px", border: `1px solid ${lernBegriffe.includes(term) ? "rgba(255,215,0,0.28)" : "rgba(255,255,255,0.07)"}`, background: lernBegriffe.includes(term) ? "rgba(255,215,0,0.07)" : "transparent", color: lernBegriffe.includes(term) ? "#FFD700" : "rgba(255,255,255,0.32)", fontSize: "10px", cursor: "pointer", fontFamily: "'DM Mono'" }}>{term}</button>
              ))}
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "11px", padding: "13px" }}>
            <div style={{ fontSize: "8px", letterSpacing: "2px", color: "rgba(255,255,255,0.22)", marginBottom: "9px" }}>☪️ ISLAM & WIRTSCHAFT</div>
            {[
              { f: "Warum ist Riba (Zins) verboten?", a: "Zins schafft Geld aus Geld ohne echte Arbeit. Es vergrößert Ungleichheit. Islam fordert Gewinn nur durch echten Wert – Arbeit, Handel, Risiko." },
              { f: "Warum bevorzugt der Islam Gold?", a: "Gold ist ein realer Wert – er kann nicht beliebig vermehrt werden wie Papiergeld. Er schützt vor Inflation und staatlicher Manipulation." },
              { f: "Was ist Gharar?", a: "Übermäßige Unsicherheit in einem Vertrag. Optionen und Futures sind oft Gharar weil man etwas verkauft was man noch nicht besitzt." },
            ].map((item, i) => (
              <div key={i} style={{ marginBottom: "10px", padding: "10px", background: "rgba(255,255,255,0.02)", borderRadius: "8px" }}>
                <div style={{ fontSize: "12px", color: "#FFD700", marginBottom: "5px", fontWeight: "600" }}>{item.f}</div>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", lineHeight: "1.7" }}>{item.a}</div>
              </div>
            ))}
          </div>
          </>}
        </>}

        {/* ── VERLAUF ── */}
        {tab === "verlauf" && <>
          <Kalender history={history} onSelect={(item) => { setBriefing(item); setTab("heute"); }} />
          {metrics && (
            <div style={{ background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.14)", borderRadius: "11px", padding: "13px", marginBottom: "11px" }}>
              <div style={{ fontSize: "8px", letterSpacing: "2px", color: "rgba(255,215,0,0.4)", marginBottom: "9px" }}>📊 TRACK RECORD ({metrics.total} Trades)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "7px" }}>
                {[["Win-Rate", `${(metrics.wr * 100).toFixed(0)}%`, metrics.wr > 0.5 ? "#00C896" : "#FF5050"], ["Expectancy", metrics.exp > 0 ? `+${metrics.exp.toFixed(2)}€` : `${metrics.exp.toFixed(2)}€`, metrics.exp > 0 ? "#00C896" : "#FF5050"], ["Max DD", `${(metrics.mdd * 100).toFixed(0)}%`, metrics.mdd < 0.1 ? "#00C896" : "#FFB800"]].map(([k, v, c]) => (
                  <div key={k} style={{ background: "rgba(255,255,255,0.03)", borderRadius: "8px", padding: "8px", textAlign: "center" }}>
                    <div style={{ fontSize: "8px", color: "rgba(255,255,255,0.28)" }}>{k}</div>
                    <div style={{ fontSize: "13px", fontWeight: "700", color: c }}>{v}</div>
                  </div>
                ))}
              </div>
              {metrics.total < 100 && <div style={{ marginTop: "9px", fontSize: "10px", color: "rgba(255,184,0,0.65)", textAlign: "center" }}>⚠️ Noch {100 - metrics.total} Trades bis zur statistischen Signifikanz</div>}
            </div>
          )}
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "11px", padding: "13px", marginBottom: "11px" }}>
            <div style={{ fontSize: "8px", letterSpacing: "2px", color: "rgba(255,255,255,0.22)", marginBottom: "9px" }}>📝 TRADE JOURNAL</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px", marginBottom: "8px" }}>
              {[["asset", "Asset (z.B. Xetra-Gold)"], ["entry", "Einstieg €"], ["sl", "Stop-Loss €"], ["target", "Ziel €"]].map(([k, ph]) => (
                <input key={k} value={newTrade[k]} onChange={e => setNewTrade(t => ({ ...t, [k]: e.target.value }))} placeholder={ph} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "8px", padding: "8px", color: "white", fontSize: "11px", fontFamily: "'DM Mono'", outline: "none" }} />
              ))}
            </div>
            <button onClick={addTrade} style={{ width: "100%", padding: "9px", background: "rgba(255,215,0,0.07)", border: "1px solid rgba(255,215,0,0.18)", borderRadius: "8px", color: "#FFD700", fontSize: "12px", cursor: "pointer", fontFamily: "'DM Mono'" }}>+ Trade hinzufügen</button>
            {trades.slice(0, 10).map(t => (
              <div key={t.id} style={{ marginTop: "7px", padding: "9px", background: "rgba(255,255,255,0.02)", borderRadius: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12px", color: "white" }}>{t.asset}</span>
                  <span style={{ fontSize: "10px", color: t.result === null ? "#FFB800" : t.result > 0 ? "#00C896" : "#FF5050" }}>
                    {t.result === null ? "Offen" : `${t.result > 0 ? "+" : ""}${t.result.toFixed(2)}€`}
                  </span>
                </div>
                <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.28)", marginTop: "3px" }}>Ein: {t.entry}€ · SL: {t.sl}€ · Ziel: {t.target}€</div>
                {t.result === null && (
                  <div style={{ display: "flex", gap: "5px", marginTop: "5px" }}>
                    <input placeholder="Ergebnis €" id={`r-${t.id}`} style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "6px", padding: "5px 7px", color: "white", fontSize: "11px", fontFamily: "'DM Mono'", outline: "none" }} />
                    <button onClick={() => { const el = document.getElementById(`r-${t.id}`); if (el?.value) closeTrade(t.id, el.value); }} style={{ padding: "5px 9px", background: "rgba(0,200,100,0.08)", border: "1px solid rgba(0,200,100,0.18)", borderRadius: "6px", color: "#00C896", fontSize: "10px", cursor: "pointer" }}>✓</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ fontSize: "8px", letterSpacing: "2px", color: "rgba(255,255,255,0.18)", marginBottom: "7px" }}>BRIEFING VERLAUF</div>
          {history.slice(0, 20).map((item, i) => (
            <div key={i} onClick={() => { setBriefing(item); setTab("heute"); }} style={{ background: i === 0 ? "rgba(255,215,0,0.04)" : "rgba(255,255,255,0.015)", border: `1px solid ${i === 0 ? "rgba(255,215,0,0.14)" : "rgba(255,255,255,0.04)"}`, borderRadius: "10px", padding: "11px 13px", marginBottom: "5px", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "11px", color: i === 0 ? "#FFD700" : "rgba(255,255,255,0.52)" }}>{i === 0 ? "📌 " : ""}{item.date}</span>
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.18)" }}>→</span>
              </div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.28)", marginTop: "4px" }}>{item.sections?.brief?.slice(0, 65)}...</div>
            </div>
          ))}
        </>}

        {/* ── NEU ── */}
        {tab === "neu" && <>
          <div style={{ background: "rgba(255,215,0,0.03)", border: "1px solid rgba(255,215,0,0.09)", borderRadius: "11px", padding: "12px", marginBottom: "11px" }}>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.48)", lineHeight: "1.7" }}>
              💡 Füge aktuelle Nachrichten ein. KI analysiert <strong style={{ color: "#FFD700" }}>20 Ebenen</strong> inkl. Live-Kurse.
            </div>
            <div style={{ marginTop: "7px", fontSize: "9px", color: "rgba(255,215,0,0.28)" }}>reuters.com · tagesschau.de/wirtschaft · ecb.europa.eu · federalreserve.gov</div>
          </div>
          <textarea value={newsInput} onChange={e => setNewsInput(e.target.value)} placeholder="Aktuelle Nachrichten einfügen..." style={{ width: "100%", minHeight: "130px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "10px", padding: "11px", color: "white", fontSize: "12px", fontFamily: "'DM Mono'", resize: "vertical", outline: "none", lineHeight: "1.6" }} />
          {error && <div style={{ color: "#FF5050", fontSize: "11px", padding: "8px", background: "rgba(255,80,80,0.04)", borderRadius: "7px", marginTop: "6px" }}>{error}</div>}
          <button onClick={generate} disabled={generating || !newsInput.trim()} style={{ width: "100%", marginTop: "8px", padding: "13px", borderRadius: "10px", border: "1px solid rgba(255,215,0,0.2)", cursor: generating || !newsInput.trim() ? "not-allowed" : "pointer", background: generating || !newsInput.trim() ? "rgba(255,215,0,0.03)" : "linear-gradient(135deg,rgba(255,215,0,0.12),rgba(255,140,0,0.07))", color: generating || !newsInput.trim() ? "rgba(255,255,255,0.18)" : "#FFD700", fontSize: "13px", fontWeight: "700", fontFamily: "'Syne'", animation: generating ? "pulse 1.4s infinite" : "none", transition: "all .2s" }}>
            {generating ? "⏳ Analysiere 20 Ebenen..." : "⚡ Briefing generieren"}
          </button>
          <div style={{ marginTop: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "10px", padding: "12px" }}>
            <div style={{ fontSize: "8px", letterSpacing: "2px", color: "rgba(255,255,255,0.18)", marginBottom: "9px" }}>📡 LIVE-DATEN (AUTO)</div>
            {TICKERS.map(t => { const d = prices[t.symbol]; return (
              <div key={t.symbol} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.38)" }}>{t.emoji} {t.label}</span>
                <span style={{ fontSize: "10px", color: d ? (d.change >= 0 ? "#00C896" : "#FF5050") : "rgba(255,255,255,0.15)" }}>{d ? `${d.price > 100 ? d.price.toFixed(0) : d.price.toFixed(4)} (${d.change >= 0 ? "+" : ""}${d.change.toFixed(2)}%)` : "Laden..."}</span>
              </div>
            ); })}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.38)" }}>😱 Fear & Greed</span>
              <span style={{ fontSize: "10px", color: fgc }}>{fg}/100 – {fgLabel}</span>
            </div>
          </div>
          <div style={{ marginTop: "11px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "10px", padding: "12px" }}>
            <div style={{ fontSize: "8px", letterSpacing: "2px", color: "rgba(255,255,255,0.18)", marginBottom: "9px" }}>🔑 API KEYS</div>
            {[["Gemini API ✅", "aistudio.google.com", "Bereits eingerichtet"], ["NewsData.io", "newsdata.io", "Kostenlos registrieren"], ["Marketaux", "marketaux.com", "Kostenlos registrieren"], ["Alpha Vantage", "alphavantage.co", "25 Req/Tag kostenlos"]].map(([n, u, note]) => (
              <div key={n} style={{ padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)" }}>{n}</div>
                <div style={{ fontSize: "9px", color: "rgba(255,215,0,0.3)" }}>{u} · {note}</div>
              </div>
            ))}
            <div style={{ marginTop: "7px", fontSize: "9px", color: "rgba(255,255,255,0.18)" }}>Yahoo Finance, Stooq, CFTC, EZB RSS, Fed RSS, Alternative.me → kein Key ✅</div>
          </div>
        </>}

      </div>

      {/* BOTTOM */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: "480px", padding: "9px 14px", background: "rgba(7,7,15,0.96)", borderTop: "1px solid rgba(255,215,0,0.05)", backdropFilter: "blur(20px)", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: "8px", color: "rgba(255,255,255,0.12)", fontFamily: "'DM Mono'" }}>follow the money</span>
        <span style={{ fontSize: "8px", color: "rgba(255,215,0,0.22)", fontFamily: "'DM Mono'" }}>☪️ halal only · kein Finanzrat</span>
      </div>
    </div>
  );
}
