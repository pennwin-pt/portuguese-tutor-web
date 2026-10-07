/* 场景演练（预习用）：用模板数据演绎购物、餐厅点单和寻找物品。
   不引入任何库：人物是内联 SVG，动画全是 CSS；对外只有 Scene.canPlay(w) 和 Scene.play(w, ctx)。

   ctx = {
     speak(w, kind, btn)   朗读单词（后端按 word_id 合成）
     speakText(text, btn)  朗读场景固定台词（后端白名单接口，失败静默）
     pool: [w, ...]        同一批预习里的其它词（用作场景干扰项）
     isLast: boolean       最后一个词时，结尾按钮显示“完成”
     extra(w): Node|null   可选，结果卡上附加的控件（words.js 传 sourceButton）
   }
   Scene.play 返回 { root, done, cancel }：done 在场景走完时 resolve(true)，被 cancel 后永远不 resolve。
   需要的词字段：pt_word、cn_meaning（可选 emoji / pt_sentence / cn_sentence）。 */
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
    const GENERIC_ZH = ['苹果', '牛奶', '面包', '水', '书', '钥匙', '雨伞', '帽子', '鞋子', '手机', '鸡蛋', '花'];   // 没有 emoji 时的通用干扰项
    const SCENE_FIELDS = ['emoji', 'pos', 'gender', 'number', 'scene_ok', 'scene_confirmed', 'scene_template'];
    const hasSceneData = w => SCENE_FIELDS.some(k => Object.prototype.hasOwnProperty.call(w, k));
    function emojiOf(w) {
        if (!w) return '';
        if (w.scene_confirmed === true && typeof w.emoji === 'string' && w.emoji.trim()) return w.emoji.trim();
        const k = norm(w.pt_word);
        return ITEM_EMOJI[k] || (k.endsWith('s') && ITEM_EMOJI[k.slice(0, -1)]) || (k.endsWith('es') && ITEM_EMOJI[k.slice(0, -2)]) || '';
    }
    const canPlay = w => {
        if (!w || !w.pt_word) return false;
        if (hasSceneData(w) && !(w.scene_confirmed === true && w.pos === 'noun' && w.scene_ok === true)) return false;
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

    /* 选项：目标词 1 个 + 干扰项 2 个；餐厅菜单只从可识别的食物/饮料中选干扰项。 */
    const FOOD_WORDS = new Set(['maçã', 'pão', 'leite', 'água', 'café', 'chá', 'queijo', 'ovo', 'arroz', 'peixe', 'carne', 'frango', 'banana', 'laranja', 'uva', 'morango', 'limão', 'tomate', 'batata', 'cenoura', 'cebola', 'alface', 'milho', 'cereja', 'pêra', 'melancia', 'ananás', 'pêssego', 'abacate', 'sumo', 'vinho', 'cerveja', 'bolo', 'gelado', 'chocolate', 'sopa', 'sal', 'mel', 'pizza', 'sandes', 'hambúrguer', 'batatas fritas'].map(norm));
    const FOOD_EMOJI = new Set([...FOOD_WORDS].map(k => ITEM_EMOJI[k]).filter(Boolean));
    const isFood = w => FOOD_WORDS.has(norm(w && w.pt_word)) || FOOD_EMOJI.has(emojiOf(w));
    const FOOD_ZH = ['苹果', '牛奶', '面包', '水', '鸡蛋', '奶酪', '香蕉', '鱼', '米饭', '蛋糕', '汤', '果汁'];
    function buildOptions(w, pool, template) {
        const em = emojiOf(w), key = em ? 'emoji' : 'text', mine = em || w.cn_meaning;
        const words = template.foodOnly ? pool.filter(isFood) : pool;
        const genericEmoji = template.foodOnly ? [...FOOD_EMOJI] : GENERIC_EMOJI;
        const genericText = template.foodOnly ? FOOD_ZH : GENERIC_ZH;
        const cand = em ? [...words.map(emojiOf), ...genericEmoji] : [...words.map(p => p.cn_meaning), ...genericText];
        const seen = new Set([mine]), others = [];
        for (const v of shuffle(cand)) {
            if (!v || seen.has(v)) continue;
            seen.add(v); others.push({ [key]: v });
            if (others.length === 2) break;
        }
        return shuffle([{ [key]: mine, ok: true }, ...others]);
    }

    const TEMPLATES = [
        {
            id: 'shop', rootClass: 'template-shop', bg: { location: 'shop' }, foodOnly: false,
            carrier: '🧺', cast: { friend: ['#f59e0b', '#1f2937'], helper: ['#22c55e', '#7c2d12'] },
            beats: [
                { action: 'intro', who: '朋友', say: 'Olá! Preciso de ajuda!', zh: '你好！我需要帮忙！', speech: 'Olá! Preciso de ajuda!', button: ['listen', '👂 听听他要什么'] },
                { action: 'request', who: '朋友', say: 'Preciso de{art}{pt}! Podes ir comprar?', zh: '我需要……{zh}！你能去买吗？', button: ['walk', '🚶 去商店帮他买'] },
                { action: 'location', who: '售货员', say: 'Bom dia! Em que posso ajudar?', zh: '早上好！需要什么？', speech: 'Bom dia! Em que posso ajudar?', hint: '👆 点货架上朋友要的东西' },
                { action: 'choose', who: '售货员', feedback: 'Não é isso…', feedbackZh: '不是这个……再听听朋友要什么', success: 'Aqui tem!', successZh: '给你！' },
                { action: 'return', button: ['back', '🚶 带回去给朋友'], speech: 'Obrigado!' },
                { action: 'thanks', who: '朋友', say: 'Obrigado!', zh: '谢谢你！' },
            ]
        },
        {
            id: 'restaurant', rootClass: 'template-restaurant', bg: { location: 'restaurant' }, foodOnly: true,
            carrier: '🍽️', cast: { friend: ['#fb923c', '#431407'], helper: ['#0f766e', '#164e63'] },
            beats: [
                { action: 'intro', who: '朋友', say: 'Olá! Tenho fome!', zh: '你好！我饿了！', speech: 'Olá! Tenho fome!', button: ['listen', '👂 听听朋友想吃什么'] },
                { action: 'request', who: '朋友', say: 'Podes pedir{art}{pt} para mim, por favor?', zh: '可以帮我点{zh}吗？', button: ['walk', '🚶 去餐厅点单'] },
                { action: 'location', who: '服务员', say: 'Bom dia! Em que posso ajudar?', zh: '早上好！需要点什么？', speech: 'Bom dia! Em que posso ajudar?', hint: '👆 从菜单里选朋友想吃的东西' },
                { action: 'choose', who: '服务员', feedback: 'Não é isso…', feedbackZh: '不是这个……再看看菜单', success: 'Aqui tem!', successZh: '餐点准备好了！' },
                { action: 'return', button: ['back', '🚶 把餐点带给朋友'], speech: 'Obrigado!' },
                { action: 'thanks', who: '朋友', say: 'Obrigado!', zh: '谢谢你！' },
            ]
        },
        {
            id: 'find', rootClass: 'template-find', bg: { location: 'search-place' }, foodOnly: false,
            carrier: '🔎', cast: { friend: ['#a78bfa', '#312e81'], helper: ['#22c55e', '#7c2d12'] },
            beats: [
                { action: 'intro', who: '朋友', say: 'Olá! Preciso de ajuda!', zh: '你好！我需要帮忙！', speech: 'Olá! Preciso de ajuda!', button: ['listen', '👂 听听他要什么'] },
                { action: 'request', who: '朋友', say: 'Não encontro{art}{pt}. Podes ajudar-me?', zh: '我找不到{zh}，可以帮我找吗？', button: ['walk', '🔎 去帮朋友找找'], clickSpeech: 'Vamos procurar!' },
                { action: 'location', who: '朋友', say: 'Vamos procurar!', zh: '我们一起找找看！', speech: 'Vamos procurar!', hint: '👆 选出朋友在找的东西' },
                { action: 'choose', who: '朋友', feedback: 'Não é isso…', feedbackZh: '不是这个……再找找看', success: 'Encontrei!', successZh: '找到了！' },
                { action: 'return', button: ['back', '✅ 把东西交给朋友'], speech: 'Obrigado!' },
                { action: 'thanks', who: '朋友', say: 'Obrigado!', zh: '谢谢你！' },
            ]
        }
    ];
    let showZh = false, templateCursor = 0;       // 中文字幕状态沿用；模板轮换，便于不同单词体验不同场景
    const beat = (template, action) => template.beats.find(x => x.action === action);
    const artOf = (w, template) => {
        const gender = String(w.gender || '').toLowerCase(), number = String(w.number || 'singular').toLowerCase();
        const articles = { m: { singular: 'um', plural: 'uns' }, f: { singular: 'uma', plural: 'umas' } };
        const article = w.scene_confirmed === true ? articles[gender]?.[number] : null;
        return article ? ' ' + article + ' ' : template.id === 'shop' ? '… ' : '';
    };
    const fill = (text, values) => String(text || '').replace(/\{(pt|zh|art|emoji)\}/g, (_, key) => values[key] || '');
    function chooseTemplate(w) {
        if (!hasSceneData(w)) return TEMPLATES[0];       // 旧数据保留原商店演练体验
        const selected = TEMPLATES.find(t => t.id === w.scene_template);
        if (selected) return selected;
        const available = TEMPLATES.filter(t => !t.foodOnly || isFood(w));
        let automatic = available.find(t => t.id === TEMPLATES[templateCursor].id);
        while (!automatic) {
            templateCursor = (templateCursor + 1) % TEMPLATES.length;
            automatic = available.find(t => t.id === TEMPLATES[templateCursor].id);
        }
        templateCursor = (templateCursor + 1) % TEMPLATES.length;
        return automatic;
    }

    function play(w, ctx) {
        ctx = ctx || {};
        const template = chooseTemplate(w), pool = ctx.pool || [], zh = w.cn_meaning || '', em = emojiOf(w), CANCEL = {};
        const values = { pt: w.pt_word || '', zh, art: artOf(w, template), emoji: em };
        let alive = true;
        const guard = () => { if (!alive) throw CANCEL; };
        const wait = async ms => { await sleep(ms); guard(); };

        /* --- 依模板搭舞台；色块 SVG 是静态素材，不包含单词或用户数据 --- */
        const root = el('div', `sc ${template.rootClass}${showZh ? ' show-zh' : ''}`);
        const view = el('div', 'sc-view'), track = el('div', 'sc-track');
        const street = el('div', 'sc-pane street'), place = el('div', `sc-pane sc-place ${template.bg.location}`);
        [['🌳', '6%', '18%'], ['🏠', '78%', '24%'], ['☁️', '30%', '6%'], ['☁️', '66%', '4%']].forEach(([t, l, tp]) => {
            const d = el('span', 'deco', t); d.style.left = l; d.style.top = tp; street.append(d);
        });
        if (template.id === 'find') {
            const art = el('div', 'sc-find-art');
            art.innerHTML = '<svg viewBox="0 0 260 150" aria-hidden="true"><rect x="18" y="75" width="118" height="42" rx="12" fill="#c084fc"/><rect x="30" y="55" width="90" height="35" rx="12" fill="#d8b4fe"/><rect x="28" y="112" width="10" height="24" fill="#7c3f16"/><rect x="116" y="112" width="10" height="24" fill="#7c3f16"/><rect x="177" y="42" width="55" height="76" rx="5" fill="#a16207"/><rect x="183" y="49" width="43" height="28" fill="#fef3c7"/><rect x="183" y="83" width="43" height="29" fill="#fde68a"/><circle cx="213" cy="95" r="2" fill="#92400e"/><path d="M150 118h96" stroke="#64748b" stroke-width="5"/><path d="M154 115c-9-35 6-55 18-67 10 12 18 31 11 67" fill="#86efac"/><path d="M159 94l-16-13m36 20 14-15m-27-13 2-20" stroke="#16a34a" stroke-width="5" stroke-linecap="round"/></svg>';
            place.append(art);
        }
        if (template.id === 'restaurant') place.append(el('div', 'sc-place-sign', 'MENU'));
        const friend = mkPerson('sc-friend', template.cast.friend[0], template.cast.friend[1]);
        const bubble = el('div', 'sc-bubble');
        street.append(friend, bubble);

        const options = buildOptions(w, pool, template);
        const shelf = el('div', 'sc-shelf');
        const items = options.map(o => {
            const b = el('button', 'sc-item' + (o.text ? ' txt' : ''), o.emoji || o.text);
            b.type = 'button'; if (o.ok) b.dataset.ok = '1';
            return b;
        });
        shelf.append(...items);
        const helper = mkPerson('sc-clerk', template.cast.helper[0], template.cast.helper[1]);
        place.append(el('div', 'awning'), shelf, helper, el('div', 'counter'));
        track.append(street, place);

        const me = mkPerson('sc-me', 'var(--blue)', '#3b2a20');
        const basket = el('div', 'sc-basket'), bItem = el('span', 'b-item'); basket.append(bItem, el('span', '', template.carrier));
        view.append(track, me, basket);

        const sayBox = el('div', 'sc-say'), ctlBox = el('div', 'sc-ctl');
        root.append(view, sayBox, ctlBox);

        /* --- 通用台词与动作 --- */
        const talk = p => { p.classList.add('talk'); setTimeout(() => p.classList.remove('talk'), 1800); };
        const say = (who, pt, zhText, withSpk) => {
            sayBox.textContent = '';
            const line = el('div', 'sc-line');
            line.append(el('div', 'sc-pt', pt));
            if (withSpk) { const b = el('button', 'spk', '🔊'); b.type = 'button'; b.setAttribute('aria-label', '朗读单词'); b.onclick = () => ctx.speak && ctx.speak(w, 'word', b); line.append(b); }
            if (zhText) {
                const z = el('button', 'sc-zhbtn', '中'); z.type = 'button'; z.setAttribute('aria-label', '显示或隐藏中文');
                z.onclick = () => { showZh = !showZh; root.classList.toggle('show-zh', showZh); };
                line.append(z);
            }
            sayBox.append(el('div', 'sc-who', who), line);
            if (zhText) sayBox.append(el('div', 'sc-zh', zhText));
        };
        const sayBeat = (b, withSpk) => say(b.who, fill(b.say, values), fill(b.zh, values), withSpk);
        const ctl = (button, speech, waitForSpeech) => new Promise(res => {
            ctlBox.textContent = '';
            const [id, label, alt] = button;
            const b = el('button', alt ? 'alt' : '', label); b.type = 'button';
            b.onclick = () => {
                ctlBox.textContent = '';
                const audio = speech && ctx.speakText ? ctx.speakText(speech, b) : null;
                if (waitForSpeech && audio) { audio.then(() => res(id)); return; }
                res(id);
            };
            ctlBox.append(b);
        });
        const speakWord = btn => { if (ctx.speak) ctx.speak(w, 'word', btn || null); };

        async function run() {
            const intro = beat(template, 'intro'), request = beat(template, 'request'), location = beat(template, 'location');
            const choose = beat(template, 'choose'), returnBeat = beat(template, 'return'), thanks = beat(template, 'thanks');
            sayBeat(intro); await wait(60); root.classList.add('go'); await wait(950);
            await ctl(intro.button, intro.speech, true); guard();

            bubble.textContent = em || zh; bubble.classList.toggle('txt', !em); bubble.classList.add('show');
            sayBeat(request, true); speakWord(sayBox.querySelector('.spk')); talk(friend);
            await ctl(request.button, request.clickSpeech || location.speech); guard();

            root.classList.add('walking', 'at-place'); if (template.id === 'shop') root.classList.add('at-shop');
            await wait(1500); root.classList.remove('walking');
            sayBeat(location); talk(helper);
            ctlBox.textContent = '';
            const hint = el('div', 'sc-hint', location.hint);
            const again = el('button', 'alt', '🔊 再听一遍'); again.type = 'button'; again.onclick = () => speakWord(again);
            ctlBox.append(hint, again);

            let wrong = 0, picking = true, successAudio = null;
            const chosen = await new Promise(res => items.forEach(b => b.onclick = () => {
                if (!picking || b.disabled) return;
                if (b.dataset.ok) {
                    picking = false;
                    if (ctx.speakText) successAudio = ctx.speakText(choose.success, b);
                    res(b); return;
                }
                wrong++; b.disabled = true; b.classList.add('shake', 'bad');
                say(choose.who, choose.feedback, choose.feedbackZh, false);
                if (ctx.speakText) ctx.speakText(choose.feedback, b).then(() => speakWord(null));
                else speakWord(null);
                if (wrong >= 2) items.find(x => x.dataset.ok).classList.add('hint');
            }));
            guard();

            const vr = view.getBoundingClientRect(), ir = chosen.getBoundingClientRect(), br = basket.getBoundingClientRect();
            const fly = el('div', 'sc-fly' + (chosen.classList.contains('txt') ? ' txt' : ''), chosen.textContent);
            Object.assign(fly.style, { left: (ir.left - vr.left) + 'px', top: (ir.top - vr.top) + 'px', width: ir.width + 'px', height: ir.height + 'px' });
            view.append(fly); chosen.style.visibility = 'hidden'; fly.getBoundingClientRect();
            fly.style.transform = `translate(${br.left - ir.left}px, ${br.top - ir.top}px) scale(.5)`; fly.style.opacity = '.9';
            say(choose.who, choose.success, choose.successZh, false); talk(helper);
            if (successAudio) successAudio.then(() => speakWord(null)); else speakWord(null);
            await wait(850); bItem.textContent = em || '📦'; basket.classList.add('has'); fly.remove();
            await ctl(returnBeat.button, returnBeat.speech); guard();

            root.classList.remove('at-place', 'at-shop'); root.classList.add('walking');
            await wait(1500); root.classList.remove('walking');
            bubble.textContent = '😀'; bubble.classList.remove('txt'); sayBeat(thanks); friend.classList.add('cheer');
            for (let i = 0; i < 6; i++) {
                const s = el('span', 'sc-spark', '✨'); s.style.left = (44 + Math.random() * 28) + '%'; s.style.top = (30 + Math.random() * 30) + '%';
                s.style.animationDelay = (i * 90) + 'ms'; street.append(s); setTimeout(() => s.remove(), 1500);
            }
            await wait(1400);

            sayBox.textContent = '';
            const card = el('div', 'sc-sum'), row = el('div', 'sc-line');
            row.append(el('div', 'sc-term', w.pt_word));
            const sp = el('button', 'spk', '🔊'); sp.type = 'button'; sp.setAttribute('aria-label', '朗读单词'); sp.onclick = () => speakWord(sp); row.append(sp);
            const extra = ctx.extra && ctx.extra(w); if (extra) row.append(extra);
            card.append(row, el('div', 'sc-zh2', zh));
            if (w.pt_sentence) card.append(el('div', 'sc-sen', w.pt_sentence), el('div', 'sc-zh2', w.cn_sentence || ''));
            sayBox.append(card);
            const next = ['next', ctx.isLast ? '完成 ✓' : '下一个词 ›'];
            await ctl(next); guard();
        }
        const done = run().then(() => alive, e => { if (e !== CANCEL) console.error(e); return false; })
            .then(ok => ok ? true : new Promise(() => {}));
        return { root, done, cancel: () => { alive = false; } };
    }

    window.Scene = { canPlay, play, emojiOf };
})();
