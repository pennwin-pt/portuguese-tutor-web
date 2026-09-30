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
function unlock() { player.src = SILENT; player.play().catch(() => {}); primeSfx(); }   // 在用户手势内解锁 iOS 自动播放（朗读 + 音效）
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
/* ---------- 音效：答对 / 答错 ----------
   文件放在前端目录的 sounds/ 下（nginx 里是 html/portuguese-tutor-web/sounds/），想换格式只改这里的文件名。
   文件缺失或加载失败时静默不播，不影响答题。用独立的 Audio 对象，不占用朗读的 #player。 */
const SFX_FILES = { pass: 'sounds/success.wav', fail: 'sounds/fail.wav' };
const sfx = Object.fromEntries(Object.entries(SFX_FILES).map(([k, src]) => { const a = new Audio(src); a.preload = 'auto'; return [k, a]; }));
let sfxPrimed = false;
function primeSfx() {       // iOS：音效是在异步评判返回后才播的，必须先在用户手势里对每个 Audio 解锁一次（静音播放再停）
    if (sfxPrimed) return; sfxPrimed = true;
    Object.values(sfx).forEach(a => {
        a.muted = true;
        a.play().then(() => { a.pause(); a.currentTime = 0; a.muted = false; })
            .catch(() => { a.muted = false; sfxPrimed = false; });      // 文件还没放 / 暂时加载失败：下次手势再试
    });
}
function playSfx(ok) {
    const a = sfx[ok ? 'pass' : 'fail'];
    try { a.currentTime = 0; } catch {}
    a.play().catch(() => {});
}
function spk(w, kind) {
    const b = el('button', 'spk', '🔊'); b.type = 'button'; b.setAttribute('aria-label', kind === 'word' ? '朗读单词' : '朗读例句');
    b.onclick = () => speak(w, kind, b);
    return b;
}

/* ---------- 任务状态 ----------
   Word Item（与后端 memory/word_source.py 的 WordItem 一致）：
   { id, pt_word, cn_meaning, pt_sentence, cn_sentence, mode }   mode: 1=看葡语说中文, 2=看中文说葡语
   state: loading 加载今日任务 | idle 未领取 | test 测试中 | judging 评判中 | result 结果展示 | preview 预习明天的词（不评分）
          | done 今日已完成（刚通关，或打开页面时服务器记录显示今天早已完成；都可以“重新学习”） */
let state = 'loading';
let today = null;           // GET /api/words/today 的结果：{date, words, completed}
let summary = null;         // done 页展示的成绩：{rounds,total,first_pass,attempts,times?,completed_at?, fresh}
let todoList = [];          // 当前轮次待测（cur 已经从里面 shift 出来）
let failedList = [];        // 本轮里出过错的词（每词只记一次，带着出错时的 mode）；本轮测完后翻转 mode 变成下一轮的 todoList
let cur = null, lastRes = null;
let aiWrong = 0;            // 当前这个词在本轮里被 AI 评判为“答错”的次数（公布答案、没听清都不算）；≥ SKIP_AFTER 才允许跳过
const SKIP_AFTER = 2;
let curRevealed = false;    // 当前这个词是否点过“公布答案”（用来判定当天结果 again）
const outcomes = {};        // 每个词当天第一轮的结果 {word_id,outcome,mode}：good 一次答对 | hard 答错后才对 | again 公布答案/判错≥2次 | skipped 跳过；完成时提交给服务器调度复习间隔
const KIND_LABEL = { new: '🆕 新词', review: '🔁 复习', weekly: '📅 本周回顾' };
let curMissed = false;      // 当前这个词在本轮里是否已经答错 / 公布过答案（= 不是“一次通过”，本轮结束后要重测）
let round = 1, roundTotal = 0, total = 0, attempts = 0, firstPass = 0;
const passed = new Set();   // 已“过关”的单词 id：某一轮里一次就答对的词（答错后重试才对的不算，还要进下一轮）

const isLast = () => !todoList.length && !failedList.length;
const canSkip = () => state === 'result' && !!lastRes && !lastRes.passed && aiWrong >= SKIP_AFTER;   // 只在“AI 已连续判错两次”的结果页开放，不能一上来就跳

function viewIdle() {
    const c = el('div', 'wcard');
    c.append(el('div', 'term', '📚 今日单词任务'),
        el('p', 'intro', '系统已为你安排好今天的单词。领取后逐个语音测试：答错会一直停在这个词，直到答对才进下一个；一次就答对的词过关，本轮结束后只重测答错过的词，并换一个方向（说中文 ⇄ 说葡语）。'));
    if (today?.words.length) {
        const m = today.meta || {}, parts = [];
        if (m.review) parts.push(`复习 ${m.review}`);
        if (m.weekly) parts.push(`本周回顾 ${m.weekly}`);
        if (m.new) parts.push(`新词 ${m.new}`);
        if (today.preview?.length) parts.push(`预习 ${today.preview.length}`);
        c.append(el('div', 'stat', `今天共 ${today.words.length} 个单词` + (parts.length ? '\n' + parts.join(' · ') : '')));
    }
    return c;
}
function viewLoading() { const c = el('div', 'wcard'); c.append(el('div', 'ask', '加载今日任务…')); return c; }
function viewTest() {
    const w = cur, c = el('div', 'wcard');
    if (KIND_LABEL[w.kind]) c.append(el('div', 'kind', KIND_LABEL[w.kind]));
    c.append(el('div', 'tag', w.mode === 1 ? '🇵🇹 → 🇨🇳 看葡语，说中文' : '🇨🇳 → 🇵🇹 看中文，说葡语'));
    const row = el('div', 'termrow');
    row.append(el('div', 'term', w.mode === 1 ? w.pt_word : w.cn_meaning));
    if (w.mode === 1) row.append(spk(w, 'word'));         // 模式 1：可以随时重听单词读音
    c.append(row, el('div', 'ask', state === 'judging' ? '⏳ AI 评判中…' : (w.mode === 1 ? '请用中文说出它的意思' : '请用葡语说出这个词')));
    return c;
}
function viewResult() {
    const w = cur, r = lastRes, c = el('div', 'wcard');
    if (r.revealed) {                                   // 主动公布答案：不是答错，也不播失败音效，但本轮结束后会重测
        c.append(el('div', 'verdict rev', '💡 答案已公布'), el('div', 'cmt', '先记为没掌握，点“再试一次”跟着说一遍；下一轮会换个方向再测'));
    } else {
        c.append(el('div', 'verdict ' + (r.passed ? 'ok' : 'bad'), r.passed ? '✅ 回答正确' : '❌ 回答错误'),
            el('div', 'heard', '你说的：' + (r.recognized_text || '（未识别）')));
        if (r.comment) c.append(el('div', 'cmt', '💬 ' + r.comment));
    }
    if (canSkip()) c.append(el('div', 'cmt', `已连续答错 ${aiWrong} 次。如果觉得是识别不准，可以跳过（跳过后这个词算已通过，不再重测）`));
    const ans = el('div', 'ans');
    const r1 = el('div', 'arow'), t1 = el('div', 'tx'), r3 = el('div', 'arow'), t3 = el('div', 'tx');
    t1.append(el('span', 'alab', '葡语单词'), el('div', 'apt', w.pt_word), el('div', 'azh', w.cn_meaning));
    r1.append(t1, spk(w, 'word'));
    t3.append(el('span', 'alab', '例句'), el('div', 'asen', w.pt_sentence), el('div', 'azh', w.cn_sentence));
    r3.append(t3, spk(w, 'sentence'));
    ans.append(r1, r3); c.append(ans);
    return c;
}
function viewPreview() {                            // 预习：只看、只听，不评分、不改进度
    const c = el('div', 'wcard');
    c.append(el('div', 'term', '👀 预习明天的词'), el('p', 'intro', '先混个脸熟：点喇叭听读音，看看例句。这里不测试。'));
    const list = el('div', 'plist');
    for (const w of today.preview) {
        const row = el('div', 'pitem'), tx = el('div', 'tx'), r1 = el('div', 'arow');
        tx.append(el('div', 'apt', w.pt_word), el('div', 'azh', w.cn_meaning));
        if (w.pt_sentence) tx.append(el('div', 'asen', w.pt_sentence), el('div', 'azh', w.cn_sentence || ''));
        r1.append(tx, spk(w, 'word'));
        row.append(r1); list.append(row);
    }
    c.append(list);
    return c;
}
function fmtTime(s) {       // 服务器存的是 UTC（'YYYY-MM-DD HH:MM:SS'），转成本地 HH:MM
    const d = s ? new Date(s.replace(' ', 'T') + 'Z') : null;
    return d && !isNaN(d) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}
function viewDone() {
    const s = summary, c = el('div', 'wcard');
    const lines = [`共 ${s.total} 个单词，用了 ${s.rounds} 轮`, `一次通过 ${s.first_pass} 个 · 共评判 ${s.attempts} 次`];
    const at = fmtTime(s.completed_at);
    if (at) lines.push(`完成于 ${at}` + (s.times > 1 ? ` · 今天第 ${s.times} 次完成` : ''));
    c.append(el('div', 'term', s.fresh ? '🎉 今日任务完成' : '✅ 今日任务已完成'),
        el('div', 'stat', lines.join('\n')),
        el('p', 'intro', '想再巩固一遍？点下面的“重新学习”。'));
    return c;
}

function render() {
    const hold = $('#hold'), act = $('#act'), stage = $('#stage');
    const testing = state === 'test' || state === 'judging';
    hold.hidden = !testing;
    hold.disabled = state === 'judging';
    $('#reveal').hidden = !testing;                              // 测试中随时可以“公布答案”
    $('#reveal').disabled = state === 'judging';
    $('#skip').hidden = !canSkip();
    hold.textContent = state === 'judging' ? '评判中…' : '按住 说话';
    act.hidden = testing || state === 'loading';
    $('#act2').hidden = state !== 'done';                         // 完成页：[返回聊天] [重新学习]
    const resultLabel = !lastRes ? '' : !lastRes.passed ? '🔁 再试一次'            // 没答对：停在这个词
        : isLast() ? '完成' : todoList.length ? '下一个' : '进入下一轮';              // 答对：本轮还有词 / 本轮最后一个但有错词要重测
    act.textContent = { idle: '领取今日任务', result: resultLabel, preview: '预习完成', done: '🔄 重新学习' }[state] || '';
    const idx = cur ? roundTotal - todoList.length : 0;            // 本轮第几个（cur 已从 todoList 取出）
    $('#prog').textContent = testing || state === 'result' ? `第 ${round} 轮 · ${idx}/${roundTotal}` : '';
    $('#bar i').style.width = total ? (passed.size / total * 100) + '%' : '0';
    stage.classList.toggle('top', state === 'preview');             // 预习列表可能很长，从顶部开始排，不居中
    stage.innerHTML = '';
    stage.append({ loading: viewLoading, idle: viewIdle, test: viewTest, judging: viewTest, result: viewResult, preview: viewPreview, done: viewDone }[state]());
}

/* ---------- 流程 ---------- */
async function fetchToday() {
    const d = await get(`/api/words/today?session_id=${enc(sid)}`);
    d.words = (d.words || []).filter(w => w && w.id != null && w.pt_word && (w.mode === 1 || w.mode === 2));
    d.preview = (d.preview || []).filter(w => w && w.id != null && w.pt_word);
    today = d;
}
function begin(words) {                             // 开始一遍新的测试（首次领取 / 重新学习共用）
    todoList = words.slice(); failedList = []; passed.clear(); curMissed = false; curRevealed = false; aiWrong = 0;
    Object.keys(outcomes).forEach(k => delete outcomes[k]);
    total = roundTotal = words.length; round = 1; attempts = 0; firstPass = 0; summary = null;
    next();
}
async function start() {
    unlock();
    const btn = $('#act'); btn.disabled = true;
    try {
        if (!today) await fetchToday();             // 页面打开时加载失败的话，这里重试
        if (!today.words.length) return toast('今天没有单词任务');
        if (today.completed) showDone(today.completed, false);     // 重试时发现今天其实已经完成了
        else begin(today.words);
    } catch (err) { toast('领取失败：' + err.message); }
    finally { btn.disabled = false; }
}
function restart() {                                // 今日已完成后选择“重新学习”：同一批单词从头再测，不需要再请求
    if (!today?.words.length) return;
    unlock(); begin(today.words);
}
function showDone(rec, fresh) { cur = null; summary = { ...rec, fresh }; state = 'done'; render(); }
function finish() {                                 // 所有单词都通过：先把当天结果提交给服务器（结算复习进度 + 记完成），再进预习 / 成绩页
    cur = null; summary = { rounds: round, total, first_pass: firstPass, attempts, fresh: true };
    if (today?.preview?.length && !today.completed) { state = 'preview'; render(); }    // 重新学习时不再预习
    else showDone(summary, true);
    post('/api/words/complete', { session_id: sid, rounds: round, first_pass: firstPass, attempts, outcomes: Object.values(outcomes) })
        .then(d => {
            if (!d.completed) return;
            if (today) today.completed = d.completed;
            if (summary?.fresh) { summary = { ...d.completed, fresh: true }; if (state === 'done') render(); }   // 换成服务器的记录（含完成时间、次数）
        })
        .catch(err => toast('完成记录保存失败：' + err.message));
}

function next() {                                   // 取下一个待测词；本轮测完则用 failedList 开下一轮；都通过了就结束
    unlock();
    if (!todoList.length) {
        if (!failedList.length) { finish(); return; }
        // 下一轮只测本轮出过错的词，并把方向翻转（上轮说中文 → 这轮说葡语，反之亦然）；用拷贝，不改 today.words 里的原始 mode
        todoList = failedList.map(w => ({ ...w, mode: w.mode === 1 ? 2 : 1 })); failedList = []; round++; roundTotal = todoList.length;
        toast(`第 ${round} 轮：重测 ${roundTotal} 个错词，换一种方向`);
    }
    cur = todoList.shift(); curMissed = false; curRevealed = false; aiWrong = 0; lastRes = null; state = 'test'; render();
    if (cur.mode === 1) speak(cur, 'word', $('#stage .spk'));      // 模式 1：展示时自动朗读一次
}
function retry() {                                  // 没答对：停在同一个词、同一个方向，直到答对
    unlock();
    lastRes = null; state = 'test'; render();
    if (cur.mode === 1) speak(cur, 'word', $('#stage .spk'));
}
function skip() {                                   // 跳过：视为已通过——从本轮错词列表里移除并记为过关，后面的轮次不再重测
    if (!canSkip()) return;
    const w = cur;
    noteOutcome(w, 'skipped');                      // 当天结果记为 skipped：算通过，但服务器不拿它升级复习盒子
    failedList = failedList.filter(x => x.id !== w.id);
    passed.add(w.id);                               // 进度条按已过关数计算；不计入 firstPass（不是一次通过）
    next();
}
function noteOutcome(w, force) {                   // 只记每个词第一轮的结果；后面轮次（翻转方向重测）不再改
    if (round !== 1 || outcomes[w.id]) return;
    const oc = force || (curRevealed || aiWrong >= SKIP_AFTER ? 'again' : curMissed ? 'hard' : 'good');
    outcomes[w.id] = { word_id: w.id, outcome: oc, mode: w.mode };
}
function markMissed(w) { if (!curMissed) { curMissed = true; failedList.push(w); } }   // 同一个词本轮只进一次错词列表，反复答错不重复加

async function evaluate(blob, ext) {
    const w = cur;
    state = 'judging'; render();
    const fd = new FormData();
    fd.append('audio', blob, 'rec.' + ext); fd.append('word_id', w.id); fd.append('mode', w.mode);
    try {
        const d = await post('/api/words/evaluate', fd);
        attempts++; lastRes = d;
        if (d.passed) {
            noteOutcome(w);
            if (!curMissed) {                       // 这一轮里一次就答对：过关，后面的轮次不再出现
                passed.add(w.id);
                if (round === 1) firstPass++;
            }
        } else {
            aiWrong++;                              // AI 判错一次；同一个词累计到 SKIP_AFTER 次就可以跳过
            markMissed(w);                          // 进入本轮的错词列表；当前词不前进，等用户“再试一次”
            post('/api/words/record_error', { session_id: sid, word_id: w.id, mode: w.mode, user_text: d.recognized_text || '' })
                .catch(err => toast('错题记录失败：' + err.message));
        }
        state = 'result'; render();
        playSfx(d.passed);
        if (!d.passed) speakAfterSfx(w);            // 答错：失败音效播完后直接朗读这个词的葡语
    } catch (err) {                                 // 没听清 / 识别或大模型故障：不算答错，留在当前题让用户重说
        toast(err.message); state = 'test'; render();
    }
}

function speakAfterSfx(w) {                        // 等失败音效播完（最多 1.5 秒）再读单词，避免两段声音叠在一起
    const a = sfx.fail;
    let done = false;
    const go = () => {
        if (done) return; done = true; a.removeEventListener('ended', go);
        if (state === 'result' && cur === w) speak(w, 'word', $('#stage .spk'));   // 期间用户已点“再试一次”等则不再朗读
    };
    if (a.paused || a.ended || a.error) return go();       // 音效没放出来（文件缺失等）：直接读
    a.addEventListener('ended', go); setTimeout(go, 1500);
}
function reveal() {                                 // 不会就直接看答案：按“答错”处理（进错词列表、要重试、下一轮重测）
    if (state !== 'test' || holding) return;         // 评判中 / 正在录音时不响应
    unlock();
    const w = cur;
    curRevealed = true;
    markMissed(w);
    lastRes = { passed: false, revealed: true };
    post('/api/words/record_error', { session_id: sid, word_id: w.id, mode: w.mode, user_text: '' })
        .catch(err => toast('错题记录失败：' + err.message));
    state = 'result'; render();
    speak(w, 'word', $('#stage .spk'));                     // 公布答案：无论哪种方向，都直接朗读这个词的葡语
}
$('#reveal').onclick = reveal;
$('#skip').onclick = skip;
$('#act').onclick = () => {
    if (state === 'idle') start();
    else if (state === 'result') { if (lastRes?.passed) next(); else retry(); }
    else if (state === 'preview') showDone(summary, true);
    else if (state === 'done') restart();
};
$('#act2').onclick = () => { location.href = 'index.html'; };
$('#back').onclick = () => {
    if (!['loading', 'idle', 'preview', 'done'].includes(state) && !confirm('任务还没完成，现在退出进度不会保留，确定返回聊天？')) return;
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

/* ---------- 启动：先看今天是不是已经完成了 ---------- */
render();
(async () => {
    try { await fetchToday(); } catch (err) { toast('加载今日任务失败：' + err.message); }
    if (today?.completed && today.words.length) showDone(today.completed, false);
    else { state = 'idle'; render(); }                      // 没完成 / 加载失败（点“领取”会重试）
})();