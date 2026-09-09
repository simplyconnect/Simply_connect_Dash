/**
 * data.js — Simply Connect Dashboard
 * Fetches live data from your Google Sheet via Apps Script. There is no
 * offline/static snapshot baked into this file — your spreadsheet is the
 * single source of truth. If the live request fails (bad URL, sheet
 * renamed, Apps Script error, etc.), the dashboard shows a clear
 * "couldn't load data" state instead of silently falling back to old
 * numbers.
 *
 * Live API: set window.API_URL to your Google Apps Script deployment URL
 * Actions: ?action=all|callresults|dailycalls|hourly|campaigns|agents|teams|sales|states|providers|services|installtypes|closers|summary
 * Filters: &start=YYYY-MM-DD&end=YYYY-MM-DD&team=X&campaign=Y&state=Z&agent=A
 */

window.API_URL = 'https://script.google.com/macros/s/AKfycbymPdF_60T2sDiR7stqMw3a067rajjj_4pQVyPhVV0WA2FUrFmnSVnNr1FcrmaWkVQV/exec';

/* ═══════════════════════════════════════════════════════
   DATA MODULE
═══════════════════════════════════════════════════════ */
window.DataModule = (function(){
  let _cache = null, _ts = null;
  const TTL = 5 * 60 * 1000;

  async function load(filters = {}){
    if(!window.API_URL){
      throw new Error('window.API_URL is not set — no live Google Sheet connected.');
    }
    return fetchLive(filters);
  }

  async function fetchLive(filters){
    const now = Date.now();
    if(_cache && _ts && (now-_ts) < TTL) return applyFilters(_cache, filters);
    // Only start/end go to the server — team/campaign/state/agent/search
    // are applied client-side in applyFilters() below. This keeps the
    // cached response a stable "full dataset for this date range" that
    // every slicer change can filter locally instead of triggering a
    // fresh (slow) Apps Script round-trip that re-reads and re-aggregates
    // the whole sheet on every click.
    const p = new URLSearchParams({ action:'all', start:filters.start||'', end:filters.end||'' });
    const r = await fetch(`${window.API_URL}?${p}`);
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    if(d && d.error) throw new Error(d.message || 'Apps Script returned an error');
    _cache = d; _ts = now;
    window.dispatchEvent(new CustomEvent('sc:apiok'));
    return applyFilters(d, filters);
  }

  function applyFilters(data, { team, campaign, state, agent, search } = {}){
    let agents = [...data.agents];
    let sales  = [...data.sales];
    let calls_d= [...data.dailyCalls];
    let camps  = [...data.campaigns];
    let states = [...data.states];
    let teams  = [...data.teams];

    if(team){
      agents = agents.filter(a => a.team === team);
      sales  = sales.filter(s => s.team === team);
      teams  = teams.filter(t => t.team === team);
    }
    if(campaign){
      // Sales rows don't reliably map to a Calls-side campaign/queue name in
      // this dataset (different naming, ~50% blank), so the campaign filter
      // only narrows call volume, not the sales list.
      camps  = camps.filter(c => c.name === campaign);
    }
    if(state){
      sales  = sales.filter(s => s.state === state);
      states = states.filter(s => s.state === state);
    }
    if(agent){
      agents = agents.filter(a => a.name === agent);
      sales  = sales.filter(s => s.agent === agent);
    }
    if(search){
      const q = search.toLowerCase();
      agents = agents.filter(a => a.name.toLowerCase().includes(q) || a.team.toLowerCase().includes(q));
    }

    const totalSales = sales.length;
    const totalRGUs  = sales.reduce((s,x)=>s+x.rgu,0);
    // NOTE: "calls" per agent already reflects only ANSWERED calls — the
    // source data doesn't attribute an agent to abandoned/overflow/stranded
    // calls, so an agent's call count and answered count are the same
    // number. totalCalls therefore falls back to the unfiltered grand total
    // (which does include unanswered calls) unless a team/agent filter is
    // active, in which case it's necessarily "answered calls only" because
    // unanswered calls can't be attributed to a team or agent in this data.
    const totalCalls = (team||agent) ? agents.reduce((s,a)=>s+a.calls,0) : data.summary.totalCalls;
    const answered   = (team||agent) ? agents.reduce((s,a)=>s+a.answered,0) : data.summary.answeredCalls;

    return {
      agents: agents.sort((a,b)=>b.calls-a.calls),
      sales, dailyCalls:calls_d, campaigns:camps, states, teams,
      providers: data.providers, services: data.services,
      installTypes: data.installTypes, closers: data.closers,
      callResults: data.callResults, hourly: data.hourly,
      summary: {
        ...data.summary,
        totalSales, totalRGUs,
        totalCalls, answeredCalls: answered,
        answerRate: totalCalls ? +((answered/totalCalls)*100).toFixed(1) : 0
      }
    };
  }

  function bust(){ _cache=null; _ts=null; }

  return { load, bust };
})();
