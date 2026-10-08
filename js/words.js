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
    const provider = c && ['piper', 'google', 'edge'].includes(c.provider) ? c.provider : 'piper';
    const v = c && c.voices && typeof c.voices[provider] === 'string' ? c.voices[provider] : null;
    return { provider, voice: v };
}

const toast = m => { $('#toast')?.remove(); const t = el('div', '', m); t.id = 'toast'; document.body.append(t); setTimeout(() => t.remove(), 2200); };
let points = { correct_count: 0, today_count: 0, consumed_total: 0, balance: 0 };
let runId = null, roundScore = 0;
function renderPoints() {
    const p = $('#points');
    if (p) p.textContent = `累计得分：${points.correct_count} · 今日得分：${points.today_count} · 余额：${points.balance} · 本轮得分：${roundScore}`;
}
async function refreshPoints() {
    try { points = await get('/api/admin/points'); renderPoints(); if (state === 'done') render(); }
    catch { /* 积分 API 不可用时不阻断单词学习 */ }
}
async function openRun(restart = false) {
    const r = await post('/api/words/run', { session_id: sid, restart });
    runId = r.run_id; roundScore = r.round_score || 0; renderPoints();
}

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
    if (kind === 'sentence' && w.ex) q.set('ex', w.ex);       // 填空题用的是第 ex 条生成例句：读的必须和屏幕上显示的是同一句（ex 为 0 / 没有 = 原例句）
    player.src = `${API}/api/words/${w.id}/audio?${q}`;
    player.play().then(() => spkBtn?.classList.add('play')).catch(() => toast('朗读失败，点喇叭重试'));
}
function speakText(text, btn) {                     // 场景固定台词：失败时只保留文字，不弹错误
    spkBtn?.classList.remove('play'); spkBtn = btn || null;
    const c = ttsCfg(), q = new URLSearchParams({ text, tts_provider: c.provider });
    if (c.provider === 'edge' && c.voice) q.set('tts_voice', c.voice);
    player.src = `${API}/api/tts?${q}`;
    return new Promise(resolve => {
        const finish = () => {
            player.removeEventListener('ended', finish); player.removeEventListener('error', finish); player.removeEventListener('pause', finish);
            resolve(true);
        };
        player.addEventListener('ended', finish);
        player.addEventListener('error', finish);
        player.addEventListener('pause', finish);
        player.play().then(() => spkBtn?.classList.add('play')).catch(() => {
            player.removeEventListener('ended', finish); player.removeEventListener('error', finish); player.removeEventListener('pause', finish); resolve(false);
        });
    });
}
function speakSceneSentence(w, template, btn) {
    spkBtn?.classList.remove('play'); spkBtn = btn || null;
    const c = ttsCfg(), q = new URLSearchParams({ word_id: String(w.id), scene_template: template, tts_provider: c.provider });
    if (c.provider === 'edge' && c.voice) q.set('tts_voice', c.voice);
    player.src = `${API}/api/scene/sentence-audio?${q}`;
    return new Promise(resolve => {
        const finish = () => {
            player.removeEventListener('ended', finish); player.removeEventListener('error', finish); player.removeEventListener('pause', finish);
            resolve(true);
        };
        player.addEventListener('ended', finish); player.addEventListener('error', finish); player.addEventListener('pause', finish);
        player.play().then(() => spkBtn?.classList.add('play')).catch(() => {
            player.removeEventListener('ended', finish); player.removeEventListener('error', finish); player.removeEventListener('pause', finish);
            toast('场景句朗读失败，请再点一次'); resolve(false);
        });
    });
}
player.onended = player.onpause = () => spkBtn?.classList.remove('play');
player.onerror = () => {
    spkBtn?.classList.remove('play');
    const src = player.currentSrc || player.src;
    if (!src.startsWith('data:') && !src.includes('/api/tts?')) toast('朗读失败，点喇叭重试');
};
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

/* ---------- 单词来源：图片关联 / 聊天上下文 ---------- */
const sourceDialog = $('#source-dialog');
const sourceImage = $('#source-image'), sourceRemark = $('#source-remark'), sourceEmpty = $('#source-empty');
function sourceButton(w) {
    if (![1, 2].includes(Number(w.source))) return null;
    const b = el('button', 'source-btn', '查看来源'); b.type = 'button';
    b.onclick = () => {
        sourceImage.hidden = sourceRemark.hidden = sourceEmpty.hidden = true;
        sourceImage.onerror = null;
        sourceImage.removeAttribute('src');
        if (Number(w.source) === 1) {
            sourceDialog.querySelector('#source-title').textContent = '图片来源';
            if (Number(w.reference_image_number) > 0) {
                sourceImage.src = `${API}/api/words/source-image/${encodeURIComponent(w.reference_image_number)}`;
                sourceImage.hidden = false;
                sourceImage.onerror = () => { sourceImage.hidden = true; sourceEmpty.textContent = '找不到这张来源图片。'; sourceEmpty.hidden = false; };
            } else {
                sourceEmpty.textContent = '这个单词没有关联图片编号。'; sourceEmpty.hidden = false;
            }
        } else {
            sourceDialog.querySelector('#source-title').textContent = '聊天来源';
            if ((w.remark || '').trim()) { sourceRemark.textContent = w.remark; sourceRemark.hidden = false; }
            else { sourceEmpty.textContent = '这个单词还没有保存聊天上下文。'; sourceEmpty.hidden = false; }
        }
        sourceDialog.showModal();
    };
    return b;
}
function appendSourceButton(parent, w) { const b = sourceButton(w); if (b) parent.append(b); }
$('#source-close').onclick = () => sourceDialog.close();
sourceDialog.addEventListener('click', e => { if (e.target === sourceDialog) sourceDialog.close(); });

/* ---------- 任务状态 ----------
   Word Item（与后端 memory/word_source.py 的 WordItem 一致）：
   { id, pt_word, cn_meaning, pt_sentence, cn_sentence, source, remark, reference_image_number, mode }   mode: 1=看葡语说中文, 2=看中文说葡语, 3=句子填空（多一个 cloze 字段，含 ____ 占位；可能带 ex＝生成例句编号），
   4=造句（说一句用到目标词的话，评判返回 corrected；无 cloze、无 ex）
   state: loading 加载今日任务 | idle 未领取 | test 测试中 | judging 评判中 | result 结果展示 | preview 预习明天的词（不评分）
          | done 今日已完成（刚通关，或打开页面时服务器记录显示今天早已完成；都可以“重新学习”） */
let state = 'loading';
let sceneIdx = 0, sceneWords = [], sceneCur = null;     // 预习场景状态
let scenePurpose = 'preview';
const sceneSeen = new Set();                            // 本次学习批次中已做过场景的词；错词重测不再重复
let today = null;           // GET /api/words/today 的结果：{date, words, completed}
let summary = null;         // done 页展示的成绩：{rounds,total,first_pass,attempts,times?,completed_at?, fresh}
let todoList = [];          // 当前轮次待测（cur 已经从里面 shift 出来）
let failedList = [];        // 本轮里出过错的词（每词只记一次，带着出错时的 mode）；本轮测完后翻转 mode 变成下一轮的 todoList
let cur = null, lastRes = null;
let aiWrong = 0;            // 当前这个词在本轮里被 AI 评判为“答错”的次数（公布答案、没听清都不算）；≥ SKIP_AFTER 才允许跳过
const SKIP_AFTER = 2;
let curRevealed = false;    // 当前这个词是否点过“公布答案”（用来判定当天结果 again）
const outcomes = {};        // 每个词当天第一轮的结果 {word_id,outcome,mode}：good 一次答对 | hard 答错后才对 | again 公布答案/判错≥2次 | skipped 跳过；完成时提交给服务器调度复习间隔
const KIND_LABEL = { new: '🆕 新词', review: '🔁 复习', weekly: '📅 本周回顾', extra: '💪 周六加练', preview: '👀 先看后测' };
let curMissed = false;      // 当前这个词在本轮里是否已经答错 / 公布过答案（= 不是“一次通过”，本轮结束后要重测）
let round = 1, roundTotal = 0, total = 0, attempts = 0, firstPass = 0, pass2 = 0;   // pass2：周日以测代看第 2 轮（直接考）里一次就答对的词数
const passed = new Set();   // 已“过关”的单词 id：某一轮里一次就答对的词（答错后重试才对的不算，还要进下一轮）

/* ---------- 周日“以测代看”（sunMode） ----------
   只在 previewOnly()（没有测试任务、只有可浏览的词，周日常见）时可用。第 1 轮每个词：先揭示答案（自动朗读）→ 盖住答案说葡语（mode 2）。
   第 2 轮：不管第 1 轮对错，全部词再直接考一遍（不再给答案，方向翻成 mode 1：看葡语说中文）。
   不计入学习进度：不调 /words/complete、不记 outcomes、不记 word_errors、不提供“我已掌握”（它会改服务器进度）。
   第 2 轮起出过错的词进 failedList，第 3 轮起沿用现有“错词翻转方向”机制重测（mode 1 ↔ 2），直到全部通过。
   连错 SKIP_AFTER 次：记为“待巩固”（weak）。第 1 轮直接公布答案往下走，不卡人；第 2 轮起可以点“跳过”。
   断点：每个词开始前把待测队列存进 localStorage（键里带 sid 和本周起始日），中途退出 / 刷新后可继续；词表变了则作废。 */
let sunMode = false;
const weak = new Set();     // 某一轮里连错两次的词 id（待巩固）
const SUN_VER = 1;
const weekStartOf = ds => { const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() - d.getDay()); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const sunKey = () => `sunquiz|${sid}|${weekStartOf(today.date)}`;      // sid 的合法字符里没有 |，不会和别的智能体的键串
const sunIds = () => today.preview.map(w => w.id).sort((a, b) => a - b);
function sunSaved() {                                // 读取并校验本周断点；没有 / 损坏 / 词表和现在对不上 → null
    if (!today?.preview?.length) return null;
    try {
        const s = JSON.parse(localStorage.getItem(sunKey()) || 'null');
        if (!s || s.v !== SUN_VER || JSON.stringify(s.ids) !== JSON.stringify(sunIds())) return null;
        if (![s.todo, s.failed, s.passed, s.weak].every(Array.isArray)) return null;
        return s;
    } catch { return null; }
}
function sunSave(done) {
    if (!today?.preview?.length) return;
    try {
        const key = sunKey(), pre = `sunquiz|${sid}|`;
        for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith(pre) && k !== key) localStorage.removeItem(k); }   // 清掉往周的
        localStorage.setItem(key, JSON.stringify({
            v: SUN_VER, ids: sunIds(), done: !!done, round, roundTotal, total, attempts, firstPass, pass2,
            todo: todoList.map(w => [w.id, w.mode]), failed: failedList.map(w => [w.id, w.mode]), passed: [...passed], weak: [...weak]
        }));
    } catch {}                                       // 隐私模式 / 存储满：不影响测试，只是不能续测
}
function sunClear() { try { localStorage.removeItem(sunKey()); } catch {} }
const sunGaveUp = () => sunMode && round === 1 && state === 'result' && !!lastRes && !lastRes.passed && aiWrong >= SKIP_AFTER;   // 第 1 轮连错够次数：结果页直接“下一个”
function sunProgressText(s) { return s.round === 1 ? `${s.roundTotal - s.todo.length}/${s.total}` : s.round === 2 ? `第 2 轮（直接考）${s.roundTotal - s.todo.length}/${s.roundTotal}` : `第 ${s.round} 轮，还剩 ${s.todo.length} 个错词`; }
function sunPct() {                                  // 顶部进度条：第 1 轮 = 已完成 / 总数；第 2 轮起 = 本轮不再需要重测的词 / 总数
    if (!total) return 0;
    if (round === 1) {
        const settled = cur && state === 'result' && lastRes && (lastRes.passed || sunGaveUp()) ? 1 : 0;
        return Math.min(1, (roundTotal - todoList.length - (cur ? 1 : 0) + settled) / total);
    }
    const left = new Set([...todoList, ...failedList].map(w => w.id));
    if (cur && !passed.has(cur.id)) left.add(cur.id);
    return Math.max(0, (total - left.size) / total);
}

const isLast = () => !todoList.length && !failedList.length && !(sunMode && round === 1);   // 周日第 1 轮测完一定还有第 2 轮（全部词直接考）
const canSkip = () => state === 'result' && !!lastRes && !lastRes.passed && aiWrong >= SKIP_AFTER && !(sunMode && round === 1);   // 周日第 1 轮连错会自动公布答案往下走，不需要跳过   // 只在“AI 已连续判错两次”的结果页开放，不能一上来就跳

const isSunday = () => !!today?.date && new Date(today.date + 'T00:00:00').getDay() === 0;   // 周日：只浏览本周全部单词，周一才开始记
const previewOnly = () => !!today && !today.words.length && !!today.preview?.length;           // 没有测试任务、只有可浏览的词（周日常见）

function viewIdle() {
    if (previewOnly()) {                              // 周日等“只有可浏览的词”：主入口是以测代看，列表浏览是次要入口（#act2）
        const n = today.preview.length, s = sunSaved(), c = el('div', 'wcard');
        c.append(el('div', 'term', '🧪 本周新词 · 以测代看'),
            el('p', 'intro', (isSunday() ? '新的一周从明天（周一）开始记。今天先把这些词一个个过一遍：' : '') +
                '第 1 轮：每个词先看答案、听读音，再盖住答案考你一次，连错两次就公布答案往下走。第 2 轮：所有词不再给答案，直接考一遍（这次看葡语说中文）。不计入学习进度，随时可以退出，下次接着测。'));
        let stat = `共 ${n} 个单词`;
        if (s && s.done) stat = s.pass2 == null ? `✅ 上次已测完：一次通过 ${s.firstPass}/${s.total} · 待巩固 ${s.weak.length} 个\n想再来一遍就点下面的按钮`
            : `✅ 上次已测完\n第 1 轮（先看后说）一次通过 ${s.firstPass}/${s.total}\n第 2 轮（直接考）一次通过 ${s.pass2}/${s.total} · 待巩固 ${s.weak.length} 个\n想再来一遍就点下面的按钮`;
        else if (s) stat = `共 ${n} 个单词\n上次测到 ${sunProgressText(s)}，可以继续`;
        c.append(el('div', 'stat', stat));
        if (s && !s.done) {
            const rb = el('button', 'sbtn', '🔄 重新开始'); rb.type = 'button';
            rb.onclick = () => { if (confirm('确定放弃上次的进度，从头开始吗？')) { unlock(); beginSun(false); } };
            c.append(rb);
        }
        return c;
    }
    const c = el('div', 'wcard');
    c.append(el('div', 'term', '📚 今日单词任务'),
        el('p', 'intro', '系统已为你安排好今天的单词。领取后逐个语音测试：答错会一直停在这个词，直到答对才进下一个；一次就答对的词过关，本轮结束后只重测答错过的词，并换一个方向（说中文 ⇄ 说葡语）。'));
    if (today?.words.length) {
        const m = today.meta || {}, parts = [];
        if (m.review) parts.push(`复习 ${m.review}`);
        if (m.weekly) parts.push(`本周回顾 ${m.weekly}`);
        if (m.extra) parts.push(`周六加练 ${m.extra}`);
        if (m.new) parts.push(`新词 ${m.new}`);
        if (today.preview?.length) parts.push(`${isSunday() ? '本周单词（只看不测）' : '预习'} ${today.preview.length}`);
        c.append(el('div', 'stat', `今天共 ${today.words.length} 个单词` + (parts.length ? '\n' + parts.join(' · ') : '')));
    }
    return c;
}
function viewLoading() { const c = el('div', 'wcard'); c.append(el('div', 'ask', '加载今日任务…')); return c; }
function viewCloze(w, c) {                           // 模式 3：句子填空。全部用 el()/textContent，例句里的特殊字符不会被当成 HTML；不放喇叭、不朗读（读句子会泄露答案）
    c.append(el('div', 'tag', '🧩 填空：看句子，说出缺的词'));
    const box = el('div', 'cloze');
    w.cloze.split('____').forEach((seg, i) => {
        if (i > 0) box.append(el('span', 'blank', '＿＿＿'));
        box.append(document.createTextNode(seg));
    });
    c.append(box);
    if (w.cn_sentence) c.append(el('div', 'azh', w.cn_sentence));
    c.append(el('div', 'hint', '提示：' + w.cn_meaning),
        el('div', 'ask', state === 'judging' ? '⏳ AI 评判中…' : '请只说出缺的那个词'));
    return c;
}
function viewSentence(w, c) {                        // 模式 4：造句。全部用 el()/textContent；不挖空、不显示例句（会让用户照抄）、不自动朗读（词旁喇叭可手动听）
    c.append(el('div', 'tag', '✍️ 造句：用这个词说一句完整的话'));
    const row = el('div', 'termrow');
    row.append(el('div', 'term', w.pt_word), spk(w, 'word'));
    c.append(row, el('div', 'azh', w.cn_meaning),
        el('div', 'ask', state === 'judging' ? '⏳ AI 评判中…' : '请用这个词，说一句完整的葡语'));
    return c;
}
function viewTest() {
    const w = cur, c = el('div', 'wcard');
    if (KIND_LABEL[w.kind]) c.append(el('div', 'kind', KIND_LABEL[w.kind]));
    if (w.mode === 3 && w.cloze) { viewCloze(w, c); appendSourceButton(c, w); return c; } // cloze 缺失时（理论上不会）自然落到下面按 mode 2 渲染
    if (w.mode === 4) { viewSentence(w, c); appendSourceButton(c, w); return c; }
    c.append(el('div', 'tag', w.mode === 1 ? '🇵🇹 → 🇨🇳 看葡语，说中文' : '🇨🇳 → 🇵🇹 看中文，说葡语'));
    const row = el('div', 'termrow');
    row.append(el('div', 'term', w.mode === 1 ? w.pt_word : w.cn_meaning));
    if (w.mode === 1) row.append(spk(w, 'word'));         // 模式 1：可以随时重听单词读音
    c.append(row, el('div', 'ask', state === 'judging' ? '⏳ AI 评判中…' : (w.mode === 1 ? '请用中文说出它的意思' : '请用葡语说出这个词')));
    appendSourceButton(c, w);
    return c;
}
function viewReveal() {                              // 周日以测代看 ①：先露答案（进入时自动朗读单词），看熟了再点“开始说”
    const w = cur, c = el('div', 'wcard');
    c.append(el('div', 'kind', KIND_LABEL.preview), el('div', 'tag', '👀 先看一遍，记住它，然后说出来'));
    const row = el('div', 'termrow');
    row.append(el('div', 'term', w.pt_word), spk(w, 'word'));
    c.append(row, el('div', 'ask', w.cn_meaning));
    if (w.pt_sentence) {
        const ans = el('div', 'ans'), r = el('div', 'arow'), t = el('div', 'tx');
        t.append(el('span', 'alab', '例句'), el('div', 'asen', w.pt_sentence), el('div', 'azh', w.cn_sentence || ''));
        r.append(t, spk(w, 'sentence')); ans.append(r); c.append(ans);
    }
    c.append(el('div', 'hint', '看熟了点“开始说”，下一步会盖住答案考你'));
    appendSourceButton(c, w);
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
        if (w.mode === 4 && lastRes?.corrected) c.append(el('div', 'cmt', '参考说法：' + lastRes.corrected));
    }
    if (sunGaveUp()) c.append(el('div', 'cmt', `已连续答错 ${aiWrong} 次，答案在下面。先记为“待巩固”，往下走，稍后会换个方向再测。`));
    if (canSkip()) c.append(el('div', 'cmt', `已连续答错 ${aiWrong} 次。如果觉得是识别不准，可以跳过（跳过后这个词算已通过，不再重测）`));
    const ans = el('div', 'ans');
    const r1 = el('div', 'arow'), t1 = el('div', 'tx'), r3 = el('div', 'arow'), t3 = el('div', 'tx');
    t1.append(el('span', 'alab', '葡语单词'), el('div', 'apt', w.pt_word), el('div', 'azh', w.cn_meaning));
    r1.append(t1, spk(w, 'word'));
    t3.append(el('span', 'alab', '例句'), el('div', 'asen', w.pt_sentence), el('div', 'azh', w.cn_sentence));
    r3.append(t3, spk(w, 'sentence'));
    ans.append(r1, r3); c.append(ans);
    appendSourceButton(c, w);
    if (sunMode) return c;                           // 周日以测代看不碰学习进度：不放“我已掌握”（它会改服务器进度）
    const mb = el('button', 'mbtn', '✅ 我已掌握，以后不再复习'); mb.type = 'button';
    mb.onclick = () => markMastered(mb);
    c.append(mb);
    return c;
}
/* ---------- 场景演练（预习）：先展示单词列表，用户可逐词主动打开场景 ---------- */
function enterPreview() {
    sceneCur?.cancel(); sceneCur = null;
    sceneWords = window.Scene ? today.preview.filter(Scene.canPlay) : [];
    sceneIdx = -1; scenePurpose = 'preview'; state = 'preview'; render();
}
function startPreviewScene(w) {
    if (!window.Scene || !Scene.canPlay(w)) return;
    sceneCur?.cancel(); sceneCur = null;
    sceneWords = today.preview.filter(Scene.canPlay);
    sceneIdx = sceneWords.findIndex(x => x.id === w.id);
    if (sceneIdx < 0) return;
    scenePurpose = 'preview'; state = 'scene'; render();
}
function previewDone() {                            // 预习结束（场景走完 / 列表点“看完了”）：和原来“看完了”的去向一致
    sceneCur?.cancel(); sceneCur = null;
    if (summary) showDone(summary, true); else { state = 'idle'; render(); }
}
function viewScene() {
    const w = sceneWords[sceneIdx];
    if (sceneCur && sceneCur.idx === sceneIdx) return sceneCur.root;          // 重新 render 时不要把正在播的场景重开
    sceneCur?.cancel();
    const s = Scene.play(w, { mode: 'preview', pool: sceneWords.filter(x => x.id !== w.id), isLast: true, afterLabel: '📋 返回预习列表', speak, speakText, speakSceneSentence, extra: sourceButton,
        exitLabel: '📋 看单词列表', onExit: () => { sceneCur?.cancel(); sceneCur = null; state = 'preview'; render(); },
        cancelAudio: stopSceneAudio });
    sceneCur = { idx: sceneIdx, root: s.root, cancel: s.cancel };
    s.done.then(() => {
        if (sceneCur?.root !== s.root) return;                                // 已经切到别处了
        sceneCur = null; state = 'preview'; render();
    });
    return s.root;
}
function viewAssessmentScene() {
    const w = cur;
    if (!canUseAssessmentScene(w)) { showCurrentTest(); return el('div'); }
    if (sceneCur && sceneCur.wordId === w.id) return sceneCur.root;
    sceneCur?.cancel();
    const pool = (today?.words || []).filter(x => x.id !== w.id && Scene.canPlay(x));
    const s = Scene.play(w, { mode: 'assessment', pool, isLast: false, afterLabel: '进入原测试', speak, speakText, speakSceneSentence,
        exitLabel: '跳过场景，进入测试', onExit: () => { sceneCur?.cancel(); sceneCur = null; showCurrentTest(); },
        extra: sourceButton, cancelAudio: stopSceneAudio, evaluateChoice: evaluateSceneChoice });
    sceneCur = { wordId: w.id, root: s.root, cancel: s.cancel };
    s.done.then(() => {
        if (sceneCur?.root !== s.root || state !== 'scene' || scenePurpose !== 'assessment' || cur !== w) return;
        sceneCur = null; showCurrentTest();
    });
    return s.root;
}
function canUseAssessmentScene(w) {
    return !!(w && w.scene_confirmed === true && ['noun', 'adjective'].includes(w.pos) &&
        w.scene_ok === true && Scene?.canPlay(w));
}
function viewPreview() {                            // 预习：只看、只听，不评分、不改进度
    const c = el('div', 'wcard');
    const wk = isSunday();
    c.append(el('div', 'term', wk ? `👀 本周单词（共 ${today.preview.length} 个）` : '👀 预习明天的词'),
        el('p', 'intro', wk ? '周一开始记。先混个脸熟：点喇叭听读音，看看例句。这里不测试。' : '先混个脸熟：点喇叭听读音，看看例句。这里不测试。'));
    const list = el('div', 'plist');
    for (const w of today.preview) {
        const row = el('div', 'pitem'), tx = el('div', 'tx'), r1 = el('div', 'arow'), actions = el('div', 'preview-actions');
        tx.append(el('div', 'apt', w.pt_word), el('div', 'azh', w.cn_meaning));
        if (w.pt_sentence) tx.append(el('div', 'asen', w.pt_sentence), el('div', 'azh', w.cn_sentence || ''));
        r1.append(tx);
        const sb = sourceButton(w); if (sb) actions.append(sb);
        if (window.Scene && Scene.canPlay(w)) {
            const sceneButton = el('button', 'source-btn scene-preview-btn', '🎬 预习场景');
            sceneButton.type = 'button';
            sceneButton.onclick = () => { unlock(); startPreviewScene(w); };
            actions.append(sceneButton);
        }
        actions.append(spk(w, 'word'));
        row.append(r1, actions); list.append(row);
    }
    c.append(list);
    return c;
}
function fmtTime(s) {       // 服务器存的是 UTC（'YYYY-MM-DD HH:MM:SS'），转成本地 HH:MM
    const d = s ? new Date(s.replace(' ', 'T') + 'Z') : null;
    return d && !isNaN(d) ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
}
function viewSunDone() {                             // 周日以测代看完成页：一次通过 X/N、待巩固 Y 个，并列出待巩固的词方便再听
    const s = summary, c = el('div', 'wcard');
    c.append(el('div', 'term', '🎉 本周新词测完了'),
        el('div', 'stat', `共 ${s.total} 个单词，用了 ${s.rounds} 轮\n第 1 轮（先看后说）一次通过 ${s.first_pass}/${s.total}\n第 2 轮（直接考）一次通过 ${s.pass2}/${s.total} · 待巩固 ${s.weak.length} 个`),
        el('p', 'intro', s.weak.length ? '这几个词连错了两次，周一的新词环节仍会照常出现。趁现在再听几遍：' : '全部过关！周一仍按正常的新词流程再巩固。'));
    if (s.weak.length) {
        const list = el('div', 'plist'), byId = new Map(today.preview.map(w => [w.id, w]));
        for (const id of s.weak) {
            const w = byId.get(id); if (!w) continue;
            const row = el('div', 'pitem'), tx = el('div', 'tx'), r1 = el('div', 'arow');
            tx.append(el('div', 'apt', w.pt_word), el('div', 'azh', w.cn_meaning));
            if (w.pt_sentence) tx.append(el('div', 'asen', w.pt_sentence), el('div', 'azh', w.cn_sentence || ''));
            r1.append(tx); const sb = sourceButton(w); if (sb) r1.append(sb); r1.append(spk(w, 'word')); row.append(r1); list.append(row);
        }
        c.append(list);
    }
    return c;
}
function viewDone() {
    if (summary?.sun) return viewSunDone();
    const s = summary, c = el('div', 'wcard');
    const lines = [`本轮得分 ${s.round_score ?? roundScore} 分 · 今日得分 ${points.today_count} 分 · 累计得分 ${points.correct_count} 分 · 当前余额 ${points.balance} 分`,
        `共 ${s.total} 个单词，用了 ${s.rounds} 轮`, `一次通过 ${s.first_pass} 个 · 共评判 ${s.attempts} 次`];
    const at = fmtTime(s.completed_at);
    if (at) lines.push(`完成于 ${at}` + (s.times > 1 ? ` · 今天第 ${s.times} 次完成` : ''));
    c.append(el('div', 'term', s.fresh ? '🎉 今日任务完成' : '✅ 今日任务已完成'),
        el('div', 'stat', lines.join('\n')),
        el('p', 'intro', '想再巩固一遍？点下面的“重新学习”。'));
    if (today?.preview?.length) {
        const previewButton = el('button', 'sbtn', '👀 重新预习明天的单词');
        previewButton.type = 'button';
        previewButton.onclick = () => { unlock(); enterPreview(); };
        c.append(previewButton);
    }
    return c;
}

function render() {
    const hold = $('#hold'), act = $('#act'), stage = $('#stage');
    const testing = state === 'test' || state === 'judging';
    $('footer').hidden = state === 'scene';
    hold.hidden = !testing;
    hold.disabled = state === 'judging';
    $('#reveal').hidden = !testing;                              // 测试中随时可以“公布答案”
    $('#reveal').textContent = sunMode && round === 1 ? '👀 再看一眼' : '💡 公布答案';   // 周日第 1 轮：回到揭示页重看（算没一次通过，但不算判错）
    $('#reveal').disabled = state === 'judging';
    $('#skip').hidden = !canSkip();
    hold.textContent = state === 'judging' ? '评判中…' : '按住 说话';
    act.hidden = testing || state === 'loading' || state === 'scene';
    const sunIdle = state === 'idle' && previewOnly();
    $('#act2').hidden = !(state === 'done' || sunIdle);                              // 完成页：[返回聊天] [重新学习]；周日首页：[只看列表]
    $('#act2').textContent = sunIdle ? '👀 只看列表' : '返回聊天';
    const ss = sunIdle ? sunSaved() : null;
    const resultLabel = !lastRes ? '' : (!lastRes.passed && !sunGaveUp()) ? '🔁 再试一次'            // 没答对：停在这个词
        : isLast() ? '完成' : todoList.length ? '下一个' : '进入下一轮';              // 答对：本轮还有词 / 本轮最后一个但有错词要重测
    const idleLabel = !previewOnly() ? '领取今日任务' : !ss ? '🧪 开始以测代看' : ss.done ? '🔄 再测一遍' : '▶ 继续测试';
    act.textContent = { idle: idleLabel, result: resultLabel, reveal: '🎤 开始说',
        preview: summary ? '预习完成' : '看完了', done: sunMode ? '🔄 再测一遍' : '🔄 重新学习' }[state] || '';
    const idx = cur ? roundTotal - todoList.length : 0;            // 本轮第几个（cur 已从 todoList 取出）
    $('#prog').textContent = state === 'scene' ? (scenePurpose === 'assessment' ? `第 ${round} 轮 · ${idx}/${roundTotal} · 场景` : `预习 ${sceneIdx + 1}/${sceneWords.length}`) : testing || state === 'result' || state === 'reveal' ? `第 ${round} 轮 · ${idx}/${roundTotal}` : '';
    $('#bar i').style.width = state === 'scene' && scenePurpose === 'preview' ? (sceneIdx / sceneWords.length * 100) + '%' : sunMode ? (sunPct() * 100) + '%' : total ? (passed.size / total * 100) + '%' : '0';
    $('#app').classList.toggle('in-scene', state === 'scene');
    stage.classList.toggle('top', state === 'preview' || state === 'scene' || (state === 'done' && !!summary?.sun && summary.weak.length > 0));   // 预习 / 待巩固列表可能很长，从顶部开始排，不居中
    stage.innerHTML = '';
    stage.append({ loading: viewLoading, idle: viewIdle, test: viewTest, judging: viewTest, reveal: viewReveal, result: viewResult, preview: viewPreview, scene: scenePurpose === 'assessment' ? viewAssessmentScene : viewScene, done: viewDone }[state]());
}

/* ---------- 流程 ---------- */
async function fetchToday() {
    const d = await get(`/api/words/today?session_id=${enc(sid)}`);
    d.words = (d.words || []).filter(w => w && w.id != null && w.pt_word && [1, 2, 3, 4].includes(w.mode));
    d.preview = (d.preview || []).filter(w => w && w.id != null && w.pt_word);
    today = d;
}
function begin(words) {                             // 开始一遍新的测试（首次领取 / 重新学习共用）
    sunMode = false; weak.clear();
    sceneCur?.cancel(); sceneCur = null; sceneSeen.clear(); scenePurpose = 'preview';
    warmMic();                                      // 预热麦克风：失败不提示，真正按住说话时会再试并提示
    todoList = words.slice(); failedList = []; passed.clear(); curMissed = false; curRevealed = false; aiWrong = 0;
    Object.keys(outcomes).forEach(k => delete outcomes[k]);
    total = roundTotal = words.length; round = 1; attempts = 0; firstPass = 0; summary = null;
    next();
}
function beginSun(resume) {                        // 开始 / 继续周日以测代看；resume=true 且有有效断点时从断点接着测
    sunMode = true;
    warmMic();
    const s = resume ? sunSaved() : null;
    passed.clear(); weak.clear(); failedList = []; curMissed = false; curRevealed = false; aiWrong = 0; lastRes = null; summary = null;
    Object.keys(outcomes).forEach(k => delete outcomes[k]);
    if (s && !s.done) {
        const byId = new Map(today.preview.map(w => [w.id, w])), mk = ([id, mode]) => byId.has(id) ? { ...byId.get(id), mode } : null;
        todoList = s.todo.map(mk).filter(Boolean); failedList = s.failed.map(mk).filter(Boolean);
        s.passed.forEach(id => passed.add(id)); s.weak.forEach(id => weak.add(id));
        round = s.round; roundTotal = s.roundTotal; total = s.total; attempts = s.attempts; firstPass = s.firstPass; pass2 = s.pass2 || 0;
        toast('继续上次的进度：' + sunProgressText(s));
    } else {
        sunClear();
        todoList = today.preview.map(w => ({ ...w, mode: 2 }));      // 第 1 轮固定 mode 2：先露答案，再看中文说葡语
        total = roundTotal = todoList.length; round = 1; attempts = 0; firstPass = 0; pass2 = 0;
    }
    next();
}
async function start() {
    unlock();
    const btn = $('#act'); btn.disabled = true;
    try {
        if (!today) await fetchToday();             // 页面打开时加载失败的话，这里重试
        if (previewOnly()) { const s = sunSaved(); beginSun(!!s && !s.done); return; }      // 只有可浏览的词（周日）：以测代看（有未完成的断点就继续）；只看列表走 #act2
        if (!today.words.length) return toast('今天没有单词任务');
        if (today.completed) showDone(today.completed, false);     // 重试时发现今天其实已经完成了
        else { await openRun(false); begin(today.words); }
    } catch (err) { toast('领取失败：' + err.message); }
    finally { btn.disabled = false; }
}
async function restart() {                          // 今日已完成后重新学习：创建新批次
    if (sunMode) { unlock(); beginSun(false); return; }      // 周日以测代看测完后“再测一遍”
    if (!today?.words.length) return;
    unlock(); const btn = $('#act'); btn.disabled = true;
    try { await openRun(true); begin(today.words); }
    catch (err) { toast('开始重新学习失败：' + err.message); }
    finally { btn.disabled = false; }
}
function showDone(rec, fresh) { cur = null; summary = { ...rec, fresh }; state = 'done'; render(); }
function finish() {                                 // 所有单词都通过：先把当天结果提交给服务器（结算复习进度 + 记完成），再进预习 / 成绩页
    releaseMic();
    if (sunMode) {                                   // 周日以测代看：只存本地结果，绝不提交服务器（不计入学习进度）
        cur = null; sunSave(true);
        summary = { rounds: round, total, first_pass: firstPass, pass2, attempts, weak: [...weak], sun: true, fresh: true };
        showDone(summary, true); return;
    }
    cur = null; summary = { rounds: round, total, first_pass: firstPass, attempts, round_score: roundScore, fresh: true };
    if (today?.preview?.length && !today.completed) enterPreview();    // 重新学习时不再预习
    else showDone(summary, true);
    post('/api/words/complete', { session_id: sid, run_id: runId, rounds: round, first_pass: firstPass, attempts, outcomes: Object.values(outcomes) })
        .then(d => {
            if (!d.completed) return;
            if (today) today.completed = d.completed;
            if (summary?.fresh) { summary = { ...d.completed, round_score: roundScore, fresh: true }; if (state === 'done') render(); }   // 换成服务器的记录（含完成时间、次数）
        })
        .catch(err => toast('完成记录保存失败：' + err.message));
}

function next() {                                   // 取下一个待测词；本轮测完则用 failedList 开下一轮；都通过了就结束
    unlock();
    if (!todoList.length && sunMode && round === 1) {  // 周日第 1 轮测完：不管对错，第 2 轮全部词直接考（不先露答案），方向翻成 mode 1（看葡语说中文）
        todoList = today.preview.map(w => ({ ...w, mode: 1 })); failedList = []; passed.clear(); round = 2; roundTotal = todoList.length;
        toast(`第 2 轮：全部 ${roundTotal} 个词直接考，这次看葡语说中文`);
    } else if (!todoList.length) {
        if (!failedList.length) { finish(); return; }
        // 下一轮只测本轮出过错的词，并把方向翻转（上轮说中文 → 这轮说葡语，反之亦然）；用拷贝，不改 today.words 里的原始 mode
        todoList = failedList.map(w => ({ ...w, mode: w.mode === 3 ? 1 : (w.mode === 4 ? 2 : (w.mode === 1 ? 2 : 1)) })); failedList = []; round++; roundTotal = todoList.length;
        toast(`第 ${round} 轮：重测 ${roundTotal} 个错词，换一种方向`);
    }
    if (sunMode) sunSave(false);                     // 断点：每个词开始前存一次（此刻 cur 还没取出，待测队列里含即将出的这个词）
    cur = todoList.shift(); curMissed = false; curRevealed = false; aiWrong = 0; lastRes = null;
    if (sunMode && round === 1) { state = 'reveal'; render(); speak(cur, 'word', $('#stage .spk')); return; }   // 周日第 1 轮：先揭示答案（自动朗读），再考
    if (round === 1 && ['new', 'review'].includes(cur.kind) && canUseAssessmentScene(cur) && !sceneSeen.has(cur.id)) {
        sceneSeen.add(cur.id); scenePurpose = 'assessment'; state = 'scene'; render(); return;
    }
    showCurrentTest();
}
function showCurrentTest() {
    sceneCur?.cancel(); sceneCur = null; scenePurpose = 'preview';
    state = 'test'; render();
    if (cur?.mode === 1) speak(cur, 'word', $('#stage .spk'));
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
async function markMastered(btn) {               // 用户确认自己已经掌握：服务器把这个词标成掌握（退出复习），本地当作已过关，不再重测
    if (state !== 'result' || !cur) return;
    const w = cur;
    if (!confirm(`确定已经完全掌握「${w.pt_word}」吗？\n以后不会再安排这个词的复习。`)) return;
    btn.disabled = true;
    try { await post('/api/words/mark_mastered', { session_id: sid, word_id: w.id }); }
    catch (err) { btn.disabled = false; return toast('保存失败：' + err.message); }
    if (state !== 'result' || cur !== w) return;     // 请求期间已经切走了（比如点了“下一个”）：服务器已记录，本地不再处理
    delete outcomes[w.id];                           // 不再提交这个词当天的结果，后端也会跳过已掌握的词
    failedList = failedList.filter(x => x.id !== w.id);
    passed.add(w.id);                                // 进度条按已过关数计算；不计入 firstPass
    toast('已标记为掌握，以后不再复习');
    next();
}
function noteOutcome(w, force) {                   // 只记每个词第一轮的结果；后面轮次（翻转方向重测）不再改
    if (sunMode || round !== 1 || outcomes[w.id]) return;     // 周日以测代看不记 outcomes（不计入学习进度）
    const oc = force || (curRevealed || aiWrong >= SKIP_AFTER ? 'again' : curMissed ? 'hard' : 'good');
    outcomes[w.id] = { word_id: w.id, outcome: oc, mode: w.mode };
}
function markMissed(w) { if (!curMissed) { curMissed = true; failedList.push(w); } }   // 同一个词本轮只进一次错词列表，反复答错不重复加

const stopSceneAudio = () => player.pause();       // 退出/切换场景时停掉还在播的台词或单词音频
async function evaluateSceneChoice(w, selectedWordId) {       // 场景里 word_choice 的提交：抛错 = 提交失败（场景不计错，可重试）
    const fd = new FormData();
    fd.append('word_id', w.id); fd.append('session_id', sid); fd.append('run_id', runId);
    fd.append('selected_word_id', selectedWordId);
    const d = await post('/api/words/scene/evaluate', fd);
    attempts++;
    if (!d.passed) markMissed(w);
    if (d.earned) roundScore = d.round_score || (roundScore + 1);
    else if (d.round_score != null) roundScore = d.round_score;
    if (d.earned) await refreshPoints(); else renderPoints();
    return d;
}

async function evaluate(blob, ext) {
    const w = cur;
    state = 'judging'; render();
    const fd = new FormData();
    fd.append('audio', blob, 'rec.' + ext); fd.append('word_id', w.id); fd.append('mode', w.mode);
    if (!sunMode && runId) { fd.append('session_id', sid); fd.append('run_id', runId); }
    try {
        const d = await post('/api/words/evaluate', fd);
        if (d.earned) roundScore = d.round_score || (roundScore + 1);
        else if (d.round_score != null) roundScore = d.round_score;
        if (d.earned) await refreshPoints(); else renderPoints();
        attempts++; lastRes = d;
        if (d.passed) {
            noteOutcome(w);
            if (!curMissed) {                       // 这一轮里一次就答对：过关，后面的轮次不再出现
                passed.add(w.id);
                if (round === 1) firstPass++;
                else if (sunMode && round === 2) pass2++;
            }
        } else {
            aiWrong++;                              // AI 判错一次；同一个词累计到 SKIP_AFTER 次就可以跳过
            markMissed(w);                          // 进入本轮的错词列表；当前词不前进，等用户“再试一次”
            if (sunMode && aiWrong >= SKIP_AFTER) weak.add(w.id);    // 周日：同一个词在某一轮连错两次 → 待巩固
            if (!sunMode) post('/api/words/record_error', { session_id: sid, word_id: w.id, mode: w.mode, user_text: d.recognized_text || '' })
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
    if (sunMode && round === 1) { markMissed(w); state = 'reveal'; render(); speak(w, 'word', $('#stage .spk')); return; }   // 周日第 1 轮：回到揭示页再看一眼
    curRevealed = true;
    markMissed(w);
    if (sunMode) weak.add(w.id);                     // 周日：直接考时点了“公布答案” = 这个词还不会 → 待巩固
    lastRes = { passed: false, revealed: true };
    if (!sunMode) post('/api/words/record_error', { session_id: sid, word_id: w.id, mode: w.mode, user_text: '' })
        .catch(err => toast('错题记录失败：' + err.message));
    state = 'result'; render();
    speak(w, 'word', $('#stage .spk'));                     // 公布答案：无论哪种方向，都直接朗读这个词的葡语
}
$('#reveal').onclick = reveal;
$('#skip').onclick = skip;
$('#act').onclick = () => {
    if (state === 'idle') start();
    else if (state === 'reveal') { unlock(); state = 'test'; render(); }       // 周日：看完答案，盖住开始说
    else if (state === 'result') { if (lastRes?.passed || sunGaveUp()) next(); else retry(); }
    else if (state === 'preview') previewDone();   // 纯浏览：看完回到首页
    else if (state === 'done') restart();
};
$('#act2').onclick = () => {
    if (state === 'scene' && scenePurpose === 'assessment') { showCurrentTest(); return; }
    if (state === 'scene') { sceneCur?.cancel(); sceneCur = null; state = 'preview'; render(); return; }      // 预习场景 -> 列表
    if (state === 'idle' && previewOnly()) { unlock(); state = 'preview'; render(); return; }     // 周日首页的“只看列表”
    location.href = 'index.html';
};
$('#back').onclick = () => {
    if (!sunMode && !['loading', 'idle', 'preview', 'scene', 'done'].includes(state) && !confirm('任务还没完成，现在退出进度不会保留，确定返回聊天？')) return;
    location.href = 'index.html';
};

/* ---------- 按住说话（和聊天页同一套手势：按下录音、松开提交、上滑取消） ---------- */
const holdBtn = $('#hold');
// iOS Safari 的 webm/opus 录音是较新的实现，偶尔会录出残缺文件；iOS 上优先用最成熟的 audio/mp4（AAC）
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const MIME_LIST = IS_IOS ? ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'] : ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];
const MIME = window.MediaRecorder && MIME_LIST.find(t => MediaRecorder.isTypeSupported(t));
const MIN_MS = 500, MIN_BYTES = 1200;      // 太短 / 太小的录音直接丢弃，不发给服务器
const TAIL_MS = 250, MIC_WAIT_MS = 1500;   // 松手后多录一小会儿防止句尾被切；等麦克风真正出声的最长时间
let mr, chunks, t0, startY, cancel, stream, stopTimer, preparing = false, holding = false;
// iOS 的麦克风轨道刚拿到、或音频会话被打断（通知音 / 切耳机 / 其它音频抢占）时是 muted（没有数据）。
// 返回 true = 轨道已出声；false = 等到超时仍是 muted，调用方不能再对着它录音（录出来只有文件头）。
const waitMicLive = s => new Promise(res => {
    const t = s.getAudioTracks()[0];
    if (!t) return res(false);
    if (!t.muted) return res(true);
    const fin = ok => { t.removeEventListener('unmute', onUnmute); clearTimeout(timer); res(ok); };
    const onUnmute = () => fin(true);
    const timer = setTimeout(() => fin(!t.muted), MIC_WAIT_MS);
    t.addEventListener('unmute', onUnmute);
});
// 麦克风流策略按平台分开：
// · 安卓（小米平板等）：整个测试期间复用同一条流——每次按下都重新 getUserMedia 要 1~3 秒，复用后只有第一次要等。
// · iOS：每次按下重新申请、录完就关（KEEP_MIC = false）。iOS 上长期开着的流一旦闲置一阵、或中间播过朗读 / 音效，
//   下一次录音常常是空的（轨道没标 muted，但录不进数据 → “没录上”），第一次按住尤其明显；而 iOS 重新申请很快（几十到几百毫秒）。
// 测试结束 / 页面切到后台时都会释放，不让系统一直亮着麦克风图标。
const KEEP_MIC = !IS_IOS;
// 注意：readyState 仍是 live 的流可能已被系统静音（muted），是否还能用由按下时的 waitMicLive 判断，不在这里判断。
let micStream = null, micPromise = null;
async function getMic() {
    if (!KEEP_MIC) releaseMic();                      // iOS：不复用，每次都是新申请的流
    if (micStream && micStream.getAudioTracks().some(t => t.readyState === 'live')) return micStream;
    if (micPromise) return micPromise;                // 预热和第一次按住同时到：共用同一次申请，不开出两条流
    micPromise = navigator.mediaDevices.getUserMedia({ audio: true }).then(s => {
        s.getAudioTracks().forEach(t => { t.onended = () => { if (micStream === s) micStream = null; }; });   // 被系统 / 其他 App 抢走后，下次按下会重新申请
        return micStream = s;
    }).finally(() => { micPromise = null; });
    return micPromise;
}
function warmMic() {                                // 提前触发麦克风权限询问（在“领取 / 开始”那一下点击里）
    if (KEEP_MIC) getMic().catch(() => {});
    else navigator.mediaDevices?.getUserMedia({ audio: true }).then(st => st.getTracks().forEach(t => t.stop())).catch(() => {});   // iOS：只为弹权限，不留着流
}
function releaseMic() {
    if (micStream) micStream.getTracks().forEach(t => t.stop());
    micStream = null;
}
document.addEventListener('visibilitychange', () => { if (document.hidden && !holding && !preparing) releaseMic(); });
window.addEventListener('pagehide', releaseMic);

const holdIdle = () => { holdBtn.className = ''; holdBtn.textContent = '按住 说话'; $('#rec').hidden = true; $('#rec').classList.remove('cancel'); };
holdBtn.addEventListener('pointerdown', async e => {
    if (state !== 'test') return;
    Object.values(sfx).forEach(a => a.pause());   // 答对/答错音效还在响时先停掉，免得和录音抢音频通道
    if (preparing || (mr && mr.state === 'recording')) return;          // 上一次还在准备 / 收尾
    // 录音手势里不 unlock()：往 #player 塞静音 wav 并 play() 会和 getUserMedia / rec.start() 同时切换 iOS 音频会话，
    // 容易让麦克风轨道被静音、录出空文件。页面早已解锁（领取 / 下一个 / 再试一次都 unlock 过），这里只停掉正在播的朗读。
    e.preventDefault(); holding = true; startY = e.clientY; cancel = false; player.pause();
    holdBtn.setPointerCapture(e.pointerId);
    if (!MIME) { toast('浏览器不支持录音（需 HTTPS）'); holding = false; return; }
    preparing = true; holdBtn.textContent = '准备中…';                      // 麦克风真正就绪前不显示“录音中”，避免一开口就丢字
    let s, live;
    const micFail = () => { holding = false; preparing = false; holdIdle(); };
    try { s = await getMic(); live = await waitMicLive(s); }
    catch { toast('无法使用麦克风：请用 HTTPS 访问并允许权限'); micFail(); return; }
    if (holding && !live) {                          // 复用的流被系统静音了（iOS 音频会话被打断）：丢掉，重新申请一条再试一次
        releaseMic();
        try { s = await getMic(); live = await waitMicLive(s); }
        catch { toast('无法使用麦克风：请用 HTTPS 访问并允许权限'); micFail(); return; }
    }
    stream = s;
    if (!holding) { preparing = false; if (!KEEP_MIC) releaseMic(); return; }    // 准备期间已松手（安卓：流留着，下次按下会再检查；iOS：关掉）
    if (!live) { releaseMic(); toast('麦克风暂时被系统占用，请再按一次'); micFail(); return; }   // 不对着静音轨道录音
    chunks = [];
    let rec;
    try { rec = new MediaRecorder(s, { mimeType: MIME, audioBitsPerSecond: 64000 }); }
    catch { releaseMic(); toast('录音启动失败，请再按一次'); micFail(); return; }
    mr = rec;
    rec.ondataavailable = ev => ev.data.size && chunks.push(ev.data);
    rec.onstart = () => {
        preparing = false;
        if (!holding) { cancel = true; rec.stop(); return; }              // 刚开始录就松手了：丢弃
        t0 = Date.now(); navigator.vibrate?.(10);
        holdBtn.classList.add('rec'); holdBtn.textContent = '松开 发送'; $('#rec').hidden = false;
    };
    rec.onstop = () => {
        const tk = s.getAudioTracks()[0], muted = tk?.muted;               // 先记下轨道状态，空录音时用来排查
        preparing = false;
        if (!KEEP_MIC) releaseMic();                 // iOS：每次录完就关；安卓：不 stop，流由 releaseMic() 统一释放
        if (cancel) return;
        if (Date.now() - t0 < MIN_MS) return toast('说话时间太短');
        const blob = new Blob(chunks, { type: MIME });
        if (blob.size < MIN_BYTES) {                                            // 空录音 / 只有文件头：多半是轨道中途被系统静音，这条流不能再用了
            console.warn('录音为空', blob.size + 'B', (Date.now() - t0) + 'ms', 'muted=' + muted, 'keep=' + KEEP_MIC);
            releaseMic();                                                       // 下次按住会用新申请的流
            return toast('没录上，请再说一次');
        }
        evaluate(blob, MIME.includes('mp4') ? 'm4a' : 'webm');
    };
    rec.start();
});
holdBtn.addEventListener('pointermove', e => {
    if (!holding || preparing) return;
    cancel = e.clientY < startY - 80;
    holdBtn.classList.toggle('cancel', cancel); $('#rec').classList.toggle('cancel', cancel);
    $('#rec span').textContent = cancel ? '松开手指，取消发送' : '正在录音… 上滑取消';
    holdBtn.textContent = cancel ? '松开 取消' : '松开 发送';
});
const endRec = () => {
    holding = false; holdIdle();
    if (mr && mr.state === 'recording') {
        if (cancel) mr.stop();
        else { clearTimeout(stopTimer); stopTimer = setTimeout(() => { if (mr.state === 'recording') mr.stop(); }, TAIL_MS); }   // 多录 250ms，句尾不被切
    }
};
holdBtn.addEventListener('pointerup', endRec);
holdBtn.addEventListener('pointercancel', () => { cancel = true; endRec(); });
holdBtn.addEventListener('contextmenu', e => e.preventDefault());

/* ---------- 启动：先看今天是不是已经完成了 ---------- */
render();
renderPoints();
refreshPoints();
(async () => {
    try { await fetchToday(); } catch (err) { toast('加载今日任务失败：' + err.message); }
    if (today?.completed && today.words.length) { roundScore = today.completed.round_score || 0; renderPoints(); showDone(today.completed, false); }
    else { state = 'idle'; render(); }                      // 没完成 / 加载失败（点“领取”会重试）
})();