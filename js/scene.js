/* 场景演练：用「节点图」演绎购物、餐厅点单、寻找物品、房间里找东西和形容词描述。
   只做 3D 舞台（stage3d.js，Three.js 渲染）；本文件的 DOM 只负责台词气泡、热点按钮、人物点击区；对外只有 Scene.canPlay(w) / Scene.play(w, ctx) / Scene.emojiOf(w)。

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
                 assign_target：random（默认）/ noun_context（describe_*）/ word_zone（shop：目标 = 词的 scene_zone，没配置则在 random_target≠false 的热点里随机）
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
    const SCENE_FIELDS = ['emoji', 'pos', 'gender', 'number', 'scene_ok', 'scene_confirmed', 'scene_template', 'scene_noun', 'scene_zone',
        'adjective_m_singular', 'adjective_f_singular', 'adjective_m_plural', 'adjective_f_plural'];
    const hasSceneData = w => SCENE_FIELDS.some(k => Object.prototype.hasOwnProperty.call(w, k));
    const ADJECTIVE_TEMPLATES = new Set(['describe_object', 'describe_person']);   // 形容词场景：描述物件 / 描述人物（服务端 scene_registry.CONTEXT_SCENES）
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
            if (w.pos === 'noun') return w.scene_template !== 'describe_object' && !!(emojiOf(w) || w.cn_meaning);
            if (w.pos === 'adjective') return (w.scene_template == null || ADJECTIVE_TEMPLATES.has(w.scene_template)) &&
                ['adjective_m_singular', 'adjective_f_singular', 'adjective_m_plural', 'adjective_f_plural']
                    .every(key => typeof w[key] === 'string' && w[key].trim()) && !!(emojiOf(w) || w.cn_meaning);
            if (w.pos === 'verb') return (w.scene_template == null ||
                (typeof w.scene_template === 'string' && w.scene_template.startsWith('verb_'))) && !!(emojiOf(w) || w.cn_meaning);
            return false;
        }
        if (w.pos === 'adjective' || w.pos === 'verb') return false;
        return !!(emojiOf(w) || w.cn_meaning);
    };
    /* ---------- 人物点击锚点：空 div，由 stage3d 每帧投影到 3D 人物身上；点击区（.sc-tap）挂在里面 ---------- */
    const mkAnchor = cls => el('div', 'sc-person ' + cls);

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
        // 管理端配置了 scene_noun 且在模板名词语境里 → 用它；否则按 id 取余（旧行为，与服务端 scene_registry.adjective_context_index 一致）
        const picked = w.scene_noun ? contexts.findIndex(c => c.noun === w.scene_noun) : -1;
        const index = picked >= 0 ? picked : (contexts.length ? (Number(w.id) || 0) % contexts.length : 0);
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
    // verb_park / verb_restaurant 等句式是 “Vamos ____ / quero ____”，只有单个词的不定式（correr、dever）才读得通。
    // 变位 / 过去分词 / 反身（decidiu、acontecido、lembrar-se）自动轮换时只进 verbForms: 'any' 的模板（如 verb_note）。
    // 抽象的不定式（confirmar、resolver）套进公园/餐厅语义别扭，在管理端把场景模板固定成 verb_note 即可。
    const isPlainInfinitive = s => /^\p{L}*(ar|er|ir|or|ôr)$/iu.test(String(s || '').trim());
    function chooseTemplate(w, templates) {
        if (w.scene_template) {
            const selected = templates.find(t => t.id === w.scene_template);
            if (!selected) throw new Error(`场景模板 ${w.scene_template} 当前不可用`);
            if (!(selected.applies_to?.pos || []).includes(w.pos)) throw new Error('所选场景模板不适用于当前词性');
            return selected;
        }
        const pos = ['noun', 'adjective', 'verb'].includes(w.pos) ? w.pos : 'noun';
        const available = templates.filter(t => (t.applies_to?.pos || []).includes(pos)
            && (!t.foodOnly || isFood(w)) && !t.manualOnly);          // manualOnly（如 verb_persuade）不参加自动轮换，只在词里明确选了它时才用
        if (!available.length) throw new Error(`没有适用于${({ noun: '名词', adjective: '形容词', verb: '动词' })[pos]}的已发布场景模板`);
        if (!hasSceneData(w)) return available.find(t => t.id === 'shop') || available[0];
        if (pos === 'adjective') return available[0];
        let candidates = available;
        if (pos === 'verb' && !isPlainInfinitive(w.pt_word)) {
            const anyForm = available.filter(t => t.verbForms === 'any');
            if (anyForm.length) candidates = anyForm;
        }
        const automatic = candidates[templateCursor % candidates.length];
        templateCursor = (templateCursor + 1) % candidates.length;
        return automatic;
    }

    /* ---------- 3D 舞台（必需）：?debug=1 显示调试镜头 ---------- */
    const SCRIPT_SRC = document.currentScript && document.currentScript.src;
    const debug3D = () => new URLSearchParams(location.search).has('debug');
    let stageModule = null;
    const loadStage3D = () => stageModule || (stageModule = import(new URL('stage3d.js', SCRIPT_SRC || location.href).href)
        .catch(e => { stageModule = null; throw e; }));

    /* 派对闯关（tpl.roam）：自由走动的 3D 场地，模块和样式都是第一次用到时才加载 */
    let roamModule = null;
    const loadRoam = () => roamModule || (roamModule = (() => {
        if (!document.querySelector('link[data-roam-css]')) {
            const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.roamCss = '1';
            l.href = new URL('../css/roam.css', SCRIPT_SRC || location.href).href; document.head.append(l);
        }
        return import(new URL('roam/index.js', SCRIPT_SRC || location.href).href);
    })().catch(e => { roamModule = null; throw e; }));

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

        /* --- 依模板搭 DOM 层：台词气泡、热点按钮、人物点击锚点、篮子；画面本身全部由 stage3d 渲染 --- */
        const root = el('div', 'sc' + (tpl.roam ? ' sc-roam' : ''));
        const view = el('div', 'sc-view');
        const helperEl = mkAnchor('sc-clerk');
        const friendEl = tpl.roomOnly ? helperEl : mkAnchor('sc-friend');   // 房间场景里朋友就在房间里
        const bubble = el('div', 'sc-bubble');
        const shelf = el('div', 'sc-shelf proj');
        const basket = el('div', 'sc-basket'), bItem = el('span', 'b-item'); basket.append(bItem, el('span', '', tpl.carrier));
        const dialogueBubble = el('div', 'sc-dialogue-bubble'), ctlBox = el('div', 'sc-ctl');
        view.append(shelf, helperEl);
        if (!tpl.roomOnly) view.append(friendEl, bubble);
        view.append(basket, dialogueBubble);
        root.append(view, ctlBox);
        let loc = tpl.roomOnly ? 'place' : 'street';

        /* --- 3D 舞台：必须成功。WebGL 不可用 / 加载失败 / 模板没有布局 / 渲染上下文丢失 → 显示错误卡 + 退出按钮（没有 2D 回退） --- */
        let stage = null;
        function showStageError(message) {
            if (!alive) return;
            alive = false; stage = null;                    // guard() 之后会让主循环以 CANCEL 退出，done 永不 resolve
            root.className = 'sc sc-load-error'; root.textContent = '';
            root.append(el('div', 'sc-load-message', message));
            if (ctx.onExit) {
                const exit = el('button', 'sc-exit', ctx.exitLabel || '退出场景');
                exit.type = 'button'; exit.onclick = () => ctx.onExit(); root.append(exit);
            }
            if (ctx.cancelAudio) ctx.cancelAudio();
        }
        root.classList.add('is3d-wait');
        const stageWait = (tpl.roam ? loadRoam() : loadStage3D())
            .then(mod => mod.create({ view, tpl, hotspots: tpl.hotspots || [], debug: debug3D(), ctx,
                onLost: () => showStageError('3D 画面丢失（显卡上下文被系统回收），请退出后重新进入场景。') }))
            .then(s3 => {
                if (!s3) throw new Error('这个场景的 3D 画面不可用（浏览器不支持 WebGL，或模板缺少 3D 布局）。');
                if (!alive) { s3.dispose(); return null; }
                stage = s3;
                s3.follow(friendEl, 'friend', 'mid'); s3.follow(helperEl, 'helper', 'mid');
                s3.follow(bubble, 'friend', 'above'); s3.follow(basket, 'me', 'hand');
                return s3;
            })
            .catch(e => { console.warn('scene: 3D 舞台不可用', e); showStageError(`3D 场景加载失败：${e.message}`); return null; })
            .then(s3 => { root.classList.remove('is3d-wait'); return s3; });

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
                // assign_target:noun_context（describe_object）：目标热点 = 本词名词语境对应的那个，不随机
                // assign_target:word_zone（shop）：目标热点 = 管理端给这个词配置的购买分区（w.scene_zone）；没配置/配置已失效时回到随机
                let forced = null;
                if (hn.assign_target === 'noun_context') forced = hs.find(h => h.context === nounCtx.index);
                else if (hn.assign_target === 'word_zone' && w.scene_zone) forced = hs.find(h => h.id === w.scene_zone);
                // 随机时跳过 random_target:false 的热点（如 shop 的数码区）：没配置分区的老词不会被随机派到它那里去
                const cands = hn.assign_target === 'word_zone' ? hs.filter(h => h.random_target !== false) : hs;
                const rnd = cands.length ? cands : hs;
                st.target = (forced || rnd[Math.floor(Math.random() * rnd.length)]).id;
            }
            return hs;
        }
        const speakNode = (nodeId, btn) => {
            if (!ctx.speakLine) return null;
            // 只有台词里带 {art}/{noun} 的节点才带名词语境序号；服务端对其它台词的 variant 会返回 422（以前 describe_object 的固定台词因此一直没声音）
            const line = tpl.nodes[nodeId], variant = tpl.adjectiveOnly && /\{(art|noun)\}/.test((line && line.pt) || '') ? nounCtx.index : undefined;
            try { return Promise.resolve(ctx.speakLine(tpl.id, nodeId, variant, btn)).catch(() => false); } catch (e) { return null; }
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
                st.entered = true; await wait(60); stage && stage.enter('friend'); await wait(950);
            },
            talk(a) { stage && stage.talk(a); },
            cheer(a) { stage && stage.cheer(a); },
            bubble_target() { if (tpl.roomOnly) return; bubble.textContent = zh; bubble.classList.add('txt', 'show'); },
            bubble_happy() { if (tpl.roomOnly) return; bubble.textContent = '😀'; bubble.classList.remove('txt'); bubble.classList.add('show'); },
            shake(a) { pulse(hotBtn(resolveArg(a)), 'shake', 400); stage && stage.shake(resolveArg(a)); },
            async open(a) { const b = hotBtn(resolveArg(a)); if (b) b.classList.add('open'); stage && stage.open(resolveArg(a)); await wait(650); },
            basket_add_target() { bItem.textContent = em || '📦'; basket.classList.add('has'); },
            basket_clear() { bItem.textContent = ''; basket.classList.remove('has'); },
            speak_target() { const p = st.lastSpeech; if (p) p.then(() => { if (alive) speakWord(null); }); else speakWord(null); },
            sparkle() {
                const pane = view;
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
            loc = to; stage && stage.cameraTo(to);
            await wait(1500);
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
            shelf.classList.add('proj');
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

        /* --- 节点：roam_choice（派对闯关：玩家在 3D 场地里跑动，抓取答案；每次抓取提交一次评判，和 word_choice 的判分完全一致） --- */
        let roamTimer = 0;
        function roamNotice(msg, ms) {                                       // 跑动中的短提示：几秒后自动收起
            clearTimeout(roamTimer);
            dialogueBubble.className = 'sc-dialogue-bubble visible friend'; dialogueBubble.textContent = '';
            if (typeof msg === 'string') dialogueBubble.append(el('div', 'sc-dialogue-zh', msg));
            else { dialogueBubble.append(el('div', 'sc-dialogue-text', msg.pt), el('div', 'sc-dialogue-zh', msg.zh)); }
            if (st.note) { addZhLine(st.note); st.note = ''; }
            roamTimer = setTimeout(() => { if (alive) dialogueBubble.className = 'sc-dialogue-bubble'; }, ms || 2600);
        }
        async function doRoamChoice(id, n) {
            if (!stage || !stage.run) throw new Error('派对闯关需要 3D 场地（舞台没有就绪）。');
            let o = st.opts[id];
            if (!o) o = st.opts[id] = { list: buildOptions(n).map(x => ({ ...x, text: x.pt })), wrong: 0 };
            showPrompt(n.prompt_zh);
            clearTimeout(roamTimer); roamTimer = setTimeout(() => { if (alive) dialogueBubble.className = 'sc-dialogue-bubble'; }, 4200);
            setCtl(null); root.classList.add('rm-playing');
            const disp = (o.list[0] && o.list[0].disp) || 'pt';
            const today = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
            await stage.run({
                pads: o.list, display: disp, seed: (Number(w.id) || 1) * 1000 + today,   // 同一天同一个词，底座分配不变
                clue: { emoji: em, zh }, preview: mode === 'preview', autoGrab: true,
                grabRange: n.grab_range || 1.4, hints: n.hints || {},
                onApproach: pad => {                                                      // 预习：靠近物件时读它的葡语（测验不读，会泄露答案）
                    const rec = pad.ok ? w : (ctx.pool || []).find(p => p.id === pad.id);
                    if (rec && ctx.speak) ctx.speak(rec, 'word', null);
                },
                onGrab: async x => {
                    if (!ctx.evaluateChoice) x.passed = x.ok;
                    else {
                        try {
                            const r = await ctx.evaluateChoice(w, x.ok ? w.id : x.id);    // 干扰项传它自己的词 id（兜底项 -1），绝不传目标 id
                            x.passed = !!(r && r.passed);
                        } catch (err) {                                                   // 提交失败：不计错，物件不动，可以再抓
                            if (alive) roamNotice((err && err.message) || '提交失败，请重试。', 3000);
                            return 'error';
                        }
                    }
                    if (!alive) return 'error';
                    if (x.passed) { st.chosen = x; return 'correct'; }
                    o.wrong++; x.picked = true;
                    if (o.wrong === RULEOUT_AT) {
                        const left = o.list.filter(y => !y.ok && !y.picked && !y.out);
                        if (left.length) { left[Math.floor(Math.random() * left.length)].out = true; st.note = '已经帮你排除了一个错误选项。'; }
                    }
                    if (o.wrong >= REVEAL_AT && mode === 'preview') o.list.find(y => y.ok).hint = true;   // 只有预习才会高亮正确项
                    if (mode === 'assessment' && o.wrong >= SKIP_AT) st.skipAttn = true;
                    roamNotice(n.wrong_feedback || { pt: '', zh: '不是这个，再找找看' });
                    return 'wrong';
                }
            });
            guard();
            return n.on_correct;
        }
        /* --- 节点：roam_deliver（带着抓对的物件走进交付环） --- */
        async function doRoamDeliver(id, n) {
            say(id, n, fillPt(n.pt), fillZh(n.zh), false);
            st.lastSpeech = (n.speech || 'none') === 'auto' ? speakNode(id) : null;
            clearTimeout(roamTimer); roamTimer = setTimeout(() => { if (alive) dialogueBubble.className = 'sc-dialogue-bubble'; }, 4200);
            setCtl(null); root.classList.add('rm-playing');
            await stage.deliver(); guard();
            root.classList.remove('rm-playing');
            dialogueBubble.className = 'sc-dialogue-bubble';
            speakWord(null); await wait(1100);                                    // 交付成功：读一遍这个词，再进入"谢谢"
            return n.next;
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
        const HANDLERS = { dialogue: doDialogue, feedback: doDialogue, actor_tap: doActorTap, hotspot_choice: doHotspots, word_choice: doChoice, roam_choice: doRoamChoice, roam_deliver: doRoamDeliver, complete: doComplete };
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

    /* 预习列表里某个词没有「预习场景」按钮时，说明原因（排查用，原因按浏览器实际收到的数据算）；返回 '' = 可以玩 */
    const whyNot = w => {
        if (!w || !w.pt_word || canPlay(w)) return '';
        if (!hasSceneData(w)) return '没有 emoji，也没有中文释义';
        if (w.scene_confirmed !== true) return '场景字段还没有在管理端点“确认”（只“保存”不算）';
        if (w.scene_ok !== true) return '没有勾选“适合用于场景演练”';
        if (!['noun', 'adjective', 'verb'].includes(w.pos)) return `词性是 ${w.pos || '空'}，只有名词 / 形容词 / 动词能用场景`;
        if (w.pos === 'verb' && w.scene_template && !String(w.scene_template).startsWith('verb_')) return `模板 ${w.scene_template} 不是动词模板`;
        if (w.pos === 'noun' && w.scene_template === 'describe_object') return '名词不能用 describe_object 模板';
        if (w.pos === 'adjective') return '形容词的场景模板，或四种词形不完整';
        return '缺少 emoji 或中文释义';
    };
    window.Scene = { canPlay, play, emojiOf, whyNot };
})();