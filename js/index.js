const API = '';               // 与 nginx 同域反代 /api 时留空；否则填 'https://your.domain'
const $ = s => document.querySelector(s);
const chat = $('#chat'), player = $('#player'), holdBtn = $('#hold');
const enc = encodeURIComponent;
const TIP = chat.innerHTML;                   // 空对话时的提示文案，切换用户时复用

/* ---------- 身份：username 即 session_id；没有 username 就是游客（随机 sid） ---------- */
const NAME_RE = /^[A-Za-z0-9_\u4e00-\u9fa5]{2,20}$/;      // 与后端校验保持一致
const guestSid = localStorage.sid || (localStorage.sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
let username = localStorage.getItem('username') || '';
if (!NAME_RE.test(username)) username = '';
let sid = username || guestSid;
let mode = 'pt', textMode = false, cur = null, playingPill = null, holding = false;

const TTS_PROVIDERS = ['piper', 'google', 'edge', 'streamelements'];
const TTS_HINTS = {
    piper: '本地离线合成，速度最快，不挑网络',
    google: '谷歌在线语音，音质一般，每日次数有限',
    edge: '微软 Edge 在线语音，音质最自然（推荐）',
    streamelements: 'StreamElements 在线语音，Edge 不可用时的备选',
};
const ttsSeg = $('#ttsSeg'), voiceHint = $('#voiceHint');
let ttsProvider = localStorage.getItem('ttsProvider');
if (!TTS_PROVIDERS.includes(ttsProvider)) ttsProvider = 'piper';

// 只有 edge / streamelements 有多个音色可选；key 要跟后端 tts_engine.py 里的
// EDGE_VOICES / STREAMELEMENTS_VOICES 白名单完全一致，改一边另一边要同步改。
const VOICE_OPTIONS = {
    edge: {
        'pt-PT-RaquelNeural': '女声 Raquel',
        'pt-PT-DuarteNeural': '男声 Duarte',
    },
    streamelements: {
        'Ines': '女声 Ines',
        'Cristiano': '男声 Cristiano',
    },
};
const voiceOptSeg = $('#voiceOptSeg');
const ttsVoiceKey = p => 'ttsVoice_' + p;
function getTtsVoice(provider) {                       // 没有多音色的 provider 返回 null，不用带 tts_voice 字段
    const opts = VOICE_OPTIONS[provider]; if (!opts) return null;
    const saved = localStorage.getItem(ttsVoiceKey(provider));
    return opts[saved] ? saved : Object.keys(opts)[0];  // 存的值不合法（比如白名单改过）就回退第一个
}
function renderVoiceOpts() {
    const opts = VOICE_OPTIONS[ttsProvider];
    if (!opts) { voiceOptSeg.hidden = true; voiceOptSeg.innerHTML = ''; return; }
    const cur = getTtsVoice(ttsProvider);
    voiceOptSeg.innerHTML = '';
    Object.entries(opts).forEach(([v, label]) => {
        const b = el('button', v === cur ? 'on' : '', label);
        b.type = 'button'; b.dataset.v = v; b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', v === cur ? 'true' : 'false');
        voiceOptSeg.append(b);
    });
    voiceOptSeg.hidden = false;
}
voiceOptSeg.onclick = e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    localStorage.setItem(ttsVoiceKey(ttsProvider), b.dataset.v);
    renderVoiceOpts();
};

function syncTtsSeg() {
    ttsSeg.querySelectorAll('button').forEach(b => {
        const on = b.dataset.p === ttsProvider;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    voiceHint.textContent = TTS_HINTS[ttsProvider] || '';
    renderVoiceOpts();
}
ttsSeg.onclick = e => {
    const b = e.target.closest('button[data-p]'); if (!b) return;
    ttsProvider = b.dataset.p;
    localStorage.setItem('ttsProvider', ttsProvider);
    syncTtsSeg();
};
syncTtsSeg();

const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const scroll = () => requestAnimationFrame(() => chat.scrollTop = chat.scrollHeight);
function toast(m) { $('#toast')?.remove(); const t = el('div', '', m); t.id = 'toast'; document.body.append(t); setTimeout(() => t.remove(), 2200); }

/* ---------- 网络 ---------- */
const errMsg = j => typeof j.detail === 'string' ? j.detail
    : Array.isArray(j.detail) ? j.detail.map(x => x.msg).join('；') : j.message;
async function req(path, body, method = 'POST') {   // body: FormData 走 multipart，普通对象走 JSON
    const opt = { method };
    if (body instanceof FormData) opt.body = body;
    else if (body) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
    const r = await fetch(API + path, opt);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(errMsg(j) || ('请求失败 ' + r.status));
    return j.data || j;                       // 兼容 {status,data:{}} 与扁平返回
}
const post = (path, body) => req(path, body);
const get = path => req(path, null, 'GET');
async function ping() {
    const s = $('#st');
    try { const r = await fetch(API + '/api/health', { cache: 'no-store' }); if (!r.ok) throw 0; s.className = 'on'; s.lastChild.textContent = '已连接'; }
    catch { s.className = 'off'; s.lastChild.textContent = '未连接'; }
}
ping(); setInterval(ping, 15000);

/* ---------- 音频 ---------- */
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
function unlock() { player.src = SILENT; player.play().catch(() => {}); }  // 在用户手势内解锁 iOS 自动播放
function audioUrl(d) {
    if (d.audio_url) return API + d.audio_url;
    if (d.audio_base64) {
        const b = atob(d.audio_base64), u = new Uint8Array(b.length);
        for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
        return URL.createObjectURL(new Blob([u], { type: 'audio/' + (d.audio_format || 'wav') }));
    }
}
function play(url, pill) {
    if (playingPill) playingPill.classList.remove('play');
    if (playingPill === pill && !player.paused) { player.pause(); playingPill = null; return; }
    playingPill = pill; player.src = url; player.play().then(() => pill.classList.add('play')).catch(() => toast('点击语音条播放'));
}
player.onended = player.onpause = () => playingPill?.classList.remove('play');

/* ---------- 消息渲染 ---------- */
function addMe(text) {
    const row = el('div', 'row me'), b = el('div', 'bub', text);
    row.append(el('div', 'col')); row.firstChild.append(b); chat.append(row); scroll(); return b;
}
function fillMe(b, d) {
    const pt = d.user_pt || d.user_text || '（未识别）';
    b.textContent = pt;
    if (d.user_pt && d.user_text && d.user_text !== d.user_pt) b.append(el('small', '', '原话：' + d.user_text));
}
function addTyping() { const r = el('div', 'row ai'), b = el('div', 'bub dots'); b.innerHTML = '<span></span><span></span><span></span>'; r.append(el('div', 'col')); r.firstChild.append(b); chat.append(r); scroll(); return r; }

function addAI(d, auto = true) {
    const m = { id: d.message_id, text: d.ai_text, ex: {}, audioUrl: null };
    const row = el('div', 'row ai'), col = el('div', 'col'), bub = el('div', 'bub pill');
    const dur = el('span', '', '··');
    bub.append(el('span', 'ic', '🔊'), dur); col.append(bub); row.append(col); chat.append(row);
    m.box = col; m.bub = bub; m.dur = dur;
    bindAudio(m, audioUrl(d));
    press(bub, () => { cur = m; $('#mask').hidden = false; }, () => { if (m.audioUrl) play(m.audioUrl, bub); });
    if (m.audioUrl && auto) play(m.audioUrl, bub);
    if (d.translation) ex(m, 'zh', '🌐 中文翻译').lastChild.textContent = d.translation;   // 历史里缓存的内容
    if (d.explanation) ex(m, 'ex', '🧠 语法解析').lastChild.textContent = d.explanation;
    scroll();
}
function bindAudio(m, url) {                  // 首次渲染 / 重新生成语音后，都走这里刷新时长和可播放地址
    m.audioUrl = url;
    if (!url) { m.dur.textContent = '无语音'; return; }
    const a = new Audio(url);
    a.onloadedmetadata = () => {
        const s = Math.max(1, Math.round(a.duration));
        m.dur.textContent = s + '″'; m.bub.style.width = Math.min(96 + s * 9, 250) + 'px';
    };
}
function press(node, onLong, onTap) {         // 长按 420ms 触发菜单；短按触发 onTap
    let t, x, y;
    node.addEventListener('pointerdown', e => {
        e.preventDefault();                   // 抢在系统"选中文字/呼出菜单"手势之前拦下，避免两个菜单打架
        x = e.clientX; y = e.clientY;
        t = setTimeout(() => {
            t = null;
            window.getSelection?.().removeAllRanges();   // 保险起见，清掉可能已经产生的系统选区
            navigator.vibrate?.(15);
            onLong();
        }, 420);
    });
    node.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - x, e.clientY - y) > 18) { clearTimeout(t); t = null; } });
    node.addEventListener('pointerup', () => { if (t) { clearTimeout(t); t = null; onTap && onTap(); } });
    node.addEventListener('pointercancel', () => { clearTimeout(t); t = null; });
    node.addEventListener('contextmenu', e => e.preventDefault());
    node.addEventListener('selectstart', e => e.preventDefault());   // 双保险：某些安卓浏览器不完全听 CSS 的 user-select
}

/* ---------- 长按菜单：原文 / 翻译 / 解析 / 拆解单词 ---------- */
function ex(m, k, title) {                    // 已存在则切换显示/隐藏，返回 null
    let b = m.ex[k];
    if (b) { b.hidden = !b.hidden; return null; }
    b = m.ex[k] = el('div', 'ex'); b.append(el('b', '', title), el('div', 'body')); m.box.append(b); scroll(); return b;
}
$('#sheet').onclick = async e => {
    const k = e.target.dataset.k; if (!k) return;
    $('#mask').hidden = true; const m = cur; if (k === 'x' || !m) return;
    if (k === 'pt') { const b = ex(m, 'pt', '📝 原文'); if (b) b.lastChild.textContent = m.text; return; }
    if (k === 'bd') { openBreakdown(m); return; }
    if (k === 'regen') { regenAudio(m); return; }
    const zh = k === 'zh', b = ex(m, k, zh ? '🌐 中文翻译' : '🧠 语法解析'); if (!b) return;
    b.lastChild.textContent = zh ? '翻译中…' : 'AI 正在解析…';
    const fd = new FormData(); fd.append('session_id', sid); fd.append('text', m.text); if (m.id) fd.append('message_id', m.id);
    try {
        const d = await post(zh ? '/api/translate' : '/api/explain', fd);
        b.lastChild.textContent = (zh ? d.translation : d.explanation) || '（无内容）';
    } catch (err) { b.remove(); delete m.ex[k]; toast(err.message); }
    scroll();
};
$('#mask').onclick = e => { if (e.target.id === 'mask') e.target.hidden = true; };

/* ---------- 重新生成语音：用当前选中的音源/音色，对同一句 ai_text 重新合成 ---------- */
async function regenAudio(m) {
    if (!m.id) return toast('这条消息没有 message_id，无法重新生成');
    toast('正在重新生成语音…');
    const fd = new FormData();
    fd.append('message_id', m.id);
    fd.append('tts_provider', ttsProvider);
    const v = getTtsVoice(ttsProvider); if (v) fd.append('tts_voice', v);
    try {
        const d = await post('/api/regenerate_audio', fd);
        bindAudio(m, audioUrl(d));
        if (m.audioUrl) play(m.audioUrl, m.bub);
        toast(d.tts_fallback ? '已重新生成（在线语音不可用，改用本地语音）' : '已重新生成语音');
    } catch (err) { toast('重新生成失败：' + err.message); }
}

/* ---------- 拆解单词：勾选加入单词库 ---------- */
// wdata.words 里每一项自带 word/meaning/sentence/sentence_zh —— sentence 是这个词
// 所在的那一句葡语原句（如果原话是 "Correção: ..." 这种纠错句，前缀已经被后端去掉），
// sentence_zh 是那一句的中文翻译。加入单词库时按每个词各自的句子存，不用整段消息。
let wdata = null;      // {words:[{word,meaning,sentence,sentence_zh}], src}
const wlist = $('#wlist');
function renderWords() {
    wlist.innerHTML = '';
    if (!wdata?.words?.length) { wlist.innerHTML = '<div class="tip">没有识别出可拆解的单词</div>'; return; }
    wdata.words.forEach((w, i) => {
        const row = el('label', 'wrow'), cb = el('input');
        cb.type = 'checkbox'; cb.checked = true; cb.dataset.i = i;
        const wd = el('div', 'wd'); wd.append(el('b', '', w.word), el('span', '', w.meaning));
        if (w.sentence) wd.append(el('small', '', w.sentence));
        row.append(cb, wd); wlist.append(row);
    });
}
async function openBreakdown(m) {
    $('#wsrc').textContent = m.text;
    wlist.innerHTML = '<div class="tip">拆解中…</div>';
    $('#wmask').hidden = false;
    const fd = new FormData(); fd.append('session_id', sid); fd.append('text', m.text); if (m.id) fd.append('message_id', m.id);
    try {
        const d = await post('/api/breakdown', fd);
        wdata = { words: d.words || [], src: m.text };
        renderWords();
    } catch (err) { $('#wmask').hidden = true; toast(err.message); }
}
$('#wadd').onclick = async () => {
    if (!wdata) return;
    const checked = [...wlist.querySelectorAll('input:checked')].map(cb => wdata.words[+cb.dataset.i]).filter(Boolean);
    if (!checked.length) return toast('请至少选一个单词');
    const items = checked.map(w => ({
        language: 'pt-PT', word: w.word,
        example_sentence: w.sentence || wdata.src || '',   // 优先用词自己所在的那一句，兜底才用整段原话
        chinese_meaning: w.meaning,
        example_chinese: w.sentence_zh || '',
    }));
    const btn = $('#wadd'); btn.disabled = true;
    try {
        const d = await post('/api/vocab', { session_id: sid, items });
        toast(`已加入 ${d.added} 个单词`); $('#wmask').hidden = true;
    } catch (err) { toast('加入失败：' + err.message); }
    finally { btn.disabled = false; }
};

/* ---------- 发送 ---------- */
async function send({ blob, ext, text }) {
    const fd = new FormData(); fd.append('session_id', sid); fd.append('mode', mode);
    fd.append('tts_provider', ttsProvider);
    const v = getTtsVoice(ttsProvider); if (v) fd.append('tts_voice', v);
    let mine;
    if (blob) { fd.append('audio', blob, 'rec.' + ext); mine = addMe('🎤 识别中…'); }
    else { fd.append('text', text); mine = addMe(text); }
    const typing = addTyping();
    try {
        const d = await post(blob ? '/api/chat/audio' : '/api/chat/text', fd);
        typing.remove(); fillMe(mine, d); addAI(d);
        if (d.tts_fallback) toast('在线语音暂时不可用，已用本地语音代替');
    } catch (err) { typing.remove(); mine.parentNode.parentNode.remove(); toast(err.message); }
}

/* ---------- 按住说话 ---------- */
const MIME = window.MediaRecorder && ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
let mr, chunks, t0, startY, cancel, stream;
holdBtn.addEventListener('pointerdown', async e => {
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
        send({ blob: new Blob(chunks, { type: MIME }), ext: MIME.includes('mp4') ? 'm4a' : 'webm' });
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

/* ---------- 文字模式 / 语言模式 ---------- */
const txt = $('#txt'), sendBtn = $('#send');
$('#kb').onclick = () => {
    textMode = !textMode;
    holdBtn.hidden = textMode; txt.hidden = sendBtn.hidden = !textMode;
    $('#kb').textContent = textMode ? '🎤' : '⌨️';
    if (textMode) txt.focus();
};
txt.oninput = () => sendBtn.disabled = !txt.value.trim();
const submit = () => { const v = txt.value.trim(); if (!v) return; txt.value = ''; sendBtn.disabled = true; unlock(); send({ text: v }); };
sendBtn.onclick = submit;
txt.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) submit(); };
$('#mode').onclick = e => {
    mode = mode === 'pt' ? 'zh' : 'pt';
    e.target.className = mode === 'zh' ? 'zh' : ''; e.target.textContent = mode === 'zh' ? '🇨🇳 中文求助' : '🇵🇹 葡语';
    $('#banner').hidden = mode === 'pt'; txt.placeholder = mode === 'zh' ? '输入中文，我来翻译成葡语…' : '输入葡语…';
    toast(mode === 'zh' ? '已切换：中文将先翻译成葡语' : '已切换：葡语模式');
};

/* ---------- 主题（CSS 变量）与背景 ---------- */
const DEFAULT_BLUE = '#3d9be9';
const PRESETS = ['#3d9be9', '#34a96b', '#8b6fd6', '#f08a3c', '#e0568d', '#4b5563'];
const VAR_KEY = /^--[\w-]{1,30}$/, VAR_VAL = /^#[0-9a-f]{3,8}$/i;        // 服务端返回的主题也要过一遍白名单
const BG_URL = /^\/api\/background\/[A-Za-z0-9_.]+$/;
const rootStyle = document.documentElement.style, metaTheme = $('meta[name="theme-color"]'), applied = new Set();

const mix = (hex, w) => {                                                // 向白色混合 w 比例
    const n = parseInt(hex.slice(1), 16);
    return '#' + [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => Math.round(v + (255 - v) * w).toString(16).padStart(2, '0')).join('');
};
const derive = hex => ({ '--blue': hex, '--me': mix(hex, .78), '--blue2': mix(hex, .9) });

function clearTheme() {
    applied.forEach(k => rootStyle.removeProperty(k)); applied.clear();
    metaTheme.content = DEFAULT_BLUE; localStorage.removeItem('theme'); markTheme();
}
function applyTheme(t) {                                                 // t: 对象 / JSON 字符串 / null
    if (typeof t === 'string') try { t = JSON.parse(t); } catch { t = null; }
    clearTheme();
    if (!t || typeof t !== 'object') return;
    const ok = {};
    for (const [k, v] of Object.entries(t)) {
        if (VAR_KEY.test(k) && typeof v === 'string' && VAR_VAL.test(v)) { rootStyle.setProperty(k, v); ok[k] = v; applied.add(k); }
    }
    if (ok['--blue']) metaTheme.content = ok['--blue'];
    localStorage.setItem('theme', JSON.stringify(ok));                   // 本地缓存：刷新时先套用，避免先闪一下默认蓝
    markTheme();
}
async function saveTheme(t) {                                            // 已绑定用户才同步到服务器，游客仅存本机
    if (!username) return;
    try { await post(`/api/user/${enc(username)}/theme`, { theme: t }); }
    catch (err) { toast('主题保存失败：' + err.message); }
}
function setBg(url) {
    const bg = $('#bg');
    bg.style.backgroundImage = url ? `url("${url}")` : '';
    bg.classList.toggle('on', !!url);
}
function applyProfile(p) {
    p = p || {};
    applyTheme(p.theme);
    setBg(BG_URL.test(p.background_url || '') ? API + p.background_url : '');
}

/* ---------- 弹层：通用开关 ---------- */
const closeMasks = () => document.querySelectorAll('.mask').forEach(m => m.hidden = true);
document.querySelectorAll('.mask').forEach(m => m.addEventListener('click', e => {
    if (e.target === m || e.target.hasAttribute('data-close')) m.hidden = true;
}));

/* ---------- 主题面板 ---------- */
const sw = $('#sw'), tc = $('#tc');
PRESETS.forEach(h => {
    const b = el('button'); b.style.background = h; b.dataset.c = h; b.setAttribute('aria-label', '主题色 ' + h);
    b.onclick = () => { applyTheme(derive(h)); saveTheme(derive(h)); };
    sw.insertBefore(b, sw.lastElementChild);
});
function markTheme() {
    const c = (JSON.parse(localStorage.getItem('theme') || '{}')['--blue'] || DEFAULT_BLUE).toLowerCase();
    sw.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.c === c));
    tc.value = c.length === 7 ? c : DEFAULT_BLUE;
}
tc.oninput = () => applyTheme(derive(tc.value));                         // 拖动时乐观更新
tc.onchange = () => saveTheme(derive(tc.value));                         // 选定后再异步保存，避免每一帧都发请求
$('#treset').onclick = () => { const t = derive(DEFAULT_BLUE); applyTheme(t); saveTheme(t); };
$('#theme').onclick = () => {
    $('#bghint').textContent = username
        ? 'JPG / PNG / WebP，不超过 5MB。背景和主题会保存到你的用户名下。'
        : 'JPG / PNG / WebP，不超过 5MB。游客的主题色只保存在本机；上传背景需要先绑定用户名。';
    markTheme(); $('#tmask').hidden = false;
};

/* ---------- 背景上传 ---------- */
$('#bgpick').onclick = () => {
    if (!username) { toast('请先绑定用户名，背景才能保存'); openUser(); return; }
    $('#bgf').click();
};
$('#bgf').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (!/\.(jpe?g|png|webp)$/i.test(f.name) && !/^image\/(jpeg|png|webp)$/.test(f.type)) return toast('仅支持 JPG / PNG / WebP');
    if (f.size > 5 * 1024 * 1024) return toast('图片不能超过 5MB');
    toast('上传中…');
    const fd = new FormData(); fd.append('file', f);
    try {
        const d = await post(`/api/user/${enc(username)}/background`, fd);
        if (BG_URL.test(d.background_url || '')) setBg(API + d.background_url);
        toast('背景已更新');
    } catch (err) { toast('上传失败：' + err.message); }
};

/* ---------- 用户名：绑定 / 恢复 / 退出 ---------- */
const uname = $('#uname');
function syncUserUI() {
    $('#user').classList.toggle('on', !!username);
    $('#user').title = username || '游客';
    $('#ucur').textContent = username ? '当前用户：' + username : '当前：游客模式（聊天记录只跟随本机浏览器）';
    $('#ulogout').hidden = !username;
    uname.value = username;
}
function openUser() { syncUserUI(); $('#tmask').hidden = true; $('#umask').hidden = false; setTimeout(() => uname.focus(), 60); }
$('#user').onclick = openUser;

async function loadHistory() {                                           // 按当前 sid 重建聊天区
    const mine = sid;
    player.pause(); playingPill = null; cur = null;
    try {
        const j = await get('/api/history?session_id=' + enc(sid));
        if (mine !== sid) return;                                        // 期间又切换了用户，丢弃过期结果
        chat.innerHTML = '';
        if (!j.messages?.length) { chat.innerHTML = TIP; return; }
        j.messages.forEach(x => x.role === 'user' ? fillMe(addMe(''), x) : addAI(x, false));
        scroll();
    } catch { if (mine === sid) chat.innerHTML = TIP; }
}
async function submitBind() {
    const name = uname.value.trim();
    if (!NAME_RE.test(name)) return toast('用户名需为 2–20 位字母、数字、下划线或中文');
    if (name === username) { closeMasks(); return; }
    const btn = $('#ubind'); btn.disabled = true;
    try {
        const p = await post('/api/user/bind', { username: name });
        username = name; localStorage.setItem('username', name); sid = name;
        applyProfile(p); syncUserUI(); closeMasks();
        await loadHistory();
        toast('已切换到：' + name);
    } catch (err) { toast(err.message); }
    finally { btn.disabled = false; }
}
$('#ubind').onclick = submitBind;
uname.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing) submitBind(); };
$('#ulogout').onclick = async () => {
    if (!confirm('退出当前用户？聊天记录仍保存在服务器，之后用同一个用户名即可恢复。')) return;
    username = ''; localStorage.removeItem('username'); sid = guestSid;
    clearTheme(); setBg(''); syncUserUI(); closeMasks();
    await loadHistory();
    toast('已回到游客模式');
};

/* ---------- 启动：先套用缓存主题 -> 拉用户资料 -> 恢复历史 ---------- */
applyTheme(localStorage.getItem('theme'));
syncUserUI();
(async () => {
    if (username) {
        try { applyProfile(await get('/api/user/' + enc(username))); }
        catch {
            try { applyProfile(await post('/api/user/bind', { username })); } catch {}   // 服务端没有这个用户（比如库被重建）就补建；网络故障则忽略
        }
    }
    loadHistory();
})();

/* ---------- 清空对话（长按标题） ---------- */
press($('h1'), async () => {
    if (!confirm(username ? `清空「${username}」的对话和所有语音记录？` : '清空本次对话和所有语音记录？')) return;
    try { await fetch(API + '/api/session/' + enc(sid), { method: 'DELETE' }); chat.innerHTML = TIP; toast('已清空'); }
    catch { toast('清空失败'); }
});