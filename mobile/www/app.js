const $ = id => document.getElementById(id);
const localDate = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const getApiBase = () => localStorage.getItem('apiBase') || '';
const api = p => getApiBase() + p;
function capPlugin(name) {
  try { return (window.Capacitor && window.Capacitor.Plugins) ? window.Capacitor.Plugins[name] : null; }
  catch { return null; }
}
let currentMode = 'auto', chatMessages = [], voiceOut = false, recognition = null;
let planDate = localDate(new Date());
let timerInterval = null, timerRunning = false, timerPhase = 'focus', focusCount = 0;
const FOCUS_SEC = 25 * 60, BREAK_SEC = 5 * 60;
let timerSeconds = FOCUS_SEC;
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'plan') loadPlan();
    if (btn.dataset.tab === 'memory') loadMemory();
    if (btn.dataset.tab === 'usage') loadUsage();
  });
});
$('settings-btn').onclick = () => { $('api-base-input').value = getApiBase(); $('settings-modal').classList.add('show'); };
$('settings-cancel').onclick = () => $('settings-modal').classList.remove('show');
$('settings-save').onclick = () => { localStorage.setItem('apiBase', $('api-base-input').value.trim()); $('settings-modal').classList.remove('show'); };
async function loadStats() {
  try {
    const r = await fetch(api('/api/stats'));
    const s = await r.json();
    $('stat-done').textContent = `${s.todayDone}/${s.todayTotal}`;
    $('stat-streak').textContent = s.streak;
    $('stat-bar').style.width = s.todayTotal ? (s.todayDone / s.todayTotal * 100) + '%' : '0%';
    $('plan-streak').textContent = s.streak;
  } catch {}
}
$('mode-auto').onclick = () => { currentMode = 'auto'; setModeBtn(); };
$('mode-study').onclick = () => { currentMode = 'study'; setModeBtn(); };
function setModeBtn() {
  $('mode-auto').classList.toggle('active', currentMode === 'auto');
  $('mode-study').classList.toggle('active', currentMode === 'study');
}
$('send').onclick = sendMessage;
$('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });
function addDayDivider() {
  const div = document.createElement('div');
  div.className = 'day-divider';
  div.textContent = '今天 · ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  $('chat-box').appendChild(div);
}
function appendMessage(role, content, typing = false) {
  const box = $('chat-box');
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.innerHTML = `<div class="mini-avatar">${role === 'assistant' ? '沈' : '我'}</div>`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (typing) {
    bubble.classList.add('typing');
    for (let i = 0; i < 3; i++) bubble.appendChild(Object.assign(document.createElement('span'), { className: 'dot' }));
  } else {
    bubble.textContent = content;
  }
  div.appendChild(bubble);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return bubble;
}
async function sendMessage() {
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text) return;
  appendMessage('user', text);
  chatMessages.push({ role: 'user', content: text });
  input.value = '';
  const bubble = appendMessage('assistant', '', true);
  try {
    const resp = await fetch(api('/api/chat'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatMessages.slice(-30), mode: currentMode }),
    });
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const p = t.slice(5).trim();
        if (p === '[DONE]') continue;
        try {
          const j = JSON.parse(p);
          if (j.error) full += '\n[错误] ' + j.error;
          else if (j.delta) full += j.delta;
          bubble.classList.remove('typing');
          bubble.textContent = full;
          $('chat-box').scrollTop = $('chat-box').scrollHeight;
        } catch {}
      }
    }
    if (full && !full.startsWith('[错误]')) chatMessages.push({ role: 'assistant', content: full });
    if (voiceOut) speak(full);
  } catch (e) {
    bubble.textContent = '连接失败：' + e + '（请检查服务器地址设置）';
  }
}
async function speak(text) {
  const clean = text.replace(/\*/g, '');
  const native = capPlugin('Speech');
  if (native) { try { await native.speak({ text: clean }); return; } catch {} }
  if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = 'zh-CN';
    const v = speechSynthesis.getVoices().find(v => /zh|Chinese|Yunxi|Xiaoxiao/i.test(v.name));
    if (v) u.voice = v;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }
}
$('voice-out').onclick = () => { voiceOut = !voiceOut; $('voice-out').textContent = voiceOut ? '🔊' : '🔇'; };
$('mic').onclick = async () => {
  const native = capPlugin('Speech');
  if (native) {
    try { const r = await native.listen(); if (r.value) $('chat-input').value = r.value; }
    catch (e) { alert('语音识别失败：' + e.message); }
    return;
  }
  if (!recognition) recognition = initRecognition();
  if (!recognition) { alert('当前环境不支持语音输入'); return; }
  recognition.start();
};
function initRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = 'zh-CN'; r.interimResults = false;
  r.onresult = e => { $('chat-input').value = e.results[0][0].transcript; };
  return r;
}
$('plan-date').value = planDate;
$('plan-date').onchange = e => { planDate = e.target.value; loadPlan(); };
$('plan-add-btn').onclick = addPlan;
$('plan-input').addEventListener('keydown', e => { if (e.key === 'Enter') addPlan(); });
async function loadPlan() {
  const r = await fetch(api('/api/plan?date=' + planDate));
  const list = await r.json();
  renderPlan(list);
  loadStats();
}
function renderPlan(list) {
  const ul = $('plan-list');
  ul.innerHTML = '';
  let done = 0;
  list.forEach(t => {
    if (t.done) done++;
    const li = document.createElement('li');
    li.className = t.done ? 'done' : '';
    li.innerHTML = `<input type="checkbox" class="task-check" ${t.done ? 'checked' : ''}>
      <span class="task-text"></span>
      ${t.minutes ? `<span class="task-min">${t.minutes} 分钟</span>` : ''}
      <button class="task-del">✕</button>`;
    li.querySelector('.task-text').textContent = t.text;
    li.querySelector('.task-check').onchange = e => toggleTask(t.id, e.target.checked);
    li.querySelector('.task-del').onclick = () => delTask(t.id);
    ul.appendChild(li);
  });
  const total = list.length;
  $('plan-done-num').textContent = done;
  $('plan-total-num').textContent = total;
  $('ring-pct').textContent = (total ? Math.round(done / total * 100) : 0) + '%';
  const C = 2 * Math.PI * 45;
  $('plan-ring').style.strokeDasharray = C;
  $('plan-ring').style.strokeDashoffset = C - (C * done / (total || 1));
}
async function addPlan() {
  const text = $('plan-input').value.trim();
  if (!text) return;
  await fetch(api('/api/plan'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, date: planDate, minutes: $('plan-minutes').value }),
  });
  $('plan-input').value = ''; $('plan-minutes').value = '';
  loadPlan();
}
async function toggleTask(id, done) {
  await fetch(api('/api/plan/' + id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done }) });
  loadPlan();
}
async function delTask(id) {
  await fetch(api('/api/plan/' + id), { method: 'DELETE' });
  loadPlan();
}
$('timer-start').onclick = startTimer;
$('timer-pause').onclick = pauseTimer;
$('timer-reset').onclick = resetTimer;
const TIMER_C = 2 * Math.PI * 90;
function fmt(s) { const m = Math.floor(s / 60), ss = s % 60; return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; }
function renderTimer() {
  $('timer-display').textContent = fmt(timerSeconds);
  const total = timerPhase === 'focus' ? FOCUS_SEC : BREAK_SEC;
  $('timer-ring').style.strokeDasharray = TIMER_C;
  $('timer-ring').style.strokeDashoffset = TIMER_C - (TIMER_C * timerSeconds / total);
}
function startTimer() {
  if (timerRunning) return;
  timerRunning = true;
  timerInterval = setInterval(() => {
    timerSeconds--;
    if (timerSeconds <= 0) {
      clearInterval(timerInterval); timerRunning = false;
      if (timerPhase === 'focus') {
        focusCount++; $('focus-count').textContent = focusCount;
        timerPhase = 'break'; timerSeconds = BREAK_SEC; $('timer-mode').textContent = '休息';
      } else {
        timerPhase = 'focus'; timerSeconds = FOCUS_SEC; $('timer-mode').textContent = '专注';
      }
    }
    renderTimer();
  }, 1000);
}
function pauseTimer() { clearInterval(timerInterval); timerRunning = false; }
function resetTimer() {
  clearInterval(timerInterval); timerRunning = false;
  timerPhase = 'focus'; timerSeconds = FOCUS_SEC; $('timer-mode').textContent = '专注';
  renderTimer();
}
renderTimer();
$('memory-add-btn').onclick = addMemory;
$('memory-input').addEventListener('keydown', e => { if (e.key === 'Enter') addMemory(); });
async function loadMemory() {
  const r = await fetch(api('/api/memory'));
  const list = await r.json();
  const grid = $('memory-list');
  grid.innerHTML = '';
  list.forEach(m => {
    const card = document.createElement('div');
    card.className = 'mem-card';
    card.innerHTML = `<span class="mem-tag">${m.type}</span><div class="mem-text"></div><button class="mem-del">删除 ✕</button>`;
    card.querySelector('.mem-text').textContent = m.content;
    card.querySelector('.mem-del').onclick = () => delMemory(m.id);
    grid.appendChild(card);
  });
}
async function addMemory() {
  const content = $('memory-input').value.trim();
  if (!content) return;
  await fetch(api('/api/memory'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, type: $('memory-type').value }),
  });
  $('memory-input').value = '';
  loadMemory();
}
async function delMemory(id) {
  await fetch(api('/api/memory/' + id), { method: 'DELETE' });
  loadMemory();
}
$('usage-refresh').onclick = loadUsage;
$('usage-grant').onclick = async () => { const p = capPlugin('AppUsage'); if (p) await p.requestPermission(); };
async function loadUsage() {
  const p = capPlugin('AppUsage');
  const status = $('usage-status'), list = $('usage-list');
  if (!p) {
    status.textContent = '⚠️ 此功能需在 Android App 内使用。网页版仅作展示。';
    list.innerHTML = ''; $('usage-grant').style.display = 'none';
    return;
  }
  const perm = await p.hasPermission();
  if (!perm.granted) {
    status.textContent = '尚未授权「使用情况访问」权限。点击下方按钮 → 在系统列表里找到「沈砚」→ 允许访问，然后回来点刷新。';
    list.innerHTML = ''; $('usage-grant').style.display = 'inline-block';
    return;
  }
  $('usage-grant').style.display = 'none';
  status.textContent = '已授权 · 近 24 小时前台使用时长';
  const res = await p.getTopApps();
  const apps = res.apps || [];
  const max = Math.max(...apps.map(a => a.minutes), 1);
  list.innerHTML = '';
  apps.forEach(a => {
    const li = document.createElement('li');
    li.innerHTML = `<div class="usage-row"><span>${a.appName}</span><span class="u-min">${(+a.minutes).toFixed(1)} 分钟</span></div>
      <div class="usage-bar"><div style="width:${(a.minutes / max * 100).toFixed(1)}%"></div></div>`;
    list.appendChild(li);
  });
}
addDayDivider();
loadStats();
appendMessage('assistant', '*抬眼看你，目光清冷里带着一点审视*\n来了？今天的学习任务，报给我。别让我问第二遍。');
