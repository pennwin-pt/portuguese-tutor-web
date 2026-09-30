const API = '';               // 与 index.js 保持一致：同域反代 /api 时留空
const $ = s => document.querySelector(s);
const enc = encodeURIComponent;
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };

/* ---------- 身份 / 主题 / 音色：和聊天页读同一份 localStorage，换页面不用重新设置 ---------- */
// 注意：这一段是 index.js 里同名逻辑的精简拷贝（项目没有构建工具，index.js 也不是模块，没法直接 import）。
// NAME_RE 必须与 index.js 和后端 user_manager.USERNAME_RE 保持一致。
const NAME_RE = /^[A-Za-z0-9_\u4e00-\u9fa5]{2,20}$/;
const guestSid = localStorage.sid || (localStorage.sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
let username = localStorage.getItem('username') || '';
if (!NAME_RE.test(username)) username = '';
const sid = username || guestSid;

(function applyCachedTheme() {                     // 只套用聊天页缓存的主题色，校验规则同 index.js
    try {
        const t = JSON.parse(localStorage.getItem('theme') || 'null');
        if (!t || typeof t !== 'object') return;
        for (const [k, v] of Object.entries(t))
            if (/^--[\w-]{1,30}$/.test(k) && typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v)) document.documentElement.style.setProperty(k, v);
        if (/^#[0-9a-f]{3,8}$/i.test(t['--blue'] || '')) $('meta[name="theme-color"]').content = t['--blue'];
    } catch {}
})();

function ttsCfg() {                                // 聊天页里给当前智能体选的音源 / 音色，朗读单词沿用；音色白名单在后端校验
    let c = null; try { c = JSON.parse(localStorage.getItem('tts_' + sid)); } catch {}
    const provider = c && ['piper', 'google', 'edge', 'streamelements'].includes(c.provider) ? c.provider : 'piper';
    const v = c && c.voices && typeof c.voices[provider] === 'string' ? c.voices[provider] : null;
    return { provider, voice: v };
}

const toast = m => { $('#toast')?.remove(); const t = el('div', '', m); t.id = 'toast'; document.body.append(t); setTimeout(() => t.remove(), 2200); };

/* ---------- 网络（同 index.js 的 req） ---------- */
const errMsg = j => typeof j.detail === 'string' ? j.detail
    : Array.isArray(j.detail) ? j.detail.map(x => x.msg).join('；') : j.message;
async function req(path, body, method = 'POST') {
    const opt = { method };
    if (body instanceof FormData) opt.body = body;
    else if (body) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
    const r = await fetch(API + path, opt);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(errMsg(j) || ('请求失败 ' + r.status));
    return j.data || j;
}
const post = (path, body) => req(path, body);
const get = path => req(path, null, 'GET');

/* ---------- 音频：朗读单词 / 例句 ---------- */
const player = $('#player');
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
function unlock() { player.src = SILENT; player.play().catch(() => {}); }   // 在用户手势内解锁 iOS 自动播放
let spkBtn = null;
function speak(w, kind, btn) {                     // kind: 'word' | 'sentence'；后端按 word_id 取文本合成，前端不传文本
    spkBtn?.classList.remove('play'); spkBtn = btn || null;
    const c = ttsCfg(), q = new URLSearchParams({ kind, tts_provider: c.provider });
    if (c.voice) q.set('tts_voice', c.voice);
    player.src = `${API}/api/words/${w.id}/audio?${q}`;
    player.play().then(() => spkBtn?.classList.add('play')).catch(() => toast('朗读失败，点喇叭重试'));
}
player.onended = player.onpause = () => spkBtn?.classList.remove('play');
player.onerror = () => { spkBtn?.classList.remove('play'); if (!player.currentSrc.startsWith('data:')) toast('朗读失败，点喇叭重试'); };
function spk(w, kind) {
    const b = el('button', 'spk', '🔊'); b.type = 'button'; b.setAttribute('aria-label', kind === 'word' ? '朗读单词' : '朗读例句');
    b.onclick = () => speak(w, kind, b);
    return b;
}

/* ---------- 任务状态 ----------
   Word Item（与后端 memory/word_source.py 的 WordItem 一致）：
   { id, pt_word, cn_meaning, pt_sentence, cn_sentence, mode }   mode: 1=看葡语说中文, 2=看中文说葡语
   state: idle 未领取 | test 测试中 | judging 评判中 | result 结果展示 | done 全部通过 */
let state = 'idle';
let todoList = [];          // 当前轮次待测（cur 已经从里面 shift 出来）
let failedList = [];        // 本轮答错的，本轮测完后变成下一轮的 todoList
let cur = null, lastRes = null;
let round = 1, roundTotal = 0, total = 0, attempts = 0, firstPass = 0;
const passed = new Set();   // 已通过的单词 id

const isLast = () => !todoList.length && !failedList.length;

function viewIdle() {
    const c = el('div', 'wcard');
    c.append(el('div', 'term', '📚 今日单词任务'),
        el('p', 'intro', '系统已为你安排好今天的单词。领取后逐个语音测试，答错的词会在本轮结束后重测，直到全部通过。'));
    return c;
}
function viewTest() {
    const w = cur, c = el('div', 'wcard');
    c.append(el('div', 'tag', w.mode === 1 ? '🇵🇹 → 🇨🇳 看葡语，说中文' : '🇨🇳 → 🇵🇹 看中文，说葡语'));
    const row = el('div', 'termrow');
    row.append(el('div', 'term', w.mode === 1 ? w.pt_word : w.cn_meaning));
    if (w.mode === 1) row.append(spk(w, 'word'));         // 模式 1：可以随时重听单词读音
    c.append(row, el('div', 'ask', state === 'judging' ? '⏳ AI 评判中…' : (w.mode === 1 ? '请用中文说出它的意思' : '请用葡语说出这个词')));
    return c;
}
function viewResult() {
    const w = cur, r = lastRes, c = el('div', 'wcard');
    c.append(el('div', 'verdict ' + (r.passed ? 'ok' : 'bad'), r.passed ? '✅ 回答正确' : '❌ 回答错误'),
        el('div', 'heard', '你说的：' + (r.recognized_text || '（未识别）')));
    if (r.comment) c.append(el('div', 'cmt', '💬 ' + r.comment));
    const ans = el('div', 'ans');
    const r1 = el('div', 'arow'), t1 = el('div', 'tx'), r3 = el('div', 'arow'), t3 = el('div', 'tx');
    t1.append(el('span', 'alab', '葡语单词'), el('div', 'apt', w.pt_word), el('div', 'azh', w.cn_meaning));
    r1.append(t1, spk(w, 'word'));
    t3.append(el('span', 'alab', '例句'), el('div', 'asen', w.pt_sentence), el('div', 'azh', w.cn_sentence));
    r3.append(t3, spk(w, 'sentence'));
    ans.append(r1, r3); c.append(ans);
    return c;
}
function viewDone() {
    const c = el('div', 'wcard');
    c.append(el('div', 'term', '🎉 今日任务完成'),
        el('div', 'stat', `共 ${total} 个单词，用了 ${round} 轮\n一次通过 ${firstPass} 个 · 共评判 ${attempts} 次`));
    c.lastChild.style.whiteSpace = 'pre-line';
    return c;
}

function render() {
    const hold = $('#hold'), act = $('#act'), stage = $('#stage');
    hold.hidden = !(state === 'test' || state === 'judging');
    hold.disabled = state === 'judging';
    hold.textContent = state === 'judging' ? '评判中…' : '按住 说话';
    act.hidden = !hold.hidden;
    act.textContent = { idle: '领取今日任务', result: isLast() ? '完成' : '下一个', done: '返回聊天' }[state] || '';
    const idx = cur ? roundTotal - todoList.length : 0;            // 本轮第几个（cur 已从 todoList 取出）
    $('#prog').textContent = state === 'idle' || state === 'done' ? '' : `第 ${round} 轮 · ${idx}/${roundTotal}`;
    $('#bar i').style.width = total ? (passed.size / total * 100) + '%' : '0';
    stage.innerHTML = '';
    stage.append({ idle: viewIdle, test: viewTest, judging: viewTest, result: viewResult, done: viewDone }[state]());
}

/* ---------- 流程 ---------- */
async function start() {
    unlock();
    const btn = $('#act'); btn.disabled = true;
    try {
        const d = await get(`/api/words/today?session_id=${enc(sid)}`);
        const words = (d.words || []).filter(w => w && w.id != null && w.pt_word && (w.mode === 1 || w.mode === 2));
        if (!words.length) return toast('今天没有单词任务');
        todoList = words; failedList = []; passed.clear();
        total = roundTotal = words.length; round = 1; attempts = 0; firstPass = 0;
        next();
    } catch (err) { toast('领取失败：' + err.message); }
    finally { btn.disabled = false; }
}

function next() {                                   // 取下一个待测词；本轮测完则用 failedList 开下一轮；都通过了就结束
    unlock();
    if (!todoList.length) {
        if (!failedList.length) { cur = null; state = 'done'; render(); return; }
        todoList = failedList; failedList = []; round++; roundTotal = todoList.length;
        toast(`第 ${round} 轮：重测 ${roundTotal} 个错词`);
    }
    cur = todoList.shift(); lastRes = null; state = 'test'; render();
    if (cur.mode === 1) speak(cur, 'word', $('#stage .spk'));      // 模式 1：展示时自动朗读一次
}

async function evaluate(blob, ext) {
    const w = cur;
    state = 'judging'; render();
    const fd = new FormData();
    fd.append('audio', blob, 'rec.' + ext); fd.append('word_id', w.id); fd.append('mode', w.mode);
    try {
        const d = await post('/api/words/evaluate', fd);
        attempts++; lastRes = d;
        if (d.passed) {
            passed.add(w.id);
            if (round === 1) firstPass++;
        } else {
            failedList.push(w);                     // 进入本轮的错词列表，本轮结束后重测
            post('/api/words/record_error', { session_id: sid, word_id: w.id, mode: w.mode, user_text: d.recognized_text || '' })
                .catch(err => toast('错题记录失败：' + err.message));
        }
        state = 'result'; render();
    } catch (err) {                                 // 没听清 / 识别或大模型故障：不算答错，留在当前题让用户重说
        toast(err.message); state = 'test'; render();
    }
}

$('#act').onclick = () => {
    if (state === 'idle') start();
    else if (state === 'result') next();
    else if (state === 'done') location.href = 'index.html';
};
$('#back').onclick = () => {
    if (state !== 'idle' && state !== 'done' && !confirm('任务还没完成，现在退出进度不会保留，确定返回聊天？')) return;
    location.href = 'index.html';
};

/* ---------- 按住说话（和聊天页同一套手势：按下录音、松开提交、上滑取消） ---------- */
const holdBtn = $('#hold');
const MIME = window.MediaRecorder && ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
let mr, chunks, t0, startY, cancel, stream, holding = false;
holdBtn.addEventListener('pointerdown', async e => {
    if (state !== 'test') return;
    e.preventDefault(); holding = true; startY = e.clientY; cancel = false; unlock();
    holdBtn.setPointerCapture(e.pointerId);
    if (!MIME) { toast('浏览器不支持录音（需 HTTPS）'); holding = false; return; }
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { toast('无法使用麦克风：请用 HTTPS 访问并允许权限'); holding = false; return; }
    if (!holding) { stream.getTracks().forEach(t => t.stop()); return; }   // 权限弹窗期间已松手
    chunks = []; mr = new MediaRecorder(stream, { mimeType: MIME });
    mr.ondataavailable = ev => ev.data.size && chunks.push(ev.data);
    mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (cancel) return;
        if (Date.now() - t0 < 600) return toast('说话时间太短');
        evaluate(new Blob(chunks, { type: MIME }), MIME.includes('mp4') ? 'm4a' : 'webm');
    };
    mr.start(); t0 = Date.now(); navigator.vibrate?.(10);
    holdBtn.classList.add('rec'); holdBtn.textContent = '松开 发送'; $('#rec').hidden = false;
});
holdBtn.addEventListener('pointermove', e => {
    if (!holding) return;
    cancel = e.clientY < startY - 80;
    holdBtn.classList.toggle('cancel', cancel); $('#rec').classList.toggle('cancel', cancel);
    $('#rec span').textContent = cancel ? '松开手指，取消发送' : '正在录音… 上滑取消';
    holdBtn.textContent = cancel ? '松开 取消' : '松开 发送';
});
const endRec = () => {
    holding = false; holdBtn.className = ''; holdBtn.textContent = '按住 说话'; $('#rec').hidden = true; $('#rec').classList.remove('cancel');
    if (mr && mr.state === 'recording') mr.stop();
};
holdBtn.addEventListener('pointerup', endRec);
holdBtn.addEventListener('pointercancel', () => { cancel = true; endRec(); });
holdBtn.addEventListener('contextmenu', e => e.preventDefault());

render();