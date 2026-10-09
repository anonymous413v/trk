(() => {
  let cfg = window.TASKFLOW_CONFIG;
  const $ = (s) => document.querySelector(s);
  const sections = {current:['⚡','Current','Tasks you are working on now.'],temporary:['⌛','Temporary','Short-term / will be removed later.'],life:['🌿','Life','Daily life tasks / personal stuff.'],long_term:['🎯','Long-Term','Big goals / ongoing / life work.']};
  let sb, user, tasks=[], history=[], editingId=null, authMode='signin', channel;
  const message=(text='')=>$('#status').textContent=text;
  const escape=(value='')=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=(d)=>new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'}).format(new Date(d));

  function setAuthMessage(text=''){ $('#auth-message').textContent=text; }
  function configured(){ return cfg?.url && cfg?.publishableKey && !cfg.url.includes('your-project'); }
  async function init(){
    if(!cfg){ try { const response=await fetch('/api/config'); if(response.ok) cfg=await response.json(); } catch(_){} }
    if(!configured()){setAuthMessage('Add your Supabase URL and publishable key to config.js (see config.example.js).');return;}
    sb=window.supabase.createClient(cfg.url,cfg.publishableKey);
    const {data:{session}}=await sb.auth.getSession(); await onSession(session);
    sb.auth.onAuthStateChange((_event,session)=>setTimeout(()=>onSession(session),0));
    if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
  }
  async function onSession(session){
    user=session?.user;
    $('#auth-view').hidden=!!user; $('#dashboard').hidden=!user;
    if(!user) return;
    $('#user-email').textContent=user.email; $('#greeting').textContent=`Good ${new Date().getHours()<12?'morning':new Date().getHours()<18?'afternoon':'evening'}, ${user.email.split('@')[0]}`;
    $('#today').textContent=new Intl.DateTimeFormat(undefined,{weekday:'long',month:'short',day:'numeric',year:'numeric'}).format(new Date());
    channel?.unsubscribe();
    channel=sb.channel(`taskflow:${user.id}`).on('postgres_changes',{event:'*',schema:'public',table:'tasks',filter:`user_id=eq.${user.id}`},load).on('postgres_changes',{event:'*',schema:'public',table:'task_history',filter:`user_id=eq.${user.id}`},load).subscribe();
    await load();
  }
  async function load(){
    const [taskResult,historyResult]=await Promise.all([sb.from('tasks').select('*').order('position').order('created_at'),sb.from('task_history').select('*').order('completed_at',{ascending:false})]);
    if(taskResult.error||historyResult.error){message(taskResult.error?.message||historyResult.error?.message);return;}
    tasks=taskResult.data;history=historyResult.data;render();
  }
  function render(){ renderBoards();renderHistory();renderStats(); }
  function renderBoards(){const query=$('#search').value.trim().toLowerCase();$('#boards').innerHTML=Object.entries(sections).map(([key,[icon,label,detail]])=>{const rows=tasks.filter(t=>t.section===key&&(`${t.title} ${t.description} ${t.notes}`).toLowerCase().includes(query));return `<article class="column" data-section="${key}"><div class="column-head"><div><h3>${icon} ${label} <small>${rows.length}</small></h3><small>${detail}</small></div><button aria-label="Add to ${label}" data-add="${key}">＋</button></div><div class="task-list">${rows.length?rows.map(taskCard).join(''):'<p class="empty">No tasks here yet.</p>'}</div></article>`}).join('');
    document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>openTask(null,b.dataset.add));document.querySelectorAll('.task').forEach(el=>{el.ondragstart=e=>e.dataTransfer.setData('text/plain',el.dataset.id);el.onclick=e=>{if(!e.target.closest('button'))openTask(tasks.find(t=>t.id===el.dataset.id));};});document.querySelectorAll('.complete').forEach(b=>b.onclick=e=>{e.stopPropagation();complete(b.dataset.id)});document.querySelectorAll('.column').forEach(c=>{c.ondragover=e=>{e.preventDefault();c.classList.add('drag-over')};c.ondragleave=()=>c.classList.remove('drag-over');c.ondrop=e=>{e.preventDefault();c.classList.remove('drag-over');moveTask(e.dataTransfer.getData('text/plain'),c.dataset.section)}});
  }
  function taskCard(t){return `<article class="task" draggable="true" data-id="${t.id}"><div class="task-title"><span>${escape(t.title)}</span><div class="task-actions"><button class="complete" data-id="${t.id}" title="Complete">✓</button></div></div>${t.description?`<small>${escape(t.description)}</small>`:''}<div class="progress"><span style="width:${t.progress}%"></span></div><div class="task-foot"><span class="pill ${t.task_type}">${escape(t.task_type)}</span><small>${t.progress}%</small></div></article>`}
  function renderHistory(){const q=$('#history-search').value.trim().toLowerCase();const rows=history.filter(h=>`${h.title} ${h.notes}`.toLowerCase().includes(q));$('#history-list').innerHTML=rows.length?rows.map(h=>`<article class="history-item"><div><strong>${escape(h.title)}</strong></div><span class="pill ${h.task_type} type">${escape(h.task_type)}</span><time>${date(h.completed_at)}</time><div class="history-notes">${h.link?`<a href="${escape(h.link)}" target="_blank" rel="noreferrer">${escape(h.link)}</a>`:escape(h.notes||'—')}</div><button class="restore" data-restore="${h.id}">Restore</button></article>`).join(''):'<p class="empty">No completed tasks yet.</p>';document.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>restore(b.dataset.restore));}
  function renderStats(){const completed=history.length, avg=tasks.length?Math.round(tasks.reduce((n,t)=>n+t.progress,0)/tasks.length):0;const byType=tasks.reduce((a,t)=>(a[t.task_type]=(a[t.task_type]||0)+1,a),{});$('#stats').innerHTML=`<article class="stat"><strong>${tasks.length}</strong>Active tasks</article><article class="stat"><strong>${completed}</strong>Completed tasks</article><article class="stat"><strong>${avg}%</strong>Average progress</article>${Object.entries(byType).map(([type,count])=>`<article class="stat"><strong>${count}</strong>${type[0].toUpperCase()+type.slice(1)} tasks</article>`).join('')}`;}
  function openTask(task=null,section='current'){$('#task-form').reset();editingId=task?.id||null;$('#dialog-title').textContent=task?'Edit task':'Add task';$('#task-id').value=editingId||'';$('#task-title').value=task?.title||'';$('#task-section').value=task?.section||section;$('#task-type').value=task?.task_type||'other';$('#task-progress').value=task?.progress||0;$('#progress-output').textContent=`${task?.progress||0}%`;$('#task-description').value=task?.description||'';$('#task-notes').value=task?.notes||'';$('#task-link').value=task?.link||'';$('#delete-task').hidden=!task;$('#task-dialog').showModal();$('#task-title').focus();}
  async function save(e){e.preventDefault();const title=$('#task-title').value.trim();if(!title)return;const payload={title,section:$('#task-section').value,task_type:$('#task-type').value,progress:Number($('#task-progress').value),description:$('#task-description').value.trim(),notes:$('#task-notes').value.trim(),link:$('#task-link').value.trim()||null};let result;if(editingId)result=await sb.from('tasks').update(payload).eq('id',editingId);else result=await sb.from('tasks').insert({...payload,user_id:user.id,position:tasks.filter(t=>t.section===payload.section).length});if(result.error){message(result.error.message);return}$('#task-dialog').close();message('Saved.');await load();}
  async function complete(id){if(!confirm('Complete this task? It will be kept in history.'))return;const {error}=await sb.rpc('complete_task',{p_task_id:id});if(error)message(error.message);else{message('Task completed and saved to history.');await load();}}
  async function restore(id){const h=history.find(x=>x.id===id);if(!h)return;const {error}=await sb.from('tasks').insert({user_id:user.id,title:h.title,description:h.description,section:h.section,task_type:h.task_type,progress:h.progress,notes:h.notes,link:h.link,position:tasks.filter(t=>t.section===h.section).length});if(error){message(error.message);return}const r=await sb.from('task_history').delete().eq('id',id);if(r.error)message('Restored, but history cleanup failed: '+r.error.message);else message('Task restored.');await load();}
  async function moveTask(id,section){const {error}=await sb.from('tasks').update({section,position:tasks.filter(t=>t.section===section).length}).eq('id',id);if(error)message(error.message);else await load();}
  $('#auth-form').onsubmit=async e=>{e.preventDefault();if(!sb)return;setAuthMessage('');const email=$('#email').value.trim(),password=$('#password').value;const response=authMode==='signin'?await sb.auth.signInWithPassword({email,password}):await sb.auth.signUp({email,password});if(response.error)setAuthMessage(response.error.message);else if(authMode==='signup')setAuthMessage('Check your email to confirm your account, then sign in.');};
  $('#toggle-auth').onclick=()=>{authMode=authMode==='signin'?'signup':'signin';$('#toggle-auth').textContent=authMode==='signin'?'New here? Create an account':'Already have an account? Sign in';$('#auth-form button').textContent=authMode==='signin'?'Sign in':'Create account';setAuthMessage('');};
  $('#sign-out').onclick=()=>sb.auth.signOut();$('#add-task').onclick=()=>openTask();$('#task-form').onsubmit=save;$('#task-progress').oninput=e=>$('#progress-output').textContent=`${e.target.value}%`;$('.close').onclick=$('.cancel').onclick=()=>$('#task-dialog').close();$('#delete-task').onclick=async()=>{if(editingId&&confirm('Delete this task permanently?')){const {error}=await sb.from('tasks').delete().eq('id',editingId);if(error)message(error.message);else{$('#task-dialog').close();await load();}}};$('#search').oninput=renderBoards;$('#history-search').oninput=renderHistory;document.querySelectorAll('.nav').forEach(b=>b.onclick=()=>{document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x===b));['tasks','history','stats'].forEach(v=>document.getElementById(`${v}-view`).hidden=v!==b.dataset.view);});
  init();
})();
