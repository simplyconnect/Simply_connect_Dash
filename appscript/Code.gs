// ══════════════════════════════════════════════════
// SIMPLY CONNECT — Google Apps Script API
// Sheet 1: "Calls Data"   Sheet 2: "Sales Data"
// (Sheet name matching is case/whitespace-tolerant — see findSheet() below)
// Deploy: Web App → Execute as Me → Anyone → Copy URL
// Set window.API_URL in js/data.js to that URL
// ══════════════════════════════════════════════════

const SPREADSHEET_ID = 'YOUR_GOOGLE_SPREADSHEET_ID';

function doGet(e) {
  try {
    e = e || { parameter: {} };
    const action   = (e.parameter.action   || 'all').toLowerCase();
    const filters  = {
      start:    e.parameter.start    || '',
      end:      e.parameter.end      || '',
      team:     e.parameter.team     || '',
      campaign: e.parameter.campaign || '',
      state:    e.parameter.state    || '',
      agent:    e.parameter.agent    || '',
    };

    let result;
    if (action === 'all') {
      result = {
        callResults:  getCallResults(filters),
        dailyCalls:   getDailyCalls(filters),
        hourly:       getHourly(filters),
        campaigns:    getCampaigns(filters),
        agents:       getAgents(filters),
        teams:        getTeams(filters),
        sales:        getSales(filters),
        states:       getStates(filters),
        providers:    getProviders(filters),
        services:     getServices(filters),
        installTypes: getInstallTypes(filters),
        closers:      getClosers(filters),
        summary:      getSummary(filters),
      };
    } else {
      const map = {
        callresults: getCallResults, dailycalls: getDailyCalls,
        hourly: getHourly, campaigns: getCampaigns,
        agents: getAgents, teams: getTeams, sales: getSales,
        states: getStates, providers: getProviders,
        services: getServices, installtypes: getInstallTypes,
        closers: getClosers, summary: getSummary,
      };
      result = (map[action] || getSummary)(filters);
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    // Return errors as JSON (not an HTML error page) so the dashboard
    // can surface a readable message instead of a silent fetch failure.
    return ContentService
      .createTextOutput(JSON.stringify({ error: true, message: String(err && err.message || err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ── Row reader + filter ──────────────────────────────
// Finds a sheet by name, tolerant of case/whitespace differences
// (e.g. "sales Data" vs "Sales Data" vs "Sales data").
function findSheet(ss, name) {
  const exact = ss.getSheetByName(name);
  if (exact) return exact;
  const target = name.trim().toLowerCase();
  const match = ss.getSheets().find(s => s.getName().trim().toLowerCase() === target);
  if (match) return match;
  throw new Error('Sheet not found: "' + name + '". Available sheets: ' +
    ss.getSheets().map(s => s.getName()).join(', '));
}

const SHEET_CACHE = {};
function readSheet(name) {
  if (SHEET_CACHE[name]) return SHEET_CACHE[name];
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = findSheet(ss, name);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) { SHEET_CACHE[name] = []; return []; }
  const headers = data[0].map(h => String(h).trim());
  const rows = data.slice(1)
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });
  SHEET_CACHE[name] = rows;
  return rows;
}

function filterCalls(rows, f) {
  let r = rows;
  if (f.start || f.end) {
    const s = f.start ? new Date(f.start) : null;
    const e = f.end   ? new Date(f.end)   : null;
    r = r.filter(row => {
      const d = new Date(row['Date']);
      if (isNaN(d)) return true;
      if (s && d < s) return false;
      if (e && d > e) return false;
      return true;
    });
  }
  if (f.campaign) r = r.filter(row => row['Call Center Name'] === f.campaign);
  if (f.agent)    r = r.filter(row => row['Agent Name']       === f.agent);
  return r;
}

function filterSales(rows, f) {
  let r = rows;
  if (f.start || f.end) {
    const s = f.start ? new Date(f.start) : null;
    const e = f.end   ? new Date(f.end)   : null;
    r = r.filter(row => {
      const d = new Date(row['Date']);
      if (isNaN(d)) return true;
      if (s && d < s) return false;
      if (e && d > e) return false;
      return true;
    });
  }
  if (f.team)     r = r.filter(row => row['Team']          === f.team);
  if (f.state)    r = r.filter(row => row['State']         === f.state);
  if (f.agent)    r = r.filter(row => row['Agent Name']    === f.agent);
  // NOTE: no reliable campaign/queue join to the Calls sheet — "Call
  // Received from Queue Name" uses different labels than "Call Center Name"
  // and is blank on ~50% of rows, so the campaign filter is not applied here.
  return r;
}

function toSecs(t) {
  if (t === '' || t === null || t === undefined) return 0;
  // Sheets time-formatted cells arrive as JS Date objects in Apps Script.
  if (Object.prototype.toString.call(t) === '[object Date]') {
    if (isNaN(t.getTime())) return 0;
    return t.getHours()*3600 + t.getMinutes()*60 + t.getSeconds();
  }
  // Fallback: "H:MM:SS" or "MM:SS" string (e.g. from a CSV import).
  const parts = String(t).trim().split(':').map(Number);
  if (parts.length === 3 && parts.every(n => !isNaN(n))) return parts[0]*3600 + parts[1]*60 + parts[2];
  if (parts.length === 2 && parts.every(n => !isNaN(n))) return parts[0]*60 + parts[1];
  return 0;
}

// ── Aggregators ─────────────────────────────────────
function getCallResults(f) {
  const rows = filterCalls(readSheet('Calls Data'), f);
  const map = {};
  rows.forEach(r => { const k = r['Call Result']||'Unknown'; map[k]=(map[k]||0)+1; });
  return Object.entries(map).map(([result,count])=>({result,count})).sort((a,b)=>b.count-a.count);
}

function getDailyCalls(f) {
  const rows = filterCalls(readSheet('Calls Data'), f);
  const map = {};
  rows.forEach(r => {
    const d = new Date(r['Date']);
    if (isNaN(d)) return;
    const k = d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
    if (!map[k]) map[k] = { date:k, total:0, answered:0, abandoned:0, talkSum:0, waitSum:0, n:0 };
    map[k].total++;
    if (r['Call Result']==='Answered')  map[k].answered++;
    if (r['Call Result']==='Abandoned') map[k].abandoned++;
    map[k].talkSum += toSecs(r['Talk Time']);
    map[k].waitSum += toSecs(r['Wait Time']);
    map[k].n++;
  });
  return Object.values(map).map(d=>({
    date:d.date, total:d.total, answered:d.answered, abandoned:d.abandoned,
    avgTalk:d.n?Math.round(d.talkSum/d.n):0,
    avgWait:d.n?Math.round(d.waitSum/d.n):0,
  }));
}

function getHourly(f) {
  const rows = filterCalls(readSheet('Calls Data'), f);
  const map = {};
  rows.forEach(r => {
    const h = (r['Time Frame']||'').replace('CT','');
    if (!h) return;
    if (!map[h]) map[h] = { hour:h, total:0, answered:0 };
    map[h].total++;
    if (r['Call Result']==='Answered') map[h].answered++;
  });
  return Object.values(map).map(h=>({
    hour:h.hour, total:h.total, answered:h.answered,
    rate:h.total?+((h.answered/h.total)*100).toFixed(1):0
  })).sort((a,b)=>+a.hour.split('-')[0] - +b.hour.split('-')[0]);
}

function getCampaigns(f) {
  const calls = filterCalls(readSheet('Calls Data'), f);
  const cmap={};
  calls.forEach(r=>{
    const k=r['Call Center Name']||'Unknown';
    if(!cmap[k]) cmap[k]={name:k,calls:0,answered:0};
    cmap[k].calls++;
    if(r['Call Result']==='Answered') cmap[k].answered++;
  });
  return Object.values(cmap).sort((a,b)=>b.calls-a.calls);
}

function getAgents(f) {
  const calls = filterCalls(readSheet('Calls Data'), f);
  const sales = filterSales(readSheet('Sales Data'), f);
  const cmap={}, smap={};
  calls.forEach(r=>{
    const n=(r['Agent Name']||'').trim(); if(!n) return;
    if(!cmap[n]) cmap[n]={name:n,calls:0,answered:0,talkSum:0,waitSum:0,bounces:0};
    cmap[n].calls++;
    if(r['Call Result']==='Answered') cmap[n].answered++;
    cmap[n].talkSum += toSecs(r['Talk Time']);
    cmap[n].waitSum += toSecs(r['Wait Time']);
    cmap[n].bounces += Number(r['Number of Bounces'])||0;
  });
  sales.forEach(r=>{
    const n=(r['Agent Name']||'').trim(); if(!n) return;
    if(!smap[n]) smap[n]={team:'',sales:0,rgus:0};
    smap[n].team = r['Team']||smap[n].team;
    smap[n].sales++;
    smap[n].rgus += Number(r["RGU's"])||0;
  });
  // Union of both sheets — some closers/agents only appear in Sales Data
  // (e.g. name spelled differently in the two sheets, or they took no
  // logged calls that period) and would otherwise be silently dropped.
  const names = new Set([...Object.keys(cmap), ...Object.keys(smap)]);
  return Array.from(names).map(n=>{
    const a = cmap[n] || { name:n, calls:0, answered:0, talkSum:0, waitSum:0, bounces:0 };
    const s = smap[n] || { team:'', sales:0, rgus:0 };
    return {
      name:n, calls:a.calls, answered:a.answered,
      avgTalk:a.calls?Math.round(a.talkSum/a.calls):0,
      avgWait:a.calls?+(a.waitSum/a.calls).toFixed(1):0,
      bounces:a.bounces,
      team:s.team, sales:s.sales, rgus:s.rgus,
    };
  }).sort((a,b)=>b.calls-a.calls);
}

function getTeams(f) {
  const calls = filterCalls(readSheet('Calls Data'), f);
  const sales = filterSales(readSheet('Sales Data'), f);
  // Teams live only in Sales Data — Calls Data has no Team column — so we
  // estimate each agent's team from their sales rows. Agents who never
  // appear in Sales Data land in "Unassigned" (their team is genuinely
  // unknown from this data, not a bug).
  const smap={};
  sales.forEach(r=>{
    const t=r['Team']||''; if(!t) return;
    if(!smap[t]) smap[t]={team:t,sales:0,rgus:0};
    smap[t].sales++;
    smap[t].rgus += Number(r["RGU's"])||0;
  });
  const agentTeam={};
  sales.forEach(r=>{ if(r['Agent Name']) agentTeam[r['Agent Name']]=r['Team']; });
  const tmap={};
  calls.forEach(r=>{
    const n=r['Agent Name']||''; const t=agentTeam[n]||'Unassigned';
    if(!tmap[t]) tmap[t]={calls:0,answered:0};
    tmap[t].calls++;
    if(r['Call Result']==='Answered') tmap[t].answered++;
  });
  const names = new Set([...Object.keys(smap), ...Object.keys(tmap)]);
  return Array.from(names).map(t=>{
    const s = smap[t] || { team:t, sales:0, rgus:0 };
    const c = tmap[t]  || { calls:0, answered:0 };
    return { ...s, calls:c.calls, answered:c.answered };
  }).sort((a,b)=>b.sales-a.sales);
}

function getSales(f) {
  return filterSales(readSheet('Sales Data'), f).map(r=>({
    date:     r['Date'] instanceof Date ? Utilities.formatDate(r['Date'], Session.getScriptTimeZone(), 'yyyy-MM-dd') : (r['Date']||''),
    agent:    r['Agent Name']||'',
    team:     r['Team']||'',
    provider: r['Provider']||'',
    service:  r['Services']||'',
    state:    r['State']||'',
    rgu:      Number(r["RGU's"])||0,
    install:  r['Installation Type']||'',
    queue:    r['Call Received from Queue Name']||'',
    closer:   r['Closer Name']||'',
    processed:r['Sale Processed']||'',
  }));
}

function getStates(f) {
  const rows = filterSales(readSheet('Sales Data'), f);
  const map={};
  rows.forEach(r=>{
    const s=r['State']; if(!s) return;
    if(!map[s]) map[s]={state:s,sales:0,rgus:0};
    map[s].sales++;
    map[s].rgus+=Number(r["RGU's"])||0;
  });
  return Object.values(map).sort((a,b)=>b.sales-a.sales);
}

function getProviders(f) {
  const rows = filterSales(readSheet('Sales Data'), f);
  const map={};
  rows.forEach(r=>{
    const p=r['Provider']; if(!p) return;
    if(!map[p]) map[p]={name:p,sales:0,rgus:0};
    map[p].sales++;
    map[p].rgus += Number(r["RGU's"])||0;
  });
  return Object.values(map).sort((a,b)=>b.sales-a.sales);
}

function getServices(f) {
  const rows = filterSales(readSheet('Sales Data'), f);
  const map={};
  rows.forEach(r=>{ const s=r['Services']; if(!s) return; map[s]=(map[s]||0)+1; });
  return Object.entries(map).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count);
}

function getInstallTypes(f) {
  const rows = filterSales(readSheet('Sales Data'), f);
  const map={};
  rows.forEach(r=>{ const t=r['Installation Type']; if(!t) return; map[t]=(map[t]||0)+1; });
  return Object.entries(map).map(([type,count])=>({type,count}));
}

function getClosers(f) {
  const rows = filterSales(readSheet('Sales Data'), f);
  const map={};
  rows.forEach(r=>{ const n=r['Closer Name']; if(!n) return; map[n]=(map[n]||0)+1; });
  return Object.entries(map).map(([name,closes])=>({name,closes})).sort((a,b)=>b.closes-a.closes);
}

function getSummary(f) {
  const calls = filterCalls(readSheet('Calls Data'), f);
  const sales = filterSales(readSheet('Sales Data'), f);
  const answered  = calls.filter(r=>r['Call Result']==='Answered').length;
  const abandoned = calls.filter(r=>r['Call Result']==='Abandoned').length;
  const overflow  = calls.filter(r=>r['Call Result']==='Overflow - Time').length;
  const total     = calls.length;
  const talkAvg   = calls.reduce((s,r)=>s+toSecs(r['Talk Time']),0)/Math.max(total,1);
  const waitAvg   = calls.reduce((s,r)=>s+toSecs(r['Wait Time']),0)/Math.max(total,1);
  const totalRGUs = sales.reduce((s,r)=>s+(Number(r["RGU's"])||0),0);
  return {
    totalCalls:total, answeredCalls:answered, abandonedCalls:abandoned, overflowCalls:overflow,
    answerRate:total?+((answered/total)*100).toFixed(1):0,
    abandonRate:total?+((abandoned/total)*100).toFixed(1):0,
    avgTalkTime:Math.round(talkAvg), avgWaitTime:Math.round(waitAvg),
    totalSales:sales.length, totalRGUs,
    totalAgents:[...new Set(calls.map(r=>r['Agent Name']).filter(Boolean))].length,
    totalBounces:calls.reduce((s,r)=>s+(Number(r['Number of Bounces'])||0),0),
  };
}
