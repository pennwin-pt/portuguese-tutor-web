const API = '';               // 与 nginx 同域反代 /api 时留空；否则填 'https://your.domain'
const $ = s => document.querySelector(s);
const chat = $('#chat'), player = $('#player'), holdBtn = $('#hold');
const sid = localStorage.sid || (localStorage.sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
let mode = 'pt', textMode = false, cur = null, playingPill = null, holding = false;

const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const scroll = () => requestAnimationFrame(() => chat.scrollTop = chat.scrollHeight);
function toast(m) { $('#toast')?.remove(); const t = el('div', '', m); t.id = 'toast'; document.body.append(t); setTimeout(() => t.remove(), 2200); }

/* ---------- 网络 ---------- */
async function post(path, fd) {
    const r = await fetch(API + path, { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || j.message || ('请求失败 ' + r.status));
    return j.data || j;                       // 兼容 {status,data:{}} 与扁平返回
}
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
    const url = audioUrl(d), m = { id: d.message_id, text: d.ai_text, ex: {} };
    const row = el('div', 'row ai'), col = el('div', 'col'), bub = el('div', 'bub pill');
    const dur = el('span', '', '··');
    bub.append(el('span', 'ic', '🔊'), dur); col.append(bub); row.append(col); chat.append(row); m.box = col;
    if (url) {
        const a = new Audio(url);
        a.onloadedmetadata = () => { const s = Math.max(1, Math.round(a.duration)); dur.textContent = s + '″'; bub.style.width = Math.min(96 + s * 9, 250) + 'px'; };
        press(bub, () => { cur = m; $('#mask').hidden = false; }, () => play(url, bub));
        if (auto) play(url, bub);
    } else { dur.textContent = '无语音'; press(bub, () => { cur = m; $('#mask').hidden = false; }); }
    if (d.translation) ex(m, 'zh', '🌐 中文翻译').lastChild.textContent = d.translation;   // 历史里缓存的内容
    if (d.explanation) ex(m, 'ex', '🧠 语法解析').lastChild.textContent = d.explanation;
    scroll();
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

/* ---------- 长按菜单：原文 / 翻译 / 解析 ---------- */
function ex(m, k, title) {                    // 已存在则切换显示/隐藏，返回 null
    let b = m.ex[k];
    if (b) { b.hidden = !b.hidden; return null; }
    b = m.ex[k] = el('div', 'ex'); b.append(el('b', '', title), el('div', 'body')); m.box.append(b); scroll(); return b;
}
$('#sheet').onclick = async e => {
    const k = e.target.dataset.k; if (!k) return;
    $('#mask').hidden = true; const m = cur; if (k === 'x' || !m) return;
    if (k === 'pt') { const b = ex(m, 'pt', '📝 原文'); if (b) b.lastChild.textContent = m.text; return; }
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

/* ---------- 发送 ---------- */
async function send({ blob, ext, text }) {
    const fd = new FormData(); fd.append('session_id', sid); fd.append('mode', mode);
    let mine;
    if (blob) { fd.append('audio', blob, 'rec.' + ext); mine = addMe('🎤 识别中…'); }
    else { fd.append('text', text); mine = addMe(text); }
    const typing = addTyping();
    try {
        const d = await post(blob ? '/api/chat/audio' : '/api/chat/text', fd);
        typing.remove(); fillMe(mine, d); addAI(d);
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

/* ---------- 恢复历史 / 清空对话（长按标题） ---------- */
(async () => {
    try {
        const j = await (await fetch(API + '/api/history?session_id=' + sid)).json();
        if (!j.messages?.length) return;
        $('.tip')?.remove();
        j.messages.forEach(x => x.role === 'user' ? fillMe(addMe(''), x) : addAI(x, false));
        scroll();
    } catch {}
})();
press($('h1'), async () => {
    if (!confirm('清空本次对话和所有语音记录？')) return;
    try { await fetch(API + '/api/session/' + sid, { method: 'DELETE' }); chat.innerHTML = ''; toast('已清空'); }
    catch { toast('清空失败'); }
});