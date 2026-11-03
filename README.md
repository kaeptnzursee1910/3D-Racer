# VELOX – 3D Racing 🏁

Ein aufwendiges 3D-Rennspiel, das komplett im Browser läuft – optimiert für das **iPad** (Touch, Neigungssensor, Vollbild als Web-App), aber genauso mit **Tastatur** oder **Gamepad** spielbar.

Alles wird prozedural erzeugt: Strecken, Landschaften, Fahrzeuge, Texturen, Soundeffekte und die Synthwave-Musik. Es gibt keine externen Assets und keinen Build-Schritt – nur statische Dateien und [three.js](https://threejs.org) (lokal in `vendor/`).

Spielen: https://kaeptnzursee.github.io/<3D-Racer>/

## Features

- **Mehrspieler für bis zu 8 Geräte** (Party mit 4-stelligem Code oder Einladungslink, Lobby mit Chat, Autowahl, Bereit-Status, Ping; freie Plätze füllen Computergegner auf)
- **4 Strecken à ca. 4 km mit eigener Welt**
  - *Sonnenküste* – Sonnenuntergang am Meer: Felstunnel, Hafen mit Steg und Booten, Leuchtturm, Palmen, Strandschirme
  - *Canyon-Pass* – rote Felsen, zwei gewaltige Felsbögen über der Strecke, Tafelberge, Strommasten, große Höhenunterschiede
  - *Neon-City* – Nachtrennen zwischen leuchtenden Hochhäusern, Hochstraße mit Verkehr, Unterführung, Neonbanden
  - *Alpen-Ring* – verschneiter Hochgebirgskurs mit Lawinengalerie, Skilift, Leitpfosten, Schneefall und weniger Grip
  - überall: Boxengasse mit Garagen und Kontrollturm, Tribünen, Reifenstapel (mit Kollision), Kiesbetten, Fangzäune, Bremspunkt-Tafeln, Sponsorbrücke
- **8 Fahrzeuge** mit eigener Optik und eigenen Werten (Spitze, Beschleunigung, Handling, Gewicht, Geländetauglichkeit): GT, Supersportwagen, Hot Hatch, Muscle-Car, Roadster, Rallye-Geländewagen, Elektro-Hypercar und Le-Mans-Prototyp (Freischaltung durch Meisterschaftssieg). Gerundete Karosserien mit Radhäusern, Glaskabine mit sichtbarem Fahrer, Felgen mit Bremsscheiben und -sätteln, eigene Licht-, Spoiler- und Auspuffvarianten, 14 Lackfarben und 5 Lackierungsstile mit Startnummern
- **Fahrphysik im Stil von Need for Speed**: dynamisches Fahrzeugmodell mit Reifen-Schräglauf, Reibkreis, Gewichtsverlagerung, Abtrieb und Heck-/Front-/Allradantrieb je Auto; einstellbare Fahrhilfe (Aus/Mittel/Stark: Gegenlenkhilfe, Stabilität, Traktions- und Bremskontrolle); kontrollierbare Drifts (Handbremse oder kurz anbremsen), Nitro lädt sich beim Driften auf; Seitenstreifen kostet nur wenig Tempo
- **KI-Gegner**, die einer berechneten Ideallinie folgen, bremsen, überholen, ausweichen, Nitro nutzen und kleine Fehler machen; drei Schwierigkeitsgrade
- **Spielmodi**: Schnelles Rennen (1–9 Runden, 0–7 Gegner), **Meisterschaft** über alle 4 Strecken mit Punktewertung, **Zeitfahren** gegen den eigenen **Geist**
- Startampel mit Raketenstart, Rundenzeiten, Bestzeiten, Delta zum Geist, Live-Rangliste, Minikarte, Tacho mit Drehzahl/Gang/Nitro
- 3 Kameraperspektiven (Verfolger, weit, Motorhaube), Intro-Kameraflug, TV-Kamera im Ziel und im Menü-Hintergrund
- Effekte: HDR-Rendering mit Bloom und Kantenglättung, Echtzeit-Spiegelungen der Umgebung im Lack, Metallic-Flakes unter Klarlack, Rad-Bewegungsunschärfe, Blendenflecke der Sonne, Gummiabrieb auf der Ideallinie und Bremsspuren, detaillierter Asphalt mit Rissen und Flicken, Echtzeit-Schatten, Asphaltstruktur (nachts nass glänzend), Reifenqualm, Bremsspuren, Funkenflug, Nitro-Flammen, Geschwindigkeitslinien
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

### Verbindungsweg

Unter *Mehrspieler → Verbindungsweg* legt man fest, wie die Geräte verbunden werden:

- **Direkt (P2P)** – nur direkte Verbindungen, der Rennverkehr läuft nie über einen Server (spart dessen Kontingent). Funktioniert nicht in Netzen, die direkte Verbindungen sperren.
- **Automatisch** – direkt, wenn möglich; sonst über den Verbindungsserver (Standard).
- **Über Server** – der gesamte Verkehr läuft über den TURN-Verbindungsserver (braucht Zugangsdaten, funktioniert auch in gesperrten Netzen).

Der Gastgeber gibt seine Wahl im Einladungslink weiter. In der Lobby steht bei jedem Mitspieler, welcher Weg tatsächlich genutzt wird (⇄ Direkt / ☁ Server).

### Datenverkehr (gemessen)

Nach jedem Online-Rennen zeigt der Ergebnisbildschirm den gemessenen Datenverkehr des eigenen Geräts – gesamt und **pro Runde** (aus den WebRTC-Statistiken, inklusive DTLS/SCTP/UDP/IP-Overhead).

Messung mit zwei Browsern, 8 Autos im Feld, 20 Pakete pro Sekunde, 4-km-Runden (ca. 100 s):

| | pro Runde | Rate |
|---|---|---|
| Gast (Senden + Empfangen) | ≈ 1,0–1,2 MB | ≈ 90 kbit/s |
| Gastgeber, je Gast | ≈ 1,0 MB | ≈ 90 kbit/s |

Ein Gast braucht also unabhängig von der Spielerzahl rund **1,1 MB pro Runde** (≈ 3,3 MB für ein Rennen über 3 Runden). Der Gastgeber braucht pro Gast ebenso viel – bei 8 Spielern also rund 7 MB pro Runde (Upload ≈ 0,5 Mbit/s). Läuft die Verbindung **über den Server**, fließt dieser Verkehr komplett durch den TURN-Server; bei **Direkt** fließt dort gar nichts. In der Lobby fließen nur wenige Hundert Byte pro Sekunde, das Spiel selbst wird einmalig geladen (≈ 400 KB komprimiert).

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
