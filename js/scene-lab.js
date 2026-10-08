(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const params = new URLSearchParams(location.search);
    const templateSelect = $('lab-template');
    const status = $('lab-status');
    const host = $('scene-host');
    const player = $('lab-player');
    const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
    let current = null, templates = [], selectedWordId = Number(params.get('word')) || 1;
    const setStatus = value => { status.textContent = value || ''; };
    const stopAudio = () => { player.pause(); player.removeAttribute('src'); player.load(); };
    const sayLine = (sceneId, nodeId, variant, btn) => {
        const q = new URLSearchParams({ scene_id: sceneId, node_id: nodeId, tts_provider: 'piper' });
        if (variant != null) q.set('variant', String(variant));
        player.pause(); player.src = `/api/scene/line-audio?${q}`;
        return player.play().then(() => true).catch(() => false);
    };
    const sayWord = word => {
        player.pause(); player.src = `/api/words/${word.id}/audio?kind=word&tts_provider=piper`;
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
            scene_ok: true, scene_confirmed: true, scene_template: template,
            adjective_m_singular: $('lab-adj-ms').value.trim(), adjective_f_singular: $('lab-adj-fs').value.trim(),
            adjective_m_plural: $('lab-adj-mp').value.trim(), adjective_f_plural: $('lab-adj-fp').value.trim(),
        };
        const mode = $('lab-mode').value;
        current = Scene.play(word, {
            mode, pool: [], isLast: true, afterLabel: '重新预览', exitLabel: '结束预览',
            onExit: () => { current?.cancel(); current = null; host.textContent = ''; setStatus('预览已结束。'); },
            speak: sayWord, speakLine: sayLine, cancelAudio: stopAudio,
            evaluateChoice: async (target, choiceId) => ({ passed: Number(choiceId) === Number(target.id) }),
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
                $('lab-pos').value = source.pos === 'adjective' ? 'adjective' : 'noun';
                $('lab-gender').value = source.gender || 'm';
                $('lab-number').value = source.number || 'singular';
                $('lab-adj-ms').value = source.adjective_m_singular || '';
                $('lab-adj-fs').value = source.adjective_f_singular || '';
                $('lab-adj-mp').value = source.adjective_m_plural || '';
                $('lab-adj-fp').value = source.adjective_f_plural || '';
            }
            populateTemplates(params.get('template') || (source && source.scene_template));
            if (!templateSelect.options.length) throw new Error('没有适用于当前词性的已发布模板。');
            setStatus('字段可修改；点击“开始 / 重新开始”预览。');
        } catch (error) {
            setStatus(`预览页初始化失败：${error.message}`);
        }
    }
    init();
})();
