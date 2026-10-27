const EMOJI = ['👍','😂','😮','😎','🤔','😭','👏','❤️','🍀','🔥','🃏','🙌'];
const MAX_BYTES = 96 * 1024;

/** Mount inside a normal-flow room toolbar; callbacks must perform authenticated requests. */
export function mountRoomSocial({container, sendEmoji, sendVoice, loadVoice, heroId}) {
  const root = document.createElement('section');
  root.className = 'room-social';
  root.setAttribute('aria-label', '牌桌互动');
  root.innerHTML = `<div class="rs-toolbar"><button type="button" class="rs-emoji-toggle" aria-expanded="false" aria-label="发送表情">☺</button><button type="button" class="rs-mic" aria-expanded="false" aria-label="按住说话，松手预览，确认后发送">🎙</button><span class="rs-status" role="status" aria-live="polite"></span></div><div class="rs-panel" hidden><div class="rs-panel-head"><strong>牌桌互动</strong><button type="button" class="rs-close" aria-label="关闭互动面板">×</button></div><div class="rs-emojis" hidden></div><div class="rs-recorder" hidden><p class="rs-hint">按住麦克风说话，松手预览，确认后发送。最长 8 秒；也可点击开始 / 停止录音。</p><div class="rs-record-actions"><button type="button" class="rs-start">开始录音</button><button type="button" class="rs-stop" hidden>停止录音</button><button type="button" class="rs-send" hidden>发送语音</button><button type="button" class="rs-cancel" hidden>取消</button></div><audio class="rs-preview" controls hidden preload="none"></audio></div><ol class="rs-feed" aria-label="最近互动"></ol></div>`;
  container.append(root);
  const $ = s => root.querySelector(s);
  const panel = $('.rs-panel'), status = $('.rs-status'), preview = $('.rs-preview');
  let dead = false, epoch = 0, stream, recorder, timer, tick, started = 0, draft, duration = 0, draftURL, playbackURL, playing, busy = false, first = true;
  let heldPointer = null;
  const seen = new Set(), bubbles = new Set();
  let lastMessages = null;
  let unread = 0;
  const badge = document.createElement('span'); badge.className = 'rs-unread'; badge.hidden = true; $('.rs-emoji-toggle').append(badge);
  const supported = !!(globalThis.isSecureContext && navigator.mediaDevices?.getUserMedia && globalThis.MediaRecorder);
  const say = message => { if (!dead) status.textContent = message; };
  const button = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = fn; return b; };
  const release = () => { clearTimeout(timer); clearInterval(tick); stream?.getTracks().forEach(t => t.stop()); stream = null; };
  function reset() {
    epoch++; heldPointer = null;
    if (recorder?.state !== 'inactive') { try { recorder?.stop(); } catch {} }
    recorder = null; release(); draft = null;
    preview.pause(); preview.removeAttribute('src'); preview.hidden = true;
    if (draftURL) URL.revokeObjectURL(draftURL);
    draftURL = null;
    $('.rs-start').hidden = false; $('.rs-start').disabled = !supported;
    for (const s of ['.rs-stop','.rs-send','.rs-cancel']) $(s).hidden = true;
  }
  function close() { reset(); stopPlayback(); panel.hidden = true; $('.rs-mic').setAttribute('aria-expanded','false'); $('.rs-emoji-toggle').setAttribute('aria-expanded','false'); }
  function open(mode) {
    reset(); panel.hidden = false;
    unread = 0; badge.hidden = true;
    $('.rs-emojis').hidden = mode !== 'emoji'; $('.rs-recorder').hidden = mode !== 'voice';
    $('.rs-emoji-toggle').setAttribute('aria-expanded', String(mode === 'emoji'));
    $('.rs-mic').setAttribute('aria-expanded', String(mode === 'voice'));
    say(mode === 'voice' && !supported ? '此浏览器无法录音，仍可发送表情。请使用支持录音的 HTTPS 浏览器。' : '');
  }
  $('.rs-emoji-toggle').onclick = () => !panel.hidden && !$('.rs-emojis').hidden ? close() : open('emoji');
  const mic = $('.rs-mic');
  mic.onclick = e => { if (e.detail === 0) open('voice'); };
  mic.onpointerdown = e => {
    if (!e.isPrimary || e.button !== 0 || busy) return;
    e.preventDefault(); open('voice');
    if (!supported) return;
    startRecording(); heldPointer = e.pointerId;
    try { mic.setPointerCapture(e.pointerId); } catch {}
  };
  function finishHold(e, cancel = false) {
    if (heldPointer !== e.pointerId) return;
    heldPointer = null;
    if (cancel) { reset(); say('已取消录音'); }
    else if (recorder?.state === 'recording') { recorder.stop(); release(); }
    else if (!recorder && !draft) { reset(); say('尚未开始录音，请允许麦克风后再次按住说话。'); }
    try { if (mic.hasPointerCapture(e.pointerId)) mic.releasePointerCapture(e.pointerId); } catch {}
  }
  mic.onpointerup = e => finishHold(e);
  mic.onpointercancel = e => finishHold(e, true);
  mic.onlostpointercapture = e => finishHold(e, true);
  mic.onpointermove = e => {
    if (heldPointer !== e.pointerId) return;
    const bounds = mic.getBoundingClientRect();
    if (e.clientX < bounds.left - 45 || e.clientX > bounds.right + 45 || e.clientY < bounds.top - 45 || e.clientY > bounds.bottom + 45) finishHold(e, true);
  };
  $('.rs-close').onclick = close;
  root.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  for (const emoji of EMOJI) {
    const b = button(emoji, async () => {
      if (busy) return; busy = true; b.disabled = true;
      try { await sendEmoji(emoji); say('表情已发送'); } catch { say('表情发送失败，请重试。'); }
      finally { busy = false; b.disabled = false; }
    });
    b.setAttribute('aria-label', `发送 ${emoji}`); $('.rs-emojis').append(b);
  }
  $('.rs-start').disabled = !supported;
  async function startRecording() {
    if (!supported || busy) return;
    reset(); const token = epoch; $('.rs-start').disabled = true; $('.rs-cancel').hidden = false; say('正在请求麦克风权限…');
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({audio:true});
      if (dead || token !== epoch) { acquired.getTracks().forEach(t => t.stop()); return; }
      stream = acquired;
      const mimeType = ['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported?.(t));
      recorder = new MediaRecorder(stream, {...(mimeType ? {mimeType} : {}), audioBitsPerSecond:32000});
      const current = recorder, chunks = []; let bytes = 0, oversized = false;
      current.ondataavailable = e => { if (dead || token !== epoch) return; if (e.data.size) { bytes += e.data.size; if (bytes > MAX_BYTES) { oversized = true; if (current.state !== 'inactive') current.stop(); release(); } else chunks.push(e.data); } };
      current.onerror = () => { if (token === epoch) { reset(); say('录音失败，请重试。'); } };
      current.onstop = () => {
        if (dead || token !== epoch) return; release();
        duration = Math.min(8000, Math.max(1, Date.now() - started));
        $('.rs-stop').hidden = true;
        if (oversized || !bytes) { reset(); say(oversized ? '录音超过大小限制，请重新录制更短语音。' : '没有录到声音，请重试。'); return; }
        draft = new Blob(chunks, {type:current.mimeType || chunks[0]?.type || 'audio/webm'});
        draftURL = URL.createObjectURL(draft); preview.src = draftURL; preview.hidden = false;
        $('.rs-send').hidden = false; say('录音完成，可试听后发送。');
      };
      started = Date.now(); current.start(200); $('.rs-start').hidden = true; $('.rs-stop').hidden = false;
      say('录音中 0 / 8 秒 · 松手预览，确认后发送；移开取消');
      tick = setInterval(() => say(`录音中 ${Math.min(8, Math.floor((Date.now()-started)/1000))} / 8 秒 · 松手预览，确认后发送`), 250);
      timer = setTimeout(() => { if (current.state !== 'inactive') current.stop(); release(); },8000);
    } catch (e) { if (token === epoch && !dead) { reset(); say(e?.name === 'NotAllowedError' ? '麦克风权限未开启，请在浏览器设置中允许后重试。' : '无法使用麦克风，请检查设备或浏览器设置。'); } }
  }
  $('.rs-start').onclick = startRecording;
  $('.rs-stop').onclick = () => { if (recorder?.state === 'recording') { recorder.stop(); release(); } };
  $('.rs-cancel').onclick = () => { reset(); say('已取消录音'); };
  $('.rs-send').onclick = async () => {
    if (!draft || busy) return; busy = true; $('.rs-send').disabled = true; const token = epoch;
    try { await sendVoice(draft, duration); if (token === epoch) { reset(); say('语音已发送'); } } catch { if(token === epoch) say('语音发送失败，可重试或取消。'); }
    finally { busy = false; $('.rs-send').disabled = false; }
  };
  let playEpoch = 0;
  function stopPlayback() {
    playEpoch++;
    if (playing) { playing.pause(); playing.removeAttribute('src'); playing.load(); playing.remove(); playing = null; }
    if (playbackURL) URL.revokeObjectURL(playbackURL);
    playbackURL = null;
  }
  async function play(message, b) {
    stopPlayback(); const token = playEpoch; b.disabled = true;
    try {
      const blob = await loadVoice(message.id);
      if (dead || token !== playEpoch) return;
      playbackURL = URL.createObjectURL(blob);
      const audio = document.createElement('audio'); playing = audio;
      audio.controls = true; audio.preload = 'none'; audio.className = 'rs-playback';
      audio.setAttribute('aria-label', `${message.playerName || '玩家'}的语音`);
      audio.src = playbackURL; panel.insertBefore(audio, $('.rs-feed'));
      audio.onended = () => { if (!dead && token === playEpoch) say('播放结束'); };
      audio.onplay = () => { if (!dead && token === playEpoch) say('正在播放语音'); };
      try {
        await audio.play();
        if (dead || token !== playEpoch) { audio.pause(); return; }
        say('正在播放语音');
      } catch (e) {
        if (dead || token !== playEpoch) return;
        say(e?.name === 'NotAllowedError' ? '语音已加载，请点播放器播放' : '语音已加载，请点播放器播放；如仍失败请重试。');
      }
    } catch { if (!dead && token === playEpoch) say('语音无法加载，请点击重试。'); } finally { b.disabled = false; }
  }
  function update(messages = []) {
    if (dead) return;
    const recent = messages.slice(-20), signature = recent.map(m => m.id).join('|');
    if(signature === lastMessages) return;
    lastMessages = signature;
    const feed = $('.rs-feed'); feed.replaceChildren();
    for (const m of recent) {
      const row = document.createElement('li'), name = document.createElement('span');
      name.textContent = `${String(m.playerId) === String(heroId) ? '我' : (m.playerName || '玩家')}：`; row.append(name);
      if (m.kind === 'emoji' && EMOJI.includes(m.emoji)) {
        row.append(document.createTextNode(m.emoji));
        const timestamp = typeof m.createdAt === 'number' ? m.createdAt : Date.parse(m.createdAt);
        if (!first && !seen.has(m.id) && Date.now() - timestamp < 15000) {
          const seat = [...document.querySelectorAll('#g-seats .seat[data-pid]')].find(el => el.dataset.pid === String(m.playerId));
          if (seat) { const bubble = document.createElement('span'); bubble.className = 'rs-seat-bubble'; bubble.textContent = m.emoji; seat.append(bubble); bubbles.add(bubble); setTimeout(() => {bubble.remove(); bubbles.delete(bubble);},3500); }
        }
      } else if (m.kind === 'voice') row.append(button(`▶ 语音 ${Math.max(1,Math.round((m.durationMs || 0)/1000))}秒`, e => play(m, e.currentTarget)));
      else continue;
      if (!first && !seen.has(m.id) && String(m.playerId) !== String(heroId) && panel.hidden) { unread++; badge.textContent = String(unread); badge.hidden = false; }
      feed.append(row); seen.add(m.id);
    }
    first = false;
    // Room snapshots retain only a small recent window.
    if (seen.size > 100) { seen.clear(); recent.forEach(m => seen.add(m.id)); }
  }
  const onHide = () => { close(); };
  const onVisibility = () => { if(document.hidden) close(); };
  document.addEventListener('visibilitychange', onVisibility);
  globalThis.addEventListener('pagehide', onHide);
  return {update, destroy() { if(dead) return; onHide(); dead = true; document.removeEventListener('visibilitychange', onVisibility); globalThis.removeEventListener('pagehide', onHide); bubbles.forEach(b => b.remove()); root.remove(); }};
}
