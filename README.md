# VELOX – 3D Racing 🏁

Ein aufwendiges 3D-Rennspiel, das komplett im Browser läuft – optimiert für das **iPad** (Touch, Neigungssensor, Vollbild als Web-App), aber genauso mit **Tastatur** oder **Gamepad** spielbar.

Alles wird prozedural erzeugt: Strecken, Landschaften, Fahrzeuge, Texturen, Soundeffekte und die Synthwave-Musik. Es gibt keine externen Assets und keinen Build-Schritt – nur statische Dateien und [three.js](https://threejs.org) (lokal in `vendor/`).

## Features

- **Mehrspieler für bis zu 8 Geräte** (Party mit 4-stelligem Code oder Einladungslink, Lobby mit Chat, Autowahl, Bereit-Status, Ping; freie Plätze füllen Computergegner auf)
- **4 Strecken à ca. 4 km mit eigener Welt**
  - *Sonnenküste* – Sonnenuntergang am Meer: Felstunnel, Hafen mit Steg und Booten, Leuchtturm, Palmen, Strandschirme
  - *Canyon-Pass* – rote Felsen, zwei gewaltige Felsbögen über der Strecke, Tafelberge, Strommasten, große Höhenunterschiede
  - *Neon-City* – Nachtrennen zwischen leuchtenden Hochhäusern, Hochstraße mit Verkehr, Unterführung, Neonbanden
  - *Alpen-Ring* – verschneiter Hochgebirgskurs mit Lawinengalerie, Skilift, Leitpfosten, Schneefall und weniger Grip
  - überall: Boxengasse mit Garagen und Kontrollturm, Tribünen, Reifenstapel (mit Kollision), Kiesbetten, Fangzäune, Bremspunkt-Tafeln, Sponsorbrücke
- **8 Fahrzeuge** mit eigener Optik und eigenen Werten (Spitze, Beschleunigung, Handling, Gewicht, Geländetauglichkeit): GT, Supersportwagen, Hot Hatch, Muscle-Car, Roadster, Rallye-Geländewagen, Elektro-Hypercar und Le-Mans-Prototyp (Freischaltung durch Meisterschaftssieg). Gerundete Karosserien mit Radhäusern, Glaskabine mit sichtbarem Fahrer, Felgen mit Bremsscheiben und -sätteln, eigene Licht-, Spoiler- und Auspuffvarianten, 14 Lackfarben und 5 Lackierungsstile mit Startnummern
- **Arcade-Fahrphysik**: Gewichtsverlagerung, Grip-Limit, Drifts/Powerslides, Nitro (lädt sich durch Driften auf), Steigungen, Fahrbahnneigung in Kurven, Mauer- und Fahrzeugkollisionen
- **KI-Gegner**, die einer berechneten Ideallinie folgen, bremsen, überholen, ausweichen, Nitro nutzen und kleine Fehler machen; drei Schwierigkeitsgrade
- **Spielmodi**: Schnelles Rennen (1–9 Runden, 0–7 Gegner), **Meisterschaft** über alle 4 Strecken mit Punktewertung, **Zeitfahren** gegen den eigenen **Geist**
- Startampel mit Raketenstart, Rundenzeiten, Bestzeiten, Delta zum Geist, Live-Rangliste, Minikarte, Tacho mit Drehzahl/Gang/Nitro
- 3 Kameraperspektiven (Verfolger, weit, Motorhaube), Intro-Kameraflug, TV-Kamera im Ziel und im Menü-Hintergrund
- Effekte: HDR-Rendering mit Bloom und Kantenglättung, Echtzeit-Schatten, Klarlack-Spiegelungen, Asphaltstruktur (nachts nass glänzend), Reifenqualm, Bremsspuren, Funkenflug, Nitro-Flammen, Geschwindigkeitslinien
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

## Mehrspieler

Die Verbindung funktioniert genauso wie bei *Horizon Rush*: Die Geräte verbinden sich per WebRTC direkt miteinander ([PeerJS](https://peerjs.com), Vermittlung über den öffentlichen PeerJS-Server).

1. Ein Gerät tippt auf *Mehrspieler → Party eröffnen* und bekommt einen 4-stelligen Code.
2. Die anderen geben den Code ein und tippen auf *Beitreten* – oder öffnen den **Einladungslink** (*Einladungslink teilen*, z. B. per WhatsApp). Wer ihn öffnet, gibt nur noch seinen Namen ein.
3. In der Lobby wählt jeder sein Auto, seine Farbe und Lackierung und tippt auf *Bereit*. Der Gastgeber legt Strecke, Runden, Computergegner und Schwierigkeit fest und startet das Rennen. Nebenan gibt es einen Chat.
4. Nach dem Rennen bringt der Gastgeber alle zurück in die Lobby.

In Netzwerken, die direkte Verbindungen blockieren (Firmen-/Hochschul-WLAN), läuft die Verbindung über einen Verbindungsserver (TURN, metered.ca). Die Zugangsdaten trägt man unter *Mehrspieler → Verbindungseinstellungen* ein; sie stehen nicht im Code, werden nur im Browser gespeichert und reisen im Einladungslink im Teil nach `#` mit (wird nie an einen Server geschickt).

### Datenverkehr (gemessen)

Gemessen mit zwei Browsern bei 20 Zustandspaketen pro Sekunde, 8 Autos im Feld, inklusive WebRTC-Overhead (DTLS/SCTP/UDP/IP):

| | Gast | Gastgeber, je Gast |
|---|---|---|
| Empfangen | ≈ 8,5 KB/s (≈ 68 kbit/s) | ≈ 2,7 KB/s |
| Senden | ≈ 2,7 KB/s (≈ 21 kbit/s) | ≈ 8,5 KB/s |

Ein Gast braucht also unabhängig von der Spielerzahl rund **3–4 MB pro Rennen** (3 Runden, ca. 5 Minuten). Beim Gastgeber wächst der Upload mit jedem Gast: bei 8 Spielern etwa 60 KB/s hoch und 19 KB/s runter (≈ 0,5 Mbit/s bzw. ≈ 25 MB pro Rennen). In der Lobby fließen nur wenige Hundert Byte pro Sekunde. Das Spiel selbst wird einmalig geladen (≈ 350 KB komprimiert) und danach aus dem Offline-Speicher gestartet.

## Projektstruktur

```
index.html            Oberfläche (Menüs, HUD, Touch-Steuerung)
css/style.css         Styling
js/main.js            Spielsteuerung, Menüs, Renderer, Spielschleife
js/world.js           Rennablauf, Runden, Kollisionen, Effekte, Geist
js/net.js             WebRTC-Verbindung (PeerJS), Code, TURN, Verkehrszähler
js/multiplayer.js     Party, Lobby, Chat, Einladungslink, Online-Rennablauf
js/trackside.js       Streckendetails (Boxengasse, Tunnel, Brücken, Reifenstapel …)
js/postfx.js          Bloom-Nachbearbeitung
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
vendor/               three.js r160 + Nachbearbeitungs-Module, PeerJS 1.5.4 (jeweils MIT-Lizenz)
```
