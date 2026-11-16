/* Intermap – redigering af data/points.json (punkter + billeder). */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const DATA_PATH = 'data/points.json';
  const PLACEHOLDER = 'img/placeholder.svg';
  const MAX_IMG = 1200;            // største side i pixels
  const LS_KEY = 'intermap-editor-github';

  let data = null;                 // { map, points }
  let baselineSha = null;          // git-blob-sha af den indlæste points.json
  const pending = new Map();       // 'img/x.webp' -> Blob (nye billeder, ikke udgivet endnu)
  const markers = new Map();       // id -> L.Marker
  let selectedId = null;
  let addMode = false;
  let dirty = false;
  let map, boundsRect;

  init().catch((e) => { console.error(e); toast('Kunne ikke indlæse ' + DATA_PATH, true); });

  async function init() {
    const res = await fetch(DATA_PATH, { cache: 'no-store' });
    const text = await res.text();
    data = JSON.parse(text);
    baselineSha = await gitBlobSha(new TextEncoder().encode(text));

    map = L.map('map', { zoomControl: true }).setView(data.map.center, data.map.zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      crossOrigin: true,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bidragydere',
    }).addTo(map);
    boundsRect = L.rectangle(data.map.bounds, { color: '#1f5f8b', weight: 1, dashArray: '6 6', fill: false, interactive: false }).addTo(map);

    map.on('click', onMapClick);
    bindUI();
    renderAll();
  }

  // ---------- UI-bindinger ----------
  function bindUI() {
    $('#btn-add').addEventListener('click', () => setAddMode(!addMode));
    $('#btn-download').addEventListener('click', downloadZip);
    $('#btn-publish').addEventListener('click', publish);
    $('#btn-settings').addEventListener('click', openSettings);

    $('#f-title').addEventListener('input', (e) => updateSel({ title: e.target.value }, true));
    $('#f-text').addEventListener('input', (e) => updateSel({ text: e.target.value }));
    $('#f-lat').addEventListener('change', (e) => moveSel(+e.target.value, null));
    $('#f-lng').addEventListener('change', (e) => moveSel(null, +e.target.value));
    $('#f-file').addEventListener('change', onImagePicked);
    $('#f-img-remove').addEventListener('click', () => { updateSel({ image: '' }); renderForm(); });
    $('#f-up').addEventListener('click', () => reorder(-1));
    $('#f-down').addEventListener('click', () => reorder(1));
    $('#f-delete').addEventListener('click', deleteSel);

    $('#m-title').addEventListener('input', (e) => { data.map.title = e.target.value; markDirty(); });
    $('#m-radius').addEventListener('change', (e) => { data.map.nearbyRadius = clampInt(e.target.value, 50, 1000, 250); markDirty(); renderMapSettings(); });
    $('#m-cluster').addEventListener('change', (e) => { data.map.cluster = e.target.checked; markDirty(); });
    $('#m-center').addEventListener('click', () => {
      const c = map.getCenter();
      data.map.center = [round(c.lat, 5), round(c.lng, 5)];
      data.map.zoom = map.getZoom();
      markDirty(); renderMapSettings(); toast('Startpunkt og zoom gemt.');
    });
    $('#m-bounds').addEventListener('click', () => {
      const b = map.getBounds();
      data.map.bounds = [[round(b.getSouth(), 4), round(b.getWest(), 4)], [round(b.getNorth(), 4), round(b.getEast(), 4)]];
      boundsRect.setBounds(data.map.bounds);
      markDirty(); renderMapSettings(); toast('Kortområde opdateret.');
    });

    $('#settings').addEventListener('close', onSettingsClosed);
    window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  }

  // ---------- Rendering ----------
  function renderAll() {
    renderMarkers();
    renderList();
    renderForm();
    renderMapSettings();
  }

  function icon(n, sel) {
    return L.divIcon({ className: '', html: `<div class="poi-marker ${sel ? 'sel' : ''}"><span>${n}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 30] });
  }

  function renderMarkers() {
    markers.forEach((m) => m.remove());
    markers.clear();
    data.points.forEach((p, i) => {
      const m = L.marker([p.lat, p.lng], { icon: icon(i + 1, p.id === selectedId), draggable: true, title: p.title, zIndexOffset: p.id === selectedId ? 500 : 0 })
        .addTo(map)
        .on('click', () => select(p.id))
        .on('dragend', (e) => {
          const ll = e.target.getLatLng();
          p.lat = round(ll.lat, 6); p.lng = round(ll.lng, 6);
          markDirty();
          if (selectedId === p.id) renderForm(); else select(p.id);
        });
      markers.set(p.id, m);
    });
  }

  function renderList() {
    const ol = $('#list');
    ol.innerHTML = '';
    data.points.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = p.id === selectedId ? 'sel' : '';
      li.innerHTML = '<span class="n"></span><span class="t"></span><span class="i"></span>';
      li.children[0].textContent = i + 1;
      li.children[1].textContent = p.title || '(uden titel)';
      li.children[2].textContent = p.image ? '🖼' : '';
      li.addEventListener('click', () => { select(p.id); map.panTo([p.lat, p.lng]); });
      ol.appendChild(li);
    });
  }

  function renderForm() {
    const p = sel();
    $('#form').hidden = !p;
    if (!p) return;
    const idx = data.points.indexOf(p);
    $('#f-num').textContent = '#' + (idx + 1);
    if (document.activeElement !== $('#f-title')) $('#f-title').value = p.title || '';
    if (document.activeElement !== $('#f-text')) $('#f-text').value = p.text || '';
    $('#f-lat').value = p.lat;
    $('#f-lng').value = p.lng;
    const img = $('#f-img');
    const blob = p.image && pending.get(p.image);
    if (img.dataset.objUrl) { URL.revokeObjectURL(img.dataset.objUrl); delete img.dataset.objUrl; }
    if (blob) { img.dataset.objUrl = URL.createObjectURL(blob); img.src = img.dataset.objUrl; }
    else img.src = p.image || PLACEHOLDER;
    img.onerror = () => { img.onerror = null; img.src = PLACEHOLDER; };
    $('#f-img-name').textContent = p.image ? p.image + (blob ? ' (ny – ikke udgivet)' : '') : 'Intet billede';
    $('#f-img-remove').disabled = !p.image;
    $('#f-up').disabled = idx === 0;
    $('#f-down').disabled = idx === data.points.length - 1;
  }

  function renderMapSettings() {
    const m = data.map;
    if (document.activeElement !== $('#m-title')) $('#m-title').value = m.title || '';
    $('#m-radius').value = m.nearbyRadius || 250;
    $('#m-cluster').checked = m.cluster !== false;
    $('#m-info').textContent = `Startpunkt ${m.center[0]}, ${m.center[1]} · zoom ${m.zoom}. Det stiplede rektangel er kortområdet.`;
  }

  // ---------- Handlinger ----------
  function sel() { return data.points.find((p) => p.id === selectedId) || null; }

  function select(id) {
    selectedId = id;
    renderMarkers();
    renderList();
    renderForm();
  }

  function updateSel(patch, refreshList) {
    const p = sel();
    if (!p) return;
    Object.assign(p, patch);
    markDirty();
    if (refreshList) { renderList(); markers.get(p.id).options.title = p.title; }
  }

  function moveSel(lat, lng) {
    const p = sel();
    if (!p) return;
    if (lat !== null && isFinite(lat)) p.lat = round(lat, 6);
    if (lng !== null && isFinite(lng)) p.lng = round(lng, 6);
    markers.get(p.id).setLatLng([p.lat, p.lng]);
    markDirty();
  }

  function setAddMode(on) {
    addMode = on;
    $('#map').classList.toggle('adding', on);
    $('#add-hint').hidden = !on;
    $('#btn-add').textContent = on ? 'Annullér' : '＋ Nyt punkt';
  }

  function onMapClick(e) {
    if (!addMode) return;
    setAddMode(false);
    const p = { id: uniqueId('punkt'), title: 'Nyt punkt', lat: round(e.latlng.lat, 6), lng: round(e.latlng.lng, 6), image: '', text: '' };
    data.points.push(p);
    markDirty();
    select(p.id);
    $('#f-title').focus();
    $('#f-title').select();
  }

  function reorder(dir) {
    const i = data.points.findIndex((p) => p.id === selectedId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= data.points.length) return;
    [data.points[i], data.points[j]] = [data.points[j], data.points[i]];
    markDirty();
    select(selectedId);
  }

  function deleteSel() {
    const p = sel();
    if (!p || !confirm(`Slet "${p.title}"?`)) return;
    data.points = data.points.filter((x) => x !== p);
    if (p.image) pending.delete(p.image);
    selectedId = null;
    markDirty();
    renderAll();
  }

  async function onImagePicked(e) {
    const file = e.target.files[0];
    e.target.value = '';
    const p = sel();
    if (!file || !p) return;
    try {
      toast('Behandler billede …');
      const { blob, ext } = await resizeImage(file);
      const path = `img/${slug(p.title) || p.id}-${Date.now().toString(36)}.${ext}`;
      if (p.image) pending.delete(p.image);
      pending.set(path, blob);
      updateSel({ image: path }, true);
      renderForm();
      toast(`Billede klar (${Math.round(blob.size / 1024)} KB).`);
    } catch (err) {
      console.error(err);
      toast('Billedet kunne ikke læses.', true);
    }
  }

  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, MAX_IMG / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((webp) => {
          // Nogle browsere (bl.a. ældre Safari) kan ikke lave WebP – så bruger vi JPEG.
          if (webp && webp.type === 'image/webp') return resolve({ blob: webp, ext: 'webp' });
          c.toBlob((jpg) => (jpg ? resolve({ blob: jpg, ext: 'jpg' }) : reject(new Error('toBlob'))), 'image/jpeg', 0.85);
        }, 'image/webp', 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  function markDirty() { dirty = true; $('#dirty').hidden = false; }
  function markClean() { dirty = false; $('#dirty').hidden = true; }

  // ---------- Validering + serialisering ----------
  function validate() {
    const bad = data.points.findIndex((p) => !String(p.title || '').trim() || !isFinite(p.lat) || !isFinite(p.lng));
    if (bad >= 0) {
      select(data.points[bad].id);
      toast(`Punkt #${bad + 1} mangler titel eller koordinater.`, true);
      return false;
    }
    return true;
  }

  function serialize() {
    const out = {
      map: data.map,
      points: data.points.map((p) => ({ id: p.id, title: p.title.trim(), lat: p.lat, lng: p.lng, image: p.image || '', text: p.text || '' })),
    };
    return JSON.stringify(out, null, 2) + '\n';
  }

  // Kun billeder, der stadig bruges af et punkt.
  function usedPending() {
    const used = new Set(data.points.map((p) => p.image));
    return [...pending].filter(([path]) => used.has(path));
  }

  // ---------- Download ZIP ----------
  async function downloadZip() {
    if (!validate()) return;
    const files = [{ name: DATA_PATH, data: new TextEncoder().encode(serialize()) }];
    for (const [path, blob] of usedPending()) files.push({ name: path, data: new Uint8Array(await blob.arrayBuffer()) });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(window.makeZip(files));
    a.download = 'intermap-data.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast(`ZIP hentet (${files.length} fil${files.length === 1 ? '' : 'er'}). Pak ud i repoets rodmappe.`);
  }

  // ---------- GitHub ----------
  function loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { /* tom */ }
    // Gæt ejer/repo ud fra GitHub Pages-adressen (ejer.github.io/repo/).
    const m = location.hostname.match(/^([^.]+)\.github\.io$/);
    if (m) {
      s.owner = s.owner || m[1];
      s.repo = s.repo || location.pathname.split('/').filter(Boolean)[0] || '';
    }
    s.branch = s.branch || 'main';
    return s;
  }

  function openSettings() {
    const s = loadSettings();
    $('#s-owner').value = s.owner || '';
    $('#s-repo').value = s.repo || '';
    $('#s-branch').value = s.branch || 'main';
    $('#s-token').value = s.token || '';
    $('#settings').showModal();
  }

  function onSettingsClosed() {
    const v = $('#settings').returnValue;
    if (v === 'save') {
      const s = {
        owner: $('#s-owner').value.trim(),
        repo: $('#s-repo').value.trim(),
        branch: $('#s-branch').value.trim() || 'main',
        token: $('#s-token').value.trim(),
      };
      localStorage.setItem(LS_KEY, JSON.stringify(s));
      toast('Indstillinger gemt.');
      if (publishAfterSettings) { publishAfterSettings = false; publish(); }
    } else if (v === 'forget') {
      const s = loadSettings();
      delete s.token;
      localStorage.setItem(LS_KEY, JSON.stringify(s));
      toast('Nøglen er glemt i denne browser.');
    }
    publishAfterSettings = false;
  }

  let publishAfterSettings = false;
  let publishing = false;

  async function publish() {
    if (publishing || !validate()) return;
    const s = loadSettings();
    if (!s.owner || !s.repo || !s.token) {
      publishAfterSettings = true;
      openSettings();
      return;
    }
    if (!dirty && !pending.size && !confirm('Der er ingen ændringer. Udgiv alligevel?')) return;

    publishing = true;
    $('#btn-publish').disabled = true;
    try {
      const gh = github(s);
      toast('Forbinder til GitHub …');
      const ref = await gh('GET', `git/ref/heads/${encodeURIComponent(s.branch)}`);
      const headSha = ref.object.sha;
      const head = await gh('GET', `git/commits/${headSha}`);

      // Er points.json ændret på GitHub, siden vi hentede den?
      const remote = await gh('GET', `contents/${DATA_PATH}?ref=${headSha}`).catch(() => null);
      if (remote && baselineSha && remote.sha !== baselineSha &&
          !confirm('points.json er ændret på GitHub, siden du åbnede editoren. Overskriv med din version?')) {
        return;
      }

      const json = serialize();
      const tree = [{ path: DATA_PATH, mode: '100644', type: 'blob', content: json }];
      const imgs = usedPending();
      for (let i = 0; i < imgs.length; i++) {
        toast(`Uploader billede ${i + 1} af ${imgs.length} …`);
        const [path, blob] = imgs[i];
        const b = await gh('POST', 'git/blobs', { content: await blobToBase64(blob), encoding: 'base64' });
        tree.push({ path, mode: '100644', type: 'blob', sha: b.sha });
      }

      toast('Gemmer …');
      const newTree = await gh('POST', 'git/trees', { base_tree: head.tree.sha, tree });
      const n = data.points.length;
      const commit = await gh('POST', 'git/commits', {
        message: `Opdatér kortdata (${n} punkter${imgs.length ? `, ${imgs.length} ${imgs.length === 1 ? 'nyt billede' : 'nye billeder'}` : ''})`,
        tree: newTree.sha,
        parents: [headSha],
      });
      await gh('PATCH', `git/refs/heads/${encodeURIComponent(s.branch)}`, { sha: commit.sha });

      baselineSha = await gitBlobSha(new TextEncoder().encode(json));
      pending.clear();
      markClean();
      renderForm();
      toast('Udgivet ✔ Kortet er opdateret om ca. 1 minut.');
    } catch (err) {
      console.error(err);
      toast('Udgivelse fejlede: ' + err.message, true);
    } finally {
      publishing = false;
      $('#btn-publish').disabled = false;
    }
  }

  function github(s) {
    const base = `https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}/`;
    return async (method, path, body) => {
      const res = await fetch(base + path, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: 'Bearer ' + s.token,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
      if (!res.ok) {
        const hint = { 401: 'nøglen er ugyldig eller udløbet', 403: 'nøglen mangler skriveadgang (Contents: Read and write)', 404: 'repo eller branch findes ikke – eller nøglen har ikke adgang til repoet', 409: 'konflikt – prøv igen', 422: 'GitHub afviste ændringen' }[res.status];
        throw new Error(`${res.status}${hint ? ' – ' + hint : ''}`);
      }
      return res.json();
    };
  }

  // ---------- Hjælpere ----------
  async function gitBlobSha(bytes) {
    const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
    const all = new Uint8Array(header.length + bytes.length);
    all.set(header); all.set(bytes, header.length);
    const h = await crypto.subtle.digest('SHA-1', all);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  function slug(s) {
    return String(s || '').toLowerCase()
      .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  }

  function uniqueId(base) {
    const ids = new Set(data.points.map((p) => p.id));
    let i = data.points.length + 1;
    while (ids.has(`${base}-${i}`)) i++;
    return `${base}-${i}`;
  }

  function round(x, d) { const f = 10 ** d; return Math.round(x * f) / f; }
  function clampInt(v, lo, hi, def) { const n = parseInt(v, 10); return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; }

  let toastTimer;
  function toast(text, isErr) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.toggle('err', !!isErr);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, isErr ? 8000 : 3500);
  }
})();
