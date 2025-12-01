// app.js
// Config
let PUBLISHED_CSV_URL = "https://opensheet.elk.sh/1L9CAlNGDNurB_zUn7e3EPiL22sENxrifkqS8kYOrqag/Sheet1";
const POLL_MS = 5000;

const canonical = {
  speed: ['speed'],
  ph: ['ph'],
  salinity: ['salinity', 'sal'],
  turbidity: ['turbidity','turb'],
  pressure: ['pressure','press'],
  leak: ['leak'],
  lat: ['lat'],
  lng: ['lng'],
  timestamp: ['timestamp','ts'],
};

function mapHeaders(headers){
  const lower = headers.map(h => String(h).toLowerCase().trim());
  const map = {};
  for(const key of Object.keys(canonical)){
    for(const alias of canonical[key]){
      const idx = lower.indexOf(alias.toLowerCase());
      if(idx >= 0){
        map[key] = headers[idx];
        break;
      }
    }
  }
  return map;
}

// Charts
let speedChart, phTrendChart, salTrendChart, pressTrendChart, turbTrendChart;

function makeSemiDonut(ctx, label){
  return new Chart(ctx, {
    type: 'doughnut',
    data: { labels: [label,'rest'], datasets:[{ data:[50,50], cutout:'75%' }]},
    options:{ rotation:-90, circumference:180, plugins:{legend:{display:false}, tooltip:{enabled:false}}}
  });
}

function makeLine(ctx, label){
  return new Chart(ctx, {
    type:'line',
    data:{ labels:[], datasets:[{ data:[], tension:0.3, pointRadius:0, borderWidth:2 }]},
    options:{
      plugins:{legend:{display:false}},
      scales:{ x:{display:false}, y:{ ticks:{color:'#7fe5ff'}}},
      elements:{ line:{ borderColor:'#7fe5ff' }, point:{ radius:0 } }
    }
  });
}

function initCharts(){
  try { speedChart.destroy(); } catch(e){}
  try { phTrendChart.destroy(); } catch(e){}
  try { salTrendChart.destroy(); } catch(e){}
  try { pressTrendChart.destroy(); } catch(e){}
  try { turbTrendChart.destroy(); } catch(e){}

  speedChart = makeSemiDonut(document.getElementById('speedGauge').getContext('2d'));
  phTrendChart = makeLine(document.getElementById('phTrend').getContext('2d'));
  salTrendChart = makeLine(document.getElementById('salTrend').getContext('2d'));
  pressTrendChart = makeLine(document.getElementById('pressTrend').getContext('2d'));
  turbTrendChart = makeLine(document.getElementById('turbTrend').getContext('2d'));
}

initCharts();

let currentRows = [];
let headerMap = {};
let pollTimer = null;

const phNow = document.getElementById('phNow');
const salNow = document.getElementById('salNow');
const pressNow = document.getElementById('pressNow');
const speedVal = document.getElementById('speedVal');
const leakPill = document.getElementById('leakPill');
const depthNow = document.getElementById('depthNow');

function normalize(o){
  o.speed = o.speed ? Number(o.speed) : null;
  o.ph = o.ph ? Number(o.ph) : null;
  o.salinity = o.salinity ? Number(o.salinity) : null;
  o.turbidity = o.turbidity ? Number(o.turbidity) : null;
  o.pressure = o.pressure ? Number(o.pressure) : null;

  if(o.leak !== undefined){
    const s = String(o.leak).toLowerCase();
    o.leak = (s === 'yes' || s === '1' || s === 'true' || s === 'detected');
  }

  if(!o.timestamp){
    const d = new Date();
    o.timestamp = d.toTimeString().split(" ")[0];
  }
}

function updateOverviewUI(latest){
  if(!latest) return;
  document.getElementById('lastUpdate').textContent = (new Date()).toLocaleString();

  const leakEl = document.getElementById('ovLeak');
  if(latest.leak){
    leakEl.textContent = 'Detected';
    leakEl.classList.add('yes'); leakEl.classList.remove('no');
    leakPill.textContent = 'Leak: YES';
  } else {
    leakEl.textContent = 'None';
    leakEl.classList.add('no'); leakEl.classList.remove('yes');
    leakPill.textContent = 'Leak: NO';
  }

  document.getElementById('ovPH').textContent = latest.ph ?? '--';
  document.getElementById('ovSal').textContent = latest.salinity ?? '--';
  document.getElementById('ovPress').textContent = latest.pressure ?? '--';
  document.getElementById('ovTurb').textContent = latest.turbidity ?? '--';
}

function applyRowsToUI(){
  const rows = currentRows;
  document.getElementById('rowCount').textContent = rows.length;
  if(!rows.length) return;

  const latest = rows[rows.length-1];

  phNow.textContent = latest.ph ?? "--";
  salNow.textContent = latest.salinity ?? "--";
  pressNow.textContent = latest.pressure ?? "--";
  speedVal.textContent = (latest.speed ?? 0) + "%";
  depthNow.textContent = latest.depth ?? "--";

  leakPill.textContent = latest.leak ? "Leak: YES" : "Leak: NO";

  speedChart.data.datasets[0].data = [latest.speed ?? 0, 100 - (latest.speed ?? 0)];
  speedChart.update();

  const slice = rows.slice(-50);
  const labels = slice.map(r => r.timestamp);

  phTrendChart.data.labels = labels;
  phTrendChart.data.datasets[0].data = slice.map(r => r.ph);
  phTrendChart.update();

  salTrendChart.data.labels = labels;
  salTrendChart.data.datasets[0].data = slice.map(r => r.salinity);
  salTrendChart.update();

  pressTrendChart.data.labels = labels;
  pressTrendChart.data.datasets[0].data = slice.map(r => r.pressure);
  pressTrendChart.update();

  turbTrendChart.data.labels = labels;
  turbTrendChart.data.datasets[0].data = slice.map(r => r.turbidity);
  turbTrendChart.update();

  const tbody = document.querySelector('#recordsTable tbody');
  tbody.innerHTML = '';
  const last10 = rows.slice(-10).reverse();
  last10.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.timestamp||''}</td><td>${r.ph??''}</td><td>${r.salinity??''}</td><td>${r.pressure??''}</td><td>${r.turbidity??''}</td><td>${r.leak? 'YES':'NO'}</td>`;
    tbody.appendChild(tr);
  });

  try { updateOverviewUI(latest); } catch(e){ console.warn(e); }
}

async function loadUrl(url){
  try{
    const r = await fetch(url);
    const txt = await r.text();
    const data = JSON.parse(txt);

    if(!data || !data.length) return;

    const headers = Object.keys(data[0]);
    headerMap = mapHeaders(headers);

    currentRows = data.map(row=>{
      const o = {};
      for(const key of Object.keys(headerMap)){
        o[key] = row[headerMap[key]];
      }
      normalize(o);
      return o;
    });

    applyRowsToUI();

  }catch(e){
    console.error("Fetch error:", e);
  }
}

function startPolling(url){
  if(pollTimer) clearInterval(pollTimer);
  loadUrl(url);
  pollTimer = setInterval(()=>loadUrl(url), POLL_MS);
}

window.onload = ()=>{
  document.getElementById('csvUrl').value = PUBLISHED_CSV_URL;
  startPolling(PUBLISHED_CSV_URL);

  document.getElementById('startBtn').addEventListener('click', ()=>{
    const u = document.getElementById('csvUrl').value.trim();
    if(u) startPolling(u);
  });
  document.getElementById('stopBtn').addEventListener('click', ()=>{
    if(pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  });
  document.getElementById('reloadBtn').addEventListener('click', ()=>{
    const u = document.getElementById('csvUrl').value.trim();
    if(u) loadUrl(u);
  });
};
