/* 场景演练（预习用）：帮朋友去商店买东西，目标词就是要买的东西。
   不引入任何库：人物是内联 SVG，动画全是 CSS；对外只有 Scene.canPlay(w) 和 Scene.play(w, ctx)。

   ctx = {
     speak(w, kind, btn)   朗读（沿用 words.js 的 speak，后端按 word_id 合成，这里不传文本）
     pool: [w, ...]        同一批预习里的其它词（用来做货架上的干扰项）
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
    const GENERIC_ZH = ['苹果', '牛奶', '面包', '水', '书', '钥匙', '雨伞', '帽子', '鞋子', '手机', '鸡蛋', '花'];   // 没有 emoji 时，货架上的干扰项
    function emojiOf(w) {
        if (!w) return '';
        if (typeof w.emoji === 'string' && w.emoji.trim()) return w.emoji.trim();
        const k = norm(w.pt_word);
        return ITEM_EMOJI[k] || (k.endsWith('s') && ITEM_EMOJI[k.slice(0, -1)]) || (k.endsWith('es') && ITEM_EMOJI[k.slice(0, -2)]) || '';
    }
    const canPlay = w => !!(w && w.pt_word && (emojiOf(w) || w.cn_meaning));

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

    /* 货架选项：目标词 1 个 + 干扰项 2 个。有 emoji 的词全用 emoji，没有的词全用中文卡片——两种混在一起会让人一眼看出答案 */
    function buildOptions(w, pool) {
        const em = emojiOf(w), key = em ? 'emoji' : 'text', mine = em || w.cn_meaning;
        const cand = em ? [...pool.map(emojiOf), ...GENERIC_EMOJI] : [...pool.map(p => p.cn_meaning), ...GENERIC_ZH];
        const seen = new Set([mine]), others = [];
        for (const v of shuffle(cand)) {
            if (!v || seen.has(v)) continue;
            seen.add(v); others.push({ [key]: v });
            if (others.length === 2) break;
        }
        return shuffle([{ [key]: mine, ok: true }, ...others]);
    }

    let showZh = false;       // 中文字幕默认收起，点“中”展开；一旦选了就一直沿用到下一个场景

    function play(w, ctx) {
        ctx = ctx || {};
        const pool = ctx.pool || [], zh = w.cn_meaning || '', em = emojiOf(w), CANCEL = {};
        let alive = true;
        const guard = () => { if (!alive) throw CANCEL; };
        const wait = async ms => { await sleep(ms); guard(); };

        /* --- 搭场景 --- */
        const root = el('div', 'sc' + (showZh ? ' show-zh' : ''));
        const view = el('div', 'sc-view'), track = el('div', 'sc-track');
        const street = el('div', 'sc-pane street'), shop = el('div', 'sc-pane shop');
        [['🌳', '6%', '18%'], ['🏠', '78%', '24%'], ['☁️', '30%', '6%'], ['☁️', '66%', '4%']].forEach(([t, l, tp]) => {
            const d = el('span', 'deco', t); d.style.left = l; d.style.top = tp; street.append(d);
        });
        const friend = mkPerson('sc-friend', '#f59e0b', '#1f2937');
        const bubble = el('div', 'sc-bubble');
        street.append(friend, bubble);

        const options = buildOptions(w, pool);
        const shelf = el('div', 'sc-shelf');
        const items = options.map(o => {
            const b = el('button', 'sc-item' + (o.text ? ' txt' : ''), o.emoji || o.text);
            b.type = 'button'; if (o.ok) b.dataset.ok = '1';
            return b;
        });
        shelf.append(...items);
        const clerk = mkPerson('sc-clerk', '#22c55e', '#7c2d12');
        shop.append(el('div', 'awning'), shelf, clerk, el('div', 'counter'));
        track.append(street, shop);

        const me = mkPerson('sc-me', 'var(--blue)', '#3b2a20');
        const basket = el('div', 'sc-basket'), bItem = el('span', 'b-item'); basket.append(bItem, el('span', '', '🧺'));
        view.append(track, me, basket);

        const sayBox = el('div', 'sc-say'), ctlBox = el('div', 'sc-ctl');
        root.append(view, sayBox, ctlBox);

        /* --- 小工具 --- */
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
        const ctl = (...defs) => new Promise(res => {          // 底部按钮，点哪个就 resolve 哪个 id
            ctlBox.textContent = '';
            defs.forEach(([id, label, alt]) => {
                const b = el('button', alt ? 'alt' : '', label); b.type = 'button';
                b.onclick = () => { ctlBox.textContent = ''; res(id); };
                ctlBox.append(b);
            });
        });
        const say0 = (who, pt, z) => say(who, pt, z, false);
        const speakWord = btn => { if (ctx.speak) ctx.speak(w, 'word', btn || null); };

        /* --- 剧本 --- */
        async function run() {
            say0('朋友', 'Olá! Preciso de ajuda!', '你好！我需要帮忙！');
            await wait(60); root.classList.add('go');                     // 朋友走进来
            await wait(950);
            await ctl(['listen', '👂 听听他要什么']);
            guard();

            bubble.textContent = em || zh; bubble.classList.toggle('txt', !em); bubble.classList.add('show');
            say('朋友', `Preciso de… ${w.pt_word}! Podes ir comprar?`, `我需要……${zh}！你能去买吗？`, true);
            speakWord(sayBox.querySelector('.spk')); talk(friend);
            await ctl(['walk', '🚶 去商店帮他买']);
            guard();

            root.classList.add('walking', 'at-shop');                      // 镜头平移到商店
            await wait(1500); root.classList.remove('walking');
            say0('售货员', 'Bom dia! Em que posso ajudar?', '早上好！需要什么？'); talk(clerk);
            ctlBox.textContent = '';
            const hint = el('div', 'sc-hint', '👆 点货架上朋友要的东西');
            const again = el('button', 'alt', '🔊 再听一遍'); again.type = 'button'; again.onclick = () => speakWord(again);
            ctlBox.append(hint, again);

            let wrong = 0, picking = true;                                 // 选对才往下走；错了不扣分，只是抖一下
            const chosen = await new Promise(res => items.forEach(b => b.onclick = () => {
                if (!picking || b.disabled) return;
                if (b.dataset.ok) { picking = false; res(b); return; }
                wrong++; b.disabled = true; b.classList.add('shake', 'bad');
                say0('售货员', 'Não é isso…', '不是这个……再听听朋友要什么'); speakWord(null);
                if (wrong >= 2) items.find(x => x.dataset.ok).classList.add('hint');
            }));
            guard();

            const vr = view.getBoundingClientRect(), ir = chosen.getBoundingClientRect(), br = basket.getBoundingClientRect();
            const fly = el('div', 'sc-fly' + (chosen.classList.contains('txt') ? ' txt' : ''), chosen.textContent);
            Object.assign(fly.style, { left: (ir.left - vr.left) + 'px', top: (ir.top - vr.top) + 'px', width: ir.width + 'px', height: ir.height + 'px' });
            view.append(fly); chosen.style.visibility = 'hidden'; fly.getBoundingClientRect();
            fly.style.transform = `translate(${br.left - ir.left}px, ${br.top - ir.top}px) scale(.5)`; fly.style.opacity = '.9';
            say0('售货员', 'Aqui tem!', '给你！'); talk(clerk); speakWord(null);
            await wait(850);
            bItem.textContent = em || '📦'; basket.classList.add('has'); fly.remove();
            await ctl(['back', '🚶 带回去给朋友']);
            guard();

            root.classList.remove('at-shop'); root.classList.add('walking');
            await wait(1500); root.classList.remove('walking');
            bubble.textContent = '😀'; bubble.classList.remove('txt');
            say0('朋友', 'Obrigado!', '谢谢你！');
            friend.classList.add('cheer');
            for (let i = 0; i < 6; i++) {                                  // 撒点星星
                const s = el('span', 'sc-spark', '✨'); s.style.left = (44 + Math.random() * 28) + '%'; s.style.top = (30 + Math.random() * 30) + '%';
                s.style.animationDelay = (i * 90) + 'ms'; street.append(s); setTimeout(() => s.remove(), 1500);
            }
            await wait(1400);

            sayBox.textContent = '';                                       // 结果卡：词 + 意思 + 例句
            const card = el('div', 'sc-sum'), row = el('div', 'sc-line');
            row.append(el('div', 'sc-term', w.pt_word));
            const sp = el('button', 'spk', '🔊'); sp.type = 'button'; sp.setAttribute('aria-label', '朗读单词'); sp.onclick = () => speakWord(sp); row.append(sp);
            const extra = ctx.extra && ctx.extra(w); if (extra) row.append(extra);
            card.append(row, el('div', 'sc-zh2', zh));
            if (w.pt_sentence) card.append(el('div', 'sc-sen', w.pt_sentence), el('div', 'sc-zh2', w.cn_sentence || ''));
            sayBox.append(card);
            await ctl(['next', ctx.isLast ? '完成 ✓' : '下一个词 ›']);
        }
        const done = run().then(() => alive, e => { if (e !== CANCEL) console.error(e); return false; })
            .then(ok => ok ? true : new Promise(() => {}));                 // 被取消 / 出错：永远不 resolve，调用方不会往下走
        return { root, done, cancel: () => { alive = false; } };
    }

    window.Scene = { canPlay, play, emojiOf };
})();