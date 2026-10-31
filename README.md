# VELOX – 3D Racing 🏁

Ein aufwendiges 3D-Rennspiel, das komplett im Browser läuft – optimiert für das **iPad** (Touch, Neigungssensor, Vollbild als Web-App), aber genauso mit **Tastatur** oder **Gamepad** spielbar.

Alles wird prozedural erzeugt: Strecken, Landschaften, Fahrzeuge, Texturen, Soundeffekte und die Synthwave-Musik. Es gibt keine externen Assets und keinen Build-Schritt – nur statische Dateien und [three.js](https://threejs.org) (lokal in `vendor/`).

## Features

- **4 Strecken mit eigener Welt**
  - *Sonnenküste* – Sonnenuntergang am Meer mit animiertem Wasser, Palmen, Leuchtturm und Segelbooten
  - *Canyon-Pass* – rote Felsen, Tafelberge, Kakteen, große Höhenunterschiede, Staub in der Luft
  - *Neon-City* – Nachtrennen zwischen leuchtenden Hochhäusern, Neonbanden, Straßenlaternen, Scheinwerfer
  - *Alpen-Ring* – verschneiter Bergkurs mit Tannen, Hütten, Schneefall und etwas weniger Grip
- **6 Fahrzeuge** mit unterschiedlichen Werten (Höchstgeschwindigkeit, Beschleunigung, Handling, Gewicht) und 12 Lackfarben – der *Phantom LMP* wird durch einen Meisterschaftssieg freigeschaltet
- **Arcade-Fahrphysik**: Gewichtsverlagerung, Grip-Limit, Drifts/Powerslides, Nitro (lädt sich durch Driften auf), Steigungen, Fahrbahnneigung in Kurven, Mauer- und Fahrzeugkollisionen
- **KI-Gegner**, die einer berechneten Ideallinie folgen, bremsen, überholen, ausweichen, Nitro nutzen und kleine Fehler machen; drei Schwierigkeitsgrade
- **Spielmodi**: Schnelles Rennen (1–9 Runden, 0–7 Gegner), **Meisterschaft** über alle 4 Strecken mit Punktewertung, **Zeitfahren** gegen den eigenen **Geist**
- Startampel mit Raketenstart, Rundenzeiten, Bestzeiten, Delta zum Geist, Live-Rangliste, Minikarte, Tacho mit Drehzahl/Gang/Nitro
- 3 Kameraperspektiven (Verfolger, weit, Motorhaube), Intro-Kameraflug, TV-Kamera im Ziel und im Menü-Hintergrund
- Effekte: Echtzeit-Schatten, Spiegelungen auf dem Lack, Reifenqualm, Bremsspuren, Funkenflug, Nitro-Flammen, Geschwindigkeitslinien
- **Sound komplett synthetisiert** (WebAudio): Motor mit Gangwechseln, Reifenquietschen, Wind, Crashs, Nitro – plus prozedurale Synthwave-Musik je Strecke
- Rekorde, Geister und Einstellungen werden lokal gespeichert
- Grafikqualität *Auto/Niedrig/Mittel/Hoch* mit automatischer Auflösungsanpassung für flüssige Bildraten
- PWA: zum Home-Bildschirm hinzufügen → echtes Vollbild und offline spielbar

## Steuerung

| Aktion | iPad / Touch | Tastatur | Gamepad |
|---|---|---|---|
| Lenken | linke Hälfte wischen *(oder Tasten / Neigen)* | ← → / A D | linker Stick |
| Gas | GAS | ↑ / W | RT oder A |
| Bremse / Rückwärts | BREMSE | ↓ / S | LT |
| Drift | DRIFT | Leertaste | X / B |
| Nitro | N₂O | Shift / N | LB / RB |
| Kamera | 🎥 | C | Y |
| Zurücksetzen | Pausemenü | R | Select |
| Pause | ❚❚ | Esc / P | Start |

Die Menüs lassen sich ebenfalls per Tastatur bedienen: **↑ ↓** auswählen, **Enter** bestätigen, **Esc** zurück, **← →** Strecke/Fahrzeug wechseln, in der Garage **↑ ↓** für die Lackfarbe.

Tipp: Gas **und** Bremse gleichzeitig plus Lenken löst einen Powerslide aus.

## Spielen auf dem iPad

Das Spiel muss über **HTTP(S)** ausgeliefert werden (ES-Module funktionieren nicht per `file://`).

**Variante A – GitHub Pages (empfohlen):**
1. Im Repository unter *Settings → Pages* als Quelle *Deploy from a branch* wählen, den Branch und den Ordner `/ (root)` auswählen und speichern.
2. Die angezeigte URL (z. B. `https://<benutzer>.github.io/<repo>/`) in Safari auf dem iPad öffnen.
3. *Teilen → Zum Home-Bildschirm* – danach startet VELOX im Vollbild und funktioniert auch offline.

**Variante B – lokal im WLAN:**
```bash
python3 -m http.server 8080
```
Dann auf dem iPad `http://<IP-des-Rechners>:8080` öffnen.

Für die Neigungssteuerung fragt Safari einmalig nach der Erlaubnis für den Bewegungssensor (Einstellungen → Lenkung → *Neigen*). Ist das iPad stumm geschaltet, kann Safari den Ton unterdrücken.

## Projektstruktur

```
index.html            Oberfläche (Menüs, HUD, Touch-Steuerung)
css/style.css         Styling
js/main.js            Spielsteuerung, Menüs, Renderer, Spielschleife
js/world.js           Rennablauf, Runden, Kollisionen, Effekte, Geist
js/track.js           Streckengeometrie, Projektion, Ideallinie, Tempoprofil
js/tracks.js          Streckendefinitionen
js/environment.js     Himmel, Licht, Gelände, Wasser, Landschaft, Wetter
js/car.js             Fahrphysik
js/carModel.js        Fahrzeugdaten und prozedurale 3D-Modelle
js/ai.js              KI-Fahrer
js/camera.js          Kameras
js/effects.js         Partikel und Bremsspuren
js/audio.js           Motor-/Effekt-Sounds und Musik-Sequenzer
js/input.js           Touch, Neigung, Tastatur, Gamepad
js/hud.js             Tacho, Minikarte, Anzeigen
js/showroom.js        Garage
js/storage.js         Speicherstände
sw.js                 Service Worker (Offline-Modus)
vendor/               three.js r160 (MIT-Lizenz)
```
