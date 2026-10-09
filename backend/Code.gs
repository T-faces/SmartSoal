/**
 * SmartSoal AI backend — Google Apps Script (V8).
 * Script Properties required: SPREADSHEET_ID, BOOTSTRAP_KEY, AI_PROVIDER.
 * Optional AI keys: OPENAI_API_KEY, GEMINI_API_KEY.
 * Never put provider keys in GitHub Pages or Google Sheets.
 */
const SCHEMA = {
  users: ['id','name','email','passwordSalt','passwordHash','role','active','createdAt'],
  subjects: ['id','name','createdAt'],
  questions: ['id','subject','grade','phase','type','question','options','answer','explanation','difficulty','cp','topic','createdBy','createdAt'],
  exams: ['id','title','description','questionIds','startTime','endTime','durationMinutes','token','status','createdBy','createdAt'],
  results: ['id','examId','userId','answers','score','submittedAt'],
  attempts: ['id','examId','userId','startedAt','deadlineAt','answers','status','score','submittedAt','updatedAt'],
  settings: ['key','value','updatedAt'],
  sessions: ['tokenHash','userId','expiresAt','createdAt'],
  audit: ['id','userId','action','tableName','recordId','createdAt']
};
const SESSION_HOURS = 8;
const MAX_QUESTIONS = 25;
const JSON_FIELDS = ['options','answer','questionIds','answers'];

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || 'health');
  if (action === 'health') return output_({ok:true,service:'SmartSoal API',version:'0.1.0',time:new Date().toISOString()});
  return output_({ok:false,error:'Aksi GET tidak dikenal.'});
}
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('Body JSON wajib diisi.');
    const req = JSON.parse(e.postData.contents);
    let result;
    switch (String(req.action || '')) {
      case 'login': result = login_(req); break;
      case 'me': result = {user:requireUser_(req.token)}; break;
      case 'list': result = list_(req); break;
      case 'save': result = save_(req); break;
      case 'remove': result = remove_(req); break;
      case 'generateQuestions': result = generateQuestions_(req); break;
      case 'settings': result = settings_(req); break;
      case 'userSave': result = userSave_(req); break;
      case 'userRemove': result = userRemove_(req); break;
      case 'createExam': result = createExam_(req); break;
      case 'joinExam': result = joinExam_(req); break;
      case 'startAttempt': result = startAttempt_(req); break;
      case 'saveAnswers': result = saveAnswers_(req); break;
      case 'submitExam': result = submitExam_(req); break;
      case 'myExams': result = myExams_(req); break;
      case 'examStatus': result = examStatus_(req); break;
      default: throw new Error('Aksi tidak dikenal: ' + String(req.action || ''));
    }
    return output_(Object.assign({ok:true}, result || {}));
  } catch (err) {
    return output_({ok:false,error:String(err && err.message || err)});
  }
}
function output_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function props_(){return PropertiesService.getScriptProperties();}
function spreadsheet_(){
  const id=props_().getProperty('SPREADSHEET_ID');
  if(!id)throw new Error('SPREADSHEET_ID belum diatur di Script Properties.');
  return SpreadsheetApp.openById(id);
}
function setupDatabase(){
  const ss=spreadsheet_();
  Object.keys(SCHEMA).forEach(name=>{
    let sh=ss.getSheetByName(name);
    if(!sh)sh=ss.insertSheet(name);
    const headers=SCHEMA[name];
    if(sh.getLastRow()===0)sh.getRange(1,1,1,headers.length).setValues([headers]);
    else{
      const current=sh.getRange(1,1,1,Math.max(sh.getLastColumn(),headers.length)).getDisplayValues()[0];
      headers.forEach((h,i)=>{if(current[i]!==h)throw new Error('Header sheet '+name+' tidak sesuai kolom '+(i+1)+'. Harap gunakan sheet baru atau perbaiki header.');});
    }
    sh.setFrozenRows(1);
  });
  return 'Database SmartSoal siap: '+ss.getUrl();
}
function sheet_(table){
  if(!SCHEMA[table])throw new Error('Tabel tidak diizinkan.');
  const sh=spreadsheet_().getSheetByName(table);
  if(!sh)throw new Error('Sheet '+table+' belum tersedia. Jalankan setupDatabase.');
  return sh;
}
function parseCell_(key,value){
  if(typeof value!=='string'||!value)return value;
  if(JSON_FIELDS.indexOf(key)>=0){try{return JSON.parse(value);}catch(e){return value;}}
  return value;
}
function rows_(table){
  const vals=sheet_(table).getDataRange().getValues();
  if(vals.length<2)return [];
  const headers=vals[0];
  return vals.slice(1).filter(r=>r.some(v=>v!==''&&v!==null)).map(r=>{
    const o={};
    headers.forEach((h,i)=>{let v=r[i];if(v instanceof Date)v=v.toISOString();o[h]=parseCell_(h,v);});
    return o;
  });
}
function cell_(v){return v===undefined||v===null?'':(typeof v==='object'?JSON.stringify(v):v);}
function append_(table,record){
  const headers=SCHEMA[table];
  sheet_(table).appendRow(headers.map(h=>cell_(record[h])));
}
function digest_(text){
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(text),Utilities.Charset.UTF_8)
    .map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
}
function makePassword_(password,salt){return digest_(salt+':'+password);}
function publicUser_(u){return {id:u.id,name:u.name,email:u.email,role:u.role,active:u.active===true||String(u.active)==='true'||u.active===1,createdAt:u.createdAt||''};}

/** Run once from the Apps Script editor after setting the BOOTSTRAP_* properties. */
function bootstrapAdminFromEditor(){
  const p=props_();
  const key=p.getProperty('BOOTSTRAP_KEY');
  if(!key)throw new Error('BOOTSTRAP_KEY belum diatur.');
  const name=p.getProperty('BOOTSTRAP_ADMIN_NAME')||'Administrator';
  const email=String(p.getProperty('BOOTSTRAP_ADMIN_EMAIL')||'').trim().toLowerCase();
  const password=p.getProperty('BOOTSTRAP_ADMIN_PASSWORD')||'';
  if(!email||email.indexOf('@')<1)throw new Error('BOOTSTRAP_ADMIN_EMAIL tidak valid.');
  if(password.length<12)throw new Error('Password admin minimal 12 karakter.');
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    if(rows_('users').some(u=>String(u.role)==='admin'))throw new Error('Admin sudah tersedia; bootstrap tidak dijalankan.');
    const salt=Utilities.getUuid();
    append_('users',{id:Utilities.getUuid(),name:name,email:email,passwordSalt:salt,passwordHash:makePassword_(password,salt),role:'admin',active:true,createdAt:new Date().toISOString()});
    p.deleteProperty('BOOTSTRAP_KEY');p.deleteProperty('BOOTSTRAP_ADMIN_PASSWORD');
    return 'Admin berhasil dibuat. BOOTSTRAP_KEY dan password bootstrap telah dihapus.';
  }finally{lock.releaseLock();}
}
function login_(req){
  const email=String(req.email||'').trim().toLowerCase(),password=String(req.password||'');
  if(!email||!password)throw new Error('Email dan password wajib diisi.');
  const user=rows_('users').find(u=>String(u.email).toLowerCase()===email&&String(u.active)!=='false'&&u.active!==0);
  if(!user||!user.passwordSalt||!safePassword_(password,user))throw new Error('Email atau password salah.');
  const token=Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,'');
  const now=Date.now(),expires=new Date(now+SESSION_HOURS*3600000).toISOString();
  append_('sessions',{tokenHash:digest_(token),userId:user.id,expiresAt:expires,createdAt:new Date(now).toISOString()});
  audit_(user,'login','users',user.id);
  return {token,expiresAt:expires,user:publicUser_(user)};
}
function safePassword_(password,user){return makePassword_(password,String(user.passwordSalt))===String(user.passwordHash);}
function requireUser_(token){
  if(!token||typeof token!=='string')throw new Error('Silakan login terlebih dahulu.');
  const hash=digest_(token),now=Date.now();
  const session=rows_('sessions').find(s=>s.tokenHash===hash&&Date.parse(s.expiresAt)>now);
  if(!session)throw new Error('Sesi tidak valid atau kedaluwarsa. Silakan login kembali.');
  const user=rows_('users').find(u=>u.id===session.userId&&(u.active===true||String(u.active)==='true'||u.active===1));
  if(!user)throw new Error('Pengguna tidak aktif.');
  return publicUser_(user);
}
function userRecord_(token){const pub=requireUser_(token);return rows_('users').find(u=>u.id===pub.id);}
function role_(user,allowed){if(allowed.indexOf(user.role)<0)throw new Error('Akses ditolak untuk peran '+user.role+'.');}
function list_(req){
  const user=userRecord_(req.token),table=String(req.table||'');
  if(['questions','subjects','exams','results','users','attempts'].indexOf(table)<0)throw new Error('Tabel tidak dapat ditampilkan.');
  if(table==='users')role_(user,['admin']);
  if(table==='questions'||table==='exams')role_(user,['admin','teacher']);
  let records=rows_(table);
  if(table==='users')records=records.map(publicUser_);
  if(table==='questions'&&user.role==='teacher')records=records.filter(r=>r.createdBy===user.id);
  if(table==='exams'&&user.role==='teacher')records=records.filter(r=>r.createdBy===user.id);
  if(table==='results'&&user.role==='student')records=records.filter(r=>r.userId===user.id);
  if(table==='attempts'&&user.role==='student')records=records.filter(r=>r.userId===user.id);
  if(table==='attempts'&&user.role==='teacher') {const owned=rows_('exams').filter(e=>e.createdBy===user.id).map(e=>e.id);records=records.filter(r=>owned.indexOf(r.examId)>=0);}
  if(table==='exams'&&user.role==='student')records=records.filter(e=>String(e.status)==='published' || String(e.status)==='active');
  if(table==='results'&&user.role==='teacher'){
    const owned=rows_('exams').filter(e=>e.createdBy===user.id).map(e=>e.id);
    records=records.filter(r=>owned.indexOf(r.examId)>=0);
  }
  return {records:records};
}
function save_(req){
  const user=userRecord_(req.token),table=String(req.table||''),rec=req.record||{};
  if(['questions','subjects','exams'].indexOf(table)<0)throw new Error('Tabel ini tidak dapat disimpan melalui endpoint ini.');
  if(table==='subjects')role_(user,['admin']);else role_(user,['admin','teacher']);
  const id=String(rec.id||Utilities.getUuid()),headers=SCHEMA[table];
  const record={};headers.forEach(h=>{if(rec[h]!==undefined)record[h]=rec[h];});
  record.id=id;record.createdAt=rec.createdAt||new Date().toISOString();
  if(table==='questions'){
    if(!String(record.question||'').trim())throw new Error('Teks soal wajib diisi.');
    record.createdBy=user.id;
    if(String(record.question).length>12000)throw new Error('Teks soal terlalu panjang.');
  }
  if(table==='subjects'&&!String(record.name||'').trim())throw new Error('Nama mata pelajaran wajib diisi.');
  if(table==='exams'){record.createdBy=user.id;if(!String(record.title||'').trim())throw new Error('Judul ujian wajib diisi.');if(!record.token)record.token=makeExamToken_();if(!record.status)record.status='draft';if(!Number(record.durationMinutes)||Number(record.durationMinutes)<1||Number(record.durationMinutes)>300)throw new Error('Durasi ujian harus 1–300 menit.');if(!Array.isArray(record.questionIds)||!record.questionIds.length)throw new Error('Pilih minimal satu soal.');}
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    const sh=sheet_(table),values=sh.getDataRange().getValues(),head=values[0],idCol=head.indexOf('id');let row=-1,existing=null;
    for(let i=1;i<values.length;i++)if(String(values[i][idCol])===id){row=i+1;existing={};head.forEach((h,j)=>existing[h]=parseCell_(h,values[i][j]));break;}
    if(existing){
      if(existing.createdBy&&existing.createdBy!==user.id&&user.role!=='admin')throw new Error('Tidak boleh mengubah data milik pengguna lain.');
      const merged=Object.assign({},existing,record);
      sh.getRange(row,1,1,head.length).setValues([head.map(h=>cell_(merged[h]))]);
    }else append_(table,record);
  }finally{lock.releaseLock();}
  audit_(user,'save',table,id);
  return {record:record};
}
function remove_(req){
  const user=userRecord_(req.token),table=String(req.table||''),id=String(req.id||'');
  if(['questions','subjects','exams'].indexOf(table)<0)throw new Error('Tabel ini tidak dapat dihapus melalui endpoint ini.');
  if(table==='subjects')role_(user,['admin']);else role_(user,['admin','teacher']);
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    const sh=sheet_(table),vals=sh.getDataRange().getValues(),headers=vals[0],idCol=headers.indexOf('id');
    for(let i=1;i<vals.length;i++)if(String(vals[i][idCol])===id){
      const row={};headers.forEach((h,j)=>row[h]=parseCell_(h,vals[i][j]));
      if(row.createdBy&&row.createdBy!==user.id&&user.role!=='admin')throw new Error('Tidak boleh menghapus data milik pengguna lain.');
      if(table==='exams'&&rows_('attempts').some(a=>a.examId===id))throw new Error('Ujian tidak dapat dihapus karena sudah memiliki sesi siswa.');
      if(table==='questions'&&rows_('exams').some(ex=>{const ids=Array.isArray(ex.questionIds)?ex.questionIds:JSON.parse(ex.questionIds||'[]');return ids.indexOf(id)>=0;}))throw new Error('Soal tidak dapat dihapus karena digunakan pada ujian.');
      sh.deleteRow(i+1);audit_(user,'remove',table,id);return {deleted:true};
    }
  }finally{lock.releaseLock();}
  throw new Error('Data tidak ditemukan.');
}
function generateQuestions_(req){
  const user=userRecord_(req.token);role_(user,['admin','teacher']);
  const s=req.settings||{},count=Math.max(1,Math.min(MAX_QUESTIONS,Number(s.count)||10));
  ['subject','cp','topic'].forEach(k=>{if(!String(s[k]||'').trim())throw new Error('Kolom wajib: '+k);});
  const provider=String(s.provider||props_().getProperty('AI_PROVIDER')||'gemini').toLowerCase();
  const prompt=[
    'Anda ahli asesmen pendidikan Indonesia. Buat soal selaras dengan CP dan materi yang diberikan.',
    'Kembalikan hanya JSON valid dengan struktur {"questions":[{"question":"...","options":["opsi A","opsi B","opsi C","opsi D"],"answer":"...","explanation":"...","difficulty":"..."}]}.',
    'Jangan mengarang atau mengubah teks CP. Pastikan kunci benar dan soal tidak ambigu.',
    'Mapel: '+s.subject,'Kelas: '+s.grade,'Fase: '+s.phase,'Capaian Pembelajaran: '+s.cp,
    'Materi: '+s.topic,'Jenis soal: '+s.type,'Kesulitan: '+s.difficulty,'Jumlah tepat: '+count,
    'Untuk esai, benar/salah, menjodohkan, dan isian singkat, sesuaikan bentuk respons dan kunci; opsi boleh berupa array kosong jika tidak diperlukan.'
  ].join('\n');
  const text=callAI_(provider,prompt),parsed=parseAI_(text),items=Array.isArray(parsed)?parsed:parsed.questions;
  if(!Array.isArray(items))throw new Error('Format respons AI tidak sesuai.');
  const questions=items.slice(0,count).map(q=>({
    id:Utilities.getUuid(),subject:String(s.subject),grade:String(s.grade||''),phase:String(s.phase||''),type:String(s.type||'multiple_choice'),
    question:String(q.question||q.text||''),options:Array.isArray(q.options)?q.options:[],answer:q.answer===undefined?'':q.answer,
    explanation:String(q.explanation||''),difficulty:String(q.difficulty||s.difficulty||''),cp:String(s.cp),topic:String(s.topic),
    createdBy:user.id,createdAt:new Date().toISOString()
  }));
  if(!questions.length)throw new Error('AI tidak menghasilkan soal. Silakan coba lagi.');
  return {provider:provider,questions:questions};
}
function parseAI_(raw){
  const t=String(raw||'').trim().replace(/^\x60\x60\x60(?:json)?\s*/i,'').replace(/\s*\x60\x60\x60$/,'');
  try{return JSON.parse(t);}catch(e){const a=t.indexOf('{'),b=t.lastIndexOf('}');if(a>=0&&b>a)return JSON.parse(t.slice(a,b+1));throw new Error('Respons AI bukan JSON valid. Coba ulangi.');}
}
function callAI_(provider,prompt){
  const p=props_();let url,key,payload,headers={};
  if(provider==='openai'){
    key=p.getProperty('OPENAI_API_KEY');if(!key)throw new Error('OPENAI_API_KEY belum diatur di Script Properties.');
    url='https://api.openai.com/v1/chat/completions';headers.Authorization='Bearer '+key;
    payload={model:'gpt-4o-mini',temperature:0.25,response_format:{type:'json_object'},messages:[{role:'system',content:'Return valid JSON only.'},{role:'user',content:prompt}]};
  }else if(provider==='gemini'){
    key=p.getProperty('GEMINI_API_KEY');if(!key)throw new Error('GEMINI_API_KEY belum diatur di Script Properties.');
    url='https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key='+encodeURIComponent(key);
    payload={contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.25,responseMimeType:'application/json'}};
  }else throw new Error('Provider AI harus openai atau gemini.');
  const res=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',headers:headers,payload:JSON.stringify(payload),muteHttpExceptions:true});
  const code=res.getResponseCode(),body=res.getContentText();
  if(code<200||code>=300)throw new Error('Provider AI HTTP '+code+': '+body.slice(0,350));
  const data=JSON.parse(body);
  if(provider==='openai')return data.choices&&data.choices[0]&&data.choices[0].message?data.choices[0].message.content:'';
  return data.candidates&&data.candidates[0]&&data.candidates[0].content?data.candidates[0].content.parts.map(x=>x.text||'').join('\n'):'';
}
function settings_(req){
  const user=userRecord_(req.token);role_(user,['admin']);
  const allowed=['schoolName','defaultProvider','theme'],input=req.settings||{},sh=sheet_('settings');
  allowed.forEach(k=>{
    if(input[k]===undefined)return;
    if(k==='defaultProvider'&&['openai','gemini'].indexOf(String(input[k]))<0)throw new Error('Provider default tidak valid.');
    const old=rows_('settings').find(r=>r.key===k),rec={key:k,value:String(input[k]),updatedAt:new Date().toISOString()};
    if(old){const vals=sh.getDataRange().getValues(),head=vals[0],idx=vals.findIndex((r,i)=>i>0&&String(r[0])===k);if(idx>0)sh.getRange(idx+1,1,1,head.length).setValues([head.map(h=>cell_(rec[h]) )]);}
    else append_('settings',rec);
  });
  return {saved:true};
}

function makeExamToken_(){return Utilities.getUuid().replace(/-/g,'').slice(0,8).toUpperCase();}
function userSave_(req){
  const actor=userRecord_(req.token);role_(actor,['admin']);
  const r=req.record||{},name=String(r.name||'').trim(),email=String(r.email||'').trim().toLowerCase(),role=String(r.role||'');
  if(!name)throw new Error('Nama pengguna wajib diisi.');
  if(!email||email.indexOf('@')<1)throw new Error('Email tidak valid.');
  if(['admin','teacher','student'].indexOf(role)<0)throw new Error('Peran harus admin, teacher, atau student.');
  const all=rows_('users'),id=String(r.id||Utilities.getUuid()),existing=all.find(u=>String(u.id)===id);
  if(all.some(u=>String(u.email).toLowerCase()===email&&String(u.id)!==id))throw new Error('Email sudah digunakan.');
  const password=String(r.password||'');
  if(!existing&&password.length<12)throw new Error('Password pengguna baru minimal 12 karakter.');
  if(password&&password.length<12)throw new Error('Password minimal 12 karakter.');
  if(existing&&existing.role==='admin'&&role!=='admin'&&all.filter(u=>u.role==='admin'&&(u.active===true||String(u.active)==='true')).length<=1)throw new Error('Tidak boleh menonaktifkan atau mengubah peran admin terakhir.');
  const salt=password?Utilities.getUuid():(existing?existing.passwordSalt:Utilities.getUuid());
  const rec={id,name,email,role,active:r.active===undefined?(existing?existing.active:true):r.active===true||String(r.active)==='true',createdAt:existing?existing.createdAt:new Date().toISOString(),passwordSalt:password?salt:(existing?existing.passwordSalt:salt),passwordHash:password?makePassword_(password,salt):(existing?existing.passwordHash:'')};
  const sh=sheet_('users'),vals=sh.getDataRange().getValues(),headers=vals[0];let row=-1;
  for(let i=1;i<vals.length;i++)if(String(vals[i][0])===id){row=i+1;break;}
  if(row>0)sh.getRange(row,1,1,headers.length).setValues([headers.map(h=>cell_(rec[h]))]);else append_('users',rec);
  audit_(actor,existing?'update':'create','users',id);
  return {user:publicUser_(rec)};
}
function userRemove_(req){
  const actor=userRecord_(req.token);role_(actor,['admin']);const id=String(req.id||'');
  if(id===actor.id)throw new Error('Anda tidak dapat menghapus akun sendiri.');
  const sh=sheet_('users'),vals=sh.getDataRange().getValues(),headers=vals[0];
  for(let i=1;i<vals.length;i++)if(String(vals[i][0])===id){
    if(String(vals[i][5])==='admin'&&rows_('users').filter(u=>u.role==='admin'&&(u.active===true||String(u.active)==='true')).length<=1)throw new Error('Admin terakhir tidak dapat dihapus.');
    sh.deleteRow(i+1);audit_(actor,'remove','users',id);return {deleted:true};
  }
  throw new Error('Pengguna tidak ditemukan.');
}
function createExam_(req){
  const user=userRecord_(req.token);role_(user,['admin','teacher']);
  const r=req.record||{},title=String(r.title||'').trim(),ids=Array.isArray(r.questionIds)?r.questionIds.map(String):[];
  if(!title)throw new Error('Judul ujian wajib diisi.');
  if(!ids.length)throw new Error('Pilih minimal satu soal.');
  if(ids.length>100)throw new Error('Maksimal 100 soal per ujian.');
  const all=rows_('questions'),qs=ids.map(id=>all.find(q=>String(q.id)===id)).filter(Boolean);
  if(qs.length!==ids.length)throw new Error('Ada soal yang tidak ditemukan di bank soal.');
  if(user.role==='teacher'&&qs.some(q=>q.createdBy!==user.id))throw new Error('Guru hanya dapat menggunakan soal yang dibuat sendiri.');
  const duration=Math.max(1,Math.min(300,Number(r.durationMinutes)||30));
  const startTime=r.startTime?new Date(r.startTime).toISOString():'';
  const endTime=r.endTime?new Date(r.endTime).toISOString():'';
  if(startTime&&endTime&&Date.parse(endTime)<=Date.parse(startTime))throw new Error('Waktu selesai harus setelah waktu mulai.');
  const rec={id:Utilities.getUuid(),title,description:String(r.description||''),questionIds:ids,startTime,endTime,durationMinutes:duration,token:makeExamToken_(),status:r.status==='published'?'published':'draft',createdBy:user.id,createdAt:new Date().toISOString()};
  append_('exams',rec);audit_(user,'create','exams',rec.id);
  return {exam:rec};
}
function examForStudent_(token,student){
  const exam=rows_('exams').find(e=>String(e.token||'').toUpperCase()===String(token||'').trim().toUpperCase()&&['published','active'].indexOf(String(e.status))>=0);
  if(!exam)throw new Error('Token ujian tidak valid atau ujian belum dipublikasikan.');
  const now=Date.now();
  if(exam.startTime&&now<Date.parse(exam.startTime))throw new Error('Ujian belum dimulai.');
  if(exam.endTime&&now>Date.parse(exam.endTime))throw new Error('Waktu ujian telah berakhir.');
  return exam;
}
function joinExam_(req){
  const user=userRecord_(req.token);role_(user,['student']);
  const exam=examForStudent_(req.examToken,user),ids=Array.isArray(exam.questionIds)?exam.questionIds:JSON.parse(exam.questionIds||'[]');
  const qs=rows_('questions').filter(q=>ids.indexOf(q.id)>=0).map(q=>({id:q.id,subject:q.subject,type:q.type,question:q.question,options:q.options,grade:q.grade}));
  return {exam:{id:exam.id,title:exam.title,description:exam.description,durationMinutes:Number(exam.durationMinutes),questionCount:qs.length},questions:qs};
}
function startAttempt_(req){
  const user=userRecord_(req.token);role_(user,['student']);const exam=examForStudent_(req.examToken,user);
  const lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    const prior=rows_('attempts').find(a=>a.examId===exam.id&&a.userId===user.id);
    if(prior){if(prior.status==='submitted')throw new Error('Anda sudah menyelesaikan ujian ini.');return {attempt:publicAttempt_(prior)};}
    const now=Date.now(),deadline=Math.min(now+Number(exam.durationMinutes)*60000,exam.endTime?Date.parse(exam.endTime):Infinity);
    const rec={id:Utilities.getUuid(),examId:exam.id,userId:user.id,startedAt:new Date(now).toISOString(),deadlineAt:new Date(deadline).toISOString(),answers:{},status:'in_progress',score:'',submittedAt:'',updatedAt:new Date(now).toISOString()};
    append_('attempts',rec);audit_(user,'start','attempts',rec.id);return {attempt:publicAttempt_(rec)};
  }finally{lock.releaseLock();}
}
function publicAttempt_(a){return {id:a.id,examId:a.examId,startedAt:a.startedAt,deadlineAt:a.deadlineAt,answers:a.answers||{},status:a.status,score:a.score,submittedAt:a.submittedAt,serverNow:new Date().toISOString()};}
function findAttempt_(id,user){
  const a=rows_('attempts').find(x=>x.id===String(id)&&x.userId===user.id);
  if(!a)throw new Error('Sesi ujian tidak ditemukan.');
  if(a.status==='submitted')throw new Error('Ujian sudah dikumpulkan.');
  if(Date.now()>=Date.parse(a.deadlineAt))throw new Error('Waktu ujian habis. Kirim jawaban untuk dinilai.');
  return a;
}
function saveAnswers_(req){
  const user=userRecord_(req.token);role_(user,['student']);const lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    const a=findAttempt_(req.attemptId,user),answers=req.answers||{};
    if(typeof answers!=='object'||Array.isArray(answers))throw new Error('Format jawaban tidak valid.');
    const exam=rows_('exams').find(e=>e.id===a.examId),ids=Array.isArray(exam.questionIds)?exam.questionIds:JSON.parse(exam.questionIds||'[]'),safe={};
    ids.forEach(id=>{if(Object.prototype.hasOwnProperty.call(answers,id)){const v=answers[id];safe[id]=String(v).slice(0,5000);}});
    updateRow_('attempts',a.id,Object.assign({},a,{answers:safe,updatedAt:new Date().toISOString()}));
    return {saved:true,serverNow:new Date().toISOString(),deadlineAt:a.deadlineAt};
  }finally{lock.releaseLock();}
}
function submitExam_(req){
  const user=userRecord_(req.token);role_(user,['student']);const lock=LockService.getScriptLock();lock.waitLock(15000);
  try{
    const attempts=rows_('attempts'),a=attempts.find(x=>x.id===String(req.attemptId)&&x.userId===user.id);
    if(!a)throw new Error('Sesi ujian tidak ditemukan.');
    if(a.status==='submitted')return {submitted:true,score:Number(a.score)||0,alreadySubmitted:true};
    const exam=rows_('exams').find(e=>e.id===a.examId);if(!exam)throw new Error('Ujian tidak ditemukan.');
    const ids=Array.isArray(exam.questionIds)?exam.questionIds:JSON.parse(exam.questionIds||'[]'),all=rows_('questions'),beforeDeadline=Date.now()<Date.parse(a.deadlineAt),answers=beforeDeadline?Object.assign({},a.answers||{},req.answers||{}):Object.assign({},a.answers||{});
    const questions=ids.map(id=>all.find(q=>q.id===id)).filter(Boolean);let earned=0,gradable=0;
    questions.forEach(q=>{
      const type=String(q.type||'multiple_choice'),given=String(answers[q.id]===undefined?'':answers[q.id]).trim(),correct=String(q.answer===undefined?'':q.answer).trim();
      if(['essay'].indexOf(type)>=0)return;
      gradable++;if(answerCorrect_(given,correct,q))earned++;
    });
    const score=gradable?Math.round(earned/gradable*10000)/100:0,now=new Date().toISOString();
    const finalAnswers={};ids.forEach(id=>{if(answers[id]!==undefined)finalAnswers[id]=String(answers[id]).slice(0,5000);});
    const updated=Object.assign({},a,{answers:finalAnswers,status:'submitted',score:score,submittedAt:now,updatedAt:now});
    updateRow_('attempts',a.id,updated);
    append_('results',{id:Utilities.getUuid(),examId:a.examId,userId:user.id,answers:finalAnswers,score:score,submittedAt:now});
    audit_(user,'submit','attempts',a.id);return {submitted:true,score:score,gradable:gradable,totalQuestions:questions.length};
  }finally{lock.releaseLock();}
}
function normalizeAnswer_(v){return String(v||'').trim().toLowerCase().replace(/^[a-d][.)]\s*/,'').replace(/\s+/g,' ');}
function answerCorrect_(given,correct,q){
  const g=normalizeAnswer_(given),a=normalizeAnswer_(correct);
  if(!g||!a)return false;
  if(g===a)return true;
  const opts=Array.isArray(q.options)?q.options:[];
  const letter='abcd'.indexOf(g);
  if(letter>=0&&letter<opts.length&&normalizeAnswer_(typeof opts[letter]==='string'?opts[letter]:opts[letter].text)===a)return true;
  const answerLetter='abcd'.indexOf(a);
  if(answerLetter>=0&&answerLetter<opts.length&&normalizeAnswer_(typeof opts[answerLetter]==='string'?opts[answerLetter]:opts[answerLetter].text)===g)return true;
  return false;
}
function updateRow_(table,id,rec){
  const sh=sheet_(table),vals=sh.getDataRange().getValues(),headers=vals[0],idCol=headers.indexOf('id');
  for(let i=1;i<vals.length;i++)if(String(vals[i][idCol])===String(id)){sh.getRange(i+1,1,1,headers.length).setValues([headers.map(h=>cell_(rec[h]))]);return;}
  throw new Error('Data tidak ditemukan saat memperbarui.');
}
function myExams_(req){
  const user=userRecord_(req.token);
  if(user.role==='student')return {records:rows_('attempts').filter(a=>a.userId===user.id).map(a=>Object.assign(publicAttempt_(a),{examTitle:(rows_('exams').find(e=>e.id===a.examId)||{}).title||''}))};
  role_(user,['admin','teacher']);
  const exams=rows_('exams').filter(e=>user.role==='admin'||e.createdBy===user.id);
  return {records:exams};
}
function examStatus_(req){
  const user=userRecord_(req.token);
  if(user.role==='student'){
    const exam=examForStudent_(req.examToken,user),a=rows_('attempts').find(x=>x.examId===exam.id&&x.userId===user.id);
    return {exam:{id:exam.id,title:exam.title,durationMinutes:Number(exam.durationMinutes)},attempt:a?publicAttempt_(a):null};
  }
  role_(user,['admin','teacher']);
  const exam=rows_('exams').find(e=>e.id===String(req.examId)&&(user.role==='admin'||e.createdBy===user.id));
  if(!exam)throw new Error('Ujian tidak ditemukan.');
  const attempts=rows_('attempts').filter(a=>a.examId===exam.id);
  return {exam:exam,records:attempts.map(a=>Object.assign(publicAttempt_(a),{user:(rows_('users').find(u=>u.id===a.userId)||{}).name||''}))};
}

function audit_(user,action,table,id){
  try{append_('audit',{id:Utilities.getUuid(),userId:user.id,action:action,tableName:table,recordId:id,createdAt:new Date().toISOString()});}catch(e){}
}
