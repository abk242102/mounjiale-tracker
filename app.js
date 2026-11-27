/* 介面互動與紀錄管理。 */
const $ = id => document.getElementById(id);
const today = () => new Date().toLocaleDateString("en-CA");
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const money = n => "$" + Number(n || 0).toLocaleString("zh-TW", { maximumFractionDigits: 0 });
const fmtDate = d => d ? new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleString("zh-TW", { dateStyle: "medium", ...(d.length > 10 ? { timeStyle: "short" } : {}) }) : "";
let selectedSite = null;
let weightView = "chart";

function go(page) {
  document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === `page-${page}`));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  document.querySelectorAll("[data-go]").forEach(b => {});
  if (page === "home") renderHome();
  if (page === "injection") renderInjections();
  if (page === "weight") renderWeights();
  if (page === "water") renderWater();
  if (page === "purchase") renderPurchases();
}
document.querySelectorAll(".nav-item").forEach(b => b.addEventListener("click", () => go(b.dataset.page)));
document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));

function setDateDefaults() {
  const now = new Date();
  const localDT = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0,16);
  $("injectionDate").value = localDT;
  $("weightDate").value = today();
  $("waterDate").value = today();
  $("purchaseDate").value = today();
}
function itemRecord(store, values, oldId) {
  return { id: oldId || uid(), ...values, updatedAt: new Date().toISOString(), deleted: false };
}
async function renderHome() {
  const weights = (await TrackerDB.all("weights")).filter(x => !x.deleted).sort((a,b)=>a.date.localeCompare(b.date));
  const injections = (await TrackerDB.all("injections")).filter(x => !x.deleted).sort((a,b)=>b.date.localeCompare(a.date));
  const water = (await TrackerDB.all("water")).filter(x => !x.deleted && x.date === today()).reduce((s,x)=>s+Number(x.amount),0);
  const purchases = (await TrackerDB.all("purchases")).filter(x=>!x.deleted);
  const latest = weights.at(-1);
  $("homeWeight").textContent = latest ? Number(latest.value).toFixed(1) : "--";
  $("homeWeightDate").textContent = latest ? latest.date : "尚無紀錄";
  if (weights.length > 1) {
    const diff = Number(weights.at(-1).value) - Number(weights[0].value);
    $("homeWeightChange").textContent = `相較第一筆 ${diff > 0 ? "+" : ""}${diff.toFixed(1)} kg`;
  } else $("homeWeightChange").textContent = latest ? "目前只有一筆紀錄" : "新增第一筆體重紀錄";
  $("homeWater").textContent = `${water.toLocaleString()} ml`;
  $("homeCost").textContent = money(purchases.reduce((s,x)=>s+Number(x.amount),0));
  $("homeInjection").textContent = injections[0] ? `${injections[0].dose} mg` : "尚無";
  $("recentInjection").innerHTML = injections[0] ? `<b>${fmtDate(injections[0].date)}</b><p class="muted">${injections[0].dose} mg・${injections[0].site ? `位置 ${injections[0].site}` : "未記位置"}</p>` : "尚無注射紀錄";
}
function siteLabel(n) {
  return ({1:"左上外側",2:"左上內側",3:"右上內側",4:"右上外側",5:"左下外側",6:"左下內側",7:"右下內側",8:"右下外側"})[n] || "";
}
document.querySelectorAll(".site").forEach(b => b.addEventListener("click", () => {
  selectedSite = Number(b.dataset.site);
  document.querySelectorAll(".site").forEach(x => x.classList.toggle("selected", x === b));
  $("selectedSiteText").textContent = `已選擇：${selectedSite} 號・${siteLabel(selectedSite)}`;
}));
$("injectionDose").addEventListener("change", () => $("customDoseWrap").classList.toggle("hidden", $("injectionDose").value !== "custom"));
$("injectionForm").addEventListener("submit", async e => {
  e.preventDefault();
  const dose = $("injectionDose").value === "custom" ? Number($("customDose").value) : Number($("injectionDose").value);
  if (!dose || dose <= 0) return alert("請輸入有效劑量。");
  if (!selectedSite && !$("injectionId").value) return alert("請選擇本次記錄的腹部位置。");
  const id = $("injectionId").value || uid();
  const previous = (await TrackerDB.all("injections")).find(x=>x.id===id);
  await TrackerDB.put("injections", itemRecord("injections", { date:$("injectionDate").value, dose, site:selectedSite || previous?.site || null, note:$("injectionNote").value.trim() }, id));
  resetInjection(); renderInjections(); renderHome();
});
function resetInjection() {
  $("injectionForm").reset(); $("injectionId").value=""; $("injectionDate").value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
  selectedSite=null; document.querySelectorAll(".site").forEach(x=>x.classList.remove("selected"));
  $("selectedSiteText").textContent="尚未選擇位置"; $("customDoseWrap").classList.add("hidden"); $("cancelInjectionEdit").classList.add("hidden");
}
$("cancelInjectionEdit").addEventListener("click", resetInjection);
async function renderInjections() {
  const list=(await TrackerDB.all("injections")).filter(x=>!x.deleted).sort((a,b)=>b.date.localeCompare(a.date));
  $("injectionCount").textContent=`${list.length} 筆`;
  $("injectionList").innerHTML=list.length?list.map(x=>`<div class="record-item"><div class="record-main"><b>${fmtDate(x.date)}・${x.dose} mg</b><small>${x.site?`位置 ${x.site}・${siteLabel(x.site)}`:"未記錄位置"}${x.note?`・${escapeHTML(x.note)}`:""}</small></div><div class="record-actions"><button class="mini-button" data-edit-inj="${x.id}">編輯</button><button class="mini-button" data-del-inj="${x.id}">刪除</button></div></div>`).join(""):`<div class="list-card empty">尚無注射紀錄</div>`;
  document.querySelectorAll("[data-edit-inj]").forEach(b=>b.onclick=()=>editInjection(b.dataset.editInj));
  document.querySelectorAll("[data-del-inj]").forEach(b=>b.onclick=()=>deleteRecord("injections",b.dataset.delInj,renderInjections));
}
async function editInjection(id) {
  const x=(await TrackerDB.all("injections")).find(a=>a.id===id); if(!x)return;
  $("injectionId").value=x.id;$("injectionDate").value=x.date;$("injectionNote").value=x.note||"";
  const presets=["2.5","5","7.5","10","12.5","15"];
  if(presets.includes(String(x.dose))) $("injectionDose").value=String(x.dose);
  else {$("injectionDose").value="custom";$("customDoseWrap").classList.remove("hidden");$("customDose").value=x.dose;}
  selectedSite=x.site;document.querySelectorAll(".site").forEach(b=>b.classList.toggle("selected",Number(b.dataset.site)===x.site));
  $("selectedSiteText").textContent=x.site?`已選擇：${x.site} 號・${siteLabel(x.site)}`:"尚未選擇位置";
  $("cancelInjectionEdit").classList.remove("hidden");window.scrollTo({top:0,behavior:"smooth"});
}
async function deleteRecord(store,id,refresh) {
  if(!confirm("確定刪除此筆紀錄？"))return;
  const x=(await TrackerDB.all(store)).find(a=>a.id===id);if(x){x.deleted=true;x.updatedAt=new Date().toISOString();await TrackerDB.put(store,x);}
  refresh();renderHome();
}
$("weightForm").addEventListener("submit",async e=>{
  e.preventDefault();const date=$("weightDate").value;const id=$("weightId").value||uid();
  const all=(await TrackerDB.all("weights")).filter(x=>!x.deleted);
  const duplicate=all.find(x=>x.date===date&&x.id!==id);
  if(duplicate&&!confirm("這一天已有體重紀錄。要取代原紀錄嗎？"))return;
  if(duplicate){duplicate.deleted=true;duplicate.updatedAt=new Date().toISOString();await TrackerDB.put("weights",duplicate);}
  await TrackerDB.put("weights",itemRecord("weights",{date,value:Number($("weightValue").value),note:$("weightNote").value.trim()},id));
  $("weightForm").reset();$("weightId").value="";$("weightDate").value=today();$("cancelWeightEdit").classList.add("hidden");renderWeights();renderHome();
});
$("cancelWeightEdit").onclick=()=>{$("weightForm").reset();$("weightId").value="";$("weightDate").value=today();$("cancelWeightEdit").classList.add("hidden");};
document.querySelectorAll("[data-weight-view]").forEach(b=>b.onclick=()=>{weightView=b.dataset.weightView;document.querySelectorAll("[data-weight-view]").forEach(x=>x.classList.toggle("selected",x===b));$("weightChartPanel").classList.toggle("hidden",weightView!=="chart");$("weightListPanel").classList.toggle("hidden",weightView!=="list");});
$("weightRange").onchange=renderWeights;
async function renderWeights(){
  const list=(await TrackerDB.all("weights")).filter(x=>!x.deleted).sort((a,b)=>a.date.localeCompare(b.date));
  const range=$("weightRange").value;let visible=list;
  if(range!=="all"){const cutoff=new Date();cutoff.setDate(cutoff.getDate()-Number(range)+1);const d=cutoff.toLocaleDateString("en-CA");visible=list.filter(x=>x.date>=d);}
  $("weightChart").innerHTML=visible.length>=2?drawChart(visible):`<div class="empty">${visible.length?"至少需要兩筆紀錄才能顯示折線圖":"新增體重紀錄後顯示趨勢"}</div>`;
  $("weightSummary").innerHTML=list.length?`起始：<b>${Number(list[0].value).toFixed(1)} kg</b>　目前：<b>${Number(list.at(-1).value).toFixed(1)} kg</b>　變化：<b>${(Number(list.at(-1).value)-Number(list[0].value)).toFixed(1)} kg</b>`:"";
  $("weightListPanel").innerHTML=list.length?[...list].reverse().map(x=>`<div class="record-item"><div class="record-main"><b>${x.date}・${Number(x.value).toFixed(1)} kg</b><small>${escapeHTML(x.note||"")}</small></div><div class="record-actions"><button class="mini-button" data-edit-weight="${x.id}">編輯</button><button class="mini-button" data-del-weight="${x.id}">刪除</button></div></div>`).join(""):`<div class="list-card empty">尚無體重紀錄</div>`;
  document.querySelectorAll("[data-edit-weight]").forEach(b=>b.onclick=()=>editWeight(b.dataset.editWeight));
  document.querySelectorAll("[data-del-weight]").forEach(b=>b.onclick=()=>deleteRecord("weights",b.dataset.delWeight,renderWeights));
}
function drawChart(data){
  const values=data.map(x=>Number(x.value)),min=Math.min(...values)-1,max=Math.max(...values)+1,w=320,h=205,p=28;
  const pts=values.map((v,i)=>({x:p+i*(w-2*p)/Math.max(1,values.length-1),y:h-p-(v-min)/(max-min||1)*(h-2*p)}));
  const poly=pts.map(x=>`${x.x},${x.y}`).join(" ");
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="體重折線圖"><line x1="${p}" y1="${h-p}" x2="${w-p}" y2="${h-p}" stroke="#ddd8cf"/><line x1="${p}" y1="${p}" x2="${p}" y2="${h-p}" stroke="#ddd8cf"/><polyline points="${poly}" fill="none" stroke="#607766" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${pts.map((pt,i)=>`<circle cx="${pt.x}" cy="${pt.y}" r="4" fill="#607766"><title>${data[i].date}: ${values[i]} kg</title></circle>`).join("")}<text x="${p}" y="15" font-size="10" fill="#858276">${max.toFixed(1)} kg</text><text x="${p}" y="${h-5}" font-size="10" fill="#858276">${min.toFixed(1)} kg</text><text x="${p}" y="${h-16}" font-size="9" fill="#858276">${data[0].date.slice(5)}</text><text x="${w-p}" y="${h-16}" text-anchor="end" font-size="9" fill="#858276">${data.at(-1).date.slice(5)}</text></svg>`;
}
async function editWeight(id){const x=(await TrackerDB.all("weights")).find(a=>a.id===id);if(!x)return;$("weightId").value=x.id;$("weightDate").value=x.date;$("weightValue").value=x.value;$("weightNote").value=x.note||"";$("cancelWeightEdit").classList.remove("hidden");window.scrollTo({top:0,behavior:"smooth"});}
$("waterDate").onchange=renderWater;
$("waterGoal").onchange=async()=>{const s=(await TrackerDB.getMeta("settings"))||{waterGoal:2000};s.waterGoal=Number($("waterGoal").value)||2000;await TrackerDB.setMeta("settings",s);renderWater();};
async function addWater(amount){const date=$("waterDate").value;await TrackerDB.put("water",itemRecord("water",{date,amount:Number(amount)}));renderWater();renderHome();}
document.querySelectorAll("[data-water]").forEach(b=>b.onclick=()=>addWater(Number(b.dataset.water)));
$("customWaterForm").onsubmit=e=>{e.preventDefault();const v=Number($("customWater").value);if(v<=0)return alert("請輸入有效容量。");addWater(v);$("customWater").value="";};
async function renderWater(){
  const date=$("waterDate").value||today();const list=(await TrackerDB.all("water")).filter(x=>!x.deleted&&x.date===date).sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt));
  const settings=(await TrackerDB.getMeta("settings"))||{waterGoal:2000};$("waterGoal").value=settings.waterGoal||2000;
  const total=list.reduce((s,x)=>s+Number(x.amount),0),goal=Number(settings.waterGoal)||2000;
  $("waterTotal").textContent=total.toLocaleString();$("waterGoalText").textContent=goal.toLocaleString();$("waterProgress").style.width=`${Math.min(100,total/goal*100)}%`;
  $("waterList").innerHTML=list.length?[...list].reverse().map(x=>`<div class="record-item"><div class="record-main"><b>${Number(x.amount).toLocaleString()} ml</b><small>${new Date(x.updatedAt).toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit"})}</small></div><div class="record-actions"><button class="mini-button" data-del-water="${x.id}">刪除</button></div></div>`).join(""):`<div class="list-card empty">這一天還沒有喝水紀錄</div>`;
  document.querySelectorAll("[data-del-water]").forEach(b=>b.onclick=()=>deleteRecord("water",b.dataset.delWater,renderWater));
}
$("purchaseAmount").oninput=$("purchaseQuantity").oninput=()=>{const a=Number($("purchaseAmount").value),q=Number($("purchaseQuantity").value);$("unitPrice").textContent=money(q?a/q:0);};
$("purchaseForm").onsubmit=async e=>{e.preventDefault();const q=Number($("purchaseQuantity").value),a=Number($("purchaseAmount").value);if(q<=0||a<0)return alert("請確認金額及數量。");const id=$("purchaseId").value||uid();await TrackerDB.put("purchases",itemRecord("purchases",{date:$("purchaseDate").value,amount:a,quantity:q,unitPrice:a/q,note:$("purchaseNote").value.trim()},id));$("purchaseForm").reset();$("purchaseId").value="";$("purchaseDate").value=today();$("purchaseQuantity").value=1;$("cancelPurchaseEdit").classList.add("hidden");$("unitPrice").textContent="$0";renderPurchases();renderHome();};
$("cancelPurchaseEdit").onclick=()=>{$("purchaseForm").reset();$("purchaseId").value="";$("purchaseDate").value=today();$("purchaseQuantity").value=1;$("cancelPurchaseEdit").classList.add("hidden");};
async function renderPurchases(){const list=(await TrackerDB.all("purchases")).filter(x=>!x.deleted).sort((a,b)=>b.date.localeCompare(a.date));$("purchaseTotal").textContent=money(list.reduce((s,x)=>s+Number(x.amount),0));$("purchaseList").innerHTML=list.length?list.map(x=>`<div class="record-item"><div class="record-main"><b>${x.date}・${money(x.amount)}</b><small>數量 ${x.quantity}・單價 ${money(x.unitPrice)}${x.note?`・${escapeHTML(x.note)}`:""}</small></div><div class="record-actions"><button class="mini-button" data-edit-purchase="${x.id}">編輯</button><button class="mini-button" data-del-purchase="${x.id}">刪除</button></div></div>`).join(""):`<div class="list-card empty">尚無購買紀錄</div>`;
  document.querySelectorAll("[data-edit-purchase]").forEach(b=>b.onclick=()=>editPurchase(b.dataset.editPurchase));document.querySelectorAll("[data-del-purchase]").forEach(b=>b.onclick=()=>deleteRecord("purchases",b.dataset.delPurchase,renderPurchases));}
async function editPurchase(id){const x=(await TrackerDB.all("purchases")).find(a=>a.id===id);if(!x)return;$("purchaseId").value=x.id;$("purchaseDate").value=x.date;$("purchaseAmount").value=x.amount;$("purchaseQuantity").value=x.quantity;$("purchaseNote").value=x.note||"";$("unitPrice").textContent=money(x.unitPrice);$("cancelPurchaseEdit").classList.remove("hidden");window.scrollTo({top:0,behavior:"smooth"});}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
$("exportData").onclick=async()=>{const data=await TrackerDB.snapshot();downloadJSON(data,`mounjiale-backup-${today()}.json`);};
function downloadJSON(data,name){const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
$("importData").onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!confirm("還原會覆蓋目前本機資料，確定繼續？"))return;await TrackerDB.replaceAll(data);alert("資料還原完成。");go("home");}catch(err){alert("備份檔格式錯誤："+err.message);}e.target.value="";};
$("connectGoogle").onclick=async()=>{try{const clientId=$("googleClientId").value.trim(),secret=$("syncPassphrase").value;await DriveSync.connect(clientId,secret);$("syncPassphrase").value="";}catch(e){DriveSync.status("同步設定尚未完成");alert(e.message);}};
$("syncNow").onclick=async()=>{try{const secret=$("syncPassphrase").value;if(!secret)throw new Error("請輸入加密密語後同步。");await DriveSync.connect($("googleClientId").value.trim(),secret);$("syncPassphrase").value="";}catch(e){alert(e.message);}};
$("disconnectGoogle").onclick=()=>{DriveSync.disconnect();alert("已清除本機授權狀態。");};
$("saveSettings").onclick=async()=>{const s=(await TrackerDB.getMeta("settings"))||{};s.waterGoal=Math.max(1,Number($("settingsWaterGoal").value)||2000);await TrackerDB.setMeta("settings",s);$("waterGoal").value=s.waterGoal;alert("設定已儲存。");renderWater();};
const dbPut=TrackerDB.put.bind(TrackerDB);
TrackerDB.put=async(store,item)=>{const result=await dbPut(store,item);if(["injections","weights","water","purchases"].includes(store))DriveSync.localChanged();return result;};
const originalDBPut=TrackerDB.put.bind(TrackerDB);
TrackerDB.put=async(store,item)=>{const result=await originalDBPut(store,item);if(["injections","weights","water","purchases"].includes(store))DriveSync.localChanged();return result;};
async function init(){
  await TrackerDB.open();setDateDefaults();
  const settings=(await TrackerDB.getMeta("settings"))||{waterGoal:2000};$("settingsWaterGoal").value=settings.waterGoal||2000;
  $("googleClientId").value=localStorage.getItem("mounjiale_google_client_id")||"";
  DriveSync.initialize();
  await renderHome();
  if("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
  const script=document.createElement("script");script.src="https://accounts.google.com/gsi/client";script.async=true;document.head.appendChild(script);
}
init().catch(e=>alert("App 初始化失敗："+e.message));