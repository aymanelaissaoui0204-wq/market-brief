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
        DB.unlink()
    con = sqlite3.connect(DB)
    con.executescript(SCHEMA)
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
    con.close()


if __name__ == "__main__":
    baue()
