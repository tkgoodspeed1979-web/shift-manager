import { useState, useRef, useCallback, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, off } from "firebase/database";

/* ── Firebase設定 ── */
const firebaseConfig = {
  apiKey: "AIzaSyAup1IQAhoxzJvDUO4M5LbUM0f4zszPmE4",
  authDomain: "shift-manager-65d41.firebaseapp.com",
  databaseURL: "https://shift-manager-65d41-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "shift-manager-65d41",
  storageBucket: "shift-manager-65d41.firebasestorage.app",
  messagingSenderId: "424438299776",
  appId: "1:424438299776:web:fab1e6cbaf61885f31fa65"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

/* ─────────────────────────────────────────
   定数・ユーティリティ
───────────────────────────────────────── */
const WEEKDAYS      = ["日","月","火","水","木","金","土"];
const PREP_END_MINS = 15*60+59;
const BIZ_START     = 16*60;
const BIZ_END       = 24*60+30;

const toMins = t => { if(!t) return null; const [h,m]=t.split(":").map(Number); return h*60+m; };
const toHHMM = m => { if(!m||m<=0) return null; return `${Math.floor(m/60)}:${String(m%60).padStart(2,"0")}`; };
const dow    = (y,mo,d) => WEEKDAYS[new Date(y,mo-1,d).getDay()];
const isSun  = (y,mo,d) => new Date(y,mo-1,d).getDay()===0;
const isSat  = (y,mo,d) => new Date(y,mo-1,d).getDay()===6;

const calcRaw  = (s,e) => { const a=toMins(s),b=toMins(e); if(a===null||b===null) return null; return b-a>0?b-a:null; };
const calcWork = (s,e) => { const r=calcRaw(s,e); if(r===null) return null; return r>480?r-60:r; };
const calcPrep = (s,e) => { const a=toMins(s),b=toMins(e); if(a===null||b===null||b<=a) return 0; return Math.max(0,Math.min(b,PREP_END_MINS+1)-a); };
const calcBiz  = (s,e) => { const a=toMins(s),b=toMins(e); if(a===null||b===null||b<=a) return 0; return Math.max(0,Math.min(b,BIZ_END)-Math.max(a,BIZ_START)); };

const autoType = (s,e) => {
  const a=toMins(s),b=toMins(e);
  if(a===null||b===null) return null;
  if(b<=PREP_END_MINS+1) return "prep";
  if(a>=BIZ_START) return "business";
  return a<BIZ_START?"prep":"business";
};

const ROLES = {
  through:  {label:"通し",  color:"#e8d5ff",border:"#8b5cf6",text:"#4c1d95"},
  business: {label:"営業",  color:"#d6eaff",border:"#3b82f6",text:"#1a4a8a"},
  prep:     {label:"仕込み",color:"#fff3cd",border:"#f0ad00",text:"#7a5000"},
};

const INIT_EMPLOYEES = [
  {id:1,name:"川根　孝",  empNo:"店長", role:"business",order:0},
  {id:2,name:"和光　大紀",empNo:"73051",role:"business",order:1},
  {id:3,name:"若杉　実加",empNo:"73001",role:"prep",    order:2},
  {id:4,name:"赤津　沙耶",empNo:"73033",role:"prep",    order:3},
  {id:5,name:"宮　玲於奈",empNo:"73038",role:"business",order:4},
];

/* ─────────────────────────────────────────
   StaffList（並び替え付き）
───────────────────────────────────────── */
function StaffList({employees,setEmployees}){
  const [editId,setEditId]=useState(null);
  const [draft,setDraft]=useState({name:"",empNo:""});
  const dragRef=useRef(null);

  const startEdit=emp=>{setEditId(emp.id);setDraft({name:emp.name,empNo:emp.empNo});};
  const saveEdit=id=>{
    if(!draft.name.trim()) return;
    setEmployees(p=>p.map(e=>e.id===id?{...e,...draft}:e));
    setEditId(null);
  };
  const cycleRole=emp=>{
    const o=["through","business","prep"];
    setEmployees(p=>p.map(e=>e.id===emp.id?{...e,role:o[(o.indexOf(e.role)+1)%o.length]}:e));
  };
  const del=emp=>{if(window.confirm(`${emp.name} を削除しますか？`)) setEmployees(p=>p.filter(e=>e.id!==emp.id));};

  // drag-to-reorder
  const onDragStart=(e,id)=>{ dragRef.current=id; e.dataTransfer.effectAllowed="move"; };
  const onDrop=(e,targetId)=>{
    e.preventDefault();
    const srcId=dragRef.current; if(srcId===targetId) return;
    setEmployees(prev=>{
      const arr=[...prev].sort((a,b)=>a.order-b.order);
      const si=arr.findIndex(e=>e.id===srcId);
      const ti=arr.findIndex(e=>e.id===targetId);
      const [item]=arr.splice(si,1); arr.splice(ti,0,item);
      return arr.map((e,i)=>({...e,order:i}));
    });
  };

  const sorted=[...employees].sort((a,b)=>a.order-b.order);

  return(
    <div>
      <div style={{fontSize:11,color:"#888",marginBottom:8,paddingLeft:2}}>
        ☰ ドラッグで並び替え可能
      </div>
      {sorted.map(emp=>{
        const ri=ROLES[emp.role]||ROLES.business;
        return(
          <div key={emp.id} draggable
            onDragStart={e=>onDragStart(e,emp.id)}
            onDragOver={e=>e.preventDefault()}
            onDrop={e=>onDrop(e,emp.id)}
            style={{background:"#fff",borderRadius:12,marginBottom:8,
              boxShadow:"0 1px 4px rgba(0,0,0,0.06)",borderLeft:`4px solid ${ri.border}`,overflow:"hidden",
              cursor:"grab"}}>
            {editId===emp.id?(
              <div style={{padding:"14px 16px"}}>
                <div style={{fontSize:11,color:"#888",fontWeight:600,marginBottom:8}}>編集中</div>
                <input value={draft.name} onChange={e=>setDraft(p=>({...p,name:e.target.value}))} placeholder="名前"
                  style={{width:"100%",padding:"10px 12px",border:"1.5px solid #3b82f6",borderRadius:8,fontSize:14,fontWeight:600,marginBottom:8,boxSizing:"border-box"}}/>
                <input value={draft.empNo} onChange={e=>setDraft(p=>({...p,empNo:e.target.value}))} placeholder="社員番号"
                  style={{width:"100%",padding:"10px 12px",border:"1.5px solid #dce6f0",borderRadius:8,fontSize:14,marginBottom:12,boxSizing:"border-box"}}/>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setEditId(null)} style={{flex:1,padding:"10px",borderRadius:8,border:"1px solid #dce6f0",background:"#f5f5f5",color:"#888",fontWeight:600,cursor:"pointer",fontSize:13}}>キャンセル</button>
                  <button onClick={()=>saveEdit(emp.id)} style={{flex:2,padding:"10px",borderRadius:8,border:"none",background:"#2c5f8a",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13}}>✓ 保存</button>
                </div>
              </div>
            ):(
              <div style={{padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:16,color:"#bbb",cursor:"grab"}}>☰</span>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,color:"#1e293b"}}>{emp.name}</div>
                    <div style={{fontSize:12,color:"#64748b",marginTop:2}}>
                      {emp.empNo||"（番号なし）"}
                      <span style={{marginLeft:6,padding:"1px 6px",borderRadius:4,fontSize:10,background:ri.color,color:ri.text,fontWeight:700}}>{ri.label}</span>
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",gap:5}}>
                  <button onClick={()=>startEdit(emp)} style={{background:"#f0f6ff",border:"1px solid #b8d4f0",borderRadius:8,padding:"6px 10px",color:"#2c5f8a",fontWeight:600,cursor:"pointer",fontSize:11}}>編集</button>
                  <button onClick={()=>cycleRole(emp)} style={{background:"#f5f0ff",border:"1px solid #c4b5fd",borderRadius:8,padding:"6px 8px",color:"#6d28d9",cursor:"pointer",fontSize:11,fontWeight:600}}>区分切替</button>
                  <button onClick={()=>del(emp)} style={{background:"#fff5f5",border:"1px solid #ffcccc",borderRadius:8,padding:"6px 8px",color:"#c0392b",fontWeight:600,cursor:"pointer",fontSize:11}}>削除</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────
   メインコンポーネント
───────────────────────────────────────── */
/* ── PdfTable：固定比率レイアウトで確実に1画面に収める ── */
function PdfTable({sortedEmployees,days,year,month,period,daysInMonth,gs,resolved,calcWork,toHHMM,empMins,dayStats,isSun,isSat,dow,ROLES}){
  const staffCount=sortedEmployees.length;
  const dayCount=days.length;
  const namePct=14;
  const totalPct=5;
  const dayPct=((100-namePct-totalPct)/dayCount).toFixed(2);
  const fs=staffCount<=10?8:staffCount<=15?7:6;
  const nameFs=staffCount<=10?10:staffCount<=15?9:8;
  const rh=staffCount<=10?28:staffCount<=15?24:20;

  const cellStyle=(t)=>{
    if(t==="off")      return {bg:"#e0e0e0",bd:"#999"};
    if(t==="through")  return {bg:"#d8b4fe",bd:"#7c3aed"};
    if(t==="prep")     return {bg:"#fde68a",bd:"#b45309"};
    if(t==="business") return {bg:"#bfdbfe",bd:"#1d4ed8"};
    return {bg:"#fff",bd:"#ccc"};
  };

  return(
    <div style={{width:"100%",fontFamily:"-apple-system,sans-serif"}}>
      <div style={{fontSize:11,fontWeight:700,color:"#2c5f8a",marginBottom:4}}>
        {year}年{month}月 シフト表（{period==="first"?`前半 1〜15日`:`後半 16〜${daysInMonth}日`}）
      </div>
      <table style={{borderCollapse:"collapse",width:"100%",tableLayout:"fixed"}}>
        <colgroup>
          <col style={{width:`${namePct}%`}}/>
          {days.map(d=><col key={d} style={{width:`${dayPct}%`}}/>)}
          <col style={{width:`${totalPct}%`}}/>
        </colgroup>
        <thead>
          <tr style={{background:"#2c5f8a"}}>
            <th style={{padding:"2px 2px",textAlign:"left",color:"#fff",border:"1px solid #4a7faa",fontSize:fs,overflow:"hidden"}}>名前</th>
            {days.map(d=>{
              const dw_=dow(year,month,d);
              const c=isSun(year,month,d)?"#ffb3b3":isSat(year,month,d)?"#b3d4ff":"#b8d4f0";
              return(
                <th key={d} style={{padding:"1px 0",textAlign:"center",color:"#fff",border:"1px solid #4a7faa",fontSize:fs}}>
                  {d}<br/><span style={{fontSize:fs-1,color:c}}>{dw_}</span>
                </th>
              );
            })}
            <th style={{padding:"1px",textAlign:"center",color:"#fff",border:"1px solid #4a7faa",fontSize:fs}}>計</th>
          </tr>
        </thead>
        <tbody>
          {sortedEmployees.map(emp=>{
            const ri=ROLES[emp.role]||ROLES.business;
            return(
              <tr key={emp.id}>
                <td style={{padding:"1px 2px",border:"1px solid #bbb",borderLeft:`3px solid ${ri.border}`,background:"#f8fafc",height:rh,overflow:"hidden"}}>
                  <div style={{fontSize:nameFs,color:"#1e293b",fontWeight:800,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{emp.name}</div>
                  <div style={{fontSize:nameFs-2,color:"#64748b"}}>{emp.empNo}</div>
                </td>
                {days.map(d=>{
                  const s=gs(emp.id,d),t=resolved(emp.id,d);
                  const hasShift=s.start||s.type;
                  const {bg,bd}=hasShift?cellStyle(t):{bg:"#fff",bd:"#ccc"};
                  const w=calcWork(s.start,s.end);
                  return(
                    <td key={d} style={{padding:"1px 0",textAlign:"center",border:`1px solid ${bd}`,background:bg,fontSize:fs-1,lineHeight:1.2,height:rh,overflow:"hidden"}}>
                      {t==="off"?<span style={{color:"#555",fontWeight:700,fontSize:fs}}>休</span>
                      :s.start?<><span style={{color:"#1e3a5f",fontWeight:700,display:"block"}}>{s.start}</span><span style={{color:"#1e3a5f",fontWeight:700,display:"block"}}>{s.end||""}</span><b style={{color:"#c05000",fontSize:fs-1}}>{toHHMM(w)||""}</b></>
                      :null}
                    </td>
                  );
                })}
                <td style={{textAlign:"center",border:"1px solid #bbb",fontWeight:700,color:"#2c5f8a",fontSize:fs,background:"#e8eef4",height:rh,overflow:"hidden"}}>
                  {toHHMM(empMins(emp.id))||"—"}
                </td>
              </tr>
            );
          })}
          {[
            {l:"仕込み",c:"#7a5000",bg:"#fef3c7",bd:"#d97706",fn:d=>dayStats(d).prepCnt||"—"},
            {l:"営業",  c:"#1e3a8a",bg:"#dbeafe",bd:"#2563eb",fn:d=>dayStats(d).bizCnt||"—"},
          ].map(row=>(
            <tr key={row.l} style={{background:row.bg}}>
              <td style={{padding:"2px 3px",border:`1px solid ${row.bd}`,fontWeight:700,color:row.c,fontSize:fs}}>{row.l}人数</td>
              {days.map(d=>(
                <td key={d} style={{textAlign:"center",border:`1px solid ${row.bd}`,fontSize:fs,fontWeight:700,color:row.c,background:row.bg}}>{row.fn(d)}</td>
              ))}
              <td style={{border:`1px solid ${row.bd}`,background:row.bg}}/>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


export default function ShiftManager(){
  const now=new Date();
  const [year,setYear]   =useState(now.getFullYear());
  const [month,setMonth] =useState(now.getMonth()+1);
  const [period,setPeriod]=useState("first");
  const [employees,setEmployees]=useState(INIT_EMPLOYEES);
  const [shifts,setShifts]  =useState({});
  const [budgets,setBudgets]=useState({});
  const [hourlyWage,setHourlyWage]=useState(1200); // 平均時給（デフォルト1200円）
  const [view,setView]      =useState("table");
  const [editCell,setEditCell]=useState(null);
  const [newEmp,setNewEmp]  =useState({name:"",empNo:"",role:"business"});
  const [nextId,setNextId]  =useState(200);
  const [daySort,setDaySort]=useState("date_asc");
  const [calDay,setCalDay]  =useState(null);
  const [savedMsg,setSavedMsg]=useState("");
  const [showSaveModal,setShowSaveModal]=useState(false);
  const [showLoadModal,setShowLoadModal]=useState(false);
  const [loadText,setLoadText]=useState("");
  const [clipboard,setClipboard]=useState(null);
  const [pastedCells,setPastedCells]=useState(new Set());
  const [copyMode,setCopyMode]=useState(false);
  const [showPdfModal,setShowPdfModal]=useState(false);
  const [syncStatus,setSyncStatus]=useState("接続中...");
  const tableRef=useRef(null);
  const isSaving=useRef(false);
  const isLoaded=useRef(false);
  const saveTimer=useRef(null);

  // Firebase：起動時に1回だけ読み込み
  useEffect(()=>{
    const dbRef=ref(db,"shiftData");
    const unsub=onValue(dbRef,(snapshot)=>{
      if(isLoaded.current) return; // 初回のみ読み込み
      const data=snapshot.val();
      if(data){
        if(data.employees) setEmployees(data.employees);
        if(data.shifts)    setShifts(data.shifts);
        if(data.budgets)   setBudgets(data.budgets);
        if(data.nextId)    setNextId(data.nextId);
        if(data.hourlyWage) setHourlyWage(data.hourlyWage);
      }
      isLoaded.current=true;
      setSyncStatus("同期済み ✓");
    },(error)=>{
      setSyncStatus("接続エラー");
    });
    return ()=>off(dbRef);
  },[]);

  // Firebaseに保存（デバウンス：3秒後）
  const saveToFirebase=(empData,shiftData,budgetData,nid)=>{
    if(!isLoaded.current) return; // 初回読込前は保存しない
    if(isSaving.current) return;
    clearTimeout(saveTimer.current);
    setSyncStatus("保存中...");
    saveTimer.current=setTimeout(()=>{
      isSaving.current=true;
      set(ref(db,"shiftData"),{
        employees:empData||employees,
        shifts:shiftData||shifts,
        budgets:budgetData||budgets,
        nextId:nid||nextId,
        hourlyWage:hourlyWage,
      }).then(()=>{
        setSyncStatus("同期済み ✓");
        setTimeout(()=>{ isSaving.current=false; },1000);
      }).catch(()=>{
        setSyncStatus("保存失敗 ✗");
        isSaving.current=false;
      });
    },3000);
  };

  // データ変更時に自動保存
  useEffect(()=>{
    if(!isLoaded.current) return;
    saveToFirebase(employees,shifts,budgets,nextId);
  },[employees,shifts,budgets,hourlyWage]);

  const daysInMonth=new Date(year,month,0).getDate();
  const allDays=Array.from({length:daysInMonth},(_,i)=>i+1);
  const days=period==="first"?allDays.slice(0,15):allDays.slice(15);

  // 表示順：通し → 営業 → 仕込み → 各グループ内はorder順
  const sortedEmployees=[...employees].sort((a,b)=>{
    const ro={"through":0,"business":1,"prep":2};
    const rd=(ro[a.role]??9)-(ro[b.role]??9);
    return rd!==0?rd:a.order-b.order;
  });

  const sk=(id,d)=>`${id}-${d}`;
  const gs=(id,d)=>shifts[sk(id,d)]||{};
  const ss=(id,d,f,v)=>setShifts(p=>({...p,[sk(id,d)]:{...(p[sk(id,d)]||{}),[f]:v}}));

  const resolved=(id,d)=>{
    const s=gs(id,d); if(s.type) return s.type;
    const e=employees.find(x=>x.id===id);
    if(e?.role==="through") return "through";
    return autoType(s.start,s.end);
  };

  const empMins=(id,dayList)=>(dayList||days).reduce((a,d)=>a+(calcWork(gs(id,d).start,gs(id,d).end)||0),0);
  const empMonthMins=id=>empMins(id,allDays);

  const dayStats=d=>{
    let totalMins=0,prepM=0,bizM=0;
    employees.forEach(e=>{
      const s=gs(e.id,d);
      totalMins+=(calcWork(s.start,s.end)||0);
      prepM+=calcPrep(s.start,s.end);
      bizM +=calcBiz(s.start,s.end);
    });
    // シフトが入力されているスタッフのみカウント（startあり or 手動でtype設定済み）
    const hasShift=e=>{
      const s=gs(e.id,d);
      return s.start||s.type; // 時間入力 or 手動区分設定のどちらか
    };
    const prepCnt=employees.filter(e=>{
      if(!hasShift(e)) return false;
      const t=resolved(e.id,d);
      return t==="through"||t==="prep";
    }).length;
    const bizCnt=employees.filter(e=>{
      if(!hasShift(e)) return false;
      const t=resolved(e.id,d);
      return t==="through"||t==="business";
    }).length;
    const budget=Number(budgets[d]||0);
    const jinsho=totalMins>0&&budget>0?Math.round(budget/(totalMins/60)):null;
    const shikomi=prepM>0&&budget>0?Math.round(budget/(prepM/60)):null;
    return{prepCnt,bizCnt,totalMins,prepM,bizM,budget,jinsho,shikomi};
  };

  // 月間集計
  const monthlyStats=()=>{
    let totalMins=0,prepM=0,bizM=0,totalBudget=0;
    allDays.forEach(d=>{
      const s=dayStats(d);
      totalMins+=s.totalMins; prepM+=s.prepM; bizM+=s.bizM; totalBudget+=s.budget;
    });
    const jinsho=totalMins>0&&totalBudget>0?Math.round(totalBudget/(totalMins/60)):null;
    const shikomi=prepM>0&&totalBudget>0?Math.round(totalBudget/(prepM/60)):null;
    return{totalMins,prepM,bizM,totalBudget,jinsho,shikomi};
  };

  /* ── PDF（行=スタッフ・列=日付、スタッフ数に応じ自動拡張） ── */
  const printPDF=()=>setShowPdfModal(true);
  const pdfHtml=()=>{
    const staffCount=sortedEmployees.length;
    const fs=staffCount<=8?9:staffCount<=12?8:staffCount<=16?7:6;
    const rh=staffCount<=8?44:staffCount<=12?38:staffCount<=16?34:28;
    // 区分ごとの背景色と罫線色
    const cellStyle=(t)=>{
      if(t==="off")       return {bg:"#e0e0e0",bd:"#999"};
      if(t==="through")   return {bg:"#d8b4fe",bd:"#7c3aed"};
      if(t==="prep")      return {bg:"#fde68a",bd:"#b45309"};
      if(t==="business")  return {bg:"#bfdbfe",bd:"#1d4ed8"};
      return {bg:"#ffffff",bd:"#aaaaaa"};
    };

    const hc=days.map(d=>{
      const dw_=dow(year,month,d);
      const c=isSun(year,month,d)?"#ffb3b3":isSat(year,month,d)?"#b3d4ff":"#b8d4f0";
      return `<th style="min-width:${fs*4}px;padding:2px 1px;text-align:center;background:#2c5f8a;border:2px solid #1a4a6a;color:#fff;font-size:${fs}px">${d}<br><span style="font-size:${fs-1}px;color:${c}">${dw_}</span></th>`;
    }).join("");

    const er=sortedEmployees.map(emp=>{
      const ri=ROLES[emp.role]||ROLES.business;
      const cells=days.map(d=>{
        const s=gs(emp.id,d),t=resolved(emp.id,d);
        const hasShift=s.start||s.type;
        const {bg,bd}=hasShift?cellStyle(t):{bg:"#ffffff",bd:"#cccccc"};
        const w=calcWork(s.start,s.end);
        return `<td style="padding:1px;text-align:center;border:2px solid ${bd};background:${bg};font-size:${fs-1}px;line-height:1.3;height:${rh}px">
          ${t==="off"?`<span style='color:#555;font-weight:700'>休</span>`
          :s.start?`<span style='color:#1e3a5f;font-weight:700'>${s.start}</span><br><span style='color:#1e3a5f;font-weight:700'>${s.end||""}</span><br><b style='color:#c05000'>${toHHMM(w)||""}</b>`
          :""}
        </td>`;
      }).join("");
      return `<tr>
        <td style="padding:2px 4px;border:2px solid #aaa;white-space:nowrap;border-left:4px solid ${ri.border};height:${rh}px;background:#f8fafc">
          <b style="font-size:${fs}px;color:#1e293b">${emp.name}</b><br>
          <span style="font-size:${fs-1}px;color:#666">${emp.empNo}</span>
        </td>
        ${cells}
        <td style="text-align:center;border:2px solid #aaa;font-weight:700;color:#2c5f8a;padding:2px;font-size:${fs}px;height:${rh}px;background:#e8eef4">${toHHMM(empMins(emp.id))||"—"}</td>
      </tr>`;
    }).join("");

    const sr=[
      {l:"仕込み人数",c:"#7a5000",bg:"#fef3c7",bd:"#d97706",fn:d=>dayStats(d).prepCnt||"—"},
      {l:"営業人数",  c:"#1e3a8a",bg:"#dbeafe",bd:"#2563eb",fn:d=>dayStats(d).bizCnt||"—"},
    ].map(r=>`<tr style="background:${r.bg}">
      <td style="padding:2px 4px;border:2px solid ${r.bd};font-weight:700;color:${r.c};font-size:${fs}px;white-space:nowrap">${r.l}</td>
      ${days.map(d=>`<td style="text-align:center;border:2px solid ${r.bd};font-size:${fs}px;font-weight:700;color:${r.c};padding:1px;background:${r.bg}">${r.fn(d)}</td>`).join("")}
      <td style="border:2px solid ${r.bd};background:${r.bg}"></td>
    </tr>`).join("");

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}
      html,body{margin:0;padding:4px;font-family:-apple-system,sans-serif;background:#fff}
      h3{color:#2c5f8a;font-size:11px;margin:0 0 4px;font-weight:700}
      table{border-collapse:collapse;width:100%}
      @media print{
        @page{size:A4 landscape;margin:5mm}
        h3{font-size:10px}
      }
    </style></head><body>
      <h3>${year}年${month}月 シフト表（${period==="first"?`前半 1〜15日`:`後半 16〜${daysInMonth}日`}）印刷時：横向き・用紙に合わせる</h3>
      <table>
        <thead><tr>
          <th style="padding:3px 4px;text-align:left;background:#2c5f8a;color:#fff;border:1px solid #4a7faa;font-size:${fs}px;white-space:nowrap">名前/番号</th>
          ${hc}
          <th style="padding:2px;text-align:center;background:#2c5f8a;color:#fff;border:1px solid #4a7faa;font-size:${fs}px">合計</th>
        </tr></thead>
        <tbody>${er}${sr}</tbody>
      </table>
    </body></html>`;
  };

  /* ── 保存（テキスト表示）／読込（テキスト貼付） ── */
  const saveJson =()=>setShowSaveModal(true);
  const doLoad=()=>{
    try{
      const d=JSON.parse(loadText);
      if(d.employees) setEmployees(d.employees);
      if(d.shifts)    setShifts(d.shifts);
      if(d.budgets)   setBudgets(d.budgets);
      if(d.nextId)    setNextId(d.nextId);
      setShowLoadModal(false); setLoadText("");
      setSavedMsg("loaded"); setTimeout(()=>setSavedMsg(""),2500);
    }catch{ alert("読み込み失敗：正しいデータを貼り付けてください"); }
  };
  const saveDataText=JSON.stringify({employees,shifts,budgets,nextId},null,2);

  /* ── Cell Modal ── */
  const CellModal=()=>{
    if(!editCell) return null;
    const {empId,day}=editCell;
    const emp=employees.find(e=>e.id===empId);
    const s=gs(empId,day);
    const [ds,setDs]=useState(s.start||"");
    const [de,setDe]=useState(s.end||"");
    const [sc,setSc]=useState(!!s.start);
    const [ec,setEc]=useState(!!s.end);
    const [pasteMode,setPasteMode]=useState(false); // テキスト入力モード（コピペ用）
    const previewMins=calcWork(sc?ds:s.start, ec?de:s.end);
    const raw=calcRaw(sc?ds:s.start, ec?de:s.end);
    const detType=autoType(sc?ds:s.start, ec?de:s.end);
    const manType=s.type||"";
    const ri=ROLES[manType||detType];
    const dw=dow(year,month,day);

    // 時間文字列を HH:MM 形式に正規化
    const normalizeTime=v=>{
      if(!v) return "";
      const clean=v.trim();
      if(/^\d{2}:\d{2}$/.test(clean)) return clean;
      if(/^\d{1,2}:\d{2}$/.test(clean)){
        const [h,m]=clean.split(":").map(Number);
        if(h<=30&&m<60) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
      }
      return v;
    };

    const confirmS=()=>{
      const v=normalizeTime(ds); if(!v) return;
      setDs(v); ss(empId,day,"start",v); setSc(true);
    };
    const confirmE=()=>{
      const v=normalizeTime(de); if(!v) return;
      setDe(v); ss(empId,day,"end",v); setEc(true);
    };

    return(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"flex-end",zIndex:200}}
        onClick={()=>setEditCell(null)}>
        <div style={{background:"#fff",width:"100%",maxWidth:480,margin:"0 auto",borderRadius:"20px 20px 0 0",padding:"0 0 32px",boxShadow:"0 -4px 32px rgba(0,0,0,0.18)"}}
          onClick={e=>e.stopPropagation()}>
          {/* header */}
          <div style={{background:"#2c5f8a",borderRadius:"20px 20px 0 0",padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{color:"#fff",fontWeight:700,fontSize:16}}>
                {emp?.name}
                <span style={{marginLeft:8,fontSize:11,padding:"2px 8px",borderRadius:6,
                  background:emp?.role==="prep"?"#f0ad00":emp?.role==="through"?"#8b5cf6":"#3b82f6",color:"#fff"}}>
                  {ROLES[emp?.role]?.label||""}
                </span>
              </div>
              <div style={{color:"#b8d4f0",fontSize:12}}>{month}月{day}日（{dw}）　{emp?.empNo}</div>
            </div>
            <button onClick={()=>setEditCell(null)} style={{background:"rgba(255,255,255,0.2)",border:"none",borderRadius:8,width:32,height:32,color:"#fff",fontSize:18,cursor:"pointer"}}>✕</button>
          </div>
          <div style={{padding:"16px 16px 0"}}>
            {/* コピペモード切替 */}
            <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
              <button onClick={()=>setPasteMode(p=>!p)}
                style={{fontSize:11,padding:"4px 10px",borderRadius:8,border:"1px solid #dce6f0",
                  background:pasteMode?"#e8f0ff":"#f5f5f5",color:pasteMode?"#2c5f8a":"#888",
                  cursor:"pointer",fontWeight:pasteMode?700:400}}>
                {pasteMode?"⌨️ テキスト入力中":"📋 コピペで入力"}
              </button>
            </div>
            {/* time inputs */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              {[
                {label:"開始時間",val:ds,setVal:v=>{setDs(v);setSc(false);},confirmed:sc,onConfirm:confirmS},
                {label:"終了時間",val:de,setVal:v=>{setDe(v);setEc(false);},confirmed:ec,onConfirm:confirmE},
              ].map(({label,val,setVal,confirmed,onConfirm})=>(
                <div key={label}>
                  <div style={{fontSize:11,color:"#666",marginBottom:5,fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
                    {label}
                    {confirmed&&<span style={{fontSize:10,background:"#d4edda",color:"#1a6a3a",borderRadius:4,padding:"1px 5px"}}>確定済</span>}
                  </div>
                  {pasteMode?(
                    // テキスト入力（コピペ可能）
                    <input type="text" value={val} placeholder="09:00"
                      onChange={e=>setVal(e.target.value)}
                      onBlur={e=>setVal(normalizeTime(e.target.value)||e.target.value)}
                      style={{width:"100%",padding:"12px 6px",boxSizing:"border-box",
                        border:`2px solid ${confirmed?"#22c55e":val?"#f0ad00":"#dce6f0"}`,
                        borderRadius:"10px 10px 0 0",fontSize:20,fontWeight:700,color:"#2c5f8a",
                        background:confirmed?"#f0fff4":"#f0f6ff",textAlign:"center",outline:"none"}}/>
                  ):(
                    // time picker（確実に保存できる）
                    <input type="time" value={val}
                      onChange={e=>setVal(e.target.value)}
                      style={{width:"100%",padding:"12px 6px",boxSizing:"border-box",
                        border:`2px solid ${confirmed?"#22c55e":val?"#f0ad00":"#dce6f0"}`,
                        borderRadius:"10px 10px 0 0",fontSize:20,fontWeight:700,color:"#2c5f8a",
                        background:confirmed?"#f0fff4":"#f0f6ff",textAlign:"center",outline:"none"}}/>
                  )}
                  <button onClick={onConfirm} disabled={!val||confirmed}
                    style={{width:"100%",padding:"8px 0",border:"none",borderRadius:"0 0 10px 10px",
                      cursor:val&&!confirmed?"pointer":"default",
                      background:confirmed?"#22c55e":val?"#2c5f8a":"#e0e8f0",
                      color:"#fff",fontWeight:700,fontSize:13,transition:"background 0.2s"}}>
                    {confirmed?"✓ 確定済み":"確定"}
                  </button>
                </div>
              ))}
            </div>
            {/* work hours */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              <div style={{background:previewMins?"#e8f4fd":"#f5f5f5",borderRadius:10,padding:"10px",textAlign:"center",border:"1px solid "+(previewMins?"#b8d9f5":"#e0e0e0")}}>
                <div style={{fontSize:10,color:"#888",marginBottom:2}}>勤務時間</div>
                <div style={{fontSize:22,fontWeight:800,color:previewMins?"#2c5f8a":"#ccc"}}>{previewMins?toHHMM(previewMins):"—"}</div>
                {raw&&raw>480&&<div style={{fontSize:9,color:"#e67e00",marginTop:2}}>※休憩1h控除済</div>}
              </div>
              <div style={{background:ri?ri.color:"#f5f5f5",borderRadius:10,padding:"10px",textAlign:"center",border:"1px solid "+(ri?ri.border:"#e0e0e0")}}>
                <div style={{fontSize:10,color:"#888",marginBottom:2}}>自動判定区分</div>
                <div style={{fontSize:15,fontWeight:800,color:ri?ri.text:"#ccc"}}>{ri?ri.label:"—"}</div>
                <div style={{fontSize:9,color:"#aaa",marginTop:1}}>{detType==="prep"?"〜15:59":detType==="business"?"16:00〜":""}</div>
              </div>
            </div>
            {/* manual type */}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:"#666",marginBottom:6,fontWeight:600}}>
                区分を手動変更（任意）
                {manType&&<span onClick={()=>ss(empId,day,"type","")} style={{marginLeft:8,fontSize:10,color:"#e74c3c",cursor:"pointer",textDecoration:"underline"}}>自動に戻す</span>}
              </div>
              <div style={{display:"flex",gap:5}}>
                {["prep","business","through","off"].map(key=>{
                  const info=key==="off"?{label:"休み",color:"#f0f0f0",border:"#aaa",text:"#888"}:ROLES[key];
                  const active=manType===key;
                  return(
                    <button key={key} onClick={()=>ss(empId,day,"type",active?"":key)}
                      style={{flex:1,padding:"9px 2px",borderRadius:9,cursor:"pointer",
                        border:"2px solid "+(active?info.border:"#ddd"),
                        background:active?info.color:"#fafafa",color:active?info.text:"#aaa",
                        fontWeight:active?700:400,fontSize:11,transition:"all 0.15s"}}>
                      {info.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* action */}
            <div style={{display:"flex",gap:6,marginBottom:6}}>
              <button onClick={()=>{
                const s=gs(empId,day);
                if(s.start||s.end){
                  setClipboard({start:s.start||"",end:s.end||"",type:s.type||""});
                  setPastedCells(new Set());
                  setEditCell(null);
                }
              }}
                style={{flex:1,padding:"11px",borderRadius:10,border:"1px solid #b8d4f0",background:"#f0f6ff",color:"#2c5f8a",fontWeight:600,cursor:"pointer",fontSize:12}}>
                📋 コピー
              </button>
              <button onClick={()=>{setShifts(p=>{const n={...p};delete n[sk(empId,day)];return n;});setEditCell(null);}}
                style={{flex:1,padding:"11px",borderRadius:10,border:"1px solid #ffcccc",background:"#fff5f5",color:"#c0392b",fontWeight:600,cursor:"pointer",fontSize:12}}>クリア</button>
            </div>
            <button onClick={()=>{
              const sv=normalizeTime(ds), ev=normalizeTime(de);
              if(sv) ss(empId,day,"start",sv);
              if(ev) ss(empId,day,"end",ev);
              setEditCell(null);
            }}
              style={{width:"100%",padding:"13px",borderRadius:10,border:"none",background:"#2c5f8a",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:14}}>保存して閉じる</button>
          </div>
        </div>
      </div>
    );
  };

  /* ── Day Summary Modal（カレンダータップ） ── */
  const DaySummaryModal=({day,onClose})=>{
    if(!day) return null;
    const {prepCnt,bizCnt,totalMins,prepM,bizM,budget,jinsho,shikomi}=dayStats(day);
    const dw=dow(year,month,day);
    return(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"flex-end",zIndex:300}}
        onClick={onClose}>
        <div style={{background:"#fff",width:"100%",maxWidth:480,margin:"0 auto",borderRadius:"20px 20px 0 0",padding:"0 0 32px",maxHeight:"85vh",overflowY:"auto"}}
          onClick={e=>e.stopPropagation()}>
          <div style={{background:isSun(year,month,day)?"#c0392b":isSat(year,month,day)?"#2980b9":"#2c5f8a",
            borderRadius:"20px 20px 0 0",padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{color:"#fff",fontWeight:700,fontSize:18}}>{month}月{day}日（{dw}）</div>
            <button onClick={onClose} style={{background:"rgba(255,255,255,0.2)",border:"none",borderRadius:8,width:32,height:32,color:"#fff",fontSize:18,cursor:"pointer"}}>✕</button>
          </div>
          <div style={{padding:"16px"}}>
            {/* 人数 */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
              {[{l:"🟡 仕込み人数",v:`${prepCnt}名`,c:"#a06000"},{l:"🔵 営業人数",v:`${bizCnt}名`,c:"#1a4a8a"}].map(x=>(
                <div key={x.l} style={{background:"#f8fafc",borderRadius:10,padding:"10px",textAlign:"center"}}>
                  <div style={{fontSize:11,color:"#888"}}>{x.l}</div>
                  <div style={{fontSize:22,fontWeight:800,color:x.c}}>{x.v}</div>
                </div>
              ))}
            </div>
            {/* 時間 */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
              {[
                {l:"仕込み〜15:59",v:toHHMM(prepM)||"—",c:"#7a5000",bg:"#fffbf0",bd:"#f0d080"},
                {l:"営業 16:00〜",v:toHHMM(bizM)||"—",c:"#1a4a8a",bg:"#f0f6ff",bd:"#90c0f0"},
                {l:"総労働時間",v:toHHMM(totalMins)||"—",c:"#2c5f8a",bg:"#f0f6ff",bd:"#90c0f0"},
              ].map(x=>(
                <div key={x.l} style={{background:x.bg,borderRadius:10,padding:"8px 6px",textAlign:"center",border:`1px solid ${x.bd}`}}>
                  <div style={{fontSize:9,color:x.c,marginBottom:2}}>{x.l}</div>
                  <div style={{fontSize:16,fontWeight:800,color:x.c}}>{x.v}</div>
                </div>
              ))}
            </div>
            {/* 売上 */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
              {[
                {l:"売上予算",v:budget?`¥${Number(budget).toLocaleString()}`:"—",c:"#6a0dad"},
                {l:"人時売上高",v:jinsho?`¥${jinsho>=1000?(jinsho/1000).toFixed(1)+"k":jinsho}`:"—",c:"#1a6a3a"},
                {l:"仕込み生産性",v:shikomi?`¥${shikomi>=1000?(shikomi/1000).toFixed(1)+"k":shikomi}`:"—",c:"#a06000"},
              ].map(x=>(
                <div key={x.l} style={{background:"#f8fafc",borderRadius:10,padding:"8px 6px",textAlign:"center"}}>
                  <div style={{fontSize:9,color:"#888",marginBottom:2}}>{x.l}</div>
                  <div style={{fontSize:14,fontWeight:800,color:x.c}}>{x.v}</div>
                </div>
              ))}
            </div>
            {/* スタッフ別 */}
            <div style={{fontSize:12,fontWeight:700,color:"#2c5f8a",marginBottom:8}}>スタッフ別シフト</div>
            {sortedEmployees.map(emp=>{
              const s=gs(emp.id,day);
              const t=resolved(emp.id,day);
              const ri=ROLES[t]||ROLES[emp.role]||ROLES.business;
              const w=calcWork(s.start,s.end);
              if(!s.start&&t!=="off") return null;
              return(
                <div key={emp.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                  padding:"8px 10px",borderRadius:8,marginBottom:4,background:ri.color,border:`1px solid ${ri.border}`}}>
                  <div>
                    <span style={{fontWeight:700,fontSize:13,color:ri.text}}>{emp.name}</span>
                    <span style={{fontSize:10,color:"#888",marginLeft:6}}>{emp.empNo}</span>
                  </div>
                  <div style={{textAlign:"right"}}>
                    {t==="off"
                      ?<span style={{color:"#888",fontWeight:700}}>休</span>
                      :<><span style={{fontSize:12,color:ri.text,fontWeight:600}}>{s.start}〜{s.end}</span>
                        {w&&<span style={{marginLeft:6,fontSize:11,color:"#e67e00",fontWeight:700}}>{toHHMM(w)}</span>}</>
                    }
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  /* ── ShiftCell ── */
  const ShiftCell=({emp,d})=>{
    const s=gs(emp.id,d);
    const t=resolved(emp.id,d);
    const w=calcWork(s.start,s.end);
    const ti=t==="off"?{color:"#f0f0f0",border:"#aaa"}:ROLES[t]||null;
    const sun=isSun(year,month,d), sat=isSat(year,month,d);
    const isTarget=!!clipboard;
    const pasted=pastedCells.has(`${emp.id}-${d}`);

    const handleClick=()=>{
      if(isTarget){
        ss(emp.id,d,"start",clipboard.start||"");
        ss(emp.id,d,"end",  clipboard.end||"");
        if(clipboard.type) ss(emp.id,d,"type",clipboard.type);
        // 貼付済みセルとしてマーク
        setPastedCells(prev=>new Set([...prev,`${emp.id}-${d}`]));
      } else {
        setEditCell({empId:emp.id,day:d});
      }
    };

    // 貼付済みの場合は緑背景＋OK表示
    const cellBg=pasted?"#bbf7d0":isTarget?(s.start?"#fef9c3":"rgba(22,163,74,0.06)"):(ti?ti.color:(s.start?"#eef6ff":"transparent"));
    const cellBorder=pasted?"#16a34a":isTarget?(s.start?"#ca8a04":"#16a34a"):(ti?ti.border:"#e0e8f0");

    return(
      <td style={{padding:"2px",borderLeft:"1px solid #e8eef4",borderBottom:"1px solid #e8eef4",
        background:sun?"#fff8f8":sat?"#f8f8ff":"inherit",verticalAlign:"middle"}}>
        <button onClick={handleClick}
          style={{width:"100%",minHeight:52,borderRadius:6,
            border:`2px solid ${cellBorder}`,
            background:cellBg,
            cursor:"pointer",padding:"3px 2px",
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:1}}>
          {pasted&&<span style={{fontSize:11,color:"#15803d",fontWeight:800}}>OK</span>}
          {!pasted&&isTarget&&<span style={{fontSize:10,color:"#16a34a",fontWeight:800}}>貼付</span>}
          {!pasted&&!isTarget&&t==="off"&&<span style={{fontSize:12,color:"#aaa",fontWeight:700}}>休</span>}
          {!pasted&&!isTarget&&s.start&&(<>
            <span style={{fontSize:10,color:"#2c5f8a",fontWeight:600}}>{s.start}</span>
            <span style={{fontSize:8,color:"#aaa"}}>↓</span>
            <span style={{fontSize:10,color:"#2c5f8a",fontWeight:600}}>{s.end}</span>
            {w&&<span style={{fontSize:10,color:"#e67e00",fontWeight:700}}>{toHHMM(w)}</span>}
          </>)}
          {!pasted&&!isTarget&&!s.start&&t!=="off"&&<span style={{fontSize:18,color:"#cdd8e3"}}>+</span>}
        </button>
      </td>
    );
  };

  /* ── ShiftRow ── */
  const ShiftRow=({emp})=>{
    const ri=ROLES[emp.role]||ROLES.business;
    const totalH=toHHMM(empMins(emp.id))||"—";
    return(
      <tr>
        <td style={{padding:"6px",position:"sticky",left:0,zIndex:5,background:"#fff",
          borderRight:"2px solid #dce6f0",borderBottom:"1px solid #e8eef4"}}>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{width:7,height:7,borderRadius:"50%",background:ri.border,flexShrink:0}}/>
            <div>
              <div style={{fontWeight:800,fontSize:14,color:"#1e293b",whiteSpace:"nowrap"}}>{emp.name}</div>
              <div style={{fontSize:11,color:"#64748b",fontWeight:500}}>{emp.empNo}</div>
            </div>
          </div>
        </td>
        {days.map(d=>(
          <ShiftCell key={d} emp={emp} d={d}/>
        ))}
        <td style={{textAlign:"center",borderLeft:"2px solid #dce6f0",borderBottom:"1px solid #e8eef4",
          fontWeight:700,fontSize:12,color:"#2c5f8a",padding:"4px",whiteSpace:"nowrap"}}>
          {totalH}
        </td>
      </tr>
    );
  };


  /* ── カレンダービュー ── */
  const CalendarView=()=>{
    const firstDow=new Date(year,month-1,1).getDay();
    const cells=[...Array(firstDow).fill(null),...allDays];
    while(cells.length%7!==0) cells.push(null);
    const ms=monthlyStats();
    return(
      <div style={{padding:"12px 12px 100px"}}>
        {/* 月間集計 */}
        <div style={{background:"#2c5f8a",borderRadius:14,padding:"14px",marginBottom:14,color:"#fff"}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:10}}>📊 {year}年{month}月 月間集計</div>

          {/* 平均時給入力 */}
          <div style={{background:"rgba(255,255,255,0.15)",borderRadius:10,padding:"10px 14px",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{color:"#b8d4f0",fontSize:11,fontWeight:700}}>平均時給</div>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{color:"#fff",fontSize:13}}>¥</span>
              <input type="number" value={hourlyWage}
                onChange={e=>setHourlyWage(Number(e.target.value))}
                style={{width:80,padding:"6px 8px",borderRadius:8,border:"none",
                  background:"rgba(255,255,255,0.2)",color:"#fff",fontSize:16,fontWeight:700,textAlign:"right"}}/>
              <span style={{color:"#b8d4f0",fontSize:11}}>円/h</span>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
            {[
              {l:"総労働時間",v:toHHMM(ms.totalMins)||"—"},
              {l:"総売上予算",v:ms.totalBudget?`¥${ms.totalBudget.toLocaleString()}`:"—"},
            ].map(x=>(
              <div key={x.l} style={{background:"rgba(255,255,255,0.15)",borderRadius:10,padding:"10px",textAlign:"center"}}>
                <div style={{fontSize:10,color:"#b8d4f0"}}>{x.l}</div>
                <div style={{fontSize:18,fontWeight:800}}>{x.v}</div>
              </div>
            ))}
          </div>

          {/* 人件費率 */}
          {(()=>{
            const totalHours=ms.totalMins/60;
            const laborCost=totalHours*hourlyWage;
            const laborRate=ms.totalBudget>0&&laborCost>0?((laborCost/ms.totalBudget)*100).toFixed(1):null;
            const rateColor=laborRate
              ? Number(laborRate)<=25?"#a0ffc0":Number(laborRate)<=30?"#ffe5a0":"#ffa0a0"
              : "#b8d4f0";
            return(
              <div style={{background:"rgba(255,255,255,0.15)",borderRadius:10,padding:"10px 14px",marginBottom:8,
                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:10,color:"#b8d4f0",marginBottom:2}}>人件費率</div>
                  <div style={{fontSize:11,color:"#b8d4f0"}}>
                    ¥{Math.round(laborCost).toLocaleString()} ÷ ¥{ms.totalBudget.toLocaleString()}
                  </div>
                </div>
                <div style={{fontSize:28,fontWeight:900,color:rateColor}}>
                  {laborRate ? `${laborRate}%` : "—"}
                </div>
              </div>
            );
          })()}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
            {[
              {l:"仕込み時間",v:toHHMM(ms.prepM)||"—",c:"#ffe5a0"},
              {l:"人時売上高",v:ms.jinsho?`¥${ms.jinsho>=1000?(ms.jinsho/1000).toFixed(1)+"k":ms.jinsho}`:"—",c:"#a0ffc0"},
              {l:"仕込み生産性",v:ms.shikomi?`¥${ms.shikomi>=1000?(ms.shikomi/1000).toFixed(1)+"k":ms.shikomi}`:"—",c:"#ffc8a0"},
            ].map(x=>(
              <div key={x.l} style={{background:"rgba(255,255,255,0.1)",borderRadius:8,padding:"8px 4px",textAlign:"center"}}>
                <div style={{fontSize:9,color:"#b8d4f0",marginBottom:2}}>{x.l}</div>
                <div style={{fontSize:13,fontWeight:700,color:x.c}}>{x.v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* カレンダーソート */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{fontWeight:700,fontSize:13,color:"#2c5f8a"}}>📅 日別カレンダー <span style={{fontSize:10,color:"#888",fontWeight:400}}>日付タップでサマリー</span></div>
          <select value={daySort} onChange={e=>setDaySort(e.target.value)}
            style={{fontSize:11,padding:"4px 6px",borderRadius:8,border:"1px solid #dce6f0",background:"#fff",color:"#2c5f8a",fontWeight:600}}>
            <option value="date_asc">日付順▲</option>
            <option value="date_desc">日付順▼</option>
            <option value="budget_desc">予算 高い順</option>
            <option value="budget_asc">予算 低い順</option>
            <option value="jinsho_desc">人時売上 高い順</option>
            <option value="jinsho_asc">人時売上 低い順</option>
            <option value="shikomi_desc">仕込み生産性 高い順</option>
            <option value="shikomi_asc">仕込み生産性 低い順</option>
          </select>
        </div>

        {daySort==="date_asc"?(
          /* カレンダーグリッド表示 */
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:4}}>
              {WEEKDAYS.map((w,i)=>(
                <div key={w} style={{textAlign:"center",fontSize:11,fontWeight:700,padding:"4px 0",
                  color:i===0?"#e74c3c":i===6?"#3b82f6":"#666"}}>{w}</div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
              {cells.map((d,i)=>{
                if(!d) return <div key={`empty-${i}`}/>;
                const {prepCnt,bizCnt,budget,jinsho}=dayStats(d);
                const sun=isSun(year,month,d), sat=isSat(year,month,d);
                const hasData=budget>0||prepCnt>0||bizCnt>0;
                return(
                  <button key={d} onClick={()=>setCalDay(d)}
                    style={{borderRadius:10,border:`1px solid ${sun?"#fccaca":sat?"#bdd7f7":"#dce6f0"}`,
                      background:sun?"#fff5f5":sat?"#f5f8ff":"#fff",
                      padding:"6px 2px",cursor:"pointer",textAlign:"center",
                      boxShadow:hasData?"0 1px 4px rgba(0,0,0,0.08)":"none",
                      minHeight:62}}>
                    <div style={{fontSize:13,fontWeight:700,color:sun?"#e74c3c":sat?"#3b82f6":"#2c3e50",marginBottom:2}}>{d}</div>
                    {hasData&&<>
                      <div style={{fontSize:8,color:"#a06000"}}>仕{prepCnt}営{bizCnt}</div>
                      {budget>0&&<div style={{fontSize:8,color:"#6a0dad",marginTop:1}}>¥{budget>=10000?(budget/10000).toFixed(1)+"万":budget.toLocaleString()}</div>}
                      {jinsho&&<div style={{fontSize:8,color:"#1a6a3a"}}>¥{jinsho>=1000?(jinsho/1000).toFixed(1)+"k":jinsho}</div>}
                    </>}
                  </button>
                );
              })}
            </div>
          </div>
        ):(
          /* ソート済みリスト表示 */
          <div>
            {[...allDays]
              .sort((a,b)=>{
                const sa=dayStats(a),sb=dayStats(b);
                switch(daySort){
                  case "date_desc":    return b-a;
                  case "budget_desc":  return sb.budget-sa.budget;
                  case "budget_asc":   return sa.budget-sb.budget;
                  case "jinsho_desc":  return (sb.jinsho||0)-(sa.jinsho||0);
                  case "jinsho_asc":   return (sa.jinsho||0)-(sb.jinsho||0);
                  case "shikomi_desc": return (sb.shikomi||0)-(sa.shikomi||0);
                  case "shikomi_asc":  return (sa.shikomi||0)-(sb.shikomi||0);
                  default: return a-b;
                }
              })
              .map(d=>{
                const {prepCnt,bizCnt,totalMins,prepM,bizM,budget,jinsho,shikomi}=dayStats(d);
                const dw=dow(year,month,d);
                const sun=isSun(year,month,d),sat=isSat(year,month,d);
                return(
                  <button key={d} onClick={()=>setCalDay(d)}
                    style={{width:"100%",background:"#fff",borderRadius:12,padding:"12px 14px",marginBottom:6,
                      boxShadow:"0 1px 4px rgba(0,0,0,0.06)",cursor:"pointer",textAlign:"left",
                      border:"none",borderLeft:`4px solid ${sun?"#e74c3c":sat?"#3498db":"#2c5f8a"}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                      <span style={{fontWeight:700,fontSize:14,color:sun?"#e74c3c":sat?"#3498db":"#2c3e50"}}>
                        {month}月{d}日（{dw}）
                      </span>
                      <span style={{fontSize:11}}>
                        <span style={{color:"#a06000",fontWeight:700}}>仕{prepCnt}</span>　
                        <span style={{color:"#1a4a8a",fontWeight:700}}>営{bizCnt}</span>
                      </span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4}}>
                      {[
                        {l:"総労働",v:toHHMM(totalMins)||"—",c:"#2c5f8a"},
                        {l:"売上予算",v:budget?`¥${budget>=10000?(budget/10000).toFixed(1)+"万":budget}`:"—",c:"#6a0dad"},
                        {l:"人時売上",v:jinsho?`¥${jinsho>=1000?(jinsho/1000).toFixed(1)+"k":jinsho}`:"—",c:"#1a6a3a"},
                        {l:"仕込み生産性",v:shikomi?`¥${shikomi>=1000?(shikomi/1000).toFixed(1)+"k":shikomi}`:"—",c:"#a06000"},
                      ].map(x=>(
                        <div key={x.l} style={{textAlign:"center",background:"#f8fafc",borderRadius:6,padding:"4px 2px"}}>
                          <div style={{fontSize:8,color:"#888"}}>{x.l}</div>
                          <div style={{fontSize:11,fontWeight:700,color:x.c}}>{x.v}</div>
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })
            }
          </div>
        )}
        <DaySummaryModal day={calDay} onClose={()=>setCalDay(null)}/>
      </div>
    );
  };

  /* ── Render ── */
  return(
    <div style={{background:"#f0f4f8",minHeight:"100vh",fontFamily:"'Noto Sans JP','Hiragino Sans',sans-serif",maxWidth:480,margin:"0 auto"}}>

      {/* Header */}
      <div style={{background:"#2c5f8a",padding:"12px 12px 0",position:"sticky",top:0,zIndex:100,boxShadow:"0 2px 8px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{background:"rgba(255,255,255,0.15)",borderRadius:8,padding:"2px 8px",display:"flex",gap:4}}>
              <select value={year} onChange={e=>setYear(Number(e.target.value))}
                style={{background:"transparent",border:"none",color:"#fff",fontSize:14,fontWeight:700}}>
                {[2024,2025,2026,2027].map(y=><option key={y} style={{color:"#000"}}>{y}</option>)}
              </select>
              <select value={month} onChange={e=>setMonth(Number(e.target.value))}
                style={{background:"transparent",border:"none",color:"#fff",fontSize:14,fontWeight:700}}>
                {Array.from({length:12},(_,i)=><option key={i+1} value={i+1} style={{color:"#000"}}>{i+1}月</option>)}
              </select>
            </div>
          </div>
          <div style={{display:"flex",gap:4}}>
            <div style={{height:34,padding:"0 10px",borderRadius:8,
              background:"rgba(255,255,255,0.15)",
              color: syncStatus.includes("✓")?"#a0ffc0":syncStatus.includes("エラー")||syncStatus.includes("失敗")?"#fca5a5":"#fff",
              fontWeight:700,fontSize:11,display:"flex",alignItems:"center",gap:4,whiteSpace:"nowrap"}}>
              {syncStatus.includes("✓")?"☁️":"⏳"} {syncStatus}
            </div>
            {view==="table"&&(
              <button onClick={printPDF}
                style={{height:34,padding:"0 8px",borderRadius:8,border:"none",cursor:"pointer",
                  background:"rgba(255,255,255,0.2)",color:"#fff",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>
                🖨 PDF
              </button>
            )}
            {[["table","📋"],["employees","👥"],["stats","📊"]].map(([v,icon])=>(
              <button key={v} onClick={()=>setView(v)}
                style={{width:34,height:34,borderRadius:8,border:"none",cursor:"pointer",
                  background:view===v?"#fff":"rgba(255,255,255,0.15)",fontSize:15}}>
                {icon}
              </button>
            ))}
          </div>
        </div>
        {view==="table"&&(
          <div style={{display:"flex"}}>
            {[["first",`前半　1〜15日`],["second",`後半　16〜${daysInMonth}日`]].map(([k,label])=>(
              <button key={k} onClick={()=>setPeriod(k)}
                style={{flex:1,padding:"9px 0",border:"none",cursor:"pointer",
                  background:period===k?"#fff":"rgba(255,255,255,0.1)",
                  color:period===k?"#2c5f8a":"#b8d4f0",fontWeight:700,fontSize:12,
                  borderRadius:period===k?"8px 8px 0 0":"0",transition:"all 0.15s"}}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* TABLE */}
      {view==="table"&&(
        <div ref={tableRef} style={{overflowX:"auto",background:"#fff",paddingBottom:80,touchAction:"pan-x pan-y"}}>
          <table style={{borderCollapse:"collapse",width:"100%",fontSize:11}}>
            <thead>
              <tr style={{background:"#2c5f8a"}}>
                <th style={{padding:"8px 6px",textAlign:"left",color:"#fff",fontSize:11,
                  position:"sticky",left:0,background:"#2c5f8a",zIndex:10,
                  borderRight:"2px solid #4a7faa",minWidth:86,width:86}}>名前/番号</th>
                {days.map(d=>{
                  const sun=isSun(year,month,d),sat=isSat(year,month,d);
                  return(
                    <th key={d} style={{padding:"4px 2px",textAlign:"center",color:"#fff",
                      minWidth:50,borderLeft:"1px solid rgba(255,255,255,0.15)"}}>
                      <div style={{fontSize:12,fontWeight:700}}>{d}</div>
                      <div style={{fontSize:10,fontWeight:600,color:sun?"#ffb3b3":sat?"#b3d4ff":"#b8d4f0"}}>{dow(year,month,d)}</div>
                    </th>
                  );
                })}
                <th style={{padding:"6px 4px",textAlign:"center",color:"#fff",minWidth:48,borderLeft:"2px solid rgba(255,255,255,0.3)"}}>合計</th>
              </tr>
            </thead>
            <tbody>
              {/* 通し */}
              {sortedEmployees.filter(e=>e.role==="through").length>0&&<>
                <tr><td colSpan={days.length+2} style={{background:"#4c1d95",padding:"3px 8px"}}>
                  <span style={{color:"#e9d5ff",fontSize:10,fontWeight:700}}>🟣 通しスタッフ</span>
                </td></tr>
                {sortedEmployees.filter(e=>e.role==="through").map(emp=><ShiftRow key={emp.id} emp={emp}/>)}
              </>}
              {/* 営業 */}
              {sortedEmployees.filter(e=>e.role==="business").length>0&&<>
                <tr><td colSpan={days.length+2} style={{background:"#1a4a8a",padding:"3px 8px"}}>
                  <span style={{color:"#b3d4ff",fontSize:10,fontWeight:700}}>🔵 営業スタッフ</span>
                </td></tr>
                {sortedEmployees.filter(e=>e.role==="business").map(emp=><ShiftRow key={emp.id} emp={emp}/>)}
              </>}
              {/* 仕込み */}
              {sortedEmployees.filter(e=>e.role==="prep").length>0&&<>
                <tr><td colSpan={days.length+2} style={{background:"#7a5000",padding:"3px 8px"}}>
                  <span style={{color:"#ffe5a0",fontSize:10,fontWeight:700}}>🟡 仕込みスタッフ</span>
                </td></tr>
                {sortedEmployees.filter(e=>e.role==="prep").map(emp=><ShiftRow key={emp.id} emp={emp}/>)}
              </>}

              {/* 集計行 */}
              {[
                {label:"仕込み人数",bg:"#fffbf0",color:"#a06000",fn:d=>dayStats(d).prepCnt||"—"},
                {label:"営業人数",  bg:"#f0f6ff",color:"#1a4a8a",fn:d=>dayStats(d).bizCnt||"—"},
              ].map(row=>(
                <tr key={row.label} style={{background:row.bg}}>
                  <td style={{padding:"5px 6px",position:"sticky",left:0,background:row.bg,
                    borderRight:"2px solid #dce6f0",borderTop:"1px solid #dce6f0",
                    fontSize:10,fontWeight:700,color:row.color,whiteSpace:"nowrap"}}>{row.label}</td>
                  {days.map(d=><td key={d} style={{textAlign:"center",fontSize:12,fontWeight:700,color:row.color,
                    borderLeft:"1px solid #e8eef4",borderTop:"1px solid #dce6f0",padding:"5px 2px"}}>{row.fn(d)}</td>)}
                  <td style={{borderLeft:"2px solid #dce6f0",borderTop:"1px solid #dce6f0"}}/>
                </tr>
              ))}
              {/* 売上予算 */}
              <tr style={{background:"#f8f0ff"}}>
                <td style={{padding:"5px 6px",position:"sticky",left:0,background:"#f8f0ff",
                  borderRight:"2px solid #dce6f0",borderTop:"1px solid #dce6f0",
                  fontSize:10,fontWeight:700,color:"#6a0dad",whiteSpace:"nowrap"}}>売上予算</td>
                {days.map(d=>(
                  <td key={d} style={{padding:"2px",borderLeft:"1px solid #e8eef4",borderTop:"1px solid #dce6f0"}}>
                    <input type="number" value={budgets[d]||""} onChange={e=>setBudgets(p=>({...p,[d]:e.target.value}))}
                      placeholder="0" style={{width:"100%",background:"transparent",border:"none",
                        color:"#6a0dad",fontSize:10,textAlign:"center",fontWeight:600,padding:"4px 0",boxSizing:"border-box"}}/>
                  </td>
                ))}
                <td style={{borderLeft:"2px solid #dce6f0",borderTop:"1px solid #dce6f0"}}/>
              </tr>
              {/* 人時売上高 */}
              <tr style={{background:"#f0fff4"}}>
                <td style={{padding:"5px 6px",position:"sticky",left:0,background:"#f0fff4",
                  borderRight:"2px solid #dce6f0",borderTop:"1px solid #dce6f0",
                  fontSize:10,fontWeight:700,color:"#1a6a3a",whiteSpace:"nowrap"}}>人時売上高</td>
                {days.map(d=>{const j=dayStats(d).jinsho; return(
                  <td key={d} style={{textAlign:"center",fontSize:9,fontWeight:700,color:"#1a6a3a",
                    borderLeft:"1px solid #e8eef4",borderTop:"1px solid #dce6f0",padding:"5px 2px"}}>
                    {j?`¥${j>=1000?(j/1000).toFixed(1)+"k":j}`:"—"}
                  </td>);})}
                <td style={{borderLeft:"2px solid #dce6f0",borderTop:"1px solid #dce6f0"}}/>
              </tr>
              {/* 仕込み生産性 */}
              <tr style={{background:"#fffbf0"}}>
                <td style={{padding:"5px 6px",position:"sticky",left:0,background:"#fffbf0",
                  borderRight:"2px solid #dce6f0",borderTop:"1px solid #dce6f0",
                  fontSize:10,fontWeight:700,color:"#a06000",whiteSpace:"nowrap"}}>仕込み生産性</td>
                {days.map(d=>{const s=dayStats(d).shikomi; return(
                  <td key={d} style={{textAlign:"center",fontSize:9,fontWeight:700,color:"#a06000",
                    borderLeft:"1px solid #e8eef4",borderTop:"1px solid #dce6f0",padding:"5px 2px"}}>
                    {s?`¥${s>=1000?(s/1000).toFixed(1)+"k":s}`:"—"}
                  </td>);})}
                <td style={{borderLeft:"2px solid #dce6f0",borderTop:"1px solid #dce6f0"}}/>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* EMPLOYEES */}
      {view==="employees"&&(
        <div style={{padding:"14px 14px 100px"}}>
          <div style={{fontWeight:700,fontSize:16,color:"#2c5f8a",marginBottom:14}}>スタッフ管理</div>
          <div style={{background:"#fff",borderRadius:14,padding:14,marginBottom:14,boxShadow:"0 1px 6px rgba(0,0,0,0.07)"}}>
            <div style={{fontSize:12,color:"#888",marginBottom:8,fontWeight:600}}>新規スタッフ追加</div>
            <input placeholder="名前" value={newEmp.name} onChange={e=>setNewEmp(p=>({...p,name:e.target.value}))}
              style={{width:"100%",padding:"11px 12px",border:"1.5px solid #dce6f0",borderRadius:10,fontSize:15,marginBottom:7,boxSizing:"border-box"}}/>
            <input placeholder="社員番号" value={newEmp.empNo} onChange={e=>setNewEmp(p=>({...p,empNo:e.target.value}))}
              style={{width:"100%",padding:"11px 12px",border:"1.5px solid #dce6f0",borderRadius:10,fontSize:15,marginBottom:10,boxSizing:"border-box"}}/>
            <div style={{display:"flex",gap:6,marginBottom:12}}>
              {[["through","🟣 通し","#f5f0ff","#8b5cf6","#4c1d95"],["business","🔵 営業","#f0f6ff","#3b82f6","#1a4a8a"],["prep","🟡 仕込み","#fffbf0","#f0ad00","#7a5000"]].map(([k,l,bg,bd,tx])=>(
                <button key={k} onClick={()=>setNewEmp(p=>({...p,role:k}))}
                  style={{flex:1,padding:"10px 0",borderRadius:10,border:`2px solid ${newEmp.role===k?bd:"#ddd"}`,
                    background:newEmp.role===k?bg:"#fafafa",color:newEmp.role===k?tx:"#aaa",
                    fontWeight:newEmp.role===k?700:400,fontSize:12,cursor:"pointer",transition:"all 0.15s"}}>
                  {l}
                </button>
              ))}
            </div>
            <button onClick={()=>{
              if(!newEmp.name.trim()) return;
              const maxOrder=employees.length>0?Math.max(...employees.map(e=>e.order||0)):0;
              setEmployees(p=>[...p,{id:nextId,name:newEmp.name,empNo:newEmp.empNo,role:newEmp.role,order:maxOrder+1}]);
              setNextId(n=>n+1); setNewEmp({name:"",empNo:"",role:"business"});
            }} style={{width:"100%",padding:12,borderRadius:10,border:"none",background:"#2c5f8a",color:"#fff",fontWeight:700,fontSize:15,cursor:"pointer"}}>
              ＋ 追加する
            </button>
          </div>
          <StaffList employees={employees} setEmployees={setEmployees}/>
        </div>
      )}

      {/* STATS */}
      {view==="stats"&&<CalendarView/>}

      {/* Bottom nav */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
        width:"100%",maxWidth:480,background:"#fff",borderTop:"1px solid #dce6f0",
        padding:"8px 0 18px",display:"flex",justifyContent:"space-around",
        boxShadow:"0 -2px 12px rgba(0,0,0,0.08)"}}>
        {[["table","📋","シフト表"],["employees","👥","スタッフ"],["stats","📊","集計"]].map(([v,icon,label])=>(
          <button key={v} onClick={()=>setView(v)}
            style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,
              background:"none",border:"none",cursor:"pointer",
              color:view===v?"#2c5f8a":"#aaa",fontWeight:view===v?700:400,fontSize:10,padding:"4px 16px",
              borderTop:view===v?"2px solid #2c5f8a":"2px solid transparent"}}>
            <span style={{fontSize:20}}>{icon}</span>{label}
          </button>
        ))}
      </div>

      {/* コピペ中バナー */}
      {clipboard&&(
        <div style={{position:"fixed",top:0,left:"50%",transform:"translateX(-50%)",
          width:"100%",maxWidth:480,background:"#16a34a",zIndex:150,
          padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",
          boxShadow:"0 2px 12px rgba(0,0,0,0.2)"}}>
          <div>
            <div style={{color:"#fff",fontWeight:700,fontSize:12}}>
              📋 {clipboard.start}〜{clipboard.end} コピー中
            </div>
            <div style={{color:"#bbf7d0",fontSize:10,marginTop:1}}>
              貼り付けたいセルを何度でもタップ可 ／ 解除で終了
            </div>
          </div>
          <button onClick={()=>{setClipboard(null);setPastedCells(new Set());}}
            style={{background:"rgba(255,255,255,0.25)",border:"none",borderRadius:8,
              color:"#fff",padding:"6px 12px",cursor:"pointer",fontWeight:700,fontSize:12,
              whiteSpace:"nowrap",marginLeft:8}}>
            ✕ 解除
          </button>
        </div>
      )}

      {/* 保存モーダル */}
      {showSaveModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
          onClick={()=>setShowSaveModal(false)}>
          <div style={{background:"#fff",borderRadius:16,padding:20,width:"100%",maxWidth:440,maxHeight:"80vh",display:"flex",flexDirection:"column"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,fontSize:16,color:"#2c5f8a",marginBottom:6}}>💾 データを保存</div>
            <div style={{fontSize:12,color:"#666",marginBottom:10,lineHeight:1.6}}>
              下のテキストを<b>全選択してコピー</b>し、<br/>
              メモ帳・LINEのノートなどに貼り付けて保存してください。
            </div>
            <textarea readOnly value={saveDataText}
              style={{flex:1,minHeight:200,padding:10,border:"1.5px solid #dce6f0",borderRadius:10,
                fontSize:11,fontFamily:"monospace",resize:"none",color:"#333",background:"#f8fafc"}}
              onClick={e=>e.target.select()}/>
            <div style={{marginTop:10,display:"flex",gap:8}}>
              <button onClick={()=>{
                if(navigator.clipboard){
                  navigator.clipboard.writeText(saveDataText).then(()=>{
                    setSavedMsg("saved"); setTimeout(()=>setSavedMsg(""),2500);
                    setShowSaveModal(false);
                  });
                } else {
                  // fallback
                  const el=document.createElement("textarea");
                  el.value=saveDataText; document.body.appendChild(el);
                  el.select(); document.execCommand("copy");
                  document.body.removeChild(el);
                  setSavedMsg("saved"); setTimeout(()=>setSavedMsg(""),2500);
                  setShowSaveModal(false);
                }
              }} style={{flex:2,padding:"12px",borderRadius:10,border:"none",background:"#2c5f8a",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:14}}>
                {savedMsg==="saved"?"✓ コピーしました":"📋 全てコピー"}
              </button>
              <button onClick={()=>setShowSaveModal(false)}
                style={{flex:1,padding:"12px",borderRadius:10,border:"1px solid #dce6f0",background:"#f5f5f5",color:"#888",fontWeight:600,cursor:"pointer",fontSize:13}}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 読込モーダル */}
      {showLoadModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
          onClick={()=>setShowLoadModal(false)}>
          <div style={{background:"#fff",borderRadius:16,padding:20,width:"100%",maxWidth:440,maxHeight:"80vh",display:"flex",flexDirection:"column"}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:700,fontSize:16,color:"#2c5f8a",marginBottom:6}}>📂 データを読み込む</div>
            <div style={{fontSize:12,color:"#666",marginBottom:10,lineHeight:1.6}}>
              保存したテキストを下に<b>貼り付けて</b>から<br/>
              「読み込む」を押してください。
            </div>
            <textarea value={loadText} onChange={e=>setLoadText(e.target.value)}
              placeholder='{"employees":[...],"shifts":{...},...} を貼り付け'
              style={{flex:1,minHeight:200,padding:10,border:"1.5px solid #dce6f0",borderRadius:10,
                fontSize:11,fontFamily:"monospace",resize:"none",color:"#333"}}/>
            <div style={{marginTop:10,display:"flex",gap:8}}>
              <button onClick={doLoad}
                style={{flex:2,padding:"12px",borderRadius:10,border:"none",background:"#2c5f8a",color:"#fff",fontWeight:700,cursor:"pointer",fontSize:14}}>
                読み込む
              </button>
              <button onClick={()=>{setShowLoadModal(false);setLoadText("");}}
                style={{flex:1,padding:"12px",borderRadius:10,border:"1px solid #dce6f0",background:"#f5f5f5",color:"#888",fontWeight:600,cursor:"pointer",fontSize:13}}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDFモーダル：1画面に縮小表示 */}
      {showPdfModal&&(
        <div style={{position:"fixed",inset:0,background:"#fff",zIndex:400,display:"flex",flexDirection:"column"}}>
          {/* ヘッダー */}
          <div style={{background:"#2c5f8a",padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
            <div>
              <div style={{color:"#fff",fontWeight:700,fontSize:13}}>🖨 シフト表プレビュー</div>
              <div style={{color:"#b8d4f0",fontSize:10}}>スクリーンショット → 写真アプリ → PDF</div>
            </div>
            <button onClick={()=>setShowPdfModal(false)}
              style={{background:"rgba(255,255,255,0.2)",border:"none",borderRadius:8,
                color:"#fff",padding:"6px 14px",cursor:"pointer",fontWeight:700,fontSize:13}}>
              ✕ 閉じる
            </button>
          </div>
          {/* テーブルをscaleで縮小して1画面に収める */}
          <div style={{flex:1,overflow:"hidden",background:"#fff",display:"flex",alignItems:"flex-start",justifyContent:"center",padding:4}}>
            <PdfTable
              sortedEmployees={sortedEmployees}
              days={days} year={year} month={month} period={period}
              daysInMonth={daysInMonth}
              gs={gs} resolved={resolved} calcWork={calcWork} toHHMM={toHHMM}
              empMins={empMins} dayStats={dayStats}
              isSun={isSun} isSat={isSat} dow={dow} ROLES={ROLES}
            />
          </div>
        </div>
      )}

      <CellModal/>
    </div>
  );
}
