const $ = id => document.getElementById(id);
const KEY = 'bp_readings_v1';
const pad = n => String(n).padStart(2, '0');

// ---------- storage (localStorage inside the app's WebView; survives restarts) ----------
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const store = arr => localStorage.setItem(KEY, JSON.stringify(arr));

// ---------- day / night (Day = 06:00–17:59, Night = 18:00–05:59) ----------
function dayNight(time) {
  const h = parseInt((time || '0:0').split(':')[0], 10);
  return h >= 6 && h < 18 ? 'Day' : 'Night';
}
function to12(time) {
  let [h, m] = time.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12; return `${h}:${pad(m)} ${ap}`;
}
function setNow() {
  const d = new Date();
  $('date').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  $('time').value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  updateTod();
}
function updateTod() {
  const t = dayNight($('time').value);
  $('tod').innerHTML = `Time of day: <span class="badge ${t}">${t === 'Day' ? '☀️ Day' : '🌙 Night'}</span>`;
}
$('time').addEventListener('input', updateTod);

// ---------- save / list ----------
function render() {
  const all = load().sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  $('list').innerHTML = all.length ? all.map(r => `
    <div class="item">
      <div class="when">${r.date}<br>${to12(r.time)} <span class="badge ${r.tod}">${r.tod}</span></div>
      <div class="vals ${r.sys >= 140 || r.dia >= 90 ? 'hi' : ''}">${r.sys}/${r.dia} <small>mmHg</small><br><small>♥ ${r.pulse} bpm</small></div>
      <button class="del" data-id="${r.id}">🗑</button>
    </div>`).join('') : '<div class="empty">No readings yet</div>';
}
$('list').addEventListener('click', e => {
  const id = e.target.dataset.id; if (!id) return;
  if (confirm('Delete this reading?')) { store(load().filter(r => String(r.id) !== id)); render(); }
});
$('saveBtn').onclick = () => {
  const sys = +$('sys').value, dia = +$('dia').value, pulse = +$('pulse').value;
  if (!$('date').value || !$('time').value) return alert('Please set date and time');
  if (!(sys > 0 && dia > 0 && pulse > 0)) return alert('Please enter SYS, DIA and Pulse');
  if (sys <= dia && !confirm('SYS is not higher than DIA. Save anyway?')) return;
  const arr = load();
  arr.push({ id: Date.now(), date: $('date').value, time: $('time').value, tod: dayNight($('time').value), sys, dia, pulse });
  store(arr); render();
  ['sys', 'dia', 'pulse'].forEach(i => $(i).value = ''); setNow();
  $('status').textContent = '✅ Saved';
};
$('clearBtn').onclick = () => { ['sys', 'dia', 'pulse'].forEach(i => $(i).value = ''); setNow(); $('status').textContent = ''; };

// ---------- scan (OCR, fully offline) ----------
let worker;
async function getWorker() {
  if (worker) return worker;
  const base = new URL('lib/', location.href).href;
  worker = await Tesseract.createWorker('eng', 1, {
    workerPath: base + 'worker.min.js', corePath: base, langPath: base,
    workerBlobURL: false, gzip: true, cacheMethod: 'none'
  });
  await worker.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: '11' });
  return worker;
}
function prep(img, invert, thresh) {
  const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
  let min = 255, max = 0; const gray = new Uint8Array(p.length / 4);
  for (let i = 0, j = 0; i < p.length; i += 4, j++) {
    const v = .299 * p[i] + .587 * p[i + 1] + .114 * p[i + 2]; gray[j] = v; if (v < min) min = v; if (v > max) max = v;
  }
  const range = Math.max(1, max - min);
  for (let i = 0, j = 0; i < p.length; i += 4, j++) {
    let v = (gray[j] - min) * 255 / range;
    if (thresh) v = v > 128 ? 255 : 0;
    if (invert) v = 255 - v;
    p[i] = p[i + 1] = p[i + 2] = v;
  }
  g.putImageData(d, 0, 0); return c;
}
function parse(text) {
  const nums = (text.match(/\d{2,3}/g) || []).map(Number).filter(n => n >= 30 && n <= 300);
  // BP monitors show SYS, DIA, PULSE top to bottom. Find first plausible triple.
  for (let i = 0; i + 2 < nums.length; i++) {
    const [s, d, p] = nums.slice(i, i + 3);
    if (s > d && s >= 70 && s <= 260 && d >= 40 && d <= 150 && p >= 30 && p <= 200) return { sys: s, dia: d, pulse: p, score: 3 };
  }
  return { score: 0 };
}
$('scanBtn').onclick = () => $('file').click();
$('file').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  $('status').textContent = '⏳ Reading image… (first scan may take a few seconds)';
  try {
    const img = new Image(); img.src = URL.createObjectURL(f); await img.decode();
    const w = await getWorker();
    let best = { score: 0 };
    for (const [inv, th] of [[false, false], [true, false], [false, true], [true, true]]) {
      const { data } = await w.recognize(prep(img, inv, th));
      const r = parse(data.text); if (r.score > best.score) { best = r; break; }
    }
    if (best.score) {
      $('sys').value = best.sys; $('dia').value = best.dia; $('pulse').value = best.pulse;
      setNow();
      $('status').textContent = '✅ Read SYS/DIA/Pulse — please verify before saving.';
    } else {
      $('status').textContent = '⚠️ Could not read clearly. Retake with the display filling the frame, no glare — or type values manually.';
    }
  } catch (err) { $('status').textContent = '❌ Scan failed: ' + err.message; }
  e.target.value = '';
};

// ---------- PDF export ----------
$('pdfBtn').onclick = async () => {
  let rows = load().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const r = $('range').value;
  if (r !== 'all') { const cut = new Date(); cut.setDate(cut.getDate() - +r); const cs = `${cut.getFullYear()}-${pad(cut.getMonth() + 1)}-${pad(cut.getDate())}`; rows = rows.filter(x => x.date >= cs); }
  if (!rows.length) return alert('No readings in this range');
  const { jsPDF } = window.jspdf; const doc = new jsPDF();
  doc.setFontSize(18); doc.text('Blood Pressure Report', 14, 18);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}   |   Range: ${r === 'all' ? 'All readings' : 'Last ' + r + ' days'}`, 14, 25);
  const avg = k => Math.round(rows.reduce((s, x) => s + x[k], 0) / rows.length);
  doc.text(`Readings: ${rows.length}   |   Average: ${avg('sys')}/${avg('dia')} mmHg, pulse ${avg('pulse')} bpm`, 14, 31);
  const cols = [['Date', 14], ['Time', 46], ['Day/Night', 76], ['SYS', 108], ['DIA', 130], ['Pulse', 152]];
  let y = 42;
  const header = () => { doc.setFont(undefined, 'bold'); doc.setFillColor(230, 230, 235); doc.rect(12, y - 6, 186, 8, 'F'); cols.forEach(([t, x]) => doc.text(t, x, y)); doc.setFont(undefined, 'normal'); y += 8; };
  header();
  rows.forEach(x => {
    if (y > 280) { doc.addPage(); y = 20; header(); }
    if (x.sys >= 140 || x.dia >= 90) doc.setTextColor(200, 30, 30);
    [x.date, to12(x.time), x.tod, String(x.sys), String(x.dia), String(x.pulse)].forEach((t, i) => doc.text(t, cols[i][1], y));
    doc.setTextColor(0); y += 7;
  });
  const name = `BP_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
  const cap = window.Capacitor;
  try {
    if (cap && cap.isNativePlatform && cap.isNativePlatform()) {
      const { Filesystem, Share } = cap.Plugins;
      const b64 = doc.output('datauristring').split(',')[1];
      const res = await Filesystem.writeFile({ path: name, data: b64, directory: 'CACHE' });
      await Share.share({ title: name, url: res.uri, dialogTitle: 'Save or share PDF' });
    } else doc.save(name);
  } catch (e) { if (!/cancel/i.test(e.message || '')) alert('PDF export failed: ' + e.message); }
};

setNow(); render();
