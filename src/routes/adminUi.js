const express = require("express");
const { config } = require("../config");

const router = express.Router();

function escapeAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

router.get("/admin", (req, res) => {
  const defaultAdminId = escapeAttr(config.adminUserId || "");
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Fanjobo Admin</title>
  <style>
    :root{--bg:#f4f7fb;--surface:#fff;--ink:#172033;--muted:#5f6f88;--line:#d9e1ee;--accent:#0a7a6c;--danger:#cc3344}
    *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font-family:Segoe UI,Tahoma,sans-serif}
    .shell{max-width:1300px;margin:0 auto;padding:16px;display:grid;gap:12px}
    .panel{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px}
    .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.row>*{flex:1;min-width:130px}.row .tight{flex:0 0 auto;min-width:auto}
    .split{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    input,select,button{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font:inherit}
    button{cursor:pointer;border:none;color:#fff;background:linear-gradient(130deg,var(--accent),#0d8f7f);font-weight:700}
    button.ghost{color:var(--ink);background:#edf3fb;border:1px solid var(--line)} button.danger{background:linear-gradient(130deg,var(--danger),#a82434)}
    .grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:8px}
    .stat{grid-column:span 2;border:1px solid var(--line);border-radius:10px;padding:8px}.v{font-weight:700;font-size:1.1rem}.k{color:var(--muted);font-size:.8rem}
    .table-wrap{overflow:auto;border:1px solid var(--line);border-radius:10px} table{width:100%;border-collapse:collapse;min-width:680px}
    th,td{padding:8px;border-bottom:1px solid var(--line);text-align:left;font-size:.88rem} th{background:#f5f9ff}
    .list{display:grid;gap:8px;max-height:300px;overflow:auto}.item{border:1px solid var(--line);border-radius:8px;padding:8px}
    .status{border:1px solid var(--line);border-radius:10px;padding:8px;background:#f8fbff}.status.error{color:#9f2330;border-color:#f2bac2;background:#fff2f4}
    .hidden{display:none!important}.muted{color:var(--muted);font-size:.84rem}.link{color:var(--accent);text-decoration:none;font-weight:700}
    @media(max-width:980px){.split{grid-template-columns:1fr}.stat{grid-column:span 4}}
    @media(max-width:720px){.shell{padding:10px}.stat{grid-column:span 6}.row>*{min-width:100%}}
  </style>
</head>
<body>
<main class="shell">
  <section class="panel row">
    <div><h1 style="margin:0">Fanjobo Admin Panel</h1><div class="muted">Clean admin UI + operations board</div></div>
    <a class="link tight" href="/admin/logs" target="_blank" rel="noreferrer">Open Logs Page</a>
  </section>

  <section class="panel" id="authPanel">
    <h2 style="margin:0 0 8px">Login</h2>
    <div class="row">
      <input id="adminIdInput" value="${defaultAdminId}" placeholder="ADMIN_USER_ID" />
      <input id="adminKeyInput" type="password" placeholder="ADMIN_API_KEY" />
      <button id="loginBtn" class="tight">Login</button>
    </div>
  </section>

  <section class="status hidden" id="statusBox"></section>

  <section class="panel hidden secure">
    <div class="row"><h2 class="tight" style="margin:0">Dashboard</h2><button id="refreshAllBtn" class="ghost tight">Refresh</button></div>
    <div class="grid" id="statsGrid" style="margin-top:8px"></div>
  </section>

  <section class="panel hidden secure split">
    <div><div class="row"><h2 class="tight" style="margin:0">Quick Queue</h2><button id="refreshQuickBtn" class="ghost tight">Refresh</button></div><div id="quickQueue" class="list" style="margin-top:8px"></div></div>
    <div><h2 style="margin:0">Recent Users</h2><div id="recentUsers" class="list" style="margin-top:8px"></div></div>
  </section>

  <section class="panel hidden secure">
    <div class="row"><h2 class="tight" style="margin:0">Users</h2><input id="userSearchInput" placeholder="Search"/><select id="userHasProfileInput"><option value="">All</option><option value="true">Has profile</option><option value="false">No profile</option></select><button id="loadUsersBtn" class="tight">Search</button></div>
    <div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>ID</th><th>Name</th><th>Contact</th><th>Telegram</th><th>Profile</th><th>Major/Term</th><th>Created</th></tr></thead><tbody id="usersBody"></tbody></table></div>
    <div class="muted" id="usersMeta"></div>
  </section>

  <section class="panel hidden secure split">
    <div><h2 style="margin:0">Moderation</h2><div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>ID</th><th>Section/Kind</th><th>Title</th><th>User</th><th>Action</th></tr></thead><tbody id="moderationBody"></tbody></table></div></div>
    <div><h2 style="margin:0">Operations</h2><div class="table-wrap" style="margin-top:8px"><table><thead><tr><th>Item</th><th>Status</th><th>Action</th></tr></thead><tbody id="opsBody"></tbody></table></div></div>
  </section>

  <section class="panel hidden secure">
    <div class="row">
      <h2 class="tight" style="margin:0">Temporary Drive Check</h2>
      <input id="driveFolderInput" placeholder="Folder ID (optional, empty = DRIVE_ROOT_FOLDER_ID)" />
      <button id="runDriveCheckBtn" class="tight">Run Read/Write Test</button>
    </div>
    <pre id="driveCheckOutput" class="status" style="margin-top:8px;white-space:pre-wrap;word-break:break-word;max-height:280px;overflow:auto">No test executed yet.</pre>
  </section>
</main>

<script>
var state = { adminKey: localStorage.getItem("adminKey") || "", adminId: localStorage.getItem("adminId") || "${defaultAdminId}" };
function el(id){return document.getElementById(id);}
var statusBox = el("statusBox");
function esc(v){return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function showStatus(msg,isError){statusBox.textContent=msg;statusBox.classList.remove("hidden","error");if(isError)statusBox.classList.add("error");clearTimeout(showStatus.t);showStatus.t=setTimeout(function(){statusBox.classList.add("hidden");},5000);}
function api(path, options){
  options = options || {};
  var headers = {"content-type":"application/json","x-admin-key":state.adminKey,"x-admin-id":state.adminId};
  if(options.headers){for(var k in options.headers){headers[k]=options.headers[k];}}
  return fetch(path, {method: options.method || "GET", body: options.body, headers: headers})
    .then(function(r){return r.json().catch(function(){return {};}).then(function(d){if(!r.ok) throw new Error(d.error || d.message || ("Request failed: "+r.status)); return d;});});
}
function buildStat(k,v){return '<article class="stat"><div class="v">'+v+'</div><div class="k">'+k+'</div></article>';}
function loadOverview(){
  return api("/api/admin/dashboard/overview").then(function(data){
    var s = data.overview || {};
    var labels = [["Users","total_users"],["Profiles","total_profiles"],["Contents","total_contents"],["Published","published_contents"],["Opportunities","total_opportunities"],["Pending Opps","pending_opportunities"],["Projects","total_projects"],["Applications","total_applications"],["Submissions","total_submissions"],["Pending Subs","pending_submissions"],["Open Notifs","open_notifications"]];
    el("statsGrid").innerHTML = labels.map(function(it){return buildStat(it[0], Number(s[it[1]]||0).toLocaleString("en-US"));}).join("");
    var recent = data.recentUsers || [];
    el("recentUsers").innerHTML = recent.length ? recent.map(function(u){return '<article class="item"><strong>#'+u.id+' '+esc(u.full_name||"-")+'</strong><div class="muted">'+esc(u.phone_or_email||"-")+'</div><div class="muted">'+esc(u.created_at||"")+'</div></article>';}).join("") : "<div class='muted'>No recent users</div>";
  });
}
function loadQuick(){
  return Promise.all([api("/api/admin/moderation/submissions?status=pending&limit=6"), api("/api/admin/industry/opportunities?approvalStatus=pending&limit=6"), api("/api/admin/notifications?status=open&limit=6")]).then(function(all){
    var cards = [];
    (all[0].items||[]).forEach(function(i){cards.push('<article class="item"><strong>Submission #'+i.id+'</strong><div class="muted">'+esc(i.title||"-")+'</div></article>');});
    (all[1].items||[]).forEach(function(i){cards.push('<article class="item"><strong>Opportunity #'+i.id+'</strong><div class="muted">'+esc(i.title||"-")+'</div></article>');});
    (all[2].items||[]).forEach(function(i){cards.push('<article class="item"><strong>Notification #'+i.id+'</strong><div class="muted">'+esc(i.title||i.type||"-")+'</div></article>');});
    el("quickQueue").innerHTML = cards.join("") || "<div class='muted'>No urgent items</div>";
  });
}
function loadUsers(){
  var q = el("userSearchInput").value.trim();
  var hp = el("userHasProfileInput").value;
  var query = new URLSearchParams({limit:"120"});
  if(q) query.set("q",q); if(hp) query.set("hasProfile",hp);
  return api("/api/admin/users?"+query.toString()).then(function(data){
    var items = data.items || [];
    el("usersBody").innerHTML = items.map(function(u){
      return "<tr><td>"+u.id+"</td><td>"+esc(u.full_name)+"</td><td>"+esc(u.phone_or_email)+"</td><td>"+esc(u.telegram_id||"-")+"</td><td>"+(u.has_profile?"Yes":"No")+"</td><td>"+esc(u.major||"-")+" / "+esc(u.term||"-")+"</td><td>"+esc(u.created_at||"")+"</td></tr>";
    }).join("") || "<tr><td colspan='7'>No users</td></tr>";
    el("usersMeta").textContent = "Total: "+Number(data.total||0).toLocaleString("en-US")+" | Showing: "+items.length;
  });
}
function loadModeration(){
  return api("/api/admin/moderation/submissions?status=pending&limit=20").then(function(data){
    var items = data.items || [];
    el("moderationBody").innerHTML = items.map(function(i){
      return '<tr><td>'+i.id+'</td><td>'+esc(i.section||"-")+' / '+esc(i.content_kind||"-")+'</td><td>'+esc(i.title||"-")+'</td><td>#'+esc(i.user_id)+'</td><td><div class="row"><button class="tight approve-sub" data-id="'+i.id+'">Approve</button><button class="tight danger reject-sub" data-id="'+i.id+'">Reject</button></div></td></tr>';
    }).join("") || "<tr><td colspan='5'>No pending submissions</td></tr>";
  });
}
function loadOps(){
  return Promise.all([api("/api/admin/industry/opportunities?approvalStatus=pending&limit=10"), api("/api/admin/industry/applications?limit=10")]).then(function(all){
    var rows = [];
    (all[0].items||[]).forEach(function(i){rows.push('<tr><td>Opportunity #'+i.id+' - '+esc(i.title||"-")+'</td><td>'+esc(i.approval_status||"pending")+'</td><td><div class="row"><button class="tight approve-opp" data-id="'+i.id+'">Approve</button><button class="tight danger reject-opp" data-id="'+i.id+'">Reject</button></div></td></tr>');});
    (all[1].items||[]).forEach(function(i){rows.push('<tr><td>Application #'+i.id+' - '+esc(i.opportunity_title||"-")+'</td><td>'+esc(i.status||"-")+'</td><td><div class="row"><select class="app-status" data-id="'+i.id+'"><option value="draft" '+(i.status==="draft"?"selected":"")+'>draft</option><option value="submitted" '+(i.status==="submitted"?"selected":"")+'>submitted</option><option value="viewed" '+(i.status==="viewed"?"selected":"")+'>viewed</option><option value="interview" '+(i.status==="interview"?"selected":"")+'>interview</option><option value="rejected" '+(i.status==="rejected"?"selected":"")+'>rejected</option><option value="accepted" '+(i.status==="accepted"?"selected":"")+'>accepted</option></select><button class="tight update-app" data-id="'+i.id+'">Update</button></div></td></tr>');});
    el("opsBody").innerHTML = rows.join("") || "<tr><td colspan='3'>No items</td></tr>";
  });
}
function loadAll(){ return Promise.all([loadOverview(), loadQuick(), loadUsers(), loadModeration(), loadOps()]); }
function login(){
  state.adminId = el("adminIdInput").value.trim();
  state.adminKey = el("adminKeyInput").value.trim();
  if(!state.adminKey){showStatus("ADMIN_API_KEY is required", true); return;}
  localStorage.setItem("adminKey", state.adminKey); localStorage.setItem("adminId", state.adminId);
  loadAll().then(function(){Array.from(document.querySelectorAll(".secure")).forEach(function(p){p.classList.remove("hidden");}); showStatus("Admin panel ready");}).catch(function(e){showStatus(e.message, true);});
}
el("loginBtn").addEventListener("click", login);
el("refreshAllBtn").addEventListener("click", function(){loadAll().then(function(){showStatus("Refreshed");}).catch(function(e){showStatus(e.message,true);});});
el("refreshQuickBtn").addEventListener("click", function(){loadQuick().then(function(){showStatus("Quick queue refreshed");}).catch(function(e){showStatus(e.message,true);});});
el("loadUsersBtn").addEventListener("click", function(){loadUsers().catch(function(e){showStatus(e.message,true);});});

el("moderationBody").addEventListener("click", function(event){
  var approve = event.target.closest(".approve-sub");
  var reject = event.target.closest(".reject-sub");
  if(!approve && !reject) return;
  var id = Number((approve||reject).dataset.id); if(!id) return;
  api("/api/admin/moderation/submissions/"+id+"/review", {method:"POST", body: JSON.stringify({action: approve ? "approve" : "reject", reason:"Reviewed in admin panel"})})
    .then(function(){return Promise.all([loadOverview(), loadModeration(), loadQuick()]);})
    .then(function(){showStatus("Submission updated");})
    .catch(function(e){showStatus(e.message,true);});
});

el("opsBody").addEventListener("click", function(event){
  var approveOpp = event.target.closest(".approve-opp");
  var rejectOpp = event.target.closest(".reject-opp");
  var updateApp = event.target.closest(".update-app");
  if(!approveOpp && !rejectOpp && !updateApp) return;
  var request;
  if(approveOpp || rejectOpp){
    var oid = Number((approveOpp||rejectOpp).dataset.id); if(!oid) return;
    request = api("/api/admin/industry/opportunities/"+oid+"/approval", {method:"PATCH", body: JSON.stringify({approvalStatus: approveOpp ? "approved" : "rejected"})});
  } else {
    var aid = Number(updateApp.dataset.id); if(!aid) return;
    var select = el("opsBody").querySelector('.app-status[data-id="'+aid+'"]');
    request = api("/api/admin/industry/applications/"+aid+"/status", {method:"PATCH", body: JSON.stringify({status: select ? select.value : "viewed"})});
  }
  request.then(function(){return Promise.all([loadOverview(), loadOps(), loadQuick()]);}).then(function(){showStatus("Operation completed");}).catch(function(e){showStatus(e.message,true);});
});

el("runDriveCheckBtn").addEventListener("click", function(){
  var folderId = el("driveFolderInput").value.trim();
  var body = folderId ? { folderId: folderId } : {};
  el("driveCheckOutput").textContent = "Running drive read/write check...";
  api("/api/admin/integrations/drive/check", {method:"POST", body: JSON.stringify(body)})
    .then(function(data){
      el("driveCheckOutput").textContent = JSON.stringify(data, null, 2);
      showStatus("Drive check completed");
    })
    .catch(function(e){
      el("driveCheckOutput").textContent = "ERROR: " + e.message;
      showStatus(e.message, true);
    });
});

el("adminIdInput").value = state.adminId || el("adminIdInput").value;
if(state.adminKey){el("adminKeyInput").value = state.adminKey; login();}
</script>
</body>
</html>`);
});

router.get("/admin/logs", (req, res) => {
  const defaultAdminId = escapeAttr(config.adminUserId || "");
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Fanjobo Logs</title>
  <style>
    :root{--bg:#0f1724;--card:#111c2e;--line:#27344a;--ink:#e8eef8;--muted:#9db0cf}
    *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
    .shell{max-width:1400px;margin:0 auto;padding:12px;display:grid;gap:10px}
    .card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px}
    .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.row>*{flex:1;min-width:130px}.row .tight{flex:0 0 auto;min-width:auto}
    input,select,button{width:100%;padding:8px 10px;border:1px solid var(--line);background:#0d1626;color:var(--ink);border-radius:8px}
    .meta{color:var(--muted);font-size:12px}.list{display:grid;gap:8px;max-height:78vh;overflow:auto}.item{border:1px solid var(--line);border-radius:8px;padding:8px;background:#0d1626}
    pre{white-space:pre-wrap;word-break:break-word;margin:6px 0 0;font-size:12px}
  </style>
</head>
<body>
<main class="shell">
  <section class="card">
    <div class="row"><h2 class="tight" style="margin:0">System Logs</h2><a href="/admin" style="color:#7ad8bd;text-decoration:none">Back</a></div>
    <div class="row" style="margin-top:8px">
      <input id="adminIdInput" value="${defaultAdminId}" placeholder="ADMIN_USER_ID" />
      <input id="adminKeyInput" type="password" placeholder="ADMIN_API_KEY" />
      <select id="levelInput"><option value="">All levels</option><option value="info">info</option><option value="warn">warn</option><option value="error">error</option></select>
      <input id="searchInput" placeholder="Search logs" />
      <input id="limitInput" type="number" min="10" max="1000" value="300" />
      <button id="loadBtn" class="tight">Load</button>
      <button id="autoBtn" class="tight">Auto: OFF</button>
    </div>
    <div class="meta" id="metaBox" style="margin-top:8px"></div>
  </section>
  <section class="card"><div class="list" id="logList"></div></section>
</main>
<script>
var state = { auto:null, on:false, adminKey:localStorage.getItem("adminKey")||"", adminId:localStorage.getItem("adminId")||"${defaultAdminId}" };
function el(id){return document.getElementById(id);}
function render(items){
  el("logList").innerHTML = items.map(function(item){
    var meta = item.meta ? JSON.stringify(item.meta, null, 2) : "";
    var msg = String(item.message||"").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    var safeMeta = meta.replace(/</g,"&lt;").replace(/>/g,"&gt;");
    return '<article class="item"><div><strong>'+item.level+'</strong> | '+item.createdAt+'</div><pre>'+msg+'</pre>'+(safeMeta?'<pre>'+safeMeta+'</pre>':'')+'</article>';
  }).join("") || "<div class='meta'>No logs</div>";
}
function loadLogs(){
  var key = el("adminKeyInput").value.trim();
  var id = el("adminIdInput").value.trim();
  var level = el("levelInput").value;
  var search = el("searchInput").value.trim();
  var limit = Number(el("limitInput").value || 300);
  localStorage.setItem("adminKey", key); localStorage.setItem("adminId", id);
  var q = new URLSearchParams({limit:String(limit)}); if(level) q.set("level",level); if(search) q.set("search",search);
  return fetch("/api/admin/logs?"+q.toString(), {headers:{"x-admin-key":key,"x-admin-id":id}})
    .then(function(r){return r.json().catch(function(){return {};}).then(function(d){if(!r.ok) throw new Error(d.error||("Request failed: "+r.status)); return d;});})
    .then(function(d){el("metaBox").textContent = "Matched: "+(d.total||0)+" | Showing: "+((d.items||[]).length); render(d.items||[]);});
}
function toggleAuto(){ state.on=!state.on; el("autoBtn").textContent = state.on ? "Auto: ON" : "Auto: OFF"; if(state.on){loadLogs().catch(function(){}); state.auto=setInterval(function(){loadLogs().catch(function(){});},4000);} else if(state.auto){clearInterval(state.auto); state.auto=null;} }
el("loadBtn").addEventListener("click", function(){loadLogs().catch(function(e){el("metaBox").textContent=e.message;});});
el("autoBtn").addEventListener("click", toggleAuto);
el("adminKeyInput").value = state.adminKey; el("adminIdInput").value = state.adminId;
if(state.adminKey){loadLogs().catch(function(e){el("metaBox").textContent=e.message;});}
</script>
</body>
</html>`);
});

module.exports = router;
