/* 场景演练：用「节点图」演绎购物、餐厅点单、寻找物品、房间里找东西和形容词描述。
   不引入任何库：人物是内联 SVG，动画全是 CSS；对外只有 Scene.canPlay(w) / Scene.play(w, ctx) / Scene.emojiOf(w)。

   ctx = {
     mode: 'preview' | 'assessment'   缺省：有 evaluateChoice 就是 assessment，否则 preview
     speak(w, kind, btn)   朗读单词（后端按 word_id 合成）
     speakLine(sceneId, nodeId, variant, btn)  按注册表节点 ID 朗读固定台词，失败静默
     pool: [w, ...]        同一批里的其它词（用作干扰项来源）
     isLast: boolean       最后一个词时，结尾按钮显示“完成”
     afterLabel / exitLabel / onExit   结尾按钮文案 / “退出场景”按钮的文案与回调
     extra(w): Node|null   结果卡上附加的控件（words.js 传 sourceButton）
     evaluateChoice(w, selectedWordId)  仅正式测验传：提交服务器判分，返回 { passed }，抛错 = 提交失败（不计错）
     cancelAudio()         被 cancel 时停音频
   }
   Scene.play 返回 { root, done, cancel }：done 在场景走完时 resolve(true)，被 cancel 后永远不 resolve。
   需要的词字段：pt_word、cn_meaning（可选 emoji / pt_sentence / cn_sentence 及场景字段）。

   ── 节点图（模板数据，没有表达式也没有脚本）──
   节点公共字段：type、modes（['preview'] / ['assessment']，当前模式不在列表里就跳过）、location（'street'|'place'，镜头先走过去）、effects（见 FX）
   dialogue / feedback：speaker(friend|helper)、side?、pt、zh、speech(auto|on_tap|none)、button?（没有就等 delay_ms 自动往下）、next、request?(true=这句是“请求”，后面选择环节会重复显示)
   hotspot_choice：hotspots、prompt_zh、on_target、on_decoy         点场景里的物件探索，不提交评判、不计错
   actor_tap：actors(friend|helper)、prompt_zh、on_tap_<人物id>、next、hint_for   点画面里的人物问线索，不提交评判、不计错；
                 next 是被 modes 跳过时的后继；hint_for 指向后面的 hotspot_choice，让 {hotspot_zh} 提前有值
   word_choice：prompt_zh、display{preview,assessment}、on_correct、on_wrong   从 4 个词里选，正式测验在这里提交评判
   complete：reveal_pt（{target}）                                    结果卡
   占位符：pt 里 {blank}→______、{art} {noun}（形容词示例名词）；zh 里 {target_zh} {noun_zh} {hotspot_zh}（目标热点的中文名，仅 zh/hint_zh）；含 {blank} 的台词一律不朗读。
   目标词泄露保护：任何要显示/朗读的固定葡语，若整词命中目标词（含形容词四个词形）→ 换成 ______ 并不朗读；热点标签命中 → 只留图标。 */
(function () {
    'use strict';
    const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const shuffle = a => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
    // 去重音、去冠词、转小写：'a maçã' / 'Maçã' / 'maçãs' 都能查到同一个 emoji
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/^(o|a|os|as|um|uma|uns|umas)\s+/, '').replace(/[^a-z\s-]/g, '').trim();

    /* ---------- 词 → emoji（没有的词会退化成“中文意思卡片”）；以后后端给词加 emoji 字段，优先用 w.emoji ---------- */
    const RAW = {
        'maçã': '🍎', 'pão': '🍞', 'leite': '🥛', 'água': '💧', 'café': '☕', 'chá': '🍵', 'queijo': '🧀', 'ovo': '🥚',
        'arroz': '🍚', 'peixe': '🐟', 'carne': '🥩', 'frango': '🍗', 'banana': '🍌', 'laranja': '🍊', 'uva': '🍇',
        'morango': '🍓', 'limão': '🍋', 'tomate': '🍅', 'batata': '🥔', 'cenoura': '🥕', 'cebola': '🧅', 'alface': '🥬',
        'milho': '🌽', 'cereja': '🍒', 'pêra': '🍐', 'melancia': '🍉', 'ananás': '🍍', 'pêssego': '🍑', 'abacate': '🥑',
        'sumo': '🧃', 'vinho': '🍷', 'cerveja': '🍺', 'bolo': '🎂', 'gelado': '🍦', 'chocolate': '🍫', 'sopa': '🍲',
        'sal': '🧂', 'mel': '🍯', 'pizza': '🍕', 'sandes': '🥪', 'hambúrguer': '🍔', 'batatas fritas': '🍟',
        'garrafa': '🍾', 'copo': '🥤', 'prato': '🍽️', 'faca': '🔪', 'garfo': '🍴', 'colher': '🥄',
        'livro': '📖', 'caneta': '🖊️', 'lápis': '✏️', 'caderno': '📓', 'jornal': '📰', 'mapa': '🗺️', 'carta': '✉️',
        'chave': '🔑', 'telemóvel': '📱', 'relógio': '⌚', 'óculos': '👓', 'computador': '💻', 'câmara': '📷',
        'sapato': '👞', 'camisa': '👔', 'chapéu': '👒', 'casaco': '🧥', 'meia': '🧦', 'calças': '👖', 'vestido': '👗',
        'mala': '👜', 'mochila': '🎒', 'guarda-chuva': '☂️', 'anel': '💍', 'presente': '🎁', 'bilhete': '🎫', 'dinheiro': '💶',
        'bola': '⚽', 'flor': '🌹', 'guitarra': '🎸', 'balão': '🎈', 'vela': '🕯️', 'lanterna': '🔦',
        'carro': '🚗', 'bicicleta': '🚲', 'autocarro': '🚌', 'comboio': '🚆', 'avião': '✈️',
        'cão': '🐶', 'gato': '🐱', 'casa': '🏠', 'cama': '🛏️', 'cadeira': '🪑', 'porta': '🚪', 'relógio de parede': '🕰️',
    };
    const ITEM_EMOJI = {};
    for (const k of Object.keys(RAW)) ITEM_EMOJI[norm(k)] = RAW[k];
    const GENERIC_EMOJI = [...new Set(Object.values(ITEM_EMOJI))];
    const GENERIC_PT = ['maçã', 'leite', 'pão', 'água', 'livro', 'chave', 'guarda-chuva', 'chapéu', 'sapato', 'telemóvel', 'ovo', 'flor'];
    const SCENE_FIELDS = ['emoji', 'pos', 'gender', 'number', 'scene_ok', 'scene_confirmed', 'scene_template',
        'adjective_m_singular', 'adjective_f_singular', 'adjective_m_plural', 'adjective_f_plural'];
    const hasSceneData = w => SCENE_FIELDS.some(k => Object.prototype.hasOwnProperty.call(w, k));
    function emojiOf(w) {
        if (!w) return '';
        if (w.scene_confirmed === true && typeof w.emoji === 'string' && w.emoji.trim()) return w.emoji.trim();
        const k = norm(w.pt_word);
        return ITEM_EMOJI[k] || (k.endsWith('s') && ITEM_EMOJI[k.slice(0, -1)]) || (k.endsWith('es') && ITEM_EMOJI[k.slice(0, -2)]) || '';
    }
    const canPlay = w => {
        if (!w || !w.pt_word) return false;
        if (hasSceneData(w)) {
            if (w.scene_confirmed !== true || w.scene_ok !== true) return false;
            if (w.pos === 'noun') return w.scene_template !== 'describe' && !!(emojiOf(w) || w.cn_meaning);
            if (w.pos === 'adjective') return (w.scene_template == null || w.scene_template === 'describe') &&
                ['adjective_m_singular', 'adjective_f_singular', 'adjective_m_plural', 'adjective_f_plural']
                    .every(key => typeof w[key] === 'string' && w[key].trim()) && !!(emojiOf(w) || w.cn_meaning);
            if (w.pos === 'verb') return (w.scene_template == null ||
                (typeof w.scene_template === 'string' && w.scene_template.startsWith('verb_'))) && !!(emojiOf(w) || w.cn_meaning);
            return false;
        }
        if (w.pos === 'adjective' || w.pos === 'verb') return false;
        return !!(emojiOf(w) || w.cn_meaning);
    };
    /* ---------- 人物：内联 SVG（只拼颜色常量，没有任何用户数据） ---------- */
    const person = (shirt, hair) =>
        '<svg viewBox="0 0 48 76" width="48" height="76" aria-hidden="true">' +
        '<ellipse cx="24" cy="72" rx="14" ry="3" fill="rgba(0,0,0,.12)"/>' +
        '<rect x="14" y="52" width="8" height="18" rx="4" fill="#475569"/><rect x="26" y="52" width="8" height="18" rx="4" fill="#475569"/>' +
        `<rect x="9" y="24" width="30" height="34" rx="13" style="fill:${shirt}"/>` +
        `<rect x="3" y="28" width="9" height="22" rx="4.5" style="fill:${shirt}"/><rect x="36" y="28" width="9" height="22" rx="4.5" style="fill:${shirt}"/>` +
        '<circle cx="24" cy="15" r="12" fill="#f8d5b5"/>' +
        `<path d="M12 14c0-9 7-12 12-12s12 3 12 12c-4-5-8-6-12-6s-8 1-12 6z" style="fill:${hair}"/>` +
        '<circle cx="20" cy="16" r="1.5" fill="#1f2937"/><circle cx="28" cy="16" r="1.5" fill="#1f2937"/>' +
        '<path d="M20.5 21q3.5 3 7 0" stroke="#9a3412" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>';
    function mkPerson(cls, shirt, hair) {
        const p = el('div', 'sc-person ' + cls), inner = el('div', 'sc-inner');
        inner.innerHTML = person(shirt, hair);
        p.append(inner);
        return p;
    }

    /* ---------- 常量 ---------- */
    const MAX_STEPS = 200;            // 节点图跳转次数上限，防止写错的数据把页面卡死
    const DISTRACTORS = 3;            // 每题 1 个正确 + 3 个干扰项（候选不够时减少，至少 2 个选项）
    const RULEOUT_AT = 2;             // D5：同一题累计答错 2 次，排除一个错误项（置灰）
    const REVEAL_AT = 3;              // D5：累计答错 3 次，仅预习高亮正确项；正式测验永远不高亮
    const SKIP_AT = 2;                // 正式测验累计答错 2 次，“跳过场景”按钮变醒目
    const FOOD_WORDS = new Set(['maçã', 'pão', 'leite', 'água', 'café', 'chá', 'queijo', 'ovo', 'arroz', 'peixe', 'carne', 'frango', 'banana', 'laranja', 'uva', 'morango', 'limão', 'tomate', 'batata', 'cenoura', 'cebola', 'alface', 'milho', 'cereja', 'pêra', 'melancia', 'ananás', 'pêssego', 'abacate', 'sumo', 'vinho', 'cerveja', 'bolo', 'gelado', 'chocolate', 'sopa', 'sal', 'mel', 'pizza', 'sandes', 'hambúrguer', 'batatas fritas'].map(norm));
    const FOOD_EMOJI = new Set([...FOOD_WORDS].map(k => ITEM_EMOJI[k]).filter(Boolean));
    const isFood = w => FOOD_WORDS.has(norm(w && w.pt_word)) || FOOD_EMOJI.has(emojiOf(w));
    // 干扰项兜底词表：emoji + 葡语（每个 emoji 只留一个词）
    const GENERIC = [], seenEmoji = new Set();
    for (const [pt, e] of Object.entries(RAW)) if (!seenEmoji.has(e)) { seenEmoji.add(e); GENERIC.push({ emoji: e, pt }); }
    // 形容词干扰项兜底：[阳单, 阴单, 阳复, 阴复]
    const GENERIC_ADJ = [['bonito', 'bonita', 'bonitos', 'bonitas'], ['grande', 'grande', 'grandes', 'grandes'], ['pequeno', 'pequena', 'pequenos', 'pequenas'],
        ['novo', 'nova', 'novos', 'novas'], ['velho', 'velha', 'velhos', 'velhas'], ['caro', 'cara', 'caros', 'caras'], ['barato', 'barata', 'baratos', 'baratas'],
        ['alto', 'alta', 'altos', 'altas'], ['baixo', 'baixa', 'baixos', 'baixas'], ['limpo', 'limpa', 'limpos', 'limpas'], ['sujo', 'suja', 'sujos', 'sujas'],
        ['feliz', 'feliz', 'felizes', 'felizes'], ['triste', 'triste', 'tristes', 'tristes'], ['bom', 'boa', 'bons', 'boas']];
    const GENERIC_VERB = [
        ['correr', '🏃'], ['comer', '🍽️'], ['beber', '🥤'], ['dormir', '😴'], ['ler', '📖'], ['escrever', '✍️'],
        ['nadar', '🏊'], ['cantar', '🎤'], ['dançar', '💃'], ['lavar', '🧼'], ['pagar', '💳'], ['abrir', '🔓']
    ].map(([pt, emoji]) => ({ id: -1, pt, emoji }));
    const adjectiveContext = (w, tpl) => {
        const contexts = tpl.noun_contexts || [];
        const index = contexts.length ? (Number(w.id) || 0) % contexts.length : 0;
        const context = contexts[index] || {};
        return { ...context, nounZh: context.noun_zh || context.nounZh || '', index };
    };
    const adjectiveForm = (w, c) => w[`adjective_${c.gender}_${c.number}`] || w.pt_word || '';
    const adjectiveIdx = c => (c.gender === 'm' ? 0 : 1) + (c.number === 'singular' ? 0 : 2);

    let templateRequest = null;
    function loadTemplates() {
        if (!templateRequest) templateRequest = fetch('/api/scene/templates', { credentials: 'same-origin' })
            .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
            .then(data => {
                if (!data || !Array.isArray(data.templates) || !data.templates.length) throw new Error('没有可用的已发布模板');
                return data.templates;
            }).catch(error => { templateRequest = null; throw error; });
        return templateRequest;
    }
    let templateCursor = 0;                // 名词没指定模板时轮换，体验不同场景
    function chooseTemplate(w, templates) {
        if (w.scene_template) {
            const selected = templates.find(t => t.id === w.scene_template);
            if (!selected) throw new Error(`场景模板 ${w.scene_template} 当前不可用`);
            if (!(selected.applies_to?.pos || []).includes(w.pos)) throw new Error('所选场景模板不适用于当前词性');
            return selected;
        }
        const pos = ['noun', 'adjective', 'verb'].includes(w.pos) ? w.pos : 'noun';
        const available = templates.filter(t => (t.applies_to?.pos || []).includes(pos)
            && (!t.foodOnly || isFood(w)));
        if (!available.length) throw new Error(`没有适用于${({ noun: '名词', adjective: '形容词', verb: '动词' })[pos]}的已发布场景模板`);
        if (!hasSceneData(w)) return available.find(t => t.id === 'shop') || available[0];
        if (pos === 'adjective') return available[0];
        const automatic = available[templateCursor % available.length];
        templateCursor = (templateCursor + 1) % available.length;
        return automatic;
    }

    /* ---------- 3D 舞台（可选）：默认开启 3D；?stage=2d 关闭并记住，?stage=3d 恢复；?debug=1 显示调试镜头 ---------- */
    const SCRIPT_SRC = document.currentScript && document.currentScript.src;
    const want3D = () => {
        const q = new URLSearchParams(location.search).get('stage');
        try {
            if (q === '2d') localStorage.setItem('stage3d', '0');
            else if (q === '3d') localStorage.removeItem('stage3d');
            return localStorage.getItem('stage3d') !== '0';        // 默认开启；没有 3D 布局的模板会自动用 2D
        } catch (e) { return q !== '2d'; }
    };
    const debug3D = () => new URLSearchParams(location.search).has('debug');
    let stageModule = null;
    const loadStage3D = () => stageModule || (stageModule = import(new URL('stage3d.js', SCRIPT_SRC || location.href).href)
        .catch(e => { stageModule = null; throw e; }));

    function playTemplate(w, ctx, tpl) {
        ctx = ctx || {};
        const mode = ctx.mode === 'assessment' || ctx.mode === 'preview' ? ctx.mode : (ctx.evaluateChoice ? 'assessment' : 'preview');
        const pool = ctx.pool || [], zh = w.cn_meaning || '', em = emojiOf(w), CANCEL = {};
        const nounCtx = tpl.adjectiveOnly ? adjectiveContext(w, tpl) : { noun: '', nounZh: '', article: '', index: 0 };
        let alive = true;
        const guard = () => { if (!alive) throw CANCEL; };
        const wait = async ms => { await sleep(ms); guard(); };

        /* --- 泄露保护：目标词（含形容词四个词形、单复数）整词出现在固定葡语里就不能显示/朗读 --- */
        const forms = new Set();
        for (const f of [w.pt_word, w.adjective_m_singular, w.adjective_f_singular, w.adjective_m_plural, w.adjective_f_plural]) {
            const k = norm(f);
            if (k.length >= 2) { forms.add(k); forms.add(k.endsWith('s') ? k.slice(0, -1) : k + 's'); }
        }
        const leaks = text => { const s = ' ' + norm(text).replace(/\s+/g, ' ') + ' '; for (const f of forms) if (s.includes(' ' + f + ' ')) return true; return false; };
        const fillPt = s => String(s || '').replace(/\{(blank|art|noun)\}/g, (_, k) => k === 'blank' ? '______' : k === 'art' ? nounCtx.article : nounCtx.noun);
        const fillZh = s => String(s || '').replace(/\{(target_zh|noun_zh|hotspot_zh)\}/g, (_, k) => k === 'target_zh' ? zh : k === 'noun_zh' ? nounCtx.nounZh : hotspotZh());

        /* --- 依模板搭舞台；色块 SVG 是静态素材，不包含单词或用户数据 --- */
        const root = el('div', `sc ${tpl.root}`);
        const view = el('div', 'sc-view'), track = el('div', 'sc-track');
        const street = el('div', 'sc-pane street'), place = el('div', `sc-pane sc-place ${tpl.scenery}`);
        [['🌳', '6%', '18%'], ['🏠', '78%', '24%'], ['☁️', '30%', '6%'], ['☁️', '66%', '4%']].forEach(([t, l, tp]) => {
            const d = el('span', 'deco', t); d.style.left = l; d.style.top = tp; street.append(d);
        });
        if (tpl.id === 'find') {
            const art = el('div', 'sc-find-art');
            art.innerHTML = '<svg viewBox="0 0 260 150" aria-hidden="true"><rect x="18" y="75" width="118" height="42" rx="12" fill="#c084fc"/><rect x="30" y="55" width="90" height="35" rx="12" fill="#d8b4fe"/><rect x="28" y="112" width="10" height="24" fill="#7c3f16"/><rect x="116" y="112" width="10" height="24" fill="#7c3f16"/><rect x="177" y="42" width="55" height="76" rx="5" fill="#a16207"/><rect x="183" y="49" width="43" height="28" fill="#fef3c7"/><rect x="183" y="83" width="43" height="29" fill="#fde68a"/><circle cx="213" cy="95" r="2" fill="#92400e"/><path d="M150 118h96" stroke="#64748b" stroke-width="5"/><path d="M154 115c-9-35 6-55 18-67 10 12 18 31 11 67" fill="#86efac"/><path d="M159 94l-16-13m36 20 14-15m-27-13 2-20" stroke="#16a34a" stroke-width="5" stroke-linecap="round"/></svg>';
            place.append(art);
        }
        if (tpl.id === 'restaurant') place.append(el('div', 'sc-place-sign', 'MENU'));
        const helperEl = mkPerson('sc-clerk', tpl.cast.helper[0], tpl.cast.helper[1]);
        const friendEl = tpl.roomOnly ? helperEl : mkPerson('sc-friend', tpl.cast.friend[0], tpl.cast.friend[1]);   // 房间场景里朋友就在房间里
        const bubble = el('div', 'sc-bubble');
        if (!tpl.roomOnly) street.append(friendEl, bubble);
        const shelf = el('div', 'sc-shelf');
        place.append(el('div', 'awning'), shelf, helperEl, el('div', 'counter'));
        track.append(street, place);
        const me = mkPerson('sc-me', 'var(--blue)', '#3b2a20');
        const basket = el('div', 'sc-basket'), bItem = el('span', 'b-item'); basket.append(bItem, el('span', '', tpl.carrier));
        const dialogueBubble = el('div', 'sc-dialogue-bubble'), ctlBox = el('div', 'sc-ctl');
        view.append(track, me, basket, dialogueBubble);
        root.append(view, ctlBox);
        let loc = 'street';
        if (tpl.roomOnly) { loc = 'place'; root.classList.add('at-place'); }

        /* --- 3D 舞台（可选）：2D 的 DOM 和状态类照常维护，3D 只是叠加；失败/丢失上下文时直接露出 2D --- */
        let stage = null, stageWait = null;
        if (want3D()) {                                     // 房间类场景（roomOnly）也支持 3D；没有布局的模板 create() 会返回 null，自动继续用 2D
            root.classList.add('is3d-wait');
            stageWait = loadStage3D()
                .then(mod => mod.create({ view, tpl, hotspots: tpl.hotspots || [], debug: debug3D(),
                    onLost: () => { stage = null; root.classList.remove('is3d'); } }))
                .then(s3 => {
                    if (!s3) return null;
                    if (!alive) { s3.dispose(); return null; }
                    stage = s3; root.classList.add('is3d');
                    s3.follow(friendEl, 'friend', 'mid'); s3.follow(helperEl, 'helper', 'mid');
                    s3.follow(me, 'me', 'mid'); s3.follow(bubble, 'friend', 'above'); s3.follow(basket, 'me', 'hand');
                    return s3;
                })
                .catch(e => { console.warn('scene: 3D 舞台不可用，继续使用 2D', e); return null; })
                .then(s3 => { root.classList.remove('is3d-wait'); return s3; });
        }

        /* --- 运行时状态 --- */
        const st = { visits: {}, opts: {}, req: null, lastSpeech: null, chosen: null, last: null, target: null, tried: new Set(), decoys: 0, note: '', skipAttn: false, entered: false };
        const hotspots = new Map((tpl.hotspots || []).map(h => [h.id, h]));
        const actorEl = id => id === 'friend' ? friendEl : helperEl;
        const hotspotZh = () => { const h = hotspots.get(st.target); if (!h) console.warn('scene: {hotspot_zh} 还没有目标热点'); return h ? (h.zh || '') : ''; };
        /* 目标热点：点人物（hint_for）和选地点共用，同一次进入内保持不变 */
        function ensureTarget(nodeId) {
            const hn = tpl.nodes[nodeId];
            const hs = ((hn && hn.hotspots) || []).map(x => hotspots.get(x)).filter(Boolean);
            if (hs.length >= 2 && (!st.target || !hs.some(h => h.id === st.target))) {
                // assign_target:noun_context（describe）：目标热点 = 本词名词语境对应的那个，不随机
                const forced = hn.assign_target === 'noun_context' ? hs.find(h => h.context === nounCtx.index) : null;
                st.target = (forced || hs[Math.floor(Math.random() * hs.length)]).id;
            }
            return hs;
        }
        const speakNode = (nodeId, btn) => {
            if (!ctx.speakLine) return null;
            try { return Promise.resolve(ctx.speakLine(tpl.id, nodeId, tpl.id === 'describe' ? nounCtx.index : undefined, btn)).catch(() => false); } catch (e) { return null; }
        };
        const speakWord = btn => { if (ctx.speak) ctx.speak(w, 'word', btn || null); };

        /* --- 控制条：主按钮（可选）+ “退出场景”（始终在） --- */
        function setCtl(label) {
            ctlBox.textContent = '';
            let p = null;
            if (label) p = new Promise(res => {
                const b = el('button', '', label); b.type = 'button';
                b.onclick = () => { b.disabled = true; res(); };
                ctlBox.append(b);
            });
            if (ctx.onExit) {
                const b = el('button', 'sc-exit' + (st.skipAttn ? ' attn' : ''), ctx.exitLabel || '退出场景');
                b.type = 'button'; b.onclick = () => ctx.onExit(); ctlBox.append(b);
            }
            return p;
        }

        /* --- 台词气泡 --- */
        function say(nodeId, n, ptText, zhText, speechTap) {
            const side = n.side || (n.speaker === 'friend' && !tpl.roomOnly ? 'friend' : 'helper');
            const who = n.speaker === 'friend' ? '朋友' : tpl.helperName;
            dialogueBubble.className = 'sc-dialogue-bubble visible ' + side;
            dialogueBubble.textContent = '';
            const line = el('div', 'sc-dialogue-text', ptText);
            if (speechTap) {
                const sp = el('button', 'spk', '🔊'); sp.type = 'button'; sp.setAttribute('aria-label', '朗读这句');
                sp.onclick = () => speakNode(nodeId, sp); line.append(sp);
            }
            dialogueBubble.append(line);
            if (zhText) dialogueBubble.append(el('div', 'sc-dialogue-zh', `${who}：${zhText}`));
        }
        const addZhLine = t => dialogueBubble.append(el('div', 'sc-dialogue-zh', t));
        function showPrompt(promptZh) {          // 选择环节：重复显示“请求”（目标词仍被遮住）+ 提示语
            dialogueBubble.className = 'sc-dialogue-bubble visible helper';
            dialogueBubble.textContent = '';
            if (st.req) dialogueBubble.append(el('div', 'sc-dialogue-text', st.req.pt), el('div', 'sc-dialogue-zh', st.req.zh));
            if (promptZh) dialogueBubble.append(el('div', 'sc-dialogue-zh', fillZh(promptZh)));
        }

        /* --- 白名单 effects：未知的只警告，不中断 --- */
        const resolveArg = a => a === '$last_hotspot' ? st.last : a;
        const hotBtn = id => [...shelf.children].find(b => b.dataset.id === id);
        const pulse = (node, cls, ms) => { if (!node) return; node.classList.add(cls); setTimeout(() => node.classList.remove(cls), ms); };
        const FX = {
            async enter(a) {
                if (a !== 'friend' || tpl.roomOnly || st.entered) return;
                st.entered = true; await wait(60); root.classList.add('go'); stage && stage.enter('friend'); await wait(950);
            },
            talk(a) { pulse(actorEl(a), 'talk', 1800); stage && stage.talk(a); },
            cheer(a) { actorEl(a).classList.add('cheer'); stage && stage.cheer(a); },
            bubble_target() { if (tpl.roomOnly) return; bubble.textContent = zh; bubble.classList.add('txt', 'show'); },
            bubble_happy() { if (tpl.roomOnly) return; bubble.textContent = '😀'; bubble.classList.remove('txt'); bubble.classList.add('show'); },
            walk_me() { root.classList.add('walking'); },
            stop_walk() { root.classList.remove('walking'); },
            shake(a) { pulse(hotBtn(resolveArg(a)), 'shake', 400); stage && stage.shake(resolveArg(a)); },
            async open(a) { const b = hotBtn(resolveArg(a)); if (b) b.classList.add('open'); stage && stage.open(resolveArg(a)); await wait(650); },
            basket_add_target() { bItem.textContent = em || '📦'; basket.classList.add('has'); },
            basket_clear() { bItem.textContent = ''; basket.classList.remove('has'); },
            speak_target() { const p = st.lastSpeech; if (p) p.then(() => { if (alive) speakWord(null); }); else speakWord(null); },
            sparkle() {
                const pane = stage ? view : tpl.roomOnly ? place : street;
                for (let i = 0; i < 6; i++) {
                    const s = el('span', 'sc-spark', '✨'); s.style.left = (44 + Math.random() * 28) + '%'; s.style.top = (30 + Math.random() * 30) + '%';
                    s.style.animationDelay = (i * 90) + 'ms'; pane.append(s); setTimeout(() => s.remove(), 1500);
                }
            },
            async fly_correct() {
                const o = st.chosen; if (!o || !o.btn) return;
                const vr = view.getBoundingClientRect(), ir = o.btn.getBoundingClientRect(), br = basket.getBoundingClientRect();
                const fly = el('div', 'sc-fly' + (o.fly.length > 3 ? ' txt' : ''), o.fly);
                Object.assign(fly.style, { left: (ir.left - vr.left) + 'px', top: (ir.top - vr.top) + 'px', width: ir.width + 'px', height: ir.height + 'px' });
                view.append(fly); o.btn.style.visibility = 'hidden'; fly.getBoundingClientRect();
                fly.style.transform = `translate(${br.left - ir.left}px, ${br.top - ir.top}px) scale(.5)`; fly.style.opacity = '.9';
                await wait(850); fly.remove();
            },
        };
        async function camera(to) {
            if (to === loc || (to !== 'street' && to !== 'place')) return;
            loc = to; root.classList.add('walking'); root.classList.toggle('at-place', to === 'place'); stage && stage.cameraTo(to);
            await wait(1500); root.classList.remove('walking');
        }
        async function runEffects(n) {
            for (const e of n.effects || []) {
                guard();
                const i = e.indexOf(':'), name = i < 0 ? e : e.slice(0, i), arg = i < 0 ? '' : e.slice(i + 1);
                if (name === 'camera_to') { await camera(arg); continue; }
                const fn = FX[name];
                if (!fn) { console.warn('scene: 未知 effect', e); continue; }
                await fn(arg, n);
            }
        }

        /* --- 节点：dialogue / feedback --- */
        async function doDialogue(id, n) {
            let pt = fillPt(n.pt), speech = n.speech || 'none';
            if (/\{blank\}/.test(n.pt || '')) speech = 'none';
            else if (leaks(pt)) { console.warn('scene leak', id); pt = '______'; speech = 'none'; }
            const zhText = fillZh(n.zh);
            say(id, n, pt, zhText, speech === 'on_tap');
            if (n.request) st.req = { pt, zh: zhText };
            if (n.type === 'feedback') {
                if (n.hint_zh && st.decoys >= (n.hint_after || 1)) addZhLine(n.hint_zh);
                if (st.note) { addZhLine(st.note); st.note = ''; }
            }
            st.lastSpeech = speech === 'auto' ? speakNode(id) : null;
            setCtl(null);
            await runEffects(n);
            const p = setCtl(n.button || null);
            if (p) await p; else await wait(n.delay_ms == null ? 1200 : n.delay_ms);
            return n.next;
        }

        /* --- 节点：actor_tap（点画面里的人物问线索：不提交、不计错） --- */
        async function doActorTap(id, n) {
            ensureTarget(n.hint_for);
            // 朋友只在街道画面（房间场景里和帮手是同一个人）；帮手只在“place”画面
            const visible = a => a === 'friend' ? (tpl.roomOnly || (loc === 'street' && st.entered)) : loc === 'place';
            const list = [...new Set(n.actors || [])].filter(a => (a === 'friend' || a === 'helper') && visible(a));
            if (!list.length) { console.warn('scene: 画面里没有可点的人物', id); return n.next; }
            showPrompt(n.prompt_zh);
            setCtl(null);
            const undo = [];
            const picked = await new Promise(res => list.forEach(a => {
                const host = actorEl(a), b = el('button', 'sc-tap');
                b.type = 'button'; b.setAttribute('aria-label', a === 'friend' ? '朋友' : tpl.helperName);
                b.onclick = () => res(a);
                host.classList.add('tap'); host.append(b);
                undo.push(() => { host.classList.remove('tap'); b.remove(); });
            }));
            guard();
            undo.forEach(f => f());
            return n['on_tap_' + picked] || n.next;
        }

        /* --- 节点：hotspot_choice（探索：点错不提交、不计错） --- */
        async function doHotspots(id, n) {
            const hs = ensureTarget(id);
            if (hs.length < 2) { console.error('scene: 热点不足', id); return n.on_target; }
            shelf.textContent = ''; shelf.style.pointerEvents = '';
            shelf.classList.toggle('proj', !!stage);
            const btns = hs.map(h => {
                const b = el('button', 'sc-item hot'); b.type = 'button'; b.dataset.id = h.id; b.setAttribute('aria-label', h.zh || h.pt);
                b.append(el('span', 'em', h.icon));
                if (!leaks(h.pt)) b.append(el('span', 'lb', h.pt));      // 标签撞了目标词：只留图标
                if (st.tried.has(h.id)) { b.disabled = true; b.classList.add('bad'); }
                shelf.append(b); return b;
            });
            if (stage) btns.forEach(b => stage.follow(b, 'hs:' + b.dataset.id, 'hot'));
            if (st.visits[id] === 1) showPrompt(n.prompt_zh);
            setCtl(null);
            const hid = await new Promise(res => btns.forEach(b => { b.onclick = () => { if (!b.disabled) res(b); }; }));
            guard();
            shelf.style.pointerEvents = 'none';
            st.last = hid.dataset.id;
            if (st.last === st.target) return n.on_target;
            st.tried.add(st.last); st.decoys++; hid.disabled = true; hid.classList.add('bad');
            return n.on_decoy;
        }

        /* --- 选项构造（D8）：优先取同批词，不够再用兜底词表；候选与目标重复的剔除 --- */
        const sameKey = s => { const k = norm(s); return k.endsWith('s') ? k.slice(0, -1) : k; };
        function buildOptions(n) {
            const disp = (n.display && n.display[mode]) || 'pt';
            const useEmoji = !!em && !tpl.adjectiveOnly && disp !== 'pt';
            const hasEmoji = !!em && !tpl.adjectiveOnly;
            let mine, batch, fallback;
            if (tpl.adjectiveOnly) {
                const idx = adjectiveIdx(nounCtx);
                mine = { id: w.id, pt: adjectiveForm(w, nounCtx), ok: true };
                batch = pool.filter(x => x.pos === 'adjective' && canPlay(x)).map(x => ({ id: x.id, pt: adjectiveForm(x, nounCtx) }));
                fallback = GENERIC_ADJ.map(g => ({ id: -1, pt: g[idx] }));
            } else if (w.pos === 'verb') {
                mine = { id: w.id, pt: w.pt_word, emoji: em, ok: true };
                batch = pool.filter(x => x.pos === 'verb' && canPlay(x)).map(x => ({ id: x.id, pt: x.pt_word, emoji: emojiOf(x) }));
                fallback = GENERIC_VERB;
            } else {
                mine = { id: w.id, pt: w.pt_word, emoji: em, ok: true };
                const words = tpl.foodOnly ? pool.filter(isFood) : pool.filter(x => x.pos !== 'adjective' && x.pos !== 'verb');
                batch = words.map(x => ({ id: x.id, pt: x.pt_word, emoji: emojiOf(x) }));
                fallback = (tpl.foodOnly ? GENERIC.filter(g => FOOD_EMOJI.has(g.emoji)) : GENERIC).map(g => ({ id: -1, pt: g.pt, emoji: g.emoji }));
            }
            const seen = new Set([sameKey(mine.pt)]), seenEmoji = new Set(hasEmoji ? [em] : []), picked = [];
            for (const c of [...shuffle(batch), ...shuffle(fallback)]) {
                if (picked.length >= DISTRACTORS) break;
                if (!c.pt || seen.has(sameKey(c.pt)) || leaks(c.pt) && !tpl.adjectiveOnly) continue;
                if (hasEmoji && (!c.emoji || seenEmoji.has(c.emoji))) continue;          // 目标有 emoji，干扰项也必须有，且互不相同
                seen.add(sameKey(c.pt)); if (c.emoji) seenEmoji.add(c.emoji); picked.push({ ...c, ok: false });
            }
            return shuffle([mine, ...picked]).map(o => ({ ...o, disp: useEmoji ? disp : 'pt', fly: (useEmoji && o.emoji) ? o.emoji : o.pt, picked: false, out: false, hint: false }));
        }
        function optionButton(o) {
            const b = el('button', 'sc-item' + (o.disp === 'pt' ? ' txt' : o.disp === 'emoji_pt' ? ' both' : '')); b.type = 'button';
            if (o.disp === 'pt') b.textContent = o.pt;
            else if (o.disp === 'emoji') b.textContent = o.emoji;
            else b.append(el('span', 'em', o.emoji), el('span', 'lb', o.pt));
            if (o.picked || o.out) { b.disabled = true; b.classList.add('bad'); }
            if (o.hint) b.classList.add('hint');
            return b;
        }

        /* --- 节点：word_choice（只有这里会提交评判；提示分级 D5） --- */
        async function doChoice(id, n) {
            let o = st.opts[id];
            if (!o) { o = st.opts[id] = { list: buildOptions(n), wrong: 0 }; showPrompt(n.prompt_zh); }
            shelf.textContent = ''; shelf.style.pointerEvents = ''; shelf.classList.remove('proj');
            o.list.forEach(x => { x.btn = optionButton(x); shelf.append(x.btn); });
            setCtl(null);
            const opt = await new Promise(resolve => {
                let busy = false;
                o.list.forEach(x => {
                    x.btn.onclick = async () => {
                        if (busy || x.btn.disabled) return;
                        if (!ctx.evaluateChoice) { x.passed = x.ok; resolve(x); return; }
                        busy = true; x.btn.disabled = true;
                        try {
                            const r = await ctx.evaluateChoice(w, x.ok ? w.id : x.id);   // 干扰项传它自己的词 id（兜底项 -1），绝不传目标 id
                            busy = false; x.passed = !!(r && r.passed); resolve(x);
                        } catch (err) {                                                  // 提交失败：不计错，按钮恢复，可再点
                            busy = false;
                            if (alive) { x.btn.disabled = false; addZhLine((err && err.message) || '提交失败，请重试。'); }
                        }
                    };
                });
            });
            guard();
            shelf.style.pointerEvents = 'none';
            if (opt.passed) { st.chosen = opt; return n.on_correct; }
            o.wrong++; opt.picked = true; opt.btn.disabled = true; opt.btn.classList.add('bad', 'shake');
            if (o.wrong === RULEOUT_AT) {
                const left = o.list.filter(x => !x.ok && !x.picked && !x.out);
                if (left.length) { left[Math.floor(Math.random() * left.length)].out = true; st.note = '已经帮你排除了一个错误选项。'; }
            }
            if (o.wrong >= REVEAL_AT && mode === 'preview') o.list.find(x => x.ok).hint = true;   // 只有预习才会高亮正确项
            if (mode === 'assessment' && o.wrong >= SKIP_AT) st.skipAttn = true;
            return n.on_wrong;
        }

        /* --- 节点：complete（结果卡） --- */
        async function doComplete(id, n) {
            shelf.style.pointerEvents = 'none';
            dialogueBubble.textContent = '';
            const card = el('div', 'sc-sum'), row = el('div', 'sc-line');
            row.append(el('div', 'sc-term', String(n.reveal_pt || '{target}').replace('{target}', w.pt_word || '')));
            const sp = el('button', 'spk', '🔊'); sp.type = 'button'; sp.setAttribute('aria-label', '朗读单词'); sp.onclick = () => speakWord(sp); row.append(sp);
            const extra = ctx.extra && ctx.extra(w); if (extra) row.append(extra);
            card.append(row, el('div', 'sc-zh2', zh));
            if (w.pt_sentence) card.append(el('div', 'sc-sen', w.pt_sentence), el('div', 'sc-zh2', w.cn_sentence || ''));
            dialogueBubble.className = 'sc-dialogue-bubble visible helper sc-dialogue-summary';
            dialogueBubble.append(card);
            await setCtl(ctx.afterLabel || (ctx.isLast ? '完成 ✓' : '下一个词 ›')); guard();
            return null;
        }

        /* --- 主循环 --- */
        const HANDLERS = { dialogue: doDialogue, feedback: doDialogue, actor_tap: doActorTap, hotspot_choice: doHotspots, word_choice: doChoice, complete: doComplete };
        const completeId = Object.keys(tpl.nodes).find(k => tpl.nodes[k].type === 'complete');
        async function run() {
            if (stageWait) { await stageWait; guard(); }
            let id = tpl.start, steps = 0;
            for (;;) {
                guard();
                if (++steps > MAX_STEPS) { console.error('scene: 超过最大步数，直接收尾'); id = completeId; steps = -1e9; }
                const n = tpl.nodes[id], handler = n && HANDLERS[n.type];
                if (!handler) { console.error('scene: 节点无效', id); if (id === completeId) return; id = completeId; continue; }
                if (n.modes && !n.modes.includes(mode)) { id = n.next || n.on_correct || n.on_target; continue; }
                st.visits[id] = (st.visits[id] || 0) + 1;
                if (n.location) await camera(n.location);
                id = await handler(id, n);
                if (id == null) return;
            }
        }
        const done = run().then(() => alive, e => { if (e !== CANCEL) console.error(e); return false; })
            .then(ok => ok ? true : new Promise(() => {}));
        return { root, done, cancel: () => { alive = false; stage && stage.dispose(); if (ctx.cancelAudio) ctx.cancelAudio(); } };
    }

    function play(w, ctx) {
        ctx = ctx || {};
        const root = el('div', 'sc sc-loading', '正在加载场景模板…');
        let alive = true, child = null;
        const done = loadTemplates().then(templates => {
            if (!alive) return new Promise(() => {});
            const tpl = chooseTemplate(w, templates);
            child = playTemplate(w, ctx, tpl);
            if (root.parentNode) root.replaceWith(child.root);
            return child.done;
        }).catch(error => {
            if (!alive) return new Promise(() => {});
            console.error('scene template load failed', error);
            root.className = 'sc sc-load-error'; root.textContent = '';
            root.append(el('div', 'sc-load-message', `场景模板加载失败：${error.message}`));
            if (ctx.onExit) {
                const exit = el('button', 'sc-exit', ctx.exitLabel || '退出场景');
                exit.type = 'button'; exit.onclick = () => ctx.onExit(); root.append(exit);
            }
            return new Promise(() => {});
        });
        return { get root() { return child?.root || root; }, done, cancel: () => { alive = false; child?.cancel(); if (ctx.cancelAudio) ctx.cancelAudio(); } };
    }

    window.Scene = { canPlay, play, emojiOf };
})();