# World Sim – Entwicklungsplan

Bezieht sich auf die Anforderungs-IDs in [ANFORDERUNGEN.md](./ANFORDERUNGEN.md).

## Technische Architektur

```
src/
  sim/        Reine Simulation (kein DOM, kein Three.js) – testbar mit Vitest
    clock.ts       Spielzeit, Geschwindigkeiten, feste Ticks
    economy.ts     Konten, Buchungen, Monatsabrechnung
    company.ts     Firmengründung, Schritte, Personal
    construction.ts Bauprojekte, Phasen, laufende Kosten
    casino.ts      Roulette mit echten Wahrscheinlichkeiten
    state.ts       Gesamter Spielstand + Speichern/Laden
  data/       Spieltabellen (Länder, Branchen, Gebäude, Maschinen, Casinos, Geschäfte)
  render/     Three.js-Darstellung
    worldMap.ts    Länder, Grenzen, Straßen, Bahn, Häfen, Städte
    cityView.ts    Grundstücke, Straßen, Gebäude der Stadt
    models.ts      Prozedurale Low-Poly-Modelle (Fabrik, Haus, Kran, Bagger …)
    player.ts      Spielerfigur + Third-Person-Kamera
  ui/         HTML-Overlay (Leisten, Panels, Dialoge)
scripts/
  prepare-data.mjs Natural-Earth-Rohdaten → kompakte JSON-Dateien
public/data/  Vorverarbeitete Kartendaten
```

**Grundsätze**
- Simulation und Darstellung sind getrennt. Die Darstellung liest den Zustand, die UI löst Aktionen aus.
- Die Uhr läuft in festen Simulationsschritten; bei hohen Geschwindigkeiten werden mehrere Schritte pro Frame gerechnet (X-04).
- Weltkarte in Mercator-Projektion als flache 3D-Ebene; die Stadtansicht ist eine eigene Szene in Metern.
- Alle Modelle werden im Code aus Grundformen gebaut (keine fremden Assets, L-03).

## Phasen

### Phase 0 – Grundlagen (dieser erste Schritt)
- Anforderungen und Plan (diese Dokumente)
- Projekt-Setup: Vite + TypeScript + Three.js + Vitest
- Datenpipeline: Natural Earth → `public/data/*.json` (Länder, Städte, Autobahnen, Bahn, Häfen)
- `ATTRIBUTION.md`

### Phase 1 – Spielbarer Prototyp (MVP-Kern)
| Paket | Inhalt | Anforderungen |
|---|---|---|
| 1.1 Weltkarte | Länderflächen, kräftige Grenzen, Städte, Autobahnen, Bahn, Häfen, Schifffahrtsrouten, Ebenen-Schalter, Zoom/Pan | W-01, W-02, U-02, U-03, U-04 |
| 1.2 Spielstart | Land + Stadt wählen, Name, Startbudget | C-01 … C-04 |
| 1.3 Uhr & Timebar | Pause, 1×–100×, Schnellvorlauf 1.000×/10.000× | T-01 … T-03, T-05 |
| 1.4 Geld | Geldbörserl, Firmenkonto, Einlage/Entnahme, Kontoauszug, Lebenshaltungskosten | G-01 … G-03, G-08, C-07 |
| 1.5 Firma | Gründungs-Assistent Schlosserei mit realen Schritten und Wartezeiten | F-01 … F-03, F-05, S-01, S-02 |
| 1.6 Stadtansicht | Prozedurale Stadt um echte Koordinaten, Zonen, Grundstücke, erkennbare Gebäude, Casinos/Geschäfte | W-03, W-06, U-05, U-06 |
| 1.7 Bauen | Grundstück kaufen, Gebäude wählen, Bauphasen, Arbeiter/Maschinen sichtbar, laufende Kosten | B-01 … B-05 |
| 1.8 Privat | Haus/Grundstück privat kaufen, Roulette | P-01, P-04, P-05 |
| 1.9 Spielerfigur | Block-Figur, WASD, Third-Person | U-07 |
| 1.10 Speichern | localStorage, Autosave | U-15, X-05 |

### Phase 2 – Wirtschaft wird lebendig
- Personal einstellen mit Löhnen nach Land, Lohnnebenkosten (F-04)
- Maschinen kaufen, Lieferzeiten, Kapazität (Szenario-Schritt 7)
- Aufträge und Produktion, Materialeinkauf, Preise
- Steuern, Kredite, Insolvenz (G-04 … G-06)
- Geschäfte echter Firmen mit Sortiment (W-04, W-05)
- Diagramme und Ampel-Liquidität (U-21, U-23)
- „Vorspulen bis nächstes Ereignis", Auto-Pause (T-04, T-06)

### Phase 3 – Welt und Logistik
- Eigene Lkw/Züge/Schiffe auf der Karte, Transportkosten und -zeiten
- Weitere Branchen und Szenario-Pfade (Bäckerei, Spedition, Tischlerei …)
- KI-Firmen als Kunden und Konkurrenz (W-07)
- Zufallsereignisse (S-04), Arbeitszeiten auf Baustellen (B-06)
- Echte Straßenzüge aus OpenStreetMap für ausgewählte Städte (mit ODbL-Attribution)

### Phase 4 – Tiefe und Feinschliff
- Blackjack, Spielautomat, Aktienmarkt, Immobilien vermieten
- Tag/Nacht, Wetter, Sound
- Weitere Länderdaten, Lokalisierung (Englisch)
- Optional Mehrspieler

## Meilensteine

| Meilenstein | Ergebnis |
|---|---|
| M0 | Docs + Projekt-Setup + Kartendaten |
| M1 | Weltkarte navigierbar, Spielstart, Timebar |
| M2 | Firma gründen, Grundstück kaufen, Halle bauen mit sichtbarer Baustelle |
| M3 | Privat: Haus, Casino; Spielerfigur; Speichern → **MVP spielbar** |
| M4 | Phase 2 abgeschlossen |

## Qualitätssicherung
- Vitest-Tests für `src/sim` (Uhr, Buchungen, Bauzeiten, Roulette-Auszahlungen, Speichern/Laden).
- `npm run build` und `npm test` müssen grün sein, bevor gepusht wird.
- Manuelle Prüfung im Browser (Screenshot pro Meilenstein).

## Risiken
| Risiko | Gegenmaßnahme |
|---|---|
| Reale Bauzeiten machen das Spiel langsam | Schnellvorlauf-Stufen + „Vorspulen bis Ereignis" |
| Kartendaten zu groß | Vorverarbeitung, Vereinfachung, nur Hauptstraßen in Phase 1 |
| Echte Stadtstraßen (OSM) aufwendig | MVP mit prozeduralen Städten an echten Koordinaten |
| Wirtschaftswerte ungenau | Werte als Näherung kennzeichnen, zentral in Tabellen pflegen |
| Markenrecht bei echten Firmen | Nur Namen, keine Logos; Schalter für fiktive Namen |
