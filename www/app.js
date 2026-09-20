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
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(s) { const [y, m, d] = s.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; }
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
      <div class="when">${fmtDate(r.date)}<br>${to12(r.time)} <span class="badge ${r.tod}">${r.tod}</span></div>
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
    [fmtDate(x.date), to12(x.time), x.tod, String(x.sys), String(x.dia), String(x.pulse)].forEach((t, i) => doc.text(t, cols[i][1], y));
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


