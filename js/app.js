/**
 * app.js — Simply Connect Dashboard Controller
 * Handles: routing · filtering · rendering all tabs · animations · CSV export
 */
(function(){
'use strict';

/* ══ STATE ══ */
const S = {
  tab:'overview', period:'daily',
  filters:{ start:'2026-08-01',end:'2026-09-02',team:'',campaign:'',state:'',agent:'',search:'' },
  data:null, loading:false,
};

/* ══ BADGE MAP ══ */
const BADGE={
  'Team Hassan':'badge-green','Team Areeb':'badge-gold',
  'Team Noor':'badge-blue','Team Wajahat':'badge-purple',
  'Team Yousif':'badge-teal','Team Wireless':'badge-orange',
};
const B=(t)=>`<span class="badge ${BADGE[t]||'badge-gray'}">${t||'—'}</span>`;

/* ══ FORMAT HELPERS ══ */
const fmtSecs = s=>{s=Math.round(s);const m=Math.floor(s/60),sec=s%60;return`${m}m ${sec}s`};
const fmtNum  = n=>(+n||0).toLocaleString();
const pct     = (a,b)=>b?((a/b)*100).toFixed(1)+'%':'—';

/* ══ PERIOD GROUPING (client-side — no refetch needed) ══
   dailyCalls dates come back as short labels like "Aug 1" (no year), so
   weekly grouping buckets by array position (the data is already in
   chronological order) rather than re-parsing the label into a real
   Date, and monthly grouping reads the month name straight off the
   label. Both avoid any date-parsing ambiguity. */
function groupDailyByPeriod(dailyCalls, period){
  if(!dailyCalls || !dailyCalls.length || period==='daily') return dailyCalls;

  function mergeBucket(rows, label){
    const total = rows.reduce((s,r)=>s+r.total,0);
    const answered = rows.reduce((s,r)=>s+r.answered,0);
    const abandoned = rows.reduce((s,r)=>s+r.abandoned,0);
    // Weighted average so a light day doesn't skew the bucket's talk/wait time.
    const talkSum = rows.reduce((s,r)=>s+r.avgTalk*r.total,0);
    const waitSum = rows.reduce((s,r)=>s+r.avgWait*r.total,0);
    return {
      date:label, total, answered, abandoned,
      avgTalk: total?Math.round(talkSum/total):0,
      avgWait: total?Math.round(waitSum/total):0,
    };
  }

  if(period==='weekly'){
    const out=[];
    for(let i=0;i<dailyCalls.length;i+=7){
      const chunk=dailyCalls.slice(i,i+7);
      const label = chunk.length>1 ? `${chunk[0].date} – ${chunk[chunk.length-1].date}` : chunk[0].date;
      out.push(mergeBucket(chunk,label));
    }
    return out;
  }

  if(period==='monthly'){
    const buckets={}; const order=[];
    dailyCalls.forEach(r=>{
      const month = String(r.date).split(' ')[0] || r.date; // "Aug 1" → "Aug"
      if(!buckets[month]){ buckets[month]=[]; order.push(month); }
      buckets[month].push(r);
    });
    return order.map(month=>mergeBucket(buckets[month],month));
  }

  return dailyCalls;
}

/* ══ TOAST ══ */
function toast(msg,ms=2400){
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),ms);
}

/* ══ COUNTER ANIMATION ══ */
function animateCounter(el,target,dur=700,suffix=''){
  const start=performance.now();
  const isFloat=String(target).includes('.');
  function step(now){
    const p=Math.min((now-start)/dur,1);
    const ease=1-Math.pow(1-p,3);
    const v=isFloat?(+target*ease).toFixed(1):Math.round(+target*ease);
    el.textContent=fmtNum(v)+suffix;
    if(p<1)requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function animateKPIs(){
  document.querySelectorAll('.kpi-val[data-count]').forEach(el=>{
    // Short duration on purpose — this replays on every filter/tab change,
    // not just first load, so a long count-up makes repeated interaction
    // feel sluggish even though the underlying data is already loaded.
    animateCounter(el,el.dataset.count,450,el.dataset.suffix||'');
  });
}

/* ══ LIVE API ERROR HANDLING ══ */
let _lastApiError = null;
window.addEventListener('sc:apierror', (ev)=>{
  _lastApiError = ev.detail;
  console.error('[Simply Connect] Google Sheets API error:', _lastApiError);
});
window.addEventListener('sc:apiok', ()=>{ _lastApiError = null; });

/* ══ LOADING ══ */
function setLoading(on){
  S.loading=on;
  const dot=document.querySelector('.dot');
  const pill=document.getElementById('pillText');
  const rb=document.getElementById('refreshBtn');
  const dataPill=document.getElementById('dataPill');
  if(on){
    dot.className='dot loading';
    pill.textContent='Loading…';
    dataPill.style.background='#FEF3C7';
    rb.classList.add('spin');
  } else {
    rb.classList.remove('spin');
    dataPill.style.background='';
    dataPill.title='';
    if(_lastApiError){
      dot.className='dot err';
      pill.textContent='Couldn\'t load data';
      document.getElementById('sbStatusText').textContent='Error';
      dataPill.title=_lastApiError;
      dataPill.style.cursor='help';
    } else {
      dot.className='dot live';
      pill.textContent='Live data';
      document.getElementById('sbStatusText').textContent='Live';
      dataPill.style.cursor='';
    }
  }
}

/* ══ POPULATE FILTER DROPDOWNS (from live data — called after the first
   successful load, since there's no offline snapshot to seed them from) ══ */
function fillAgentDrop(d){
  const sel=document.getElementById('fAgent');
  const cur=sel.value;
  while(sel.options.length>1)sel.remove(1);
  [...d.agents].sort((a,b)=>a.name.localeCompare(b.name)).forEach(a=>{
    const o=document.createElement('option');
    o.value=a.name; o.textContent=a.name; sel.appendChild(o);
  });
  sel.value=cur;
}
function fillTeamDrop(d){
  const sel=document.getElementById('fTeam');
  const cur=sel.value;
  while(sel.options.length>1)sel.remove(1);
  d.teams
    .filter(t=>t.team && t.team!=='Unassigned')
    .sort((a,b)=>b.sales-a.sales)
    .forEach(t=>{
      const o=document.createElement('option');
      o.value=t.team; o.textContent=t.team; sel.appendChild(o);
    });
  sel.value=cur;
}
function fillCampaignDrop(d){
  const sel=document.getElementById('fCampaign');
  const cur=sel.value;
  while(sel.options.length>1)sel.remove(1);
  [...d.campaigns].sort((a,b)=>b.calls-a.calls).forEach(c=>{
    const o=document.createElement('option');
    o.value=c.name; o.textContent=c.name; sel.appendChild(o);
  });
  sel.value=cur;
}
function fillStateDrop(d){
  const sel=document.getElementById('fState');
  const cur=sel.value;
  while(sel.options.length>1)sel.remove(1);
  [...d.states].sort((a,b)=>b.sales-a.sales).forEach(s=>{
    const o=document.createElement('option');
    o.value=s.state; o.textContent=s.state; sel.appendChild(o);
  });
  sel.value=cur;
}

/* ══ RENDER DISPATCH ══ */
function render(){
  Charts.killAll();
  const area=document.getElementById('content');
  if(!S.data){
    area.innerHTML = `
      <div class="card" style="text-align:center;padding:48px 24px">
        <div style="font-size:32px;margin-bottom:8px">⚠️</div>
        <div style="font-weight:700;font-size:16px;margin-bottom:6px">Couldn't load data from your Google Sheet</div>
        <div style="color:var(--t3);font-size:13px;max-width:480px;margin:0 auto 16px">
          ${_lastApiError ? _lastApiError : 'No data has loaded yet.'}
          Check that <code>window.API_URL</code> in <code>js/data.js</code> points to your deployed
          Apps Script web app, and that the sheet is shared correctly.
        </div>
        <button class="export-btn" id="retryLoadBtn">↻ Retry</button>
      </div>`;
    document.getElementById('retryLoadBtn').addEventListener('click', loadData);
    return;
  }
  const titles={
    overview:'Overview',calls:'Call Analytics',sales:'Sales Analytics',
    agents:'Agent Performance',campaigns:'Campaigns',
    states:'State Analytics',hourly:'Hourly Heatmap',
    insights:'Insights',apisetup:'API Setup'
  };
  document.getElementById('pageTitle').textContent=titles[S.tab]||'';
  const sm = S.data.summary;
  const agentCount = S.data.agents.length;
  const campCount  = S.data.campaigns.length;
  const stateCount = S.data.states.length;
  const subs={
    overview:'Combined Calls & Sales · Aug – Sep 2026',
    calls:fmtNum(sm.totalCalls)+' calls · Call center performance',
    sales:fmtNum(sm.totalSales)+' sales · Revenue & provider breakdown',
    agents:agentCount+' agents · Individual performance drill-down',
    campaigns:campCount+' call center queues · Volume & conversion',
    states:stateCount+' states · Geographic sales distribution',
    hourly:'Call volume & answer rate by hour of day',
    insights:'Automated management insights & recommendations',
    apisetup:'Google Sheets → Apps Script → Dashboard → Vercel',
  };
  document.getElementById('pageSub').textContent=subs[S.tab]||'';

  const map={
    overview:renderOverview, calls:renderCalls, sales:renderSales,
    agents:renderAgents, campaigns:renderCampaigns,
    states:renderStates, hourly:renderHourly,
    insights:renderInsights, apisetup:renderAPI,
  };
  (map[S.tab]||renderOverview)(area,S.data);
  setTimeout(animateKPIs,50);
}

/* ═══════════════════════════════════════════════════════
   OVERVIEW TAB
═══════════════════════════════════════════════════════ */
function renderOverview(area,d){
  const {summary:sm}=d;
  area.innerHTML=`
  <div class="kpi-row animate-in">
    ${kpi('Total Calls',sm.totalCalls,'','gold','Aug – Sep 2026')}
    ${kpi('Answered',sm.answeredCalls,'','green','▲ '+sm.answerRate+'% rate')}
    ${kpi('Abandoned',sm.abandonedCalls,'','red',sm.abandonRate+'% abandon rate')}
    ${kpi('Total Sales',sm.totalSales,'','blue',sm.totalRGUs+' RGUs generated')}
    ${kpi('Avg Talk Time',0,'','purple',null,'fmtSecs',sm.avgTalkTime+'s avg')}
    ${kpi('Avg RGUs / Sale',0,'','teal',null,null,(sm.totalRGUs/Math.max(sm.totalSales,1)).toFixed(2))}
  </div>

  <!-- Call trend -->
  <div class="card mb14 animate-in">
    <div class="sec-title">Daily Call Volume — Aug – Sep 2026<small>Total · Answered · Abandoned</small></div>
    <div class="chart-box" style="height:220px"><canvas id="chDailyCalls"></canvas></div>
  </div>

  <!-- Answer rate + Call result -->
  <div class="g2 animate-in">
    <div class="card">
      <div class="sec-title">Answer &amp; Abandon Rate Trend</div>
      <div class="chart-box" style="height:200px"><canvas id="chAnsRate"></canvas></div>
    </div>
    <div class="card">
      <div class="sec-title">Call Result Breakdown<small>${fmtNum(sm.totalCalls)} total</small></div>
      <div class="chart-box" style="height:200px"><canvas id="chCallResult"></canvas></div>
    </div>
  </div>

  <!-- Team overview -->
  <div class="card mb14 animate-in">
    <div class="sec-title">Team Performance — Calls vs Sales</div>
    <div class="chart-box" style="height:220px"><canvas id="chTeamBar"></canvas></div>
  </div>

  <!-- Provider + Service -->
  <div class="g2 animate-in">
    <div class="card">
      <div class="sec-title">Provider Sales Share</div>
      <div class="chart-box" style="height:190px"><canvas id="chProvider"></canvas></div>
    </div>
    <div class="card">
      <div class="sec-title">Service Type Breakdown</div>
      <div class="chart-box" style="height:190px"><canvas id="chService"></canvas></div>
    </div>
  </div>
  `;

  Charts.dailyCallsArea('chDailyCalls',groupDailyByPeriod(d.dailyCalls,S.period));
  Charts.answerRateLine('chAnsRate',groupDailyByPeriod(d.dailyCalls,S.period));
  Charts.callResultDoughnut('chCallResult',d.callResults);
  Charts.teamBar('chTeamBar',d.teams);
  Charts.providerDoughnut('chProvider',d.providers);
  Charts.servicePie('chService',d.services);
}

/* ═══════════════════════════════════════════════════════
   CALLS TAB
═══════════════════════════════════════════════════════ */
function renderCalls(area,d){
  const {summary:sm}=d;
  document.getElementById('badgeCalls').textContent=fmtNum(sm.totalCalls);
  const answered=sm.answeredCalls,total=sm.totalCalls;
  area.innerHTML=`
  <div class="kpi-row animate-in">
    ${kpi('Total Calls',     total,      '','gold',  'Aug – Sep 2026')}
    ${kpi('Answered',        answered,   '','green', pct(answered,total)+' answer rate')}
    ${kpi('Abandoned',       sm.abandonedCalls,'','red',pct(sm.abandonedCalls,total)+' of total')}
    ${kpi('Overflow',        sm.overflowCalls, '','purple',pct(sm.overflowCalls,total)+' overflow')}
    ${kpi('Avg Talk Time',   sm.avgTalkTime,'s','teal',fmtSecs(sm.avgTalkTime)+' per call')}
    ${kpi('Avg Wait Time',   sm.avgWaitTime, 's','blue',fmtSecs(sm.avgWaitTime)+' avg wait')}
  </div>

  <div class="card mb14 animate-in">
    <div class="sec-title">Daily Call Volume Trend<small>Answered · Abandoned · Total</small></div>
    <div class="chart-box" style="height:230px"><canvas id="chDC2"></canvas></div>
  </div>

  <div class="g2 animate-in">
    <div class="card">
      <div class="sec-title">Call Result Distribution</div>
      <div class="chart-box" style="height:220px"><canvas id="chCR2"></canvas></div>
    </div>
    <div class="card">
      <div class="sec-title">Bounce Count Distribution<small>Log scale</small></div>
      <div class="chart-box" style="height:220px"><canvas id="chBounce"></canvas></div>
    </div>
  </div>

  <div class="card mb14 animate-in">
    <div class="sec-title">Avg Talk Time vs Avg Wait Time — Daily</div>
    <div class="chart-box" style="height:210px"><canvas id="chTalkWait"></canvas></div>
  </div>

  <!-- Call result table -->
  <div class="card animate-in">
    <div class="sec-title">Call Result Detail</div>
    <div class="tbl-wrap">
      <table class="dtbl">
        <thead><tr><th>Result</th><th class="r">Count</th><th class="r">% of Total</th></tr></thead>
        <tbody>
          ${d.callResults.map(r=>`<tr>
            <td><span class="badge ${resultBadge(r.result)}">${r.result}</span></td>
            <td class="r">${fmtNum(r.count)}</td>
            <td class="r">${pct(r.count,total)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>
  `;
  Charts.dailyCallsArea('chDC2',groupDailyByPeriod(d.dailyCalls,S.period));
  Charts.callResultDoughnut('chCR2',d.callResults);
  Charts.bounceDist('chBounce');
  Charts.dailySalesArea('chTalkWait',groupDailyByPeriod(d.dailyCalls,S.period),d.sales);
}

/* ═══════════════════════════════════════════════════════
   SALES TAB
═══════════════════════════════════════════════════════ */
function renderSales(area,d){
  const {summary:sm,sales,providers,services,installTypes,closers,states}=d;
  document.getElementById('badgeSales').textContent=sm.totalSales;
  const providerNames = providers.slice(0,5).map(p=>p.name).join(' · ') + (providers.length>5?` +${providers.length-5} more`:'');
  const PAGE_SIZE = 150;
  const sorted = [...sales].sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  const shown = sorted.slice(0, PAGE_SIZE);

  area.innerHTML=`
  <div class="kpi-row animate-in">
    ${kpi('Total Sales',  sm.totalSales,'','gold',  fmtNum(sm.totalSales)+' transactions')}
    ${kpi('Total RGUs',   sm.totalRGUs, '','blue',  (sm.totalRGUs/Math.max(sm.totalSales,1)).toFixed(2)+' RGU/sale')}
    ${kpi('Avg RGU / Sale',0,'','green',null,null,(sm.totalRGUs/Math.max(sm.totalSales,1)).toFixed(2))}
    ${kpi('Providers',    providers.length,'','purple',providerNames)}
    ${kpi('States',       states.length,'','teal',states.length+' states covered')}
    ${kpi('Closers',      closers.length,'','red',closers.length+' unique closers')}
  </div>

  <div class="g2 animate-in">
    <div class="card">
      <div class="sec-title">Provider Distribution<small>by sales count</small></div>
      <div class="chart-box" style="height:210px"><canvas id="chProv2"></canvas></div>
    </div>
    <div class="card">
      <div class="sec-title">Service Type Mix</div>
      <div class="chart-box" style="height:210px"><canvas id="chSvc2"></canvas></div>
    </div>
  </div>

  <div class="g2 animate-in">
    <div class="card">
      <div class="sec-title">Installation Type</div>
      <div class="chart-box" style="height:190px"><canvas id="chInstall"></canvas></div>
    </div>
    <div class="card">
      <div class="sec-title">RGUs by Provider</div>
      <div class="chart-box" style="height:190px"><canvas id="chPts"></canvas></div>
    </div>
  </div>

  <!-- Closers -->
  <div class="g2 animate-in">
    <div class="card">
      <div class="sec-title">Top 10 Closers<small>of ${closers.length} total</small></div>
      <div class="chart-box" style="height:200px"><canvas id="chCloser"></canvas></div>
    </div>
    <div class="card">
      <div class="sec-title">State Performance</div>
      <div class="chart-box" style="height:200px"><canvas id="chState2"></canvas></div>
    </div>
  </div>

  <!-- Sales log table -->
  <div class="card animate-in">
    <div class="sec-title">Sales Transaction Log<small>Showing ${fmtNum(shown.length)} of ${fmtNum(sales.length)} records — newest first · use CSV export for the full log</small></div>
    <div class="tbl-wrap">
      <table class="dtbl">
        <thead><tr><th>#</th><th>Date</th><th>Agent</th><th>Team</th><th>Provider</th><th>Service</th><th>State</th><th>RGU</th><th>Install</th><th>Closer</th><th>Queue</th></tr></thead>
        <tbody>
          ${shown.map((s,i)=>`<tr>
            <td class="rk ${i<3?'g':''}">${i+1}</td>
            <td>${s.date||'—'}</td>
            <td style="font-weight:600">${s.agent}</td>
            <td>${B(s.team)}</td>
            <td>${s.provider}</td>
            <td><span class="badge badge-blue">${s.service}</span></td>
            <td style="font-weight:700">${s.state}</td>
            <td class="r">${s.rgu}</td>
            <td><span class="badge ${s.install==='Pro Install'?'badge-green':'badge-orange'}">${s.install}</span></td>
            <td>${s.closer}</td>
            <td><span class="badge badge-gray">${s.queue||'—'}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>
  `;
  Charts.providerDoughnut('chProv2',providers);
  Charts.servicePie('chSvc2',services);
  Charts.installPie('chInstall',installTypes);
  Charts.providerPoints('chPts',providers);
  Charts.closerBar('chCloser',closers.slice(0,10));
  Charts.stateHBar('chState2',states);
}

/* ═══════════════════════════════════════════════════════
   AGENTS TAB
═══════════════════════════════════════════════════════ */
function renderAgents(area,d){
  const {agents,sales,summary:sm}=d;
  const withCalls = agents.filter(a=>a.calls>0);
  const withSales = agents.filter(a=>a.sales>0);
  const salesOnly = agents.filter(a=>a.calls===0 && a.sales>0);
  const topByTalk=[...withCalls].sort((a,b)=>b.avgTalk-a.avgTalk).slice(0,5);
  const underperf=[...withCalls].sort((a,b)=>a.calls-b.calls).slice(0,8);
  const topCaller = withCalls[0];

  area.innerHTML=`
  <div class="kpi-row animate-in">
    ${kpi('Total Agents',     agents.length,'','gold',  sm.totalAgents+' with call logs · '+salesOnly.length+' sales-only')}
    ${kpi('With Calls',       withCalls.length,'','blue',withCalls.length+' active this period')}
    ${kpi('With Sales',       withSales.length,'','green','Converted to sales')}
    ${kpi('Top Caller',       0,'','purple',topCaller?topCaller.name+' ('+fmtNum(topCaller.calls)+' calls)':'—',null,topCaller?fmtNum(topCaller.calls)+' calls':'—')}
    ${kpi('Avg Talk Time',    Math.round(withCalls.reduce((s,a)=>s+a.avgTalk,0)/Math.max(withCalls.length,1)),'s','teal','across active agents')}
    ${kpi('Total Bounces',    withCalls.reduce((s,a)=>s+a.bounces,0),'','red','call bounces total')}
  </div>

  <!-- Agent bar -->
  <div class="card mb14 animate-in">
    <div class="sec-title">Top 15 Agents — Calls &amp; Answered<small>sorted by total calls</small></div>
    <div class="chart-box" style="height:380px"><canvas id="chAgBar"></canvas></div>
  </div>

  <!-- Efficiency scatter -->
  <div class="g2 animate-in">
    <div class="card">
      <div class="sec-title">Agent Efficiency — Calls vs Avg Talk Time</div>
      <div class="chart-box" style="height:250px"><canvas id="chScatter"></canvas></div>
    </div>
    <div class="card">
      <div class="sec-title">Top 5 by Avg Talk Time<small>highest engagement</small></div>
      <div style="margin-top:8px">
        ${topByTalk.map((a,i)=>`
        <div class="bar-row">
          <span class="bar-name">${a.name}</span>
          ${B(a.team)}
          <span class="bar-val">${fmtSecs(a.avgTalk)}</span>
          <div class="bar-track"><div class="bar-fill gold" style="width:${Math.round(a.avgTalk/topByTalk[0].avgTalk*100)}%"></div></div>
        </div>`).join('')}
      </div>
    </div>
  </div>

  <!-- Full agent table -->
  <div class="card mb14 animate-in">
    <div class="sec-title">All Agent Performance Detail<small>Calls/Answered/Talk/Wait/Bounces reflect calls this agent personally answered — unanswered calls aren't attributed to an agent in the source data</small></div>
    <div class="tbl-wrap">
      <table class="dtbl">
        <thead><tr>
          <th>#</th><th>Agent</th><th>Team</th>
          <th class="r">Calls</th><th class="r">Answered</th><th class="r">Ans%</th>
          <th class="r">Avg Talk</th><th class="r">Avg Wait</th>
          <th class="r">Bounces</th><th class="r">Sales</th><th class="r">RGUs</th>
        </tr></thead>
        <tbody>
          ${agents.map((a,i)=>`<tr>
            <td class="rk ${i===0?'g':i<3?'s':''}">${i+1}</td>
            <td style="font-weight:600">${a.name}</td>
            <td>${B(a.team)}</td>
            <td class="r">${a.calls?fmtNum(a.calls):'—'}</td>
            <td class="r">${a.calls?fmtNum(a.answered):'—'}</td>
            <td class="r">${a.calls?pct(a.answered,a.calls):'—'}</td>
            <td class="r">${a.calls?fmtSecs(a.avgTalk):'—'}</td>
            <td class="r">${a.calls?a.avgWait.toFixed(0)+'s':'—'}</td>
            <td class="r">${a.calls?fmtNum(a.bounces):'—'}</td>
            <td class="r" style="color:${a.sales>0?'var(--green)':'var(--t4)'}">${a.sales||'—'}</td>
            <td class="r">${a.rgus||'—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Underperformers -->
  <div class="card animate-in" style="border-color:#FCA5A5">
    <div class="sec-title" style="color:var(--red)">⚠ Agents Needing Support — Lowest Call Volume</div>
    <div class="stat-grid">
      ${underperf.map(a=>`
        <div class="stat-box" style="border-color:#FCA5A5;background:#FFF5F5">
          <div class="stat-box-label">${a.team||'—'}</div>
          <div style="font-size:12px;font-weight:600;color:var(--t1);margin-bottom:4px">${a.name}</div>
          <div class="stat-box-val" style="color:var(--red)">${a.calls}</div>
          <div style="font-size:10px;color:var(--t4)">calls · ${fmtSecs(a.avgTalk)} talk</div>
        </div>`).join('')}
    </div>
  </div>
  `;
  Charts.agentCallBar('chAgBar',withCalls,15);
  Charts.agentScatter('chScatter',withCalls);
}

/* ═══════════════════════════════════════════════════════
   CAMPAIGNS TAB
═══════════════════════════════════════════════════════ */
function renderCampaigns(area,d){
  const {campaigns,summary:sm}=d;
  const totalVolume  = campaigns.reduce((s,c)=>s+c.calls,0);
  const totalAns     = campaigns.reduce((s,c)=>s+c.answered,0);
  const top          = campaigns[0]||{name:'—',calls:0};
  const overflowPct  = sm.totalCalls ? ((sm.overflowCalls/sm.totalCalls)*100).toFixed(1) : 0;

  area.innerHTML=`
  <div class="kpi-row animate-in">
    ${kpi('Campaign Queues',  campaigns.length,'','gold', campaigns.length+' unique queues')}
    ${kpi('Total Volume',     fmtNum(totalVolume),'','blue','across all campaigns')}
    ${kpi('Top Campaign',     0,'','green',top.name+' — '+fmtNum(top.calls)+' calls',null,top.name)}
    ${kpi('Total Answered',   fmtNum(totalAns),'','teal',pct(totalAns,totalVolume)+' answer rate')}
    ${kpi('Overflow Calls',   fmtNum(sm.overflowCalls),'','purple',overflowPct+'% of all calls')}
    ${kpi('Escaped / Transferred', fmtNum((sm.totalCalls-sm.answeredCalls-sm.abandonedCalls-sm.overflowCalls)),'','red','other outcomes')}
  </div>

  <div class="card mb14 animate-in">
    <div class="sec-title">Top 8 Campaigns — Call Volume &amp; Answer Rate</div>
    <div class="chart-box" style="height:280px"><canvas id="chCampBar"></canvas></div>
  </div>

  <div class="card animate-in">
    <div class="sec-title">Campaign Breakdown Table<small>All ${campaigns.length} queues shown · call volume only (Sales Data has no reliable link to these queue names)</small></div>
    <div class="tbl-wrap">
      <table class="dtbl">
        <thead><tr>
          <th>#</th><th>Campaign / Queue</th>
          <th class="r">Total Calls</th><th class="r">Answered</th>
          <th class="r">Ans Rate</th><th>Volume</th>
        </tr></thead>
        <tbody>
          ${campaigns.map((c,i)=>`<tr>
            <td class="rk ${i===0?'g':i<3?'s':''}">${i+1}</td>
            <td style="font-weight:600">${c.name}</td>
            <td class="r">${fmtNum(c.calls)}</td>
            <td class="r">${fmtNum(c.answered)}</td>
            <td class="r">${pct(c.answered,c.calls)}</td>
            <td style="min-width:100px">
              <div class="bar-track"><div class="bar-fill gold" style="width:${Math.round(c.calls/campaigns[0].calls*100)}%"></div></div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>
  `;
  Charts.campaignHBar('chCampBar',campaigns);
}

/* ═══════════════════════════════════════════════════════
   STATES TAB
═══════════════════════════════════════════════════════ */
function renderStates(area,d){
  const {states,summary:sm}=d;
  const top = states[0]||{state:'—',sales:0};
  const bestRatio = [...states].filter(s=>s.sales>=10).sort((a,b)=>(b.rgus/b.sales)-(a.rgus/a.sales))[0] || states[0] || {state:'—',rgus:0,sales:1};
  area.innerHTML=`
  <div class="kpi-row animate-in">
    ${kpi('States Covered', states.length,'','gold', 'from sales data')}
    ${kpi('Top State',       0,'','blue',top.state+' — '+fmtNum(top.sales)+' sales',null,top.state)}
    ${kpi('Total Sales',     sm.totalSales,'','green','across all states')}
    ${kpi('Total RGUs',      sm.totalRGUs,'','purple','revenue-generating units')}
    ${kpi('Best RGU/Sale',   0,'','teal',bestRatio.state+' ('+(bestRatio.rgus/Math.max(bestRatio.sales,1)).toFixed(2)+' RGU/sale)',null,bestRatio.state)}
    ${kpi(top.state+' Share', 0,'','red',pct(top.sales,sm.totalSales)+' of all sales',null,pct(top.sales,sm.totalSales))}
  </div>

  <div class="card mb14 animate-in">
    <div class="sec-title">State-wise Sales &amp; RGU Performance</div>
    <div class="chart-box" style="height:${Math.max(250,states.length*32)}px"><canvas id="chStateBar"></canvas></div>
  </div>

  <div class="card animate-in">
    <div class="sec-title">State Ranking Table</div>
    <div class="tbl-wrap">
      <table class="dtbl">
        <thead><tr><th>#</th><th>State</th><th class="r">Sales</th><th class="r">RGUs</th><th class="r">RGU/Sale</th><th class="r">Share %</th><th>Volume</th></tr></thead>
        <tbody>
          ${states.map((s,i)=>`<tr>
            <td class="rk ${i===0?'g':i<3?'s':''}">${i+1}</td>
            <td style="font-weight:800;font-size:14px">${s.state}</td>
            <td class="r">${s.sales}</td>
            <td class="r">${s.rgus}</td>
            <td class="r">${(s.rgus/Math.max(s.sales,1)).toFixed(2)}</td>
            <td class="r">${pct(s.sales,sm.totalSales)}</td>
            <td style="min-width:110px">
              <div class="bar-track"><div class="bar-fill gold" style="width:${Math.round(s.sales/states[0].sales*100)}%"></div></div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>
  `;
  Charts.stateHBar('chStateBar',states);
}

/* ═══════════════════════════════════════════════════════
   HOURLY TAB
═══════════════════════════════════════════════════════ */
function renderHourly(area,d){
  const {hourly}=d;
  const maxRate=Math.max(...hourly.map(h=>h.rate));
  const peakHour = hourly.reduce((a,b)=>b.total>a.total?b:a, hourly[0]);
  const bestRate = hourly.reduce((a,b)=>b.rate>a.rate?b:a, hourly[0]);
  const lowRate  = hourly.reduce((a,b)=>(b.rate<a.rate&&b.total>0)?b:a, hourly.find(h=>h.total>0)||hourly[0]);

  function heatColor(rate){
    if(rate>=80)return{bg:'#DCFCE7',c:'#14532D',fw:'700'};
    if(rate>=65)return{bg:'#FEF9C3',c:'#713F12',fw:'600'};
    if(rate>=45)return{bg:'#FED7AA',c:'#7C2D12',fw:'600'};
    return{bg:'#FEE2E2',c:'#7F1D1D',fw:'500'};
  }

  area.innerHTML=`
  <div class="kpi-row animate-in">
    ${kpi('Peak Hour',    0,'','gold',peakHour.hour+'CT — '+fmtNum(peakHour.total)+' calls',null,peakHour.hour+'CT')}
    ${kpi('Best Ans Rate',0,'','green',bestRate.hour+'CT — '+bestRate.rate+'%',null,bestRate.rate+'%')}
    ${kpi('Low Ans Rate', 0,'','red',lowRate.hour+'CT — '+lowRate.rate+'%',null,lowRate.rate+'%')}
    ${kpi('Total Hours',  hourly.length,'','blue','hour buckets tracked')}
    ${kpi('Peak Calls',   peakHour.total,'','purple',peakHour.hour+'CT slot')}
    ${kpi('Avg Ans Rate', Math.round(hourly.reduce((s,h)=>s+h.rate,0)/hourly.length),'%','teal','across all hours')}
  </div>

  <div class="card mb14 animate-in">
    <div class="sec-title">Hourly Call Volume &amp; Answer Rate — Aug – Sep 2026</div>
    <div class="chart-box" style="height:240px"><canvas id="chHourBar"></canvas></div>
  </div>

  <!-- Heatmap -->
  <div class="card animate-in">
    <div class="sec-title">Answer Rate Heatmap by Hour<small>Green = high · Red = low</small></div>
    <div class="heat-wrap">
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">
        ${hourly.map(h=>{
          const {bg,c,fw}=heatColor(h.rate);
          return`<div class="heat-cell" style="background:${bg};color:${c};font-weight:${fw};width:auto;flex:1;min-width:72px;padding:10px 8px;border-radius:8px;text-align:center;cursor:default" title="${h.hour}CT: ${h.total} calls, ${h.answered} answered, ${h.rate}% answer rate">
            <div style="font-size:11px;font-weight:700">${h.hour}CT</div>
            <div style="font-size:16px;font-weight:900;margin:2px 0">${h.rate}%</div>
            <div style="font-size:10px;opacity:.8">${fmtNum(h.total)} calls</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>

  <!-- Hourly detail table -->
  <div class="card mt14 animate-in" style="margin-top:14px">
    <div class="sec-title">Hourly Detail Table</div>
    <div class="tbl-wrap">
      <table class="dtbl">
        <thead><tr><th>Hour (CT)</th><th class="r">Total Calls</th><th class="r">Answered</th><th class="r">Answer Rate</th><th class="r">Missed</th><th>Performance</th></tr></thead>
        <tbody>
          ${hourly.map(h=>{
            const {bg,c}=heatColor(h.rate);
            return`<tr>
              <td style="font-weight:700">${h.hour}CT</td>
              <td class="r">${fmtNum(h.total)}</td>
              <td class="r">${fmtNum(h.answered)}</td>
              <td class="r"><span class="badge" style="background:${bg};color:${c}">${h.rate}%</span></td>
              <td class="r">${fmtNum(h.total-h.answered)}</td>
              <td style="min-width:110px"><div class="bar-track"><div class="bar-fill gold" style="width:${h.rate}%"></div></div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>
  `;
  Charts.hourlyBar('chHourBar',hourly);
}

/* ═══════════════════════════════════════════════════════
   INSIGHTS TAB
═══════════════════════════════════════════════════════ */
function renderInsights(area,d){
  const {agents,summary:sm,teams,hourly,campaigns,providers,states}=d;
  const withCalls = agents.filter(a=>a.calls>0);
  const topAgent = withCalls[0]||{};
  const activeTeams = teams.filter(t=>t.calls>0 || t.sales>0);
  const topTeam = [...teams].sort((a,b)=>b.calls-a.calls)[0] || {};
  const smallestTeam = [...activeTeams].filter(t=>t.team!=='Unassigned').sort((a,b)=>a.calls-b.calls)[0] || {};
  const peakHour=hourly.reduce((a,b)=>b.total>a.total?b:a,{total:0,hour:'—'});
  const bestHour=hourly.reduce((a,b)=>b.rate>a.rate?b:a,{rate:0,hour:'—'});
  const ansRate =sm.answerRate;
  const totalBounces = withCalls.reduce((s,a)=>s+a.bounces,0);
  const avgBounces = withCalls.length ? (totalBounces/withCalls.length).toFixed(1) : 0;
  const topProvider = providers[0]||{name:'—',sales:0};
  const providerShare = sm.totalSales ? ((topProvider.sales/sm.totalSales)*100).toFixed(1) : 0;
  const secondProvider = providers[1]||{name:'—',sales:0};
  const topState = states[0]||{state:'—',sales:0};
  const secondState = states[1]||{state:'—',sales:0};
  const stateShare = sm.totalSales ? ((topState.sales/sm.totalSales)*100).toFixed(1) : 0;
  const topCampaign = campaigns[0]||{name:'—',calls:0};
  const rguPerSale = sm.totalSales ? (sm.totalRGUs/sm.totalSales).toFixed(2) : 0;

  const insights=[
    {type:'success',icon:'🏆',label:'Top Performer',text:`${topAgent.name||'—'} (${topAgent.team||'—'}) leads with ${fmtNum(topAgent.calls||0)} calls answered — avg talk time of ${fmtSecs(topAgent.avgTalk||0)}.`},
    {type:ansRate<60?'danger':'success',icon:ansRate<60?'⚠️':'📞',label:'Answer Rate',text:`Overall answer rate is ${ansRate}% (${fmtNum(sm.answeredCalls)} of ${fmtNum(sm.totalCalls)} calls). ${ansRate<65?'Below 65% — consider increasing agent capacity or adjusting schedules.':'Performing within acceptable range.'}`},
    {type:'warn',  icon:'📉',label:'Abandon Rate',text:`${fmtNum(sm.abandonedCalls)} calls abandoned (${sm.abandonRate}%). Focus on reducing wait times during peak hours to recover lost customers.`},
    {type:'info',  icon:'📡',label:'Provider Mix',text:`${topProvider.name} dominates sales at ${providerShare}% (${fmtNum(topProvider.sales)} sales). Growing ${secondProvider.name} would reduce provider concentration risk.`},
    {type:'success',icon:'🕑',label:'Peak Performance Window',text:`${bestHour.hour}CT has the highest answer rate at ${bestHour.rate}%. Staff this window heavily for maximum sales conversion.`},
    {type:'warn',  icon:'🌙',label:'Highest-Volume Window',text:`${peakHour.hour}CT has peak call volume (${fmtNum(peakHour.total)} calls). Make sure this window is fully staffed to protect the answer rate.`},
    {type:'success',icon:'🌍',label:'Geographic Strength',text:`${topState.state} leads with ${fmtNum(topState.sales)} sales (${stateShare}% share) and ${secondState.state} follows with ${fmtNum(secondState.sales)}. Both states offer growth potential for ${topProvider.name}.`},
    {type:'info',  icon:'👥',label:'Team Balance',text:`${topTeam.team||'—'} leads with ${fmtNum(topTeam.calls||0)} calls handled. ${smallestTeam.team?smallestTeam.team+' has the smallest active volume ('+fmtNum(smallestTeam.calls)+' calls).':''}`},
    {type:'warn',  icon:'🔄',label:'Bounce Volume',text:`${fmtNum(totalBounces)} total bounces recorded across agents with call activity, averaging ${avgBounces} per agent. High-bounce agents may need call routing adjustments or coaching.`},
    {type:'info',  icon:'📦',label:'RGU Opportunity',text:`${fmtNum(sm.totalRGUs)} RGUs from ${fmtNum(sm.totalSales)} sales (avg ${rguPerSale} RGU/sale). Bundling Internet+Mobility or Internet+Phone can increase the RGU ratio per sale.`},
    {type:'info',  icon:'🏗️',label:'Top Campaign Queue',text:`${topCampaign.name} handled the most volume at ${fmtNum(topCampaign.calls)} calls (${pct(topCampaign.answered,topCampaign.calls)} answered).`},
  ];

  area.innerHTML=`
  <div class="insight-grid animate-in">
    ${insights.map(i=>`
      <div class="insight ${i.type}">
        <span class="insight-icon">${i.icon}</span>
        <div><div class="insight-type">${i.label}</div><div class="insight-text">${i.text}</div></div>
      </div>`).join('')}
  </div>

  <div class="card animate-in">
    <div class="sec-title">Management Summary — Aug – Sep 2026</div>
    <div class="stat-grid">
      ${[
        ['Total Calls',      fmtNum(sm.totalCalls)],
        ['Answered',         fmtNum(sm.answeredCalls)],
        ['Abandoned',        fmtNum(sm.abandonedCalls)],
        ['Answer Rate',      ansRate+'%'],
        ['Total Sales',      fmtNum(sm.totalSales)],
        ['Total RGUs',       fmtNum(sm.totalRGUs)],
        ['RGU / Sale',       rguPerSale],
        ['Avg Talk Time',    fmtSecs(sm.avgTalkTime)],
        ['Avg Wait Time',    fmtSecs(sm.avgWaitTime)],
        ['Active Agents',    withCalls.length],
        ['Agents w/ Sales',  agents.filter(a=>a.sales>0).length],
        ['Campaigns',        campaigns.length],
        ['States Covered',   states.length],
        ['Top State',        `${topState.state} (${fmtNum(topState.sales)} sales)`],
        ['Top Provider',     `${topProvider.name} (${fmtNum(topProvider.sales)} sales)`],
        ['Top Campaign',     `${topCampaign.name} (${fmtNum(topCampaign.calls)} calls)`],
      ].map(([l,v])=>`<div class="stat-box"><div class="stat-box-label">${l}</div><div class="stat-box-val">${v}</div></div>`).join('')}
    </div>
  </div>
  `;
}

/* ═══════════════════════════════════════════════════════
   API SETUP TAB
═══════════════════════════════════════════════════════ */
const GAS=`// ══════════════════════════════════════════════════
// SIMPLY CONNECT — Google Apps Script API
// Sheet 1: "Calls Data"   Sheet 2: "Sales Data"
// (Sheet name matching is case/whitespace-tolerant — see findSheet() below)
// Deploy: Web App → Execute as Me → Anyone → Copy URL
// Set window.API_URL in js/data.js to that URL
// ══════════════════════════════════════════════════

const SPREADSHEET_ID = '19sapy2PJqHvTwqRbZ4ctkdAgLzeE2Wz4SqArBXU7VEWofwzD_tf0V7Vg';

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
}`;

function renderAPI(area){
  area.innerHTML=`
  <div class="card mb14 animate-in">
    <div class="sec-title">Architecture</div>
    <div class="arch-flow">
      ${['Google Sheets','→','Apps Script API','→','HTML Dashboard','→','GitHub','→','Vercel'].map(s=>
        s==='→'?`<span class="arch-arr">→</span>`:`<span class="arch-box">${s}</span>`
      ).join('')}
    </div>
    <p style="font-size:12px;color:var(--t2);line-height:1.7">
      Two sheets: <strong>Calls Data</strong> (48K+ rows, daily growing) and <strong>sales Data</strong> (33+ rows).
      The Apps Script API reads both sheets, applies filters, and returns JSON.
      Set <code>window.API_URL</code> in <code>js/data.js</code> to activate live data.
      Dashboard auto-refreshes every 5 minutes when a live URL is configured.
    </p>
  </div>

  <div class="card mb14 animate-in">
    <div class="sec-title">Setup Steps</div>
    <div class="steps-list">
      ${[
        ['Prepare Google Sheet','Create a Google Spreadsheet with two sheets named exactly: <code>Calls Data</code> and <code>sales Data</code>. Import your daily export files here. New rows added daily will automatically appear in the dashboard.'],
        ['Open Google Apps Script','In your Sheet: Extensions → Apps Script. Delete all default code. Paste the full GAS code (click the button below). Set <code>SPREADSHEET_ID</code> to your Sheet ID (from the URL).'],
        ['Deploy as Web App','Click Deploy → New Deployment → Web App. Execute as: <strong>Me</strong>. Who has access: <strong>Anyone</strong>. Click Deploy and copy the full deployment URL.'],
        ['Connect the dashboard','Open <code>js/data.js</code>. Find <code>window.API_URL = \'\';</code> — paste your GAS URL as the value. Save. Reload the dashboard.'],
        ['Push to GitHub','<code>git init → git add . → git commit -m "init" → git remote add origin YOUR_REPO → git push -u origin main</code>'],
        ['Deploy on Vercel','Connect Vercel to your GitHub repo. No build step — plain HTML. Add <code>API_URL</code> as an environment variable if needed. Every git push auto-deploys.'],
        ['Daily data updates','Paste or import today\'s call/sales exports into the Google Sheet. The dashboard auto-fetches fresh data on each filter change and every 5 minutes.'],
      ].map(([t,d],i)=>`<div class="step-item">
        <div class="step-num">${i+1}</div>
        <div><div class="step-title">${t}</div><div class="step-desc">${d}</div></div>
      </div>`).join('')}
    </div>
  </div>

  <div class="card animate-in">
    <div class="sec-title">Google Apps Script — Full API Code</div>
    <p style="font-size:12px;color:var(--t3);margin-bottom:10px">This single script handles both sheets, all filters, and all data aggregations your dashboard needs.</p>
    <button class="gas-show-btn" id="showGasBtn">📋 View Full GAS Code</button>
    <div class="gas-pre" style="margin-top:14px;max-height:280px">${GAS.slice(0,600)}…</div>
  </div>
  `;
  document.getElementById('showGasBtn').addEventListener('click',()=>{
    document.getElementById('gasCode').textContent=GAS;
    document.getElementById('gasModal').style.display='flex';
  });
}

/* ══ HELPERS ══ */
function kpi(label,value,suffix,color,sub,special,override){
  const disp = override || (suffix?(value+suffix):fmtNum(value));
  // Only wire up the count-up animation when the displayed value IS the
  // numeric `value` — KPIs with a text override (e.g. an agent name, a
  // state code) must not be animated, since animateCounter always replaces
  // the cell's text with a number and would clobber the override text.
  const countAttrs = override ? '' : `data-count="${value}" data-suffix="${suffix||''}"`;
  return`<div class="kpi ${color}">
    <div class="kpi-label">${label}</div>
    <div class="kpi-val" ${countAttrs}>${disp}</div>
    ${sub?`<div class="kpi-sub">${sub}</div>`:''}
  </div>`;
}

function resultBadge(r){
  return {
    'Answered':'badge-green',
    'Abandoned':'badge-red',
    'Overflow - Time':'badge-orange',
    'Stranded - Unavailable':'badge-purple',
    'Stranded':'badge-gray',
    'Transferred':'badge-blue',
    'Escaped':'badge-gray',
  }[r]||'badge-gray';
}

/* ══ CSV EXPORT ══ */
function exportCSV(){
  if(!S.data){toast('No data to export');return;}
  let rows=[['Agent','Team','Calls','Answered','Ans%','AvgTalk(s)','AvgWait(s)','Bounces','Sales','RGUs']];
  S.data.agents.forEach(a=>rows.push([
    a.name,a.team,a.calls,a.answered,
    a.calls?((a.answered/a.calls)*100).toFixed(1):0,
    Math.round(a.avgTalk),a.avgWait.toFixed(0),a.bounces,
    a.sales,a.rgus
  ]));
  rows.push([]);
  rows.push(['--- SALES LOG ---']);
  rows.push(['Date','Agent','Team','Provider','Service','State','RGU','Install','Queue','Closer']);
  S.data.sales.forEach(s=>rows.push([s.date,s.agent,s.team,s.provider,s.service,s.state,s.rgu,s.install,s.queue,s.closer]));

  const csv=rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=`SimplyConnect_${S.filters.start}_${S.filters.end}.csv`; a.click();
  URL.revokeObjectURL(url);
  toast('✓ CSV exported');
}

/* ══ DATA LOAD ══ */
async function loadData(){
  if(S.loading)return;
  setLoading(true);
  try{
    S.data=await DataModule.load(S.filters);
    // Keep the slicer dropdowns in sync with whatever the sheet actually
    // contains (new agents/teams/campaigns/states show up automatically).
    fillAgentDrop(S.data);
    fillTeamDrop(S.data);
    fillCampaignDrop(S.data);
    fillStateDrop(S.data);
  }catch(e){
    console.error('[Simply Connect] Failed to load data:', e.message);
    _lastApiError = e.message;
    S.data = null;
  }
  setLoading(false);
  render();
}

/* ══ WIRE EVENTS ══ */
function wire(){
  // Sidebar nav
  document.querySelectorAll('.nav-link').forEach(el=>{
    el.addEventListener('click',e=>{
      e.preventDefault();
      document.querySelectorAll('.nav-link').forEach(n=>n.classList.remove('active'));
      el.classList.add('active');
      S.tab=el.dataset.tab;
      render();
    });
  });

  // Hamburger
  document.getElementById('hamburger').addEventListener('click',()=>{
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Period tabs — daily/weekly/monthly grouping is done client-side in
  // groupDailyByPeriod() from the data already sitting in S.data, so this
  // just re-renders instantly instead of re-hitting the Google Sheets API
  // for data that hasn't actually changed.
  document.querySelectorAll('.pbtab').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.pbtab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      S.period=btn.dataset.p;
      render();
    });
  });

  // Date pickers
  let dtTimer;
  ['fStart','fEnd'].forEach(id=>{
    document.getElementById(id).addEventListener('change',()=>{
      S.filters.start=document.getElementById('fStart').value;
      S.filters.end  =document.getElementById('fEnd').value;
      clearTimeout(dtTimer);
      dtTimer=setTimeout(()=>{DataModule.bust();loadData();},500);
    });
  });

  // Selects
  const selectMap={fTeam:'team',fCampaign:'campaign',fState:'state',fAgent:'agent'};
  Object.entries(selectMap).forEach(([id,key])=>{
    const el=document.getElementById(id);
    el.addEventListener('change',()=>{
      S.filters[key]=el.value;
      el.classList.toggle('on',!!el.value);
      DataModule.bust(); loadData();
    });
  });

  // Search
  let srTimer;
  document.getElementById('fSearch').addEventListener('input',e=>{
    S.filters.search=e.target.value;
    clearTimeout(srTimer);
    srTimer=setTimeout(()=>loadData(),320);
  });

  // Clear
  document.getElementById('clearBtn').addEventListener('click',()=>{
    S.filters={start:'2026-08-01',end:'2026-09-02',team:'',campaign:'',state:'',agent:'',search:''};
    document.getElementById('fStart').value='2026-08-01';
    document.getElementById('fEnd').value='2026-09-02';
    ['fTeam','fCampaign','fState','fAgent'].forEach(id=>{
      document.getElementById(id).value='';
      document.getElementById(id).classList.remove('on');
    });
    document.getElementById('fSearch').value='';
    DataModule.bust(); loadData();
    toast('Filters cleared');
  });

  // Export
  ['exportBtn','exportCsv'].forEach(id=>{
    document.getElementById(id).addEventListener('click',exportCSV);
  });

  // Refresh
  document.getElementById('refreshBtn').addEventListener('click',()=>{
    DataModule.bust(); loadData();
    toast('Refreshing…');
  });

  // Modal
  document.getElementById('modalClose').addEventListener('click',()=>{
    document.getElementById('gasModal').style.display='none';
  });
  document.getElementById('gasModal').addEventListener('click',e=>{
    if(e.target===document.getElementById('gasModal'))
      document.getElementById('gasModal').style.display='none';
  });

  // Badge counts — set once real data loads (see renderCalls/renderSales);
  // just show a neutral placeholder until the first fetch completes.
  document.getElementById('badgeCalls').textContent='—';
  document.getElementById('badgeSales').textContent='—';

  // Auto-refresh
  if(window.API_URL){
    setInterval(()=>{DataModule.bust();loadData();},5*60*1000);
  }
}

/* ══ INIT ══ */
function init(){
  // Dropdowns are populated from live data once the first load() call
  // succeeds (see loadData()) — there's no offline snapshot to seed them
  // from before that.
  wire();
  loadData();
}

document.addEventListener('DOMContentLoaded',init);
})();
