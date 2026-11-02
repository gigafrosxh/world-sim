# World Sim in Unreal Engine 5.7 starten

Die Simulation ist reines C++ (`Source/WorldSim/Public/Sim`, `Private/Sim`) und unabhängig von Unreal getestet.
Darüber liegt eine dünne Unreal-Schicht: Subsystem, Weltkarte, Stadt, Kamera, HUD.
Alle Modelle sind aus Engine-Grundformen gebaut, damit das Projekt ohne eigene Assets startet.

## Voraussetzungen

- Unreal Engine **5.7** (Epic Games Launcher).
- **Windows:** Visual Studio 2022 mit den Workloads „Desktopentwicklung mit C++“ und „Spieleentwicklung mit C++“.
- **macOS:** Xcode.

## Erster Start

1. Rechtsklick auf `WorldSim.uproject` und dann **Generate Visual Studio project files** (am Mac: *Generate Xcode project*).
2. `WorldSim.uproject` doppelklicken. Unreal fragt, ob das Modul gebaut werden soll: **Ja**. Der erste Build dauert ein paar Minuten.
3. Im Editor ein leeres Level anlegen und als Startlevel eintragen:
   1. *File → New Level → Empty Level*.
   2. Speichern als `Content/Maps/Welt`.
   3. Unter *Project Settings → Maps & Modes* bei *Editor Startup Map* und *Game Default Map* `Welt` eintragen.
   
   Der GameMode `WSGameMode` ist schon voreingestellt. Er legt Sonne, Himmel und Licht selbst an, wenn das Level keine eigenen hat.
4. **Play** drücken. Ohne Spielstand startet ein neues Spiel in Wien. Ein anderes Startland stellst du am GameMode unter `StartCountry` ein (z. B. `DEU`, `CHE`, `USA`).

Der Spielstand liegt in `Saved/SaveGames/worldsim.sav`. Er wird alle 30 Sekunden automatisch gespeichert.

## Steuerung im ersten Unreal-Stand

| Aktion | Taste |
|---|---|
| Kamera bewegen / drehen / zoomen | WASD · Q/E oder rechte Maustaste · Mausrad (bis zur ganzen Welt) |
| Spielfigur | F, dann WASD (Shift = laufen) |
| Pause, Geschwindigkeit | Leertaste, 1–7 |
| Bis zum nächsten Ereignis vorspulen | N |
| Grundstück wählen | Linksklick |
| Kaufen privat / für die Firma | B / Shift+B |
| Mieten, Verkaufen, Einziehen | R, V, M |
| Bauen (erste mögliche Bauart, 6 Arbeiter) | H |
| Schlosserei gründen | G |
| Speichern / Laden | F5 / F9 |

Die Bildschirmanzeige ist vorerst ein einfaches HUD. Die richtige Oberfläche mit Menüs entsteht als UMG-Widget.
Alle Spielfunktionen sind dafür als Blueprint-Knoten im `WorldSimSubsystem` verfügbar (Kategorie *WorldSim*).

## Eigene Gebäudemodelle einhängen

`WSCityActor` hat die Eigenschaft `VisualOverrides`. Dort kannst du je Gebäudeart (Werkstatt, Halle, Haus …) einen eigenen Actor eintragen.
Er wird in der Grundstücksmitte gespawnt, die Vorderseite zeigt nach +X.
Ohne Eintrag wird das eingebaute Modell aus Grundformen gezeigt.

## UnrealClaude (Tool aus dem Video)

UnrealClaude verbindet Claude Code mit dem laufenden Editor, damit Level, Blueprints und Widgets direkt im Editor gebaut werden können.

1. Plugin von GitHub (`Natfii/UnrealClaude`) nach `Plugins/UnrealClaude/` klonen. Der Ordner ist in `.gitignore` eingetragen.
2. Editor neu starten und das Plugin aktivieren.
3. Der Anleitung des Plugins folgen, um Claude Code zu verbinden.

## Simulationstests ohne Unreal

```bash
cd WorldSim
bash Tests/run.sh      # braucht g++ oder clang++ mit C++20
```

## Kartendaten

`Content/Data/*.json` stammen aus Natural Earth (Public Domain, siehe `../ATTRIBUTION.md`).
`map_mesh.json` enthält fertig triangulierte Länderflächen. Neu erzeugen:

```bash
cd prototype-web && npm install && node scripts/export-unreal-mesh.mjs
```

## Was Unreal hier noch nicht geprüft hat

Der C++-Kern ist getestet (40 Tests). Die Unreal-Klassen (`WS*`, `WorldSimSubsystem`) wurden ohne Engine geschrieben und beim ersten Build in 5.7 zum ersten Mal kompiliert.
Meldet der Build Fehler, die Ausgabe aus dem *Output Log* bzw. Visual Studio einfach an Claude schicken.
