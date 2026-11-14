/* Intermap – Leaflet-kort med punkter, modal og "Her er jeg"-funktion. */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const PLACEHOLDER = 'img/placeholder.svg';

  let map, cfg, points = [];
  const markers = new Map();      // id -> L.Marker
  let meMarker = null, meAccuracy = null, nearCircle = null;
  let myPos = null;               // L.LatLng
  let watchId = null;
  let simulated = false;

  // ---------- Opstart ----------
  init().catch((err) => {
    console.error(err);
    toast('Kunne ikke indlæse kortdata.');
  });

  async function init() {
    const res = await fetch('data/points.json');
    const data = await res.json();
    cfg = data.map;
    points = data.points;

    $('#title').textContent = cfg.title;
    document.title = 'Intermap – ' + cfg.title;
    $('#radius').value = String(cfg.nearbyRadius || 250);

    map = L.map('map', {
      center: cfg.center,
      zoom: cfg.zoom,
      minZoom: cfg.minZoom,
      maxZoom: cfg.maxZoom,
      maxBounds: L.latLngBounds(cfg.bounds).pad(0.15),
      maxBoundsViscosity: 0.8,
      zoomControl: false,
    });
    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      crossOrigin: true, // giver CORS-svar, så service workeren kan gemme fliserne effektivt
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bidragydere',
    }).addTo(map);

    points.forEach((p, i) => {
      const m = L.marker([p.lat, p.lng], { icon: poiIcon(i + 1, ''), title: p.title, keyboard: true })
        .addTo(map)
        .on('click', () => openModal(p));
      m._idx = i + 1;
      markers.set(p.id, m);
    });

    $('#btn-locate').addEventListener('click', locate);
    $('#radius').addEventListener('change', () => { if (myPos) updateNearby(); });
    $('#nearby-close').addEventListener('click', clearNearby);
    document.querySelectorAll('#modal [data-close]').forEach((el) => el.addEventListener('click', closeModal));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

    setupNetStatus();
    registerSW();
    if (new URLSearchParams(location.search).has('demo')) simulatePosition();
  }

  function poiIcon(n, state) {
    return L.divIcon({
      className: '',
      html: `<div class="poi-marker ${state}"><span>${n}</span></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 30],
    });
  }

  // ---------- Modal ----------
  function openModal(p) {
    const img = $('#modal-img');
    img.src = p.image || PLACEHOLDER;
    img.alt = p.image ? p.title : '';
    img.onerror = () => { img.onerror = null; img.src = PLACEHOLDER; };
    $('#modal-title').textContent = p.title;
    $('#modal-text').textContent = p.text || '';
    $('#modal-dist').textContent = myPos ? fmtDist(myPos.distanceTo([p.lat, p.lng])) + ' herfra' : '';
    $('#modal').hidden = false;
    $('.modal-close').focus();
  }
  function closeModal() { $('#modal').hidden = true; }

  // ---------- GPS / "Her er jeg" ----------
  function locate() {
    if (myPos) { updateNearby(); focusCircle(); }
    simulated = false; // et nyt tryk prøver altid den rigtige GPS
    if (!('geolocation' in navigator)) { toast('Din browser understøtter ikke GPS.'); return; }

    toast('Finder din position …');
    navigator.geolocation.getCurrentPosition(onFirstFix, onGeoError, {
      enableHighAccuracy: true, timeout: 20000, maximumAge: 10000,
    });
  }

  function onFirstFix(pos) {
    const ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
    const area = L.latLngBounds(cfg.bounds).pad(0.5);
    if (!area.contains(ll)) {
      toast('Du er uden for kortområdet.', { label: 'Simulér ved Domkirken', onClick: simulatePosition });
      return;
    }
    hideToast();
    setPosition(ll, pos.coords.accuracy, true);
    if (watchId === null) {
      watchId = navigator.geolocation.watchPosition(
        (p) => setPosition(L.latLng(p.coords.latitude, p.coords.longitude), p.coords.accuracy, false),
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
    }
  }

  function onGeoError(err) {
    const msg = {
      1: 'Adgang til position blev afvist. Tillad placering i browserens indstillinger.',
      2: 'Positionen kunne ikke bestemmes. Prøv udendørs.',
      3: 'Det tog for lang tid at finde positionen. Prøv igen.',
    }[err.code] || 'Positionen kunne ikke bestemmes.';
    toast(msg, { label: 'Simulér ved Domkirken', onClick: simulatePosition });
  }

  function simulatePosition() {
    simulated = true;
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    hideToast();
    setPosition(L.latLng(cfg.center), 10, true);
    toast('Demo: position sat ved ' + (points[0] ? points[0].title : 'centrum') + '.');
  }

  function setPosition(ll, accuracy, fly) {
    myPos = ll;
    if (!meMarker) {
      meMarker = L.marker(ll, {
        icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        interactive: false, zIndexOffset: 1000,
      }).addTo(map);
      meAccuracy = L.circle(ll, { radius: accuracy, stroke: false, fillColor: '#2b8cff', fillOpacity: .12, interactive: false }).addTo(map);
    } else {
      meMarker.setLatLng(ll);
      meAccuracy.setLatLng(ll).setRadius(accuracy);
    }
    updateNearby();
    if (fly) focusCircle();
  }

  // Vis hele radius-cirklen over listen i bunden.
  function focusCircle() {
    const sheetH = $('#nearby').hidden ? 0 : $('#nearby').offsetHeight;
    map.flyToBounds(nearCircle.getBounds(), {
      paddingTopLeft: [20, 20],
      paddingBottomRight: [20, sheetH + 20],
      maxZoom: 18,
    });
  }

  function updateNearby() {
    const radius = Number($('#radius').value);
    if (!nearCircle) {
      nearCircle = L.circle(myPos, { radius, color: '#e67e22', weight: 2, fillOpacity: .06, dashArray: '6 6', interactive: false }).addTo(map);
    } else {
      nearCircle.setLatLng(myPos).setRadius(radius);
    }

    const withDist = points.map((p) => ({ p, d: myPos.distanceTo([p.lat, p.lng]) }));
    const near = withDist.filter((x) => x.d <= radius).sort((a, b) => a.d - b.d);
    const nearIds = new Set(near.map((x) => x.p.id));

    markers.forEach((m, id) => m.setIcon(poiIcon(m._idx, nearIds.has(id) ? 'near' : 'far')));

    const list = $('#nearby-list');
    list.innerHTML = '';
    $('#nearby-title').textContent = `Inden for ${radius} m (${near.length})`;
    if (near.length) {
      $('#nearby-msg').textContent = '';
      near.forEach(({ p, d }) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = `<span></span><span class="d">${fmtDist(d)}</span>`;
        b.firstChild.textContent = p.title;
        b.addEventListener('click', () => { map.flyTo([p.lat, p.lng], 18); openModal(p); });
        li.appendChild(b);
        list.appendChild(li);
      });
    } else {
      const nearest = withDist.sort((a, b) => a.d - b.d)[0];
      $('#nearby-msg').textContent = nearest
        ? `Ingen punkter her. Nærmeste er ${nearest.p.title} (${fmtDist(nearest.d)}).`
        : 'Ingen punkter.';
    }
    $('#nearby').hidden = false;
  }

  function clearNearby() {
    $('#nearby').hidden = true;
    if (nearCircle) { nearCircle.remove(); nearCircle = null; }
    markers.forEach((m) => m.setIcon(poiIcon(m._idx, '')));
  }

  function fmtDist(m) {
    return m < 1000 ? Math.round(m / 5) * 5 + ' m' : (m / 1000).toFixed(1).replace('.', ',') + ' km';
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(text, action) {
    const t = $('#toast');
    t.textContent = text;
    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = action.label;
      b.addEventListener('click', () => { hideToast(); action.onClick(); });
      t.appendChild(b);
    }
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, action ? 9000 : 3500);
  }
  function hideToast() { $('#toast').hidden = true; }

  // ---------- Netværk + offline ----------
  function setupNetStatus() {
    const el = $('#net-status');
    const upd = () => {
      el.textContent = navigator.onLine ? 'Online' : 'Offline';
      el.classList.toggle('offline', !navigator.onLine);
    };
    window.addEventListener('online', upd);
    window.addEventListener('offline', upd);
    upd();
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    // Bed om at data ikke slettes automatisk (vigtigt på iPhone).
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Ny version klar.', { label: 'Opdatér', onClick: () => nw.postMessage('skipWaiting') });
          }
        });
      });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloaded) { reloaded = true; location.reload(); }
    });
  }
})();
