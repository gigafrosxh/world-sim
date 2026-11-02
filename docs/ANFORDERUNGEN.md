# World Sim – Anforderungsspezifikation

> Arbeitstitel: **World Sim – Industrie & Leben**
> Status: v0.1 (Entwurf, abgeleitet aus dem ursprünglichen Prompt und präzisiert)
> Sprache des Spiels: Deutsch (weitere Sprachen später)

Diese Spezifikation ist die überarbeitete, ausführlichere Fassung der ursprünglichen Idee. Jede Anforderung hat eine ID (z. B. `W-03`), damit Plan, Code und Tickets darauf verweisen können. Die Priorität steht in Klammern:

- **[M]** Muss – gehört in die erste spielbare Version (MVP)
- **[S]** Soll – kommt direkt danach
- **[K]** Kann – zusätzliche Möglichkeit, wenn Zeit ist

---

## 1. Vision

Ein Wirtschafts- und Lebenssimulator auf einer **echten Weltkarte**. Du startest als frisch gebackene:r Absolvent:in einer höheren Schule (Matura/Abitur/High School) in einem Land deiner Wahl. Mit einem kleinen Startbudget entscheidest du, ob du eine Firma gründest, arbeiten gehst, sparst, investierst, dir ein Haus kaufst oder im Casino alles verspielst.

Das Spiel soll **so nah wie möglich am echten Leben** sein: Dinge kosten realistische Beträge, Bauprojekte dauern realistisch lange, Behörden wollen Genehmigungen, Mitarbeiter wollen jeden Monat Lohn. Gleichzeitig muss es **einfach zu bedienen** sein und Statistiken müssen für jeden Erwachsenen (18+) ohne BWL-Studium verständlich sein.

**Optik:** Aus der Ferne sieht die Welt aus wie eine Strategiekarte mit klaren Ländergrenzen (Stil-Vorbild: Grand-Strategy-Spiele wie Hearts of Iron IV). Zoomt man hinein, wird daraus eine 3D-Stadtansicht mit erkennbaren Gebäuden (Stil-Vorbild: Städtebau-Spiele wie Cities: Skylines). Beide Spiele dienen **nur als Stil-Referenz**; es werden keine Assets, Texte oder Code daraus verwendet.

---

## 2. Zielgruppe und Grundprinzipien

| Prinzip | Bedeutung für das Design |
|---|---|
| Realismus vor Spektakel | Preise, Löhne, Bauzeiten, Steuern orientieren sich an echten Durchschnittswerten des gewählten Landes. |
| Einfach bedienbar | Jede Kernaktion (kaufen, bauen, einstellen) ist in höchstens 3 Klicks erreichbar. Assistenten führen durch komplexe Abläufe. |
| Verständliche Zahlen | Überall Klartext: „Du verdienst gerade 1.200 € pro Monat mehr als du ausgibst." statt nur Bilanzkennzahlen. |
| Entscheidungen haben Folgen | Kredite müssen zurückgezahlt werden, ungenutzte Maschinen kosten trotzdem, leerstehende Hallen verlieren an Wert. |
| Fair zu Glücksspiel | Casino-Spiele verwenden echte Wahrscheinlichkeiten (Hausvorteil), keine manipulierten Gewinnchancen. Nur Spielgeld, keine Echtgeld-Käufe. |

---

## 3. Spielstart und Charakter

| ID | Anforderung | Prio |
|---|---|---|
| C-01 | Spieler wählt ein **Land** auf der Weltkarte oder aus einer Liste. | M |
| C-02 | Spieler wählt **Name**, **Startstadt** (echte Städte des Landes) und optional ein einfaches Aussehen (Farbe der Figur). | M |
| C-03 | Startsituation: Absolvent:in einer höheren Schule, 18–19 Jahre alt, ohne Firma, ohne Immobilie. | M |
| C-04 | **Startbudget** ist landesabhängig und fix (z. B. AT/DE ≈ 15.000 €, US ≈ 20.000 $, IN ≈ 300.000 ₹), entspricht realistischen Ersparnissen + Familienstarthilfe. | M |
| C-05 | Optionale **Schwierigkeitsstufen**: „Bescheiden" (½ Budget), „Normal", „Erbe" (×10 Budget). | S |
| C-06 | Optionaler **Hintergrund** (Lehre/HTL, Gymnasium, Handelsschule), der Startfähigkeiten leicht verändert (z. B. HTL → günstigere Gewerbeberechtigung für Metallbau). | K |
| C-07 | Charakter hat **Lebensbedürfnisse**: Wohnen, Essen, Versicherung. Monatliche Lebenshaltungskosten werden automatisch vom Geldbörserl abgebucht. | M |
| C-08 | Charakter altert mit der Spielzeit. Optional: Ausbildung/Studium nachholen, um neue Branchen freizuschalten. | K |

---

## 4. Geld: Geldbörserl vs. Firmenkonto

Ein zentraler Realismus-Punkt ist die **Trennung zwischen Privat- und Firmengeld**.

| ID | Anforderung | Prio |
|---|---|---|
| G-01 | **Geldbörserl** (Privatkonto): gehört dem Charakter. Damit kauft man Haus, Grundstücke, Auto, Konsumgüter, geht ins Casino. | M |
| G-02 | **Firmenkonto**: gehört der Firma. Damit kauft die Firma Grundstücke, Maschinen, zahlt Löhne. | M |
| G-03 | Überweisungen zwischen beiden sind explizite Aktionen: **Einlage** (privat → Firma) und **Entnahme/Gehalt** (Firma → privat). Entnahmen werden versteuert. | M |
| G-04 | **Kredite**: Privatkredit, Firmenkredit, Förderkredit. Zinsen nach Land; Bonität hängt von Einkommen und Vermögen ab. | S |
| G-05 | **Steuern**: Einkommensteuer (privat), Körperschaft-/Gewinnsteuer (Firma), Umsatzsteuer vereinfacht. Werte je Land aus einer Tabelle. | S |
| G-06 | **Insolvenz**: Ist das Firmenkonto über eine Frist hinaus im Minus, droht Insolvenz. Bei einer GmbH haftet nur die Firma, bei einem Einzelunternehmen auch das Geldbörserl. | S |
| G-07 | **Anlagen**: Sparbuch, Aktien echter börsennotierter Firmen (simulierte Kurse), Immobilien vermieten. | K |
| G-08 | **Kontoauszug** mit jeder Buchung in Klartext („Lohn Juli – 3 Mitarbeiter – −7.950 €"). | M |

---

## 5. Firmengründung

| ID | Anforderung | Prio |
|---|---|---|
| F-01 | Auswahl einer **Branche** aus einem Katalog. MVP-Branchen: Schlosserei/Metallbau, Tischlerei, Bäckerei, Kfz-Werkstatt, Logistik/Spedition, Lebensmittelhandel. Später: Chemie, Elektronik, Automobilzulieferer, Stahlwerk, Software. | M |
| F-02 | Auswahl einer **Rechtsform** (Einzelunternehmen, GmbH/LLC). Unterschiedliches Mindestkapital, Gründungskosten und Haftung. | M |
| F-03 | **Gründungs-Assistent** mit realistischen Schritten: Gewerbeanmeldung → Firmenbuch/Handelsregister (bei GmbH) → Firmenkonto → Versicherung. Jeder Schritt kostet Geld und Zeit (z. B. Firmenbuch-Eintragung 1–3 Wochen). | M |
| F-04 | Manche Branchen brauchen einen **Befähigungsnachweis** (z. B. Meisterprüfung für Schlosser). Alternative: eine Fachkraft mit Qualifikation als gewerberechtliche:n Geschäftsführer:in anstellen (kostet Gehalt). | S |
| F-05 | Firmenname und Firmenfarbe frei wählbar; erscheinen auf Gebäuden und Lkw. | M |

---

## 6. Realistische Szenarien (Beispiel: Schlosserei)

Jede Branche hat einen **Szenario-Pfad** aus realistischen Schritten. Der Spieler kann davon abweichen, bekommt aber Hinweise, was als Nächstes sinnvoll ist („Nächster Schritt"-Karte).

**Beispiel Schlosserei/Metallbau:**

1. **Grundstück suchen** – auf der Karte Grundstücke mit Flächenwidmung „Industrie/Gewerbe" anzeigen; Preis pro m² nach Land/Stadt/Lage.
2. **Alternativ: Halle mieten** – billiger Einstieg, aber monatliche Miete und keine Wertsteigerung.
3. **Grundstück kaufen** – Kaufpreis + Nebenkosten (Grunderwerbsteuer, Notar, Grundbuch ≈ 8–10 %). Dauer bis zur Übergabe: einige Wochen.
4. **Baugenehmigung beantragen** – Kosten und Wartezeit (z. B. 2–6 Monate). Optional: Architekt beauftragen (verkürzt/verbessert).
5. **Bauen** – Gebäude wählen (kleine Werkstatt 200 m², Halle 800 m², Halle mit Kran 2.000 m²). Baufirma beauftragen *oder* selbst Arbeiter einstellen und Baumaschinen mieten/kaufen.
6. **Baustelle** – Bagger, Kran, Betonmischer, Arbeiter sind sichtbar auf dem Grundstück. Bauphasen: Erdarbeiten → Fundament → Rohbau → Dach → Haustechnik → Innenausbau → Abnahme.
7. **Maschinen kaufen und aufstellen** – z. B. Schweißgerät, Bandsäge, Abkantpresse, CNC-Plasmaschneider, Hallenkran. Maschinen haben Preis, Lieferzeit, Strombedarf, Kapazität, Wartung.
8. **Personal einstellen** – Rollen: Schlosser:in, Schweißer:in, Lehrling, Bürokraft. Lohn nach Land/Kollektivvertrag, Lohnnebenkosten.
9. **Material einkaufen** – Stahl, Bleche, Profile bei echten oder generischen Großhändlern; Preise schwanken.
10. **Aufträge annehmen** – Geländer, Tore, Stahlkonstruktionen; Aufträge haben Frist, Preis, Qualitätsanforderung.
11. **Wachsen** – zweite Halle, Lkw, Lager, Spezialisierung (z. B. Stahlbau), Export.

Weitere Szenario-Pfade (gleiche Struktur): Bäckerei (Lokal mieten → Öfen → Filialen), Spedition (Lkw leasen → Lager → Routen), Tischlerei, Kfz-Werkstatt, Handel.

| ID | Anforderung | Prio |
|---|---|---|
| S-01 | Mindestens ein vollständiger Szenario-Pfad (Schlosserei) im MVP. | M |
| S-02 | „Nächster Schritt"-Hinweis mit Erklärung, was jeder Schritt kostet und wie lange er dauert. | M |
| S-03 | Abweichungen erlaubt (z. B. Halle mieten statt bauen, ganze Firma kaufen). | S |
| S-04 | Zufallsereignisse: Lieferverzug, Preissteigerung beim Stahl, Unwetter verzögert Bau, Großauftrag, Mitarbeiter kündigt. | S |

---

## 7. Bauen, Baustellen und Zeit

| ID | Anforderung | Prio |
|---|---|---|
| B-01 | Jedes Gebäude hat eine **realistische Bauzeit** in echter Zeit (z. B. kleine Werkstatt ≈ 4 Monate, Industriehalle ≈ 8–12 Monate, Einfamilienhaus ≈ 9–12 Monate). | M |
| B-02 | Kosten fallen **laufend** an: Arbeiterlöhne pro Arbeitstag, Maschinenmiete pro Tag, Material zu Beginn jeder Bauphase. Kein „alles auf einmal bezahlen". | M |
| B-03 | Mehr Arbeiter/Maschinen → schneller, aber teurer (mit abnehmendem Nutzen). | M |
| B-04 | **Bauphasen sichtbar** auf dem Grundstück: Baugrube, Fundament, Gerüst, Rohbau, Dach, fertiges Gebäude. | M |
| B-05 | **Baumaschinen sichtbar**: Bagger, Kran, Betonmischer, Lkw, Arbeiterfiguren. Sie bewegen sich (einfache Animationen). | M |
| B-06 | Arbeiten nur an Werktagen und zur Arbeitszeit (z. B. Mo–Fr 7–16 Uhr). Nachts steht die Baustelle still. | S |
| B-07 | Wetter beeinflusst Bau (Frost stoppt Betonarbeiten). | K |
| B-08 | Baustopp/Abbruch möglich; bereits verbautes Geld ist weg. | S |

### Zeitleiste (Timebar)

| ID | Anforderung | Prio |
|---|---|---|
| T-01 | Spielzeit läuft in **Echtzeit** (1×): 1 Sekunde Realzeit = 1 Sekunde Spielzeit. | M |
| T-02 | Geschwindigkeiten **1×, 2×, 5×, 10×, 100×**, plus **Pause**. Tastenkürzel: Leertaste = Pause, 1–5 = Geschwindigkeit. | M |
| T-03 | Zusätzliche „Schnellvorlauf"-Stufen **1.000×, 10.000×**, weil reale Bauzeiten (Monate) sonst bei 100× noch Tage dauern. | M (Vorschlag) |
| T-04 | **„Vorspulen bis …"**: bis zum nächsten Ereignis (z. B. Bauabschnitt fertig, Monatsende). Stoppt automatisch bei wichtigen Ereignissen. | S |
| T-05 | Datum und Uhrzeit sind immer sichtbar; Tag/Nacht-Zyklus in der Stadtansicht. | M |
| T-06 | Automatische Pause bei kritischen Ereignissen (Konto im Minus, Bau fertig) – einstellbar. | S |

---

## 8. Die Welt

| ID | Anforderung | Prio |
|---|---|---|
| W-01 | **Akkurate Weltkarte** mit echten Ländergrenzen, Küsten, Seen aus lizenzierten offenen Daten (Natural Earth, später OpenStreetMap). | M |
| W-02 | **Echte Städte** mit realer Lage und Einwohnerzahl. | M |
| W-03 | Jede Stadt hat beim Hineinzoomen eine **Stadtansicht** mit Grundstücken, Straßen und Zonen (Wohnen, Gewerbe, Industrie). Im MVP prozedural um das echte Stadtzentrum erzeugt; später echte Straßen aus OpenStreetMap. | M |
| W-04 | **Echte Firmen und Geschäfte**: bekannte Handelsketten, Baumärkte, Autohäuser, Stahlhändler, Banken in passenden Ländern. Es werden nur **Namen** als Faktenangabe verwendet, **keine Logos** oder geschützte Gestaltung. | S |
| W-05 | In diesen Geschäften kann man einkaufen (privat und als Firma). Jeder Geschäftstyp hat ein passendes Sortiment. | S |
| W-06 | **Casinos an realistischen Orten** (z. B. Las Vegas, Macau, Monte-Carlo, Baden bei Wien, Atlantic City, Singapur, Baden-Baden). | M |
| W-07 | KI-Firmen: andere (fiktive und echte) Firmen sind Konkurrenten und Kunden; sie kaufen, verkaufen und reagieren auf Preise. | S |
| W-08 | Länderdaten: Währung, Lohnniveau, Grundstückspreise, Steuersätze, Strompreis. Im MVP für mindestens 8 Länder ausgearbeitet, alle anderen mit Schätzwerten aus BIP pro Kopf. | M |

---

## 9. Darstellung und Benutzeroberfläche

### 9.1 Kartenmodi (Zoomstufen)

| Stufe | Ansicht | Inhalt |
|---|---|---|
| 1 – Welt | Strategiekarte | Länder als farbige Flächen mit **kräftigen Grenzlinien**, Ländernamen groß, Meere mit Papier-/Kartenoptik, Haupthandelsrouten. |
| 2 – Region | Strategiekarte + Netz | Autobahnen, Eisenbahnen, Häfen, Fährrouten, Städte als Symbole. Grenzen bleiben sichtbar. |
| 3 – Stadt | 3D-Stadtansicht | Grundstücke, Straßen, erkennbare Gebäude, eigene Firmen hervorgehoben. |
| 4 – Spielerfigur | Third-Person | Man läuft mit der eigenen Figur durch die Stadt. |

| ID | Anforderung | Prio |
|---|---|---|
| U-01 | Fließender Übergang zwischen Welt und Stadt durch Zoomen (Mausrad) oder Klick auf eine Stadt. | M |
| U-02 | **Grenzansicht** im Stil einer Strategiekarte: Länder flächig eingefärbt, Grenzen deutlich, das eigene Land hervorgehoben. | M |
| U-03 | **Industriewege klar und maßstabsgetreu**: Autobahnen (aus echten Daten), Eisenbahnlinien, Seehäfen, Schifffahrtsrouten. Eigene Lkw/Züge/Schiffe sind auf der Karte als Symbole unterwegs. | M (Darstellung) / S (Fahrzeuge) |
| U-04 | Kartenebenen ein-/ausschaltbar: Grenzen, Straßen, Bahn, Schifffahrt, Städte, Casinos, eigene Objekte. | M |
| U-05 | **Gebäude erkennbar**: keine farbigen Quader, sondern einfache Low-Poly-Modelle mit typischen Merkmalen (Fabrik mit Sheddach und Schornstein, Lagerhalle mit Rolltor, Haus mit Satteldach, Hochhaus mit Fensterbändern, Casino mit Leuchtschild). | M |
| U-06 | Private Gebäude und Grundstücke werden **einfach** dargestellt (wenige Formen, klare Farben), eigene Gebäude mit mehr Details. | M |
| U-07 | **Spielerperspektive**: Umschalten in die Figur (einfaches Block-Modell), Steuerung mit WASD/Maus. | S |
| U-08 | Tag/Nacht-Beleuchtung, Fenster leuchten nachts. | K |

### 9.2 Bedienoberfläche

| ID | Anforderung | Prio |
|---|---|---|
| U-10 | **Obere Leiste**: Datum/Uhrzeit, Timebar, Geldbörserl, Firmenkonto, Monatsbilanz (+/−). | M |
| U-11 | **Seitliche Panels**: Firma, Bauprojekte, Personal, Finanzen, Privat, Casino. Immer nur ein Panel offen. | M |
| U-12 | **Kontextmenü** auf Grundstück/Gebäude: Infos, kaufen, bauen, verkaufen. | M |
| U-13 | Benachrichtigungen unten rechts (Bau fertig, Lohn bezahlt, Kreditrate fällig). | M |
| U-14 | Tooltips mit Klartext-Erklärung für jeden Begriff. | M |
| U-15 | Speichern/Laden (lokal im Browser), Autosave. | M |

### 9.3 Statistiken – verständlich

| ID | Anforderung | Prio |
|---|---|---|
| U-20 | **Drei Kernzahlen** immer sichtbar: Vermögen gesamt, Monatsbilanz, Kontostand Firma. | M |
| U-21 | Diagramme: Kontostand über Zeit (Linie), Ausgaben nach Kategorie (Balken). Keine verschachtelten Tabellen. | S |
| U-22 | Jede Zahl erklärt sich per Tooltip in einem Satz. | M |
| U-23 | Ampel-Logik: grün/gelb/rot bei Liquidität („Reicht 4 Monate"). | S |

---

## 10. Privatleben und Freizeit

| ID | Anforderung | Prio |
|---|---|---|
| P-01 | **Wohnen**: zu Beginn bei den Eltern/WG (geringe Kosten), später Wohnung mieten oder Haus/Grundstück kaufen. | M |
| P-02 | Haus bauen auf eigenem Grundstück (gleiches Bausystem wie Firma). | S |
| P-03 | **Konsum**: Auto, Urlaub, Möbel, Elektronik in echten Geschäften kaufen. Manche Käufe bringen Vorteile (Auto → schneller zwischen Standorten). | S |
| P-04 | **Casino**: Roulette (europäisch, 1 Null), Blackjack, Spielautomat. Echte Wahrscheinlichkeiten, Einsatzlimits, Statistik „Gewonnen/Verloren gesamt". | M (Roulette) / S (Rest) |
| P-05 | Verantwortungsvolles Spieldesign: Hinweis bei hohen Verlusten, optionale Selbstsperre im Spiel. Nur Spielgeld. | M |
| P-06 | Zufriedenheit/Gesundheit als einfache Werte, die von Wohnen, Freizeit und Stress (Überstunden) abhängen. | K |

---

## 11. Weitere Möglichkeiten (Erweiterungsideen)

- **Angestellt arbeiten** statt gründen: Job bei einer KI-Firma annehmen, Gehalt ins Geldbörserl, später kündigen und gründen.
- **Bestehende Firma kaufen** (Unternehmensnachfolge) statt bei null anfangen.
- **Franchise**: Filiale einer Kette eröffnen.
- **Börsengang** der eigenen Firma, Aktien anderer Firmen kaufen.
- **Export/Import** über echte Häfen, Zölle zwischen Ländern.
- **Lieferketten**: eigene Produkte als Vorprodukte für andere Branchen.
- **Mehrspieler**: mehrere Spieler in derselben Welt, gemeinsamer Markt (später, braucht Server).
- **Mods/Szenarien**: eigene Branchen als JSON-Datei hinzufügen.
- **Lernmodus**: Erklärungen zu echten Begriffen (Kollektivvertrag, Grunderwerbsteuer, Abschreibung).

---

## 12. Technische Anforderungen

| ID | Anforderung | Prio |
|---|---|---|
| X-01 | Läuft im **Browser** (Chrome, Firefox, Edge, Safari aktuell) ohne Installation; Desktop zuerst. | M |
| X-02 | Technik: TypeScript, Vite, Three.js (WebGL). Simulation getrennt von Darstellung (testbar ohne Grafik). | M |
| X-03 | 60 FPS in der Stadtansicht auf einem durchschnittlichen Laptop; 30 FPS Minimum. | M |
| X-04 | Simulation deterministisch pro Tick, damit 10.000× nicht zu Fehlern führt (Zeitsprung in festen Schritten). | M |
| X-05 | Spielstände als JSON in `localStorage`, Export/Import als Datei. | M |
| X-06 | Kartendaten vorverarbeitet und komprimiert ausgeliefert (< 10 MB beim Start). | M |
| X-07 | Spieldaten (Länder, Branchen, Gebäude, Maschinen, Geschäfte, Casinos) als JSON/TS-Tabellen, leicht erweiterbar. | M |
| X-08 | Automatische Tests für die Wirtschaftssimulation. | M |

## 13. Daten, Lizenzen und Rechtliches

| ID | Anforderung | Prio |
|---|---|---|
| L-01 | Kartendaten nur aus offen lizenzierten Quellen: **Natural Earth** (Public Domain) für Länder, Städte, Straßen, Bahn, Häfen; später **OpenStreetMap** (ODbL, Namensnennung „© OpenStreetMap contributors" Pflicht). | M |
| L-02 | Quellenangabe im Spiel (Menü „Credits") und in `ATTRIBUTION.md`. | M |
| L-03 | Keine Assets, Texte, Musik oder Code aus Hearts of Iron IV, Cities: Skylines oder anderen kommerziellen Spielen. Eigene Modelle (prozedural in Code). | M |
| L-04 | Echte Firmen nur als Namensnennung, keine Logos, keine abwertenden Darstellungen. Bei Bedarf auf fiktive Namen umschaltbar. | M |
| L-05 | Glücksspiel ausschließlich mit Spielgeld, keine Echtgeld-Käufe, kein Bezug zu echten Online-Casinos. | M |
| L-06 | Wirtschaftswerte sind **Näherungen** und werden als solche gekennzeichnet (Quelle/Stand in den Datentabellen). | M |

---

## 14. Abnahmekriterien für das MVP

1. Ich kann ein Land und eine Stadt wählen und starte mit dem landesüblichen Budget.
2. Die Weltkarte zeigt echte Grenzen, Städte, Autobahnen, Bahnlinien und Häfen; ich kann frei zoomen und verschieben.
3. Ich kann in eine Stadt hineinzoomen und sehe Grundstücke, Straßen und erkennbare Gebäude.
4. Ich kann eine Schlosserei gründen (mit Kosten und Wartezeit), ein Industriegrundstück kaufen und eine Halle bauen.
5. Während des Baus sehe ich Baumaschinen und Bauphasen; Löhne und Maschinenmieten werden laufend abgebucht.
6. Die Timebar funktioniert mit 1×, 2×, 5×, 10×, 100× (plus Schnellvorlauf und Pause).
7. Ich kann mit meinem Geldbörserl ein Haus/Grundstück kaufen und im Casino Roulette spielen.
8. Ich kann in die Spielerfigur wechseln und durch die Stadt laufen.
9. Spielstand wird gespeichert und kann wieder geladen werden.
10. Credits zeigen die Datenquellen.
