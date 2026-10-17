(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const params = new URLSearchParams(location.search);
    const templateSelect = $('lab-template');
    const status = $('lab-status');
    const host = $('scene-host');
    const player = $('lab-player');
    const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    let current = null, templates = [], selectedWordId = Number(params.get('word')) || 1, selectedNoun = '', selectedZone = '';
    const setStatus = value => { status.textContent = value || ''; };
    const stopAudio = () => { player.pause(); player.removeAttribute('src'); player.load(); };
    const sayLine = (sceneId, nodeId, variant, btn) => {
        const q = new URLSearchParams({ scene_id: sceneId, node_id: nodeId, tts_provider: 'piper' });
        if (variant != null) q.set('variant', String(variant));
        player.pause(); player.src = `/api/scene/line-audio?${q}`;
        return player.play().then(() => true).catch(() => false);
    };
    const saySentence = (word, template, btn, variant) => {                 // 性数配对：每送对一张牌读一句（lab 里没有后端时只会 404，不影响流程）
        player.pause(); player.src = `/api/scene/sentence-audio?word_id=${word.id}&scene_template=${encodeURIComponent(template)}&tts_provider=piper${Number.isInteger(variant) ? `&variant=${variant}` : ''}`;
        return player.play().then(() => true).catch(() => false);
    };
    const sayWord = (word, kind, btn, form) => {
        player.pause(); player.src = `/api/words/${word.id}/audio?kind=word&tts_provider=piper${form ? `&form=${encodeURIComponent(form)}` : ''}`;
        player.play().catch(() => {});
    };
    function populateTemplates(preferred) {
        const pos = $('lab-pos').value;
        const choices = templates.filter(item => (item.applies_to?.pos || []).includes(pos));
        templateSelect.textContent = '';
        for (const item of choices) {
            const option = document.createElement('option');
            option.value = item.id; option.textContent = item.title || item.id;
            templateSelect.append(option);
        }
        if (choices.some(item => item.id === preferred)) templateSelect.value = preferred;
    }
    function start() {
        const template = templateSelect.value;
        const pt = $('lab-pt').value.trim();
        if (!template || !pt) { setStatus('请选择适用模板并填写葡语单词。'); return; }
        current?.cancel(); current = null; stopAudio();
        player.src = SILENT; player.play().catch(() => {});
        host.textContent = '';
        const word = {
            id: selectedWordId, pt_word: pt, cn_meaning: $('lab-zh').value.trim(), emoji: $('lab-emoji').value.trim(),
            pos: $('lab-pos').value, gender: $('lab-gender').value, number: $('lab-number').value,
            scene_ok: true, scene_confirmed: true, scene_template: template, scene_noun: selectedNoun || undefined, scene_zone: selectedZone || undefined,
            adjective_m_singular: $('lab-adj-ms').value.trim(), adjective_f_singular: $('lab-adj-fs').value.trim(),
            adjective_m_plural: $('lab-adj-mp').value.trim(), adjective_f_plural: $('lab-adj-fp').value.trim(),
        };
        const mode = $('lab-mode').value;
        current = Scene.play(word, {
            mode, pool: [], isLast: true, afterLabel: '重新预览', exitLabel: '结束预览',
            onExit: () => { current?.cancel(); current = null; host.textContent = ''; setStatus('预览已结束。'); },
            speak: sayWord, speakLine: sayLine, speakSceneSentence: saySentence, cancelAudio: stopAudio,
            evaluateChoice: async (target, choiceId) => { (window.__evalLog = window.__evalLog || []).push(Number(choiceId)); return { passed: Number(choiceId) === Number(target.id) }; },   // __evalLog：自动化测试数判分次数
        });
        host.append(current.root);
        setStatus(`预览中：${template} / ${mode === 'assessment' ? '测验模式' : '预习模式'}。测验预览不会提交判分或积分。`);
        current.done.then(done => { if (done) setStatus('场景预览完成。'); });
    }
    $('lab-start').addEventListener('click', start);
    $('lab-pos').addEventListener('change', () => populateTemplates(templateSelect.value));
    async function init() {
        try {
            const response = await fetch('/api/scene/templates');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            templates = (await response.json()).templates || [];
            let source = null;
            if (params.has('word')) {
                const wordResponse = await fetch(`/api/admin/words/${encodeURIComponent(params.get('word'))}`);
                if (!wordResponse.ok) throw new Error(`单词读取失败（HTTP ${wordResponse.status}）`);
                source = await wordResponse.json();
                selectedWordId = source.id;
                $('lab-pt').value = source.text || '';
                $('lab-zh').value = source.chinese_meaning || '';
                $('lab-emoji').value = source.emoji || '';
                $('lab-pos').value = ['noun', 'adjective', 'verb'].includes(source.pos) ? source.pos : 'noun';
                $('lab-gender').value = source.gender || 'm';
                $('lab-number').value = source.number || 'singular';
                $('lab-adj-ms').value = source.adjective_m_singular || '';
                $('lab-adj-fs').value = source.adjective_f_singular || '';
                $('lab-adj-mp').value = source.adjective_m_plural || '';
                $('lab-adj-fp').value = source.adjective_f_plural || '';
                selectedNoun = source.scene_noun || '';
                selectedZone = params.get('zone') || source.scene_zone || '';
            }
            populateTemplates(params.get('template') || (source && source.scene_template));
            if (!templateSelect.options.length) throw new Error('没有适用于当前词性的已发布模板。');
            setStatus('字段可修改；点击“开始 / 重新开始”预览。');
        } catch (error) {
            setStatus(`预览页初始化失败：${error.message}`);
        }
    }
    init();

    /* 效果调试面板（URL 带 ?debug，场景进入走路阶段后出现）：直接点某个形容词的效果看展台上的东西怎么变；复位 = 回到原样 */
    if (new URLSearchParams(location.search).has('debug')) {
        const panel = document.createElement('div');
        panel.style.cssText = 'position:fixed;right:10px;bottom:10px;z-index:99;background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:10px;font:13px system-ui;box-shadow:0 4px 16px #0002;display:none;max-width:240px';
        panel.innerHTML = '<b>效果调试</b><br><select id="lab-fx-sel" style="width:100%;margin:6px 0"></select><button id="lab-fx-play">播放（保持）</button> <button id="lab-fx-clear">复位</button><div style="color:#64748b;margin-top:4px">作用在当前展台 / 舞台上的摆件</div>';
        document.body.append(panel);
        const select = panel.querySelector('#lab-fx-sel'); let table = {};
        fetch('/api/scene/templates').then(r => r.json()).then(({ templates }) => {
            for (const t of templates.filter(x => x.effects)) for (const [key, spec] of Object.entries(t.effects)) {
                const label = `${t.adjective_family === 'person' ? '人物' : '物体'} · ${key} (${spec.kind})`; table[label] = spec;
                select.append(new Option(label, label));
            }
        }).catch(() => {});
        panel.querySelector('#lab-fx-play').onclick = () => { if (window.__roam) window.__roam.fx.play(table[select.value], { dur: 1.2, hold: true }); };
        panel.querySelector('#lab-fx-clear').onclick = () => { if (window.__roam) window.__roam.fx.clear(); };
        setInterval(() => { panel.style.display = window.__roam ? 'block' : 'none'; }, 800);
    }
})();