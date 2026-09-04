/**
 * charts.js — Simply Connect Dashboard
 * All Chart.js chart factories with smooth animations
 */
window.Charts = (function(){
  const G='#F5A623',GD='#C8830A',GL='#FDD68A';
  const BL='#3B82F6',GR='#10B981',RD='#EF4444';
  const PU='#8B5CF6',TE='#14B8A6',OR='#F97316',AM='#F59E0B';
  const PAL=[G,BL,GR,RD,PU,TE,OR,AM,'#EC4899','#6366F1','#84CC16','#06B6D4'];

  const FONT={family:"'Inter',system-ui,sans-serif",size:11};
  const FONT_SM={family:"'Inter',system-ui,sans-serif",size:10};

  const TIP={
    backgroundColor:'#1F2937',titleColor:'#F9FAFB',bodyColor:'#D1D5DB',
    borderColor:'#374151',borderWidth:1,cornerRadius:8,padding:10,
    titleFont:{...FONT,weight:'700'},bodyFont:FONT,
  };

  const ANIM={duration:600,easing:'easeOutQuart'};

  const pool={};
  function kill(id){ if(pool[id]){pool[id].destroy();delete pool[id];} }
  function killAll(){ Object.keys(pool).forEach(kill); }

  function ctx(id){ return document.getElementById(id); }

  /* ── AREA: Daily Calls ── */
  function dailyCallsArea(id, data){
    kill(id); const c=ctx(id); if(!c)return;
    pool[id]=new Chart(c,{
      type:'line',
      data:{
        labels:data.map(d=>d.date),
        datasets:[
          {label:'Total Calls',data:data.map(d=>d.total),
           borderColor:G,backgroundColor:'rgba(245,166,35,.12)',
           borderWidth:2.5,fill:true,tension:0.4,pointRadius:3,pointHoverRadius:6,pointBackgroundColor:G},
          {label:'Answered',data:data.map(d=>d.answered),
           borderColor:GR,backgroundColor:'rgba(16,185,129,.08)',
           borderWidth:2,fill:true,tension:0.4,pointRadius:3,pointHoverRadius:6,pointBackgroundColor:GR},
          {label:'Abandoned',data:data.map(d=>d.abandoned),
           borderColor:RD,backgroundColor:'rgba(239,68,68,.08)',
           borderWidth:2,fill:true,tension:0.4,pointRadius:3,pointHoverRadius:6,pointBackgroundColor:RD},
        ]
      },
      options:{
        responsive:true,maintainAspectRatio:false,animation:ANIM,
        plugins:{legend:{position:'top',align:'end',labels:{...FONT,boxWidth:10,usePointStyle:true,padding:14}},tooltip:{...TIP,mode:'index',intersect:false}},
        scales:{
          x:{grid:{display:false},ticks:{...FONT_SM,color:'#9CA3AF'}},
          y:{grid:{color:'#F3F4F6'},ticks:{...FONT_SM,color:'#9CA3AF'},beginAtZero:true}
        }
      }
    });
  }

  /* ── AREA: Daily Sales ── */
  function dailySalesArea(id, dailyCalls, salesData){
    kill(id); const c=ctx(id); if(!c)return;
    // aggregate sales by day
    const dayMap={};
    salesData.forEach(s=>{
      const k='Aug 1'; // all sales are Aug 1 in static
    });
    // Use call daily dates but sales will just show total
    pool[id]=new Chart(c,{
      type:'line',
      data:{
        labels:dailyCalls.map(d=>d.date),
        datasets:[
          {label:'Avg Talk Time (s)',data:dailyCalls.map(d=>d.avgTalk),
           borderColor:G,backgroundColor:'rgba(245,166,35,.1)',
           borderWidth:2.5,fill:true,tension:0.4,yAxisID:'yL',pointRadius:3,pointHoverRadius:6,pointBackgroundColor:G},
          {label:'Avg Wait Time (s)',data:dailyCalls.map(d=>d.avgWait),
           borderColor:BL,backgroundColor:'rgba(59,130,246,.08)',
           borderWidth:2,fill:false,tension:0.4,yAxisID:'yR',pointRadius:3,pointHoverRadius:6,pointBackgroundColor:BL},
        ]
      },
      options:{
        responsive:true,maintainAspectRatio:false,animation:ANIM,
        plugins:{legend:{position:'top',align:'end',labels:{...FONT,boxWidth:10,usePointStyle:true,padding:14}},tooltip:{...TIP,mode:'index',intersect:false}},
        scales:{
          x:{grid:{display:false},ticks:{...FONT_SM,color:'#9CA3AF'}},
          yL:{position:'left',grid:{color:'#F3F4F6'},ticks:{...FONT_SM,color:'#9CA3AF'},beginAtZero:true,title:{display:true,text:'Talk (sec)',font:FONT_SM,color:'#9CA3AF'}},
          yR:{position:'right',grid:{display:false},ticks:{...FONT_SM,color:'#9CA3AF'},beginAtZero:true,title:{display:true,text:'Wait (sec)',font:FONT_SM,color:'#9CA3AF'}}
        }
      }
    });
  }

  /* ── DOUGHNUT: Call Results ── */
  function callResultDoughnut(id, data){
    kill(id); const c=ctx(id); if(!c)return;
    const cols={Answered:GR,'Overflow - Time':OR,'Stranded - Unavailable':PU,Abandoned:RD,Stranded:AM,Transferred:BL,Escaped:'#9CA3AF'};
    pool[id]=new Chart(c,{
      type:'doughnut',
      data:{
        labels:data.map(d=>d.result),
        datasets:[{data:data.map(d=>d.count),backgroundColor:data.map(d=>cols[d.result]||G),borderWidth:2,borderColor:'#fff',hoverOffset:8}]
      },
      options:{
        responsive:true,maintainAspectRatio:false,animation:{...ANIM,animateRotate:true},
        cutout:'65%',
        plugins:{legend:{position:'right',labels:{...FONT_SM,boxWidth:10,usePointStyle:true,padding:10}},
          tooltip:{...TIP,callbacks:{label:ctx=>{
            const t=ctx.dataset.data.reduce((a,b)=>a+b,0);
            return ` ${ctx.label}: ${ctx.raw.toLocaleString()} (${((ctx.raw/t)*100).toFixed(1)}%)`;
          }}}}
      }
    });
  }

  /* ── DOUGHNUT: Providers ── */
  function providerDoughnut(id, data){
    kill(id); const c=ctx(id); if(!c)return;
    pool[id]=new Chart(c,{
      type:'doughnut',
      data:{
        labels:data.map(d=>d.name),
        datasets:[{data:data.map(d=>d.sales),backgroundColor:PAL,borderWidth:2,borderColor:'#fff',hoverOffset:8}]
      },
      options:{
        responsive:true,maintainAspectRatio:false,animation:{...ANIM,animateRotate:true},cutout:'62%',
        plugins:{legend:{position:'right',labels:{...FONT_SM,boxWidth:10,usePointStyle:true,padding:10}},
          tooltip:{...TIP,callbacks:{label:ctx=>{
            const t=ctx.dataset.data.reduce((a,b)=>a+b,0);
            return ` ${ctx.label}: ${ctx.raw} sales (${((ctx.raw/t)*100).toFixed(1)}%)`;
          }}}}
      }
    });
  }

  /* ── PIE: Services ── */
  function servicePie(id, data){
    kill(id); const c=ctx(id); if(!c)return;
    pool[id]=new Chart(c,{
      type:'doughnut',
      data:{
        labels:data.map(d=>d.name),
        datasets:[{data:data.map(d=>d.count),backgroundColor:[G,BL,GR,PU],borderWidth:2,borderColor:'#fff',hoverOffset:8}]
      },
      options:{
        responsive:true,maintainAspectRatio:false,animation:{...ANIM,animateRotate:true},cutout:'58%',
        plugins:{legend:{position:'right',labels:{...FONT_SM,boxWidth:10,usePointStyle:true,padding:10}},tooltip:{...TIP}}
      }
    });
  }

  /* ── PIE: Install Type ── */
  function installPie(id, data){
    kill(id); const c=ctx(id); if(!c)return;
    pool[id]=new Chart(c,{
      type:'doughnut',
      data:{
        labels:data.map(d=>d.type),
        datasets:[{data:data.map(d=>d.count),backgroundColor:[G,BL],borderWidth:2,borderColor:'#fff',hoverOffset:8}]
      },
      options:{
        responsive:true,maintainAspectRatio:false,animation:{...ANIM,animateRotate:true},cutout:'58%',
        plugins:{legend:{position:'right',labels:{...FONT_SM,boxWidth:10,usePointStyle:true,padding:10}},tooltip:{...TIP}}
      }
    });
  }

  /* ── GROUPED BAR: Teams calls+sales ── */
  function teamBar(id, data){
    kill(id); const c=ctx(id); if(!c)return;
    pool[id]=new Chart(c,{
      type:'bar',
      data:{
        labels:data.map(t=>t.team.replace('Team ','')),
        datasets:[
          {label:'Calls',   data:data.map(t=>t.calls),   backgroundColor:G,  borderRadius:5,borderSkipped:false},
          {label:'Answered',data:data.map(t=>t.answered), backgroundColor:GR, borderRadius:5,borderSkipped:false},
          {label:'Sales',   data:data.map(t=>t.sales*50), backgroundColor:BL, borderRadius:5,borderSkipped:false,yAxisID:'yR'},
        ]
      },
      options:{
        responsive:true,maintainAspectRatio:false,animation:ANIM,
        plugins:{legend:{position:'top',align:'end',labels:{...FONT,boxWidth:10,usePointStyle:true,padding:14}},tooltip:{...TIP}},
        scales:{
          x:{grid:{display:false},ticks:{...FONT_SM,color:'#9CA3AF'}},
          y:{grid:{color:'#F3F4F6'},ticks:{...FONT_SM,color:'#9CA3AF'},beginAtZero:true},
          yR:{display:false,beginAtZero:true}
        }
      }
    });
  }

  /* ── HORIZONTAL BAR: Campaigns ── */
  function campaignHBar(id, data){
    kill(id); const c=ctx(id); if(!c)return;
    const top8=data.slice(0,8);
    pool[id]=new Chart(c,{
      type:'bar',
      data:{
        labels:top8.map(d=>d.name),
        datasets:[
          {label:'Total Calls',data:top8.map(d=>d.calls),   backgroundColor:G,  borderRadius:4},
          {label:'Answered',   data:top8.map(d=>d.answered), backgroundColor:GR, borderRadius:4},
        ]
      },
      options:{
        indexAxis:'y',responsive:true,maintainAspectRatio:false,animation:ANIM,
        plugins:{legend:{position:'top',align:'end',labels:{...FONT,boxWidth:10,usePointStyle:true,padding:14}},tooltip:{...TIP}},
        scales:{
          x:{grid:{color:'#F3F4F6'},ticks:{...FONT_SM,color:'#9CA3AF'},beginAtZero:true},
          y:{grid:{display:false},ticks:{...FONT_SM,color:'#4B5563'}}
        }
      }
    });
  }

  /* ── HORIZONTAL BAR: States ── */
  function stateHBar(id, data){
    kill(id); const c=ctx(id); if(!c)return;
    pool[id]=new Chart(c,{
      type:'bar',
      data:{
        labels:data.map(s=>s.state),
        datasets:[
          {label:'Sales',data:data.map(s=>s.sales),backgroundColor:G,borderRadius:4},
          {label:'RGUs', data:data.map(s=>s.rgus), backgroundColor:BL,borderRadius:4},
        ]
      },
      options:{
        indexAxis:'y',responsive:true,maintainAspectRatio:false,animation:ANIM,
        plugins:{legend:{position:'top',align:'end',labels:{...FONT,boxWidth:10,usePointStyle:true,padding:14}},tooltip:{...TIP}},
        scales:{
          x:{grid:{color:'#F3F4F6'},ticks:{...FONT_SM,color:'#9CA3AF'},beginAtZero:true},
          y:{grid:{display:false},ticks:{...FONT_SM,color:'#4B5563'}}
        }
      }
    });
  }

  /* ── VERTICAL BAR: Hourly ── */
  function hourlyBar(id, data){
    kill(id); const c=ctx(id); if(!c)return;
    pool[id]=new Chart(c,{
      type:'bar',
      data:{
        labels:data.map(d=>d.hour+'CT'),
        datasets:[
          {label:'Total',   data:data.map(d=>d.total),   backgroundColor:'rgba(245,166,35,.25)',borderRadius:4,borderSkipped:false},
          {label:'Answered',data:data.map(d=>d.answered), backgroundColor:G, borderRadius:4,borderSkipped:false},
        ]
      },
      options:{
        responsive:true,maintainAspectRatio:false,animation:ANIM,
        plugins:{legend:{position:'top',align:'end',labels:{...FONT,boxWidth:10,usePointStyle:true,padding:14}},tooltip:{...TIP,mode:'index',intersect:false,
          callbacks:{afterBody:items=>[`Answer Rate: ${data[items[0].dataIndex].rate}%`]}}},
        scales:{
          x:{grid:{display:false},ticks:{...FONT_SM,color:'#9CA3AF',maxRotation:45}},
          y:{grid:{color:'#F3F4F6'},ticks:{...FONT_SM,color:'#9CA3AF'},beginAtZero:true}
        }
      }
    });
  }

  /* ── HORIZONTAL BAR: Agent calls ── */
  function agentCallBar(id, agents, limit=15){
    kill(id); const c=ctx(id); if(!c)return;
    const top=agents.slice(0,limit);
    pool[id]=new Chart(c,{
      type:'bar',
      data:{
        labels:top.map(a=>a.name.split(' ').slice(0,2).join(' ')),
        datasets:[
          {label:'Calls',   data:top.map(a=>a.calls),   backgroundColor:G,  borderRadius:4},
          {label:'Answered',data:top.map(a=>a.answered), backgroundColor:GR, borderRadius:4},
        ]
      },
      options:{
        indexAxis:'y',responsive:true,maintainAspectRatio:false,animation:ANIM,
        plugins:{legend:{position:'top',align:'end',labels:{...FONT,boxWidth:10,usePointStyle:true,padding:12}},tooltip:{...TIP}},
        scales:{
          x:{grid:{color:'#F3F4F6'},ticks:{...FONT_SM,color:'#9CA3AF'},beginAtZero:true},
          y:{grid:{display:false},ticks:{...FONT_SM,color:'#4B5563'}}
        }
      }
    });
  }

  /* ── SCATTER: Talk Time vs Calls (agent efficiency) ── */
  function agentScatter(id, agents){
    kill(id); const c=ctx(id); if(!c)return;
    pool[id]=new Chart(c,{
      type:'scatter',
      data:{
        datasets:[{
          label:'Agents',
          data:agents.filter(a=>a.calls>50).map(a=>({x:a.calls,y:a.avgTalk,name:a.name})),
          backgroundColor:'rgba(245,166,35,.7)',pointRadius:6,pointHoverRadius:9,
          borderColor:GD,borderWidth:1,
        }]
      },
      options:{
        responsive:true,maintainAspectRatio:false,animation:ANIM,
        plugins:{legend:{display:false},tooltip:{...TIP,callbacks:{
          label:ctx=>`${ctx.raw.name}: ${ctx.raw.x} calls, ${Math.round(ctx.raw.y)}s avg talk`
        }}},
        scales:{
          x:{grid:{color:'#F3F4F6'},ticks:{...FONT_SM,color:'#9CA3AF'},title:{display:true,text:'Total Calls',font:FONT_SM,color:'#9CA3AF'}},
          y:{grid:{color:'#F3F4F6'},ticks:{...FONT_SM,color:'#9CA3AF'},title:{display:true,text:'Avg Talk Time (s)',font:FONT_SM,color:'#9CA3AF'}}
        }
      }
    });
  }

  /* ── BAR: Closers ── */
  function closerBar(id, data){
    kill(id); const c=ctx(id); if(!c)return;
    pool[id]=new Chart(c,{
      type:'bar',
      data:{
        labels:data.map(d=>d.name.split(' ')[0]),
        datasets:[{label:'Closes',data:data.map(d=>d.closes),backgroundColor:PAL,borderRadius:6,borderSkipped:false}]
      },
      options:{
        responsive:true,maintainAspectRatio:false,animation:ANIM,
        plugins:{legend:{display:false},tooltip:{...TIP,callbacks:{label:ctx=>` ${ctx.raw} closes`}}},
        scales:{
          x:{grid:{display:false},ticks:{...FONT_SM,color:'#9CA3AF',maxRotation:30}},
          y:{grid:{color:'#F3F4F6'},ticks:{...FONT_SM,color:'#9CA3AF'},beginAtZero:true}
        }
      }
    });
  }

  /* ── LINE: Answer Rate trend ── */
  function answerRateLine(id, data){
    kill(id); const c=ctx(id); if(!c)return;
    pool[id]=new Chart(c,{
      type:'line',
      data:{
        labels:data.map(d=>d.date),
        datasets:[{
          label:'Answer Rate %',
          data:data.map(d=>d.total>0?+((d.answered/d.total)*100).toFixed(1):0),
          borderColor:GR,backgroundColor:'rgba(16,185,129,.1)',
          borderWidth:2.5,fill:true,tension:0.4,pointRadius:3,pointHoverRadius:7,pointBackgroundColor:GR,
        },{
          label:'Abandon Rate %',
          data:data.map(d=>d.total>0?+((d.abandoned/d.total)*100).toFixed(1):0),
          borderColor:RD,backgroundColor:'rgba(239,68,68,.08)',
          borderWidth:2,fill:true,tension:0.4,pointRadius:3,pointHoverRadius:7,pointBackgroundColor:RD,
        }]
      },
      options:{
        responsive:true,maintainAspectRatio:false,animation:ANIM,
        plugins:{legend:{position:'top',align:'end',labels:{...FONT,boxWidth:10,usePointStyle:true,padding:14}},tooltip:{...TIP,mode:'index',intersect:false}},
        scales:{
          x:{grid:{display:false},ticks:{...FONT_SM,color:'#9CA3AF'}},
          y:{grid:{color:'#F3F4F6'},ticks:{...FONT_SM,color:'#9CA3AF',callback:v=>v+'%'},min:0,max:100}
        }
      }
    });
  }

  /* ── BAR: Bounce distribution ── */
  function bounceDist(id){
    kill(id); const c=ctx(id); if(!c)return;
    const labels=['0','1','2','3','4','5+'];
    const counts=[44563,3011,474,148,92,21];
    pool[id]=new Chart(c,{
      type:'bar',
      data:{labels,datasets:[{label:'Calls',data:counts,backgroundColor:[GR,G,AM,OR,RD,PU],borderRadius:6,borderSkipped:false}]},
      options:{
        responsive:true,maintainAspectRatio:false,animation:ANIM,
        plugins:{legend:{display:false},tooltip:{...TIP}},
        scales:{
          x:{grid:{display:false},ticks:{...FONT_SM,color:'#9CA3AF'},title:{display:true,text:'Number of Bounces',font:FONT_SM,color:'#9CA3AF'}},
          y:{grid:{color:'#F3F4F6'},ticks:{...FONT_SM,color:'#9CA3AF'},type:'logarithmic',title:{display:true,text:'Count (log)',font:FONT_SM,color:'#9CA3AF'}}
        }
      }
    });
  }

  /* ── BAR: RGUs by provider ── */
  function providerPoints(id, providers){
    kill(id); const c=ctx(id); if(!c)return;
    pool[id]=new Chart(c,{
      type:'bar',
      data:{
        labels:providers.map(p=>p.name),
        datasets:[{label:'Total RGUs',data:providers.map(p=>p.rgus),backgroundColor:PAL,borderRadius:6,borderSkipped:false}]
      },
      options:{
        responsive:true,maintainAspectRatio:false,animation:ANIM,
        plugins:{legend:{display:false},tooltip:{...TIP}},
        scales:{
          x:{grid:{display:false},ticks:{...FONT_SM,color:'#9CA3AF'}},
          y:{grid:{color:'#F3F4F6'},ticks:{...FONT_SM,color:'#9CA3AF'},beginAtZero:true}
        }
      }
    });
  }

  return {
    dailyCallsArea, dailySalesArea, callResultDoughnut,
    providerDoughnut, servicePie, installPie,
    teamBar, campaignHBar, stateHBar, hourlyBar,
    agentCallBar, agentScatter, closerBar,
    answerRateLine, bounceDist, providerPoints,
    killAll
  };
})();
