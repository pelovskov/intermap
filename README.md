# Intermap

Interaktivt kort som PWA (installérbar web-app), bygget med [Leaflet](https://leafletjs.com) og OpenStreetMap.
Første kort: **Roskilde centrum** med Roskilde Domkirke som midtpunkt.

## Funktioner

- Kort over Roskilde centrum (ca. 1,3 km i hver retning fra Domkirken).
- 10 nummererede punkter. Tryk på et punkt for at åbne en modal med billede og tekst.
- **📍 Her er jeg**: viser din position og markerer de punkter, der ligger inden for 200/250/300 m, i en liste sorteret efter afstand.
  Er du ikke i Roskilde, kan du vælge **Simulér ved Domkirken** for at afprøve funktionen. Du kan også åbne siden med `?demo` sidst i adressen.
- PWA: kan føjes til hjemmeskærmen. Appen, data og billeder gemmes, så den virker uden net.
  Kortfliser gemmes, når du har set dem (se "Offline-kort" nedenfor).

## Kør lokalt

Der skal ikke bygges noget. Start blot en lokal webserver i mappen:

```bash
python3 -m http.server 8000
```

Åbn derefter http://localhost:8000. (Service worker og GPS virker på `localhost` og over HTTPS.)

## Redigér punkter: editoren

Åbn **`editor.html`**, fx `https://pelovskov.github.io/intermap/editor.html`. Siden er ikke linket fra appen.

- **＋ Nyt punkt**: tryk på knappen og klik derefter på kortet, hvor punktet skal stå.
- Klik på et punkt (på kortet eller i listen) for at rette titel og tekst. **Træk i markøren** for at flytte punktet.
- **Vælg billede …**: billedet bliver automatisk gjort mindre (max 1200 px) og gemt som WebP. Brug gerne et billede direkte fra telefonen.
- ▲/▼ ændrer rækkefølgen, altså numrene på kortet.
- Under *Kortindstillinger* kan du ændre titel, standardradius, startpunkt og kortområde.

Der er to måder at gemme på:

1. **⬇ Download ZIP**: du får `data/points.json` og de nye billeder. Pak ZIP-filen ud i repoets rodmappe og commit/upload.
2. **⬆ Udgiv på GitHub**: editoren committer selv direkte til `main`. Kortet er opdateret efter cirka 1 minut.
   Første gang skal du bruge en *fine-grained personal access token*:
   GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → *Generate new token*
   - *Repository access*: **Only select repositories** → `intermap`
   - *Permissions* → *Repository permissions* → **Contents: Read and write**
   - Vælg en udløbsdato, fx 1 år.

   Nøglen gemmes kun i den browser, du bruger. Tryk på ⚙ → *Glem nøgle* for at fjerne den.
   Er `points.json` blevet ændret på GitHub, siden du åbnede editoren, bliver du spurgt, før noget overskrives.

Billeder, der ikke længere bruges, bliver liggende i `img/`. De kan slettes på GitHub, når det passer dig.

## Dataformatet

Alt indhold ligger i [`data/points.json`](data/points.json). Filen kan også rettes i hånden:

```json
{
  "id": "domkirke",
  "title": "Roskilde Domkirke",
  "lat": 55.6425,
  "lng": 12.0803,
  "image": "img/domkirke.webp",
  "text": "Tekst der vises i modalen."
}
```

- `image`: kan være tom. Så vises en pladsholder. Læg billeder i `img/`, gerne WebP, max ca. 1000 px bredt.
- Punkternes placering er cirka-placeringer og kun eksempler. Ret koordinaterne efter behov.
  Højreklik på et sted i Google Maps eller på openstreetmap.org for at kopiere koordinaterne.
- `map.nearbyRadius` er standardradius for "Her er jeg".

Når du ændrer filer i appen (css/js/html), skal du hæve `VERSION` i [`sw.js`](sw.js). Så får brugerne en "Ny version klar"-besked.
Ændringer i `points.json` og nye billeder hentes automatisk, næste gang appen åbnes med net. Det kræver ingen ny version.

## Udgiv på GitHub Pages

Settings → Pages → *Deploy from a branch* → vælg `main` og `/ (root)`.
Siden kommer så til at ligge på `https://<brugernavn>.github.io/intermap/`.

## Offline-kort: status og næste skridt

OpenStreetMaps egne flise-servere må ikke bruges til massedownload ("hent hele området på forhånd").
Version 1 gemmer derfor kun de fliser, man faktisk har set. Zoom og panorer rundt i området, mens du er online, så virker de bagefter offline.

Til ægte "hent hele kortet"-offline er planen at lave en egen kortfil til området, fx en PMTiles-fil fra Protomaps eller selvgenererede fliser,
og lægge den ind i appen. Så kan hele kortet hentes med én knap uden at belaste OSM.

## Struktur

```
index.html            Side + layout
css/app.css           Udseende
js/app.js             Kort, markører, modal, GPS
editor.html           Redigering af punkter (js/editor.js, js/zip.js, css/editor.css)
sw.js                 Service worker (offline)
data/points.json      Punkter og kortindstillinger
manifest.webmanifest  PWA-manifest
vendor/leaflet/       Leaflet 1.9.4 (lokalt, så det virker offline)
img/, icons/          Billeder og app-ikoner
```
