"""
Baut market.db (SQLite) aus allen gespeicherten Tagen in public/archive/.

Starten (im Repo-Ordner):   python scripts/build_db.py
Ansehen und abfragen mit:   DB Browser for SQLite (kostenlos, sqlitebrowser.org)

Die Datenbank wird bei jedem Start komplett neu gebaut. Du kannst also nichts kaputt machen –
im schlimmsten Fall löschst du market.db und startest das Skript noch einmal.
"""
import json
import re
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ARCHIV = ROOT / "public" / "archive"
TRACKER = ROOT / "public" / "tracker.json"
DB = ROOT / "market.db"

SCHEMA = """
-- Ein Eintrag pro gespeichertem Tag
CREATE TABLE tage (
    datum          TEXT PRIMARY KEY,   -- 'YYYY-MM-DD'
    datum_text     TEXT,               -- 'Freitag, 16. Oktober 2026'
    generiert_um   TEXT,
    analyse_ok     INTEGER,            -- 1 = KI-Analyse vorhanden, 0 = nur Daten
    modell         TEXT,
    entscheidung   TEXT,               -- JA / NEIN / WARTEN
    fear_greed     INTEGER,            -- 0 = extreme Angst, 100 = extreme Gier
    sim_kauf       INTEGER,
    sim_halten     INTEGER,
    sim_verkauf    INTEGER,
    marktlage      TEXT,
    neu_heute      TEXT,
    brief          TEXT
);

-- Kurse und Kennzahlen: ein Eintrag pro Tag und Markt
CREATE TABLE kurse (
    datum          TEXT REFERENCES tage(datum),
    symbol         TEXT,               -- z.B. 'GC=F'
    markt          TEXT,               -- z.B. 'Gold'
    kurs           REAL,
    veraend_1t     REAL,               -- Prozent
    veraend_5t     REAL,
    veraend_20t    REAL,
    abstand_hoch   REAL,               -- Prozent zum 3-Monats-Hoch (negativ = darunter)
    rsi            INTEGER,            -- über 70 = stark gelaufen, unter 30 = stark gefallen
    vola           REAL,               -- Schwankung aufs Jahr, Prozent
    atr_pct        REAL,               -- normale Tagesschwankung, Prozent
    PRIMARY KEY (datum, symbol)
);

-- Jede Schlagzeile, die an einem Tag in die Analyse ging
CREATE TABLE news (
    id             INTEGER PRIMARY KEY,
    datum          TEXT REFERENCES tage(datum),
    herkunft       TEXT,               -- welche API: GNews, AlphaVantage, Finnhub, Marketaux
    quelle         TEXT,               -- z.B. Reuters
    titel          TEXT,
    stimmung       TEXT,               -- Bullish / Neutral / Bearish ... (nur manche APIs)
    veroeffentlicht TEXT
);

-- Welche Aktien/Assets eine News betrifft, mit Stimmungswert (-1 bis +1)
CREATE TABLE news_ticker (
    news_id        INTEGER REFERENCES news(id),
    ticker         TEXT,
    score          REAL
);

-- Von der KI gebündelte Ereignisse
CREATE TABLE ereignisse (
    id             INTEGER PRIMARY KEY,
    datum          TEXT REFERENCES tage(datum),
    ereignis       TEXT,
    typ            TEXT,               -- Fakt / Meinung / Spekulation
    neu            INTEGER,            -- 1 = neu, 0 = schon bekannt
    quellen        INTEGER,
    betroffen      TEXT,
    wirkung        TEXT
);

-- Wirkungsketten: A -> B -> C
CREATE TABLE ketten (
    id             INTEGER PRIMARY KEY,
    datum          TEXT REFERENCES tage(datum),
    ausloeser      TEXT,
    kette          TEXT,
    warum          TEXT,
    asset          TEXT,
    richtung       TEXT,
    halal          TEXT
);

-- Jede Idee der KI. id hat dasselbe Format wie im Tracker: 'YYYY-MM-DD#rang'
CREATE TABLE ideen (
    id             TEXT PRIMARY KEY,
    datum          TEXT REFERENCES tage(datum),
    rang           INTEGER,
    asset          TEXT,
    isin           TEXT,
    klasse         TEXT,
    basiswert      TEXT,
    richtung       TEXT,               -- LONG / MEIDEN / REDUZIEREN
    halal          TEXT,
    ueberzeugung   TEXT,               -- niedrig / mittel / hoch
    einstieg       REAL,
    stop           REAL,
    ziel           REAL,
    zeitraum       TEXT,
    kette          TEXT,
    eingepreist    TEXT,
    plausibel      INTEGER,            -- 1 = Code-Prüfung bestanden
    verifiziert    INTEGER,            -- 1 = gegen echten Kurs geprüft
    verlust_eur    REAL,               -- bei 50 € Einsatz inkl. Gebühren
    gewinn_eur     REAL,
    crv_netto      REAL,
    break_even     REAL                -- nötige Trefferquote in Prozent
);

-- Ergebnis jeder ausgewerteten Idee (aus dem Tracker)
CREATE TABLE ergebnisse (
    idee_id        TEXT PRIMARY KEY REFERENCES ideen(id),
    status         TEXT,               -- ziel / stop / abgelaufen / nicht_ausgeloest / laeuft / offen
    am             TEXT,
    tage           INTEGER,
    ergebnis_eur   REAL                -- bei 50 € Einsatz, nach Gebühren
);
"""


VIEWS = """
-- Fertige Auswertungen. In DB Browser: Tab "Daten durchsuchen" -> oben bei "Tabelle" auswählen.

CREATE VIEW v_tagesuebersicht AS
SELECT t.datum, t.entscheidung, t.fear_greed,
       (SELECT asset FROM ideen i WHERE i.datum = t.datum ORDER BY rang LIMIT 1) AS top_idee,
       (SELECT COUNT(*) FROM ideen i WHERE i.datum = t.datum) AS ideen,
       (SELECT COUNT(*) FROM news n WHERE n.datum = t.datum) AS news,
       CASE WHEN t.analyse_ok = 1 THEN 'ja' ELSE 'nein, nur Daten' END AS ki_analyse,
       t.marktlage
FROM tage t ORDER BY t.datum DESC;

CREATE VIEW v_ideen_mit_ergebnis AS
SELECT i.datum, i.rang, i.asset, i.richtung, i.halal, i.ueberzeugung, i.basiswert,
       i.einstieg, i.stop, i.ziel, i.crv_netto AS chance_risiko,
       ROUND(i.break_even) AS noetige_trefferquote,
       COALESCE(e.status, 'nicht ausgewertet') AS status, e.ergebnis_eur, i.kette
FROM ideen i LEFT JOIN ergebnisse e ON e.idee_id = i.id
ORDER BY i.datum DESC, i.rang;

CREATE VIEW v_bilanz AS
SELECT COUNT(*) AS abgeschlossen,
       SUM(status = 'ziel') AS ziel, SUM(status = 'stop') AS stop, SUM(status = 'abgelaufen') AS abgelaufen,
       ROUND(100.0 * SUM(status = 'ziel') / NULLIF(COUNT(*), 0), 1) AS trefferquote,
       ROUND(SUM(ergebnis_eur), 2) AS summe_eur,
       ROUND(AVG(ergebnis_eur), 2) AS schnitt_pro_idee_eur,
       ROUND(SUM(ergebnis_eur) + 2 * COUNT(*), 2) AS summe_ohne_gebuehren_eur
FROM ergebnisse WHERE status IN ('ziel', 'stop', 'abgelaufen');

CREATE VIEW v_kalibrierung AS
SELECT COALESCE(i.ueberzeugung, 'unbekannt') AS ueberzeugung, COUNT(*) AS abgeschlossen,
       SUM(e.status = 'ziel') AS ziel_erreicht,
       ROUND(100.0 * SUM(e.status = 'ziel') / COUNT(*), 1) AS trefferquote,
       ROUND(SUM(e.ergebnis_eur), 2) AS summe_eur
FROM ideen i JOIN ergebnisse e ON e.idee_id = i.id
WHERE e.status IN ('ziel', 'stop', 'abgelaufen')
GROUP BY 1 ORDER BY trefferquote DESC;

CREATE VIEW v_haeufigste_assets AS
SELECT asset, COUNT(*) AS genannt, SUM(richtung LIKE '%LONG%') AS davon_kaufen,
       MIN(datum) AS erstmals, MAX(datum) AS zuletzt
FROM ideen GROUP BY asset ORDER BY genannt DESC;

CREATE VIEW v_marktverlauf AS
SELECT markt, datum, kurs, veraend_1t, veraend_5t, veraend_20t, abstand_hoch, rsi, vola,
       CASE WHEN rsi > 70 THEN 'stark gelaufen' WHEN rsi < 30 THEN 'stark gefallen' ELSE '' END AS rsi_signal
FROM kurse ORDER BY markt, datum DESC;

CREATE VIEW v_extreme_tage AS
SELECT datum, markt, veraend_1t, rsi
FROM kurse WHERE ABS(veraend_1t) >= 2 OR rsi > 75 OR rsi < 25
ORDER BY datum DESC, ABS(veraend_1t) DESC;

CREATE VIEW v_ticker_stimmung AS
SELECT nt.ticker, COUNT(*) AS erwaehnungen, ROUND(AVG(nt.score), 2) AS stimmung_schnitt,
       SUM(n.stimmung LIKE '%Bullish%') AS bullish, SUM(n.stimmung LIKE '%Bearish%') AS bearish
FROM news_ticker nt JOIN news n ON n.id = nt.news_id
GROUP BY nt.ticker HAVING COUNT(*) >= 2 ORDER BY erwaehnungen DESC;

CREATE VIEW v_ereignisse AS
SELECT datum, typ, CASE WHEN neu = 1 THEN 'neu' ELSE 'bekannt' END AS neu_oder_bekannt,
       quellen, ereignis, betroffen, wirkung
FROM ereignisse ORDER BY datum DESC;
"""


def zahl(x):
    """'56,85 €' -> 56.85, '4.023,50' -> 4023.5, None -> None"""
    if x is None or isinstance(x, bool):
        return None
    if isinstance(x, (int, float)):
        return float(x)
    s = re.sub(r"[^\d.,-]", "", str(x))
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def jein(x):
    return None if x is None else (1 if x else 0)


def baue():
    if DB.exists():
        try:
            DB.unlink()
        except PermissionError:
            print("market.db ist noch geöffnet (z.B. im DB Browser).")
            print("Bitte dort 'Datenbank schließen' klicken und update.bat nochmal starten.")
            return
    con = sqlite3.connect(DB)
    con.executescript(SCHEMA)
    con.executescript(VIEWS)
    dateien = sorted(p for p in ARCHIV.glob("*.json") if re.fullmatch(r"\d{4}-\d{2}-\d{2}\.json", p.name))
    if not dateien:
        print(f"Keine Archiv-Tage gefunden in {ARCHIV}. Erst 'git pull' machen.")
        return

    for pfad in dateien:
        try:
            t = json.loads(pfad.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            print(f"Übersprungen: {pfad.name} ({e})")
            continue
        datum = t.get("dateKey") or pfad.stem
        s = t.get("sections") or {}
        fg = t.get("fearGreed") or []
        sim = t.get("simulation") or {}
        con.execute(
            "INSERT INTO tage VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (datum, t.get("date"), t.get("generatedAt"), 1 if len(s) > 5 else 0, s.get("_modell"),
             s.get("entscheidung"), fg[-1] if fg else None, sim.get("buy"), sim.get("hold"), sim.get("sell"),
             s.get("marktlage"), s.get("neuHeute"), s.get("brief")),
        )
        for symbol, k in (t.get("prices") or {}).items():
            if not isinstance(k, dict):
                continue
            con.execute(
                "INSERT OR IGNORE INTO kurse VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (datum, symbol, k.get("label"), zahl(k.get("price")), zahl(k.get("change")), zahl(k.get("ch5")),
                 zahl(k.get("ch20")), zahl(k.get("abstandHoch")), k.get("rsi"), zahl(k.get("vola")), zahl(k.get("atrPct"))),
            )
        for n in t.get("news") or []:
            cur = con.execute(
                "INSERT INTO news (datum, herkunft, quelle, titel, stimmung, veroeffentlicht) VALUES (?,?,?,?,?,?)",
                (datum, n.get("origin"), n.get("source"), n.get("title"), n.get("sentiment"), n.get("publishedAt")),
            )
            for tk in n.get("tickers") or []:
                m = re.fullmatch(r"(.+)\(([-\d.]+|\?)\)", str(tk))
                if m:
                    con.execute("INSERT INTO news_ticker VALUES (?,?,?)", (cur.lastrowid, m.group(1), zahl(m.group(2))))
        for e in s.get("ereignisse") or []:
            con.execute(
                "INSERT INTO ereignisse (datum, ereignis, typ, neu, quellen, betroffen, wirkung) VALUES (?,?,?,?,?,?,?)",
                (datum, e.get("ereignis"), e.get("typ"), jein(e.get("neu")), e.get("quellen"), e.get("betroffen"), e.get("wirkung")),
            )
        for b in s.get("bewegungen") or []:
            inv = b.get("investierbar") or {}
            con.execute(
                "INSERT INTO ketten (datum, ausloeser, kette, warum, asset, richtung, halal) VALUES (?,?,?,?,?,?,?)",
                (datum, b.get("ausloeser"), b.get("kette"), b.get("warum"), inv.get("asset"), inv.get("richtung"), inv.get("halal")),
            )
        for i, c in enumerate(s.get("chancen") or []):
            r = c.get("rechnung") or {}
            rang = c.get("rang") or i + 1
            con.execute(
                "INSERT OR IGNORE INTO ideen VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (f"{datum}#{rang}", datum, rang, c.get("asset"), c.get("isin"), c.get("klasse"), c.get("basiswert"),
                 c.get("richtung"), c.get("halal"), c.get("ueberzeugung"),
                 zahl(r.get("einstieg", c.get("einstieg"))), zahl(r.get("stop", c.get("stopLoss"))), zahl(r.get("ziel", c.get("ziel"))),
                 c.get("zeitraum"), c.get("kette"), c.get("eingepreist"), jein(r.get("plausibel")), jein(r.get("verifiziert")),
                 zahl(r.get("verlustEur")), zahl(r.get("gewinnEur")), zahl(r.get("crvNetto")), zahl(r.get("breakEven"))),
            )

    if TRACKER.exists():
        try:
            for p in json.loads(TRACKER.read_text(encoding="utf-8")).get("prognosen", []):
                con.execute("INSERT OR IGNORE INTO ergebnisse VALUES (?,?,?,?,?)",
                            (p.get("id"), p.get("status"), p.get("am") or p.get("seit"), p.get("tage"), zahl(p.get("ergebnisEur"))))
        except (json.JSONDecodeError, OSError) as e:
            print(f"tracker.json übersprungen ({e})")

    con.commit()
    print(f"Fertig: {DB}")
    for tabelle in ["tage", "kurse", "news", "news_ticker", "ereignisse", "ketten", "ideen", "ergebnisse"]:
        print(f"  {tabelle:<12} {con.execute(f'SELECT COUNT(*) FROM {tabelle}').fetchone()[0]:>6} Zeilen")
    print("Fertige Auswertungen (im DB Browser unter 'Daten durchsuchen'):")
    for (name,) in con.execute("SELECT name FROM sqlite_master WHERE type = 'view' ORDER BY name"):
        print(f"  {name}")
    con.close()


if __name__ == "__main__":
    baue()
