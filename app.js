(() => {
'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const state = {apiUrl:localStorage.getItem('ss_api_url')||'',token:sessionStorage.getItem('ss_token')||'',provider:localStorage.getItem('ss_provider')||'gemini',questions:[],aiCount:0,user:null};
const titles={dashboard:'Dashboard',generator:'Generator Soal AI',bank:'Bank Soal',users:'Manajemen Pengguna',cbt:'Ujian / CBT',reports:'Laporan',settings:'Pengaturan & Login'};
$('#year').textContent=new Date().getFullYear();
function notify(msg,type=''){const n=$('#notice');n.textContent=msg;n.className='notice'+(type?' '+type:'');n.classList.remove('hidden');}
function view(v){$$('.view').forEach(x=>x.classList.toggle('hidden',x.id!=='view-'+v));$$('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===v));$('#title').textContent=titles[v]||v;$('#sidebar').classList.remove('open');}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>view(b.dataset.view)));
$$('[data-goto]').forEach(b=>b.addEventListener('click',()=>view(b.dataset.goto)));
$('#menu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
const sf=$('#settingsForm');sf.elements.apiUrl.value=state.apiUrl;sf.elements.provider.value=state.provider;sf.elements.token.value=state.token;
async function api(action,payload={},method='POST'){
 if(!state.apiUrl)throw Error('Isi Apps Script Web App URL terlebih dahulu di Pengaturan.');
 const url=new URL(state.apiUrl);
 if(method==='GET'){url.searchParams.set('action',action);const r=await fetch(url);if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,token:state.token,...payload})});
 const d=await r.json();if(!r.ok||d.ok===false)throw Error(d.error||('HTTP '+r.status));return d;
}
sf.addEventListener('submit',e=>{e.preventDefault();state.apiUrl=sf.elements.apiUrl.value.trim();state.provider=sf.elements.provider.value;state.token=sf.elements.token.value.trim();localStorage.setItem('ss_api_url',state.apiUrl);localStorage.setItem('ss_provider',state.provider);if(state.token)sessionStorage.setItem('ss_token',state.token);else sessionStorage.removeItem('ss_token');notify('Pengaturan disimpan di browser ini.','success');});
$('#testConnection').addEventListener('click',async()=>{const box=$('#connectionStatus');try{const d=await api('health',{},'GET');box.textContent='Backend merespons: '+(d.service||'OK')+' · '+(d.version||'');box.className='notice success';}catch(e){box.textContent=e.message;box.className='notice error';}});
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;try{const d=await api('login',{email:f.elements.email.value.trim(),password:f.elements.password.value});if(!d.token)throw Error('Token tidak diterima dari backend.');state.token=d.token;state.user=d.user||null;sessionStorage.setItem('ss_token',d.token);sf.elements.token.value=d.token;$('#sessionLabel').textContent=state.user?state.user.name+' · '+state.user.role:'Login';$('#avatar').textContent=state.user?.name?.[0]?.toUpperCase()||'G';notify('Login berhasil.','success');if(['admin','teacher'].includes(state.user?.role))await refreshQuestions();setRoleUI();}catch(err){notify('Login gagal: '+err.message,'error');}});
$('#logout').addEventListener('click',()=>{state.token='';state.user=null;$('#usersNav').classList.add('hidden');$('#teacherExamPanel').classList.add('hidden');$('#studentExamPanel').classList.add('hidden');sessionStorage.removeItem('ss_token');sf.elements.token.value='';$('#sessionLabel').textContent='Belum login';notify('Token lokal dihapus. Sesi server kedaluwarsa sesuai masa berlaku.');});
$('#generatorForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,btn=$('#generateBtn');btn.disabled=true;btn.textContent='Menyusun soal…';try{const s=Object.fromEntries(new FormData(f));s.count=Number(s.count);s.provider=state.provider;const d=await api('generateQuestions',{settings:s});renderGenerated(d.questions||[]);state.aiCount+=(d.questions||[]).length;$('#statAi').textContent=state.aiCount;notify('Soal berhasil dibuat. Periksa kembali kunci dan kesesuaiannya sebelum digunakan.','success');}catch(err){notify('Generate gagal: '+err.message,'error');}finally{btn.disabled=false;btn.textContent='✦ Generate soal';}});
function renderGenerated(qs){const root=$('#generated');root.replaceChildren();if(!qs.length){root.textContent='AI belum mengembalikan soal.';return;}qs.forEach((q,i)=>{const card=document.createElement('article');card.className='question-result';const h=document.createElement('h4');h.textContent=(i+1)+'. '+(q.question||'(Teks soal kosong)');card.append(h);if(Array.isArray(q.options)){const ol=document.createElement('ol');ol.type='A';q.options.forEach(o=>{const li=document.createElement('li');li.textContent=typeof o==='string'?o:(o.text||'');ol.append(li);});card.append(ol);}if(q.answer!==undefined){const a=document.createElement('div');a.className='answer';a.textContent='Kunci jawaban: '+(typeof q.answer==='string'?q.answer:JSON.stringify(q.answer));card.append(a);}if(q.explanation){const p=document.createElement('p');p.textContent='Pembahasan: '+q.explanation;card.append(p);}const b=document.createElement('button');b.className='btn outline';b.textContent='Simpan ke bank soal';b.addEventListener('click',async()=>{try{await api('save',{table:'questions',record:q});b.textContent='Tersimpan ✓';b.disabled=true;await refreshQuestions();}catch(err){notify('Gagal menyimpan: '+err.message,'error');}});card.append(b);root.append(card);});}
async function refreshQuestions(){try{const d=await api('list',{table:'questions'});state.questions=d.records||[];$('#statQuestions').textContent=state.questions.length;renderTable();}catch(err){$('#questionTable').textContent='Tidak dapat memuat bank soal: '+err.message;}}
function renderTable(){const root=$('#questionTable'),term=$('#searchQuestions').value.toLowerCase(),rows=state.questions.filter(q=>JSON.stringify(q).toLowerCase().includes(term));root.replaceChildren();if(!rows.length){root.className='empty';root.textContent='Belum ada soal atau pencarian tidak menemukan hasil.';return;}root.className='';const t=document.createElement('table'),thead=document.createElement('thead');thead.innerHTML='<tr><th>SOAL</th><th>MAPEL</th><th>KELAS / FASE</th><th>AKSI</th></tr>';t.append(thead);const body=document.createElement('tbody');rows.forEach(q=>{const tr=document.createElement('tr');const td1=document.createElement('td');td1.textContent=q.question||'';const td2=document.createElement('td');td2.textContent=q.subject||'';const td3=document.createElement('td');td3.textContent=(q.grade||'')+' / '+(q.phase||'');const td4=document.createElement('td'),del=document.createElement('button');del.className='btn outline';del.textContent='Hapus';del.addEventListener('click',async()=>{if(!confirm('Hapus soal ini?'))return;try{await api('remove',{table:'questions',id:q.id});await refreshQuestions();notify('Soal dihapus.','success');}catch(err){notify('Gagal menghapus: '+err.message,'error');}});td4.append(del);tr.append(td1,td2,td3,td4);body.append(tr);});t.append(body);root.append(t);}
$('#reloadQuestions').addEventListener('click',refreshQuestions);$('#searchQuestions').addEventListener('input',renderTable);
$('#exportCsv').addEventListener('click',()=>{if(!state.questions.length){notify('Bank soal kosong.');return;}const cols=['id','subject','grade','phase','type','question','answer','difficulty'];const esc=v=>'"'+String(v??'').replaceAll('"','""')+'"';const csv=[cols.join(','),...state.questions.map(q=>cols.map(k=>esc(typeof q[k]==='object'?JSON.stringify(q[k]):q[k])).join(','))].join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='SmartSoal-BankSoal.csv';a.click();URL.revokeObjectURL(url);});

state.currentAttempt=null;state.attemptQuestions=[];state.answerValues={};state.timerHandle=null;state.autosaveHandle=null;
function el(tag,txt,cls){const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n;}
function showBox(id,msg,type=''){const n=$('#'+id);n.textContent=msg;n.className='notice'+(type?' '+type:'');n.classList.remove('hidden');}
function setRoleUI(){
 const role=state.user?.role||'';
 $('#usersNav').classList.toggle('hidden',role!=='admin');
 $('[data-view="generator"],[data-view="bank"]').forEach(n=>n.classList.toggle('hidden',!['admin','teacher'].includes(role)));
 $('#teacherExamPanel').classList.toggle('hidden',!['admin','teacher'].includes(role));
 $('#studentExamPanel').classList.toggle('hidden',role!=='student');
 if(role==='admin')refreshUsers();
 if(['admin','teacher'].includes(role)){renderExamQuestionChoices();refreshExams();refreshReports();}
 if(role==='student')refreshExams();
}
function renderExamQuestionChoices(){
 const root=$('#examQuestionChoices');root.replaceChildren();
 if(!state.questions.length){root.append(el('p','Belum ada soal. Simpan soal di Bank Soal terlebih dahulu.'));return;}
 state.questions.forEach(q=>{
  const label=el('label',undefined,'choice-row'),box=el('input');box.type='checkbox';box.name='questionIds';box.value=q.id;
  label.append(box,el('span',(q.subject||'Mapel')+' · '+(q.grade||'')+' · '+String(q.question||'').slice(0,180)));root.append(label);
 });
}
async function refreshUsers(){
 if(state.user?.role!=='admin')return;
 const root=$('#usersTable');root.textContent='Memuat pengguna…';
 try{const d=await api('list',{table:'users'}),users=d.records||[];root.replaceChildren();
  if(!users.length){root.textContent='Belum ada pengguna.';return;}
  const t=el('table'),thead=el('thead'),tr=el('tr');['Nama','Email','Peran','Status','Aksi'].forEach(x=>tr.append(el('th',x)));thead.append(tr);t.append(thead);
  const body=el('tbody');users.forEach(u=>{const row=el('tr');[u.name,u.email,u.role,u.active?'Aktif':'Nonaktif'].forEach(x=>row.append(el('td',String(x||''))));
   const actions=el('td'),edit=el('button','Edit','btn outline'),del=el('button','Hapus','btn outline');
   edit.type=del.type='button';edit.addEventListener('click',()=>{const f=$('#userForm');['id','name','email','role'].forEach(k=>f.elements[k].value=u[k]||'');f.elements.active.value=u.active?'true':'false';f.elements.password.value='';$('#userFormTitle').textContent='Edit pengguna';view('users');});
   del.disabled=u.id===state.user.id;del.addEventListener('click',async()=>{if(!confirm('Hapus akun '+u.email+'?'))return;try{await api('userRemove',{id:u.id});notify('Pengguna dihapus.','success');refreshUsers();}catch(e){notify('Gagal menghapus pengguna: '+e.message,'error');}});
   actions.append(edit,del);row.append(actions);body.append(row);});t.append(body);root.append(t);
 }catch(e){root.textContent='Gagal memuat pengguna: '+e.message;}
}
$('#userForm').addEventListener('submit',async e=>{e.preventDefault();if(state.user?.role!=='admin')return notify('Hanya Admin yang dapat mengelola pengguna.','error');
 const f=e.currentTarget,r={id:f.elements.id.value||undefined,name:f.elements.name.value.trim(),email:f.elements.email.value.trim(),role:f.elements.role.value,active:f.elements.active.value==='true',password:f.elements.password.value};
 if(!r.id&&!r.password)return notify('Password wajib untuk akun baru.','error');
 try{await api('userSave',{record:r});notify('Pengguna berhasil disimpan.','success');resetUserForm();await refreshUsers();}catch(err){notify('Gagal menyimpan pengguna: '+err.message,'error');}
});
function resetUserForm(){const f=$('#userForm');f.reset();f.elements.id.value='';$('#userFormTitle').textContent='Tambah pengguna';}
$('#resetUserForm').addEventListener('click',resetUserForm);$('#reloadUsers').addEventListener('click',refreshUsers);
$('#examForm').addEventListener('submit',async e=>{
 e.preventDefault();if(!['admin','teacher'].includes(state.user?.role))return notify('Fitur ini hanya untuk Admin/Guru.','error');
 const f=e.currentTarget,questionIds=[...f.querySelectorAll('input[name="questionIds"]:checked')].map(x=>x.value);
 if(!questionIds.length)return notify('Pilih minimal satu soal untuk ujian.','error');
 const iso=v=>v?new Date(v).toISOString():'';
 const record={title:f.elements.title.value.trim(),description:f.elements.description.value,durationMinutes:Number(f.elements.durationMinutes.value),startTime:iso(f.elements.startTime.value),endTime:iso(f.elements.endTime.value),status:f.elements.status.value,questionIds};
 try{const d=await api('createExam',{record});showBox('examMessage','Ujian berhasil dibuat. Token: '+d.exam.token+' · Status: '+d.exam.status,'success');f.reset();f.elements.durationMinutes.value=30;await refreshExams();}catch(err){showBox('examMessage','Gagal membuat ujian: '+err.message,'error');}
});
async function refreshExams(){
 if(!state.user)return;const root=$('#examsTable');root.textContent='Memuat data…';
 try{const d=await api('myExams'),rows=d.records||[];root.replaceChildren();
  if(!rows.length){root.textContent=state.user.role==='student'?'Belum ada riwayat ujian. Masukkan token dari guru untuk mulai.':'Belum ada ujian. Buat ujian di formulir atas.';return;}
  const t=el('table'),head=el('thead'),hr=el('tr');(state.user.role==='student'?['Ujian','Status','Nilai','Aksi']:['Judul ujian','Token','Status','Durasi','Aksi']).forEach(x=>hr.append(el('th',x)));head.append(hr);t.append(head);const body=el('tbody');
  rows.forEach(x=>{const tr=el('tr');
   if(state.user.role==='student'){
    tr.append(el('td',x.examTitle||x.title||x.examId),el('td',x.status||'Belum mulai'),el('td',x.score===undefined||x.score===''?'—':String(x.score)));
    const td=el('td');td.append(el('span',x.status==='submitted'?'Selesai':'Sesi tersimpan'));tr.append(td);
   }else{
    tr.append(el('td',x.title||''),el('td',x.token||''),el('td',x.status||'draft'),el('td',String(x.durationMinutes||'')+' menit'));
    const td=el('td'),copy=el('button','Salin token','btn outline'),report=el('button','Hasil','btn outline'),del=el('button','Hapus','btn outline');copy.type=report.type=del.type='button';
    copy.addEventListener('click',()=>{if(navigator.clipboard?.writeText)navigator.clipboard.writeText(x.token).then(()=>notify('Token disalin.','success')).catch(()=>notify('Token: '+x.token));else notify('Token ujian: '+x.token);});
    report.addEventListener('click',async()=>{try{const r=await api('examStatus',{examId:x.id});renderExamReport(r);}catch(err){notify(err.message,'error');}});
    del.addEventListener('click',async()=>{if(!confirm('Hapus ujian ini?'))return;try{await api('remove',{table:'exams',id:x.id});refreshExams();}catch(err){notify(err.message,'error');}});
    td.append(copy,report,del);tr.append(td);
   }body.append(tr);
  });t.append(body);root.append(t);
 }catch(e){root.textContent='Gagal memuat ujian: '+e.message;}
}
function renderExamReport(data){
 const root=$('#reportsTable');root.replaceChildren();root.append(el('h3','Hasil: '+(data.exam?.title||'')));
 const records=data.records||[];if(!records.length){root.append(el('p','Belum ada siswa yang mengumpulkan ujian.'));view('reports');return;}
 const t=el('table'),thead=el('thead'),hr=el('tr');['Siswa ID','Status','Nilai','Dikumpulkan'].forEach(x=>hr.append(el('th',x)));thead.append(hr);t.append(thead);const body=el('tbody');
 records.forEach(r=>{const tr=el('tr');[r.user||r.userId,r.status,r.score===undefined?'—':r.score,r.submittedAt||'—'].forEach(v=>tr.append(el('td',String(v??''))));body.append(tr);});t.append(body);root.append(t);view('reports');
}
async function refreshReports(){
 if(!state.user)return;
 try{const d=state.user.role==='student'?await api('myExams'):await api('list',{table:'attempts'}),rows=d.records||[],root=$('#reportsTable');
  if(!rows.length){root.textContent='Belum ada hasil ujian.';return;}
  const t=el('table'),thead=el('thead'),hr=el('tr');(state.user.role==='student'?['Ujian','Status','Nilai','Waktu kumpul']:['Ujian ID','Siswa ID','Status','Nilai','Waktu kumpul']).forEach(x=>hr.append(el('th',x)));thead.append(hr);t.append(thead);const body=el('tbody');
  rows.forEach(r=>{const tr=el('tr');(state.user.role==='student'?[r.examTitle||r.examId,r.status,r.score===undefined?'—':r.score,r.submittedAt||'—']:[r.examId,r.userId,r.status,r.score===undefined?'—':r.score,r.submittedAt||'—']).forEach(v=>tr.append(el('td',String(v??''))));body.append(tr);});t.append(body);root.append(t);
 }catch(e){$('#reportsTable').textContent='Gagal memuat laporan: '+e.message;}
}
$('#reloadExams').addEventListener('click',refreshExams);$('#reloadReports').addEventListener('click',refreshReports);
$('#joinExamForm').addEventListener('submit',async e=>{
 e.preventDefault();const token=e.currentTarget.elements.examToken.value.trim().toUpperCase();
 try{const d=await api('joinExam',{examToken:token});const started=await api('startAttempt',{examToken:token});state.currentAttempt=started.attempt;state.attemptQuestions=d.questions||[];state.answerValues=Object.assign({},started.attempt.answers||{});$('#attemptTitle').textContent=d.exam.title;$('#attemptPanel').classList.remove('hidden');renderAttemptQuestions();startExamTimer();showBox('examMessage','Token valid. Jawaban tersimpan berkala dan batas waktu divalidasi oleh server.','success');}
 catch(err){showBox('examMessage','Tidak dapat memulai ujian: '+err.message,'error');}
});
function renderAttemptQuestions(){
 const root=$('#attemptQuestions');root.replaceChildren();
 state.attemptQuestions.forEach((q,i)=>{const card=el('article',undefined,'attempt-question'),title=el('h4',(i+1)+'. '+q.question);card.append(title);
  if(Array.isArray(q.options)&&q.options.length&&['essay','short_answer'].indexOf(q.type)<0){
   q.options.forEach((opt,j)=>{const letter='ABCD'[j]||String(j+1),label=el('label',undefined,'answer-option'),input=el('input');input.type='radio';input.name='q_'+q.id;input.value=letter;input.checked=String(state.answerValues[q.id]||'')===letter;label.append(input,el('span',letter+'. '+(typeof opt==='string'?opt:opt.text||'')));card.append(label);});
  }else{const input=el('textarea');input.name='q_'+q.id;input.rows=3;input.maxLength=5000;input.placeholder='Tuliskan jawaban…';input.value=state.answerValues[q.id]||'';card.append(input);}
  root.append(card);
 });
 $('#attemptForm').querySelector('button[type="submit"]').disabled=state.currentAttempt?.status==='submitted';
}
function collectAnswers(){
 const answers={};state.attemptQuestions.forEach(q=>{const selected=$('#attemptQuestions').querySelector('input[name="q_'+q.id+'"]:checked');const text=$('#attemptQuestions').querySelector('textarea[name="q_'+q.id+'"]');if(selected)answers[q.id]=selected.value;else if(text)answers[q.id]=text.value;else answers[q.id]=state.answerValues[q.id]||'';});return answers;
}
function queueAutosave(){
 if(!state.currentAttempt||state.currentAttempt.status==='submitted')return;
 state.answerValues=collectAnswers();clearTimeout(state.autosaveHandle);$('#attemptSaveStatus').textContent='Menyimpan jawaban…';
 state.autosaveHandle=setTimeout(async()=>{try{const d=await api('saveAnswers',{attemptId:state.currentAttempt.id,answers:state.answerValues});$('#attemptSaveStatus').textContent='Tersimpan otomatis · '+new Date().toLocaleTimeString('id-ID');state.currentAttempt.deadlineAt=d.deadlineAt;}catch(err){$('#attemptSaveStatus').textContent='Belum tersimpan: '+err.message;}},1200);
}
$('#attemptQuestions').addEventListener('change',queueAutosave);$('#attemptQuestions').addEventListener('input',queueAutosave);
async function submitCurrentAttempt(auto=false){
 if(!state.currentAttempt||state.currentAttempt.status==='submitted')return;
 clearTimeout(state.autosaveHandle);const answers=collectAnswers();
 try{const d=await api('submitExam',{attemptId:state.currentAttempt.id,answers});state.currentAttempt.status='submitted';state.currentAttempt.score=d.score;clearInterval(state.timerHandle);$('#examTimer').textContent='Selesai';$('#attemptSaveStatus').textContent='Jawaban telah dikumpulkan.';$('#attemptForm').querySelectorAll('input,textarea,button').forEach(x=>x.disabled=true);notify((auto?'Waktu habis. ':'')+'Ujian dikumpulkan. Nilai otomatis: '+d.score,'success');await refreshExams();await refreshReports();}
 catch(err){notify('Gagal mengumpulkan ujian: '+err.message,'error');}
}
$('#attemptForm').addEventListener('submit',async e=>{e.preventDefault();if(confirm('Kumpulkan ujian sekarang? Jawaban tidak dapat diubah setelah dikumpulkan.'))await submitCurrentAttempt(false);});
function startExamTimer(){
 clearInterval(state.timerHandle);const tick=async()=>{if(!state.currentAttempt)return;const remaining=Date.parse(state.currentAttempt.deadlineAt)-Date.now();if(remaining<=0){$('#examTimer').textContent='00:00';await submitCurrentAttempt(true);return;}const seconds=Math.ceil(remaining/1000);$('#examTimer').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');};
 tick();state.timerHandle=setInterval(tick,1000);
}
async function initializeSession(){
 try{const d=await api('me');state.user=d.user;$('#sessionLabel').textContent=state.user.name+' · '+state.user.role;$('#avatar').textContent=state.user.name?.[0]?.toUpperCase()||'G';if(['admin','teacher'].includes(state.user.role))await refreshQuestions();setRoleUI();}
 catch(e){state.user=null;$('#sessionLabel').textContent='Sesi tidak aktif';}
}

if(state.token){$('#sessionLabel').textContent='Memeriksa sesi…';initializeSession();}
})();