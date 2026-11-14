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

## Tilføj eller ret punkter

Alt indhold ligger i [`data/points.json`](data/points.json):

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
Ændringer i `points.json` hentes automatisk, når der er net.

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
sw.js                 Service worker (offline)
data/points.json      Punkter og kortindstillinger
manifest.webmanifest  PWA-manifest
vendor/leaflet/       Leaflet 1.9.4 (lokalt, så det virker offline)
img/, icons/          Billeder og app-ikoner
```
