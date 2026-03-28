/* ===== Fread. — app.js ===== */

(function () {
  'use strict';

  // ── DOM refs ──
  const $inputStage    = document.getElementById('input-stage');
  const $studyStage    = document.getElementById('study-stage');
  const $textInput     = document.getElementById('text-input');
  const $wordCount     = document.getElementById('word-count');
  const $apiKeyHint    = document.getElementById('api-key-hint');
  const $freeBtn       = document.getElementById('free-btn');
  const $backBtn       = document.getElementById('back-btn');
  const $cardList      = document.getElementById('card-list');
  const $cardTemplate  = document.getElementById('card-template');

  // Settings modal
  const $overlay       = document.getElementById('settings-overlay');
  const $apiKeyInput   = document.getElementById('api-key-input');
  const $modelSelect   = document.getElementById('model-select');
  const $ttsSpeed      = document.getElementById('tts-speed-select');
  const $settingsSave  = document.getElementById('settings-save');
  const $settingsClose = document.getElementById('settings-close');
  const $settingsBtn   = document.getElementById('settings-btn');
  const $settingsBtnS  = document.getElementById('settings-btn-study');

  // ── State ──
  const STORAGE_KEY_API   = 'freed_api_key';
  const STORAGE_KEY_TEXT  = 'freed_text';
  const STORAGE_KEY_TTS   = 'freed_tts_speed';
  const STORAGE_KEY_MODEL = 'freed_model';
  const STORAGE_KEY_CACHE = 'fread_last_result';

  let apiKey   = localStorage.getItem(STORAGE_KEY_API) || '';
  let ttsSpeed = parseFloat(localStorage.getItem(STORAGE_KEY_TTS)) || 1;
  let model    = localStorage.getItem(STORAGE_KEY_MODEL) || 'gemini-2.5-flash';

  // ── Init ──
  function init() {
    // Restore persisted text
    const saved = localStorage.getItem(STORAGE_KEY_TEXT);
    if (saved) $textInput.value = saved;
    updateWordCount();

    // Restore settings selects
    $ttsSpeed.value = String(ttsSpeed);
    $modelSelect.value = model;

    // Show resume button if cached result exists
    var $resumeBtn = document.getElementById('resume-btn');
    var cache = loadCache();
    if (cache && $resumeBtn) {
      $resumeBtn.classList.remove('hidden');
      $resumeBtn.addEventListener('click', function () {
        renderCards(cache.sentences);
        showStudyStage();
      });
    }

    // Bind events
    $textInput.addEventListener('input', onTextInput);
    $freeBtn.addEventListener('click', onFreeText);
    $backBtn.addEventListener('click', showInputStage);

    $settingsBtn.addEventListener('click', openSettings);
    $settingsBtnS.addEventListener('click', openSettings);
    $settingsClose.addEventListener('click', closeSettings);
    $settingsSave.addEventListener('click', saveSettings);
    $overlay.addEventListener('click', function (e) {
      if (e.target === $overlay) closeSettings();
    });

    // Show API key hint if missing
    toggleApiKeyHint();
  }

  // ── Text input ──
  function onTextInput() {
    localStorage.setItem(STORAGE_KEY_TEXT, $textInput.value);
    updateWordCount();
    toggleApiKeyHint();
  }

  function updateWordCount() {
    const text = $textInput.value.trim();
    if (!text) {
      $wordCount.textContent = '';
      return;
    }
    const count = text.split(/\s+/).length;
    $wordCount.textContent = count + ' word' + (count !== 1 ? 's' : '');
    if (count > 500) {
      $wordCount.textContent += ' — consider keeping under 500 for best results';
    }
  }

  function toggleApiKeyHint() {
    $apiKeyHint.classList.toggle('hidden', !!apiKey);
  }

  // ── Settings ──
  function openSettings() {
    $apiKeyInput.value = apiKey;
    $modelSelect.value = model;
    $ttsSpeed.value = String(ttsSpeed);
    $overlay.classList.remove('hidden');
    $apiKeyInput.focus();
  }

  function closeSettings() {
    $overlay.classList.add('hidden');
  }

  function saveSettings() {
    apiKey = $apiKeyInput.value.trim();
    model = $modelSelect.value;
    ttsSpeed = parseFloat($ttsSpeed.value) || 1;
    localStorage.setItem(STORAGE_KEY_API, apiKey);
    localStorage.setItem(STORAGE_KEY_MODEL, model);
    localStorage.setItem(STORAGE_KEY_TTS, String(ttsSpeed));
    toggleApiKeyHint();
    closeSettings();
  }

  // ── Cache ──
  function saveCache(inputText, sentences) {
    try {
      localStorage.setItem(STORAGE_KEY_CACHE, JSON.stringify({
        inputText: inputText,
        sentences: sentences
      }));
    } catch (_) { /* localStorage full — silently skip */ }
  }

  function loadCache() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY_CACHE);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (data && Array.isArray(data.sentences) && data.sentences.length) return data;
    } catch (_) { /* corrupted — ignore */ }
    return null;
  }

  // ── Stage navigation ──
  function showInputStage() {
    speechSynthesis.cancel();
    $studyStage.classList.add('hidden');
    $inputStage.classList.remove('hidden');
  }

  function showStudyStage() {
    $inputStage.classList.add('hidden');
    $studyStage.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  // ── Free the Text ──
  async function onFreeText() {
    const text = $textInput.value.trim();
    if (!text) return;

    if (!apiKey) {
      openSettings();
      return;
    }

    setLoading(true);

    try {
      const sentences = await callGemini(text);
      if (!sentences || !sentences.length) {
        showToast('No sentences returned. Try different text.');
        setLoading(false);
        return;
      }
      saveCache(text, sentences);
      renderCards(sentences);
      showStudyStage();
    } catch (err) {
      showToast(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  function setLoading(on) {
    if (on) {
      $freeBtn.disabled = true;
      $freeBtn.innerHTML = '<span class="spinner"></span> Translating…';
    } else {
      $freeBtn.disabled = false;
      $freeBtn.textContent = 'Fread the Text';
    }
  }

  // ── Gemini API ──
  async function callGemini(text) {
    const prompt =
      'Translate every single English sentence into French separately. Do not condense anything.' +
      'For each sentence, provide a "breakdown" for every single French word:' +
      '(i) english word (ii) origin (iii) a key grammar concept or verb conjugation used.\n\n' +
      'Format: Return ONLY a JSON array:\n' +
      '[{ "en": "...", "fr": "...", "breakdown": [{ "word": "French word", "en": "English equivalent", "origin": "etymology or root", "grammar": "grammar note" }] }]\n\n' +
      'Text:\n' + text;

    const url =
      'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' +
      encodeURIComponent(apiKey);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 200000
        }
      })
    });

    if (!res.ok) {
      const body = await res.json().catch(function () { return {}; });
      const msg = (body.error && body.error.message) || ('API error ' + res.status);
      throw new Error(msg);
    }

    const data = await res.json();
    const raw = data.candidates &&
                data.candidates[0] &&
                data.candidates[0].content &&
                data.candidates[0].content.parts &&
                data.candidates[0].content.parts[0] &&
                data.candidates[0].content.parts[0].text;

    if (!raw) throw new Error('Empty response from Gemini.');

    return parseJSON(raw);
  }

  function parseJSON(raw) {
    // Strip markdown fences Gemini loves to add
    var cleaned = raw.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

    // Try direct parse first
    try {
      var parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) { /* fall through */ }

    // Fallback: extract the first JSON array from the string
    var match = cleaned.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (match) {
      try {
        var extracted = JSON.parse(match[0]);
        if (Array.isArray(extracted)) return extracted;
      } catch (_) { /* fall through */ }
    }

    // Truncation recovery: response was cut off mid-JSON
    // Find the last complete top-level object and close the array
    var recovered = recoverTruncatedArray(cleaned);
    if (recovered && recovered.length) return recovered;

    console.error('Fread. \u2014 raw Gemini response:', raw);
    throw new Error('Failed to parse Gemini response. Check console for raw output.');
  }

  function recoverTruncatedArray(text) {
    // Ensure it starts with [
    var start = text.indexOf('[');
    if (start === -1) return null;
    text = text.substring(start);

    // Strategy: find each top-level } that closes a sentence object
    // by tracking brace/bracket depth, then try parsing up to that point
    var lastGoodEnd = -1;
    var depth = 0;
    var inString = false;
    var escape = false;

    for (var i = 1; i < text.length; i++) {
      var ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;

      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') {
        depth--;
        // When depth returns to 0, we closed a top-level object inside the array
        if (depth === 0 && ch === '}') {
          lastGoodEnd = i;
        }
      }
    }

    if (lastGoodEnd === -1) return null;

    var attempt = text.substring(0, lastGoodEnd + 1) + ']';
    try {
      var parsed = JSON.parse(attempt);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (_) { /* give up */ }
    return null;
  }

  // ── Render Cards ──
  function renderCards(sentences) {
    $cardList.innerHTML = '';

    sentences.forEach(function (item) {
      var clone = $cardTemplate.content.cloneNode(true);

      clone.querySelector('.card-en').textContent = item.en || '';
      // Build breakdown table
      var breakdownContainer = clone.querySelector('.card-breakdown');
      renderBreakdown(breakdownContainer, item.breakdown);

      // Build clickable words
      var frContainer = clone.querySelector('.card-fr');
      var frText = item.fr || '';
      buildClickableWords(frContainer, frText);

      // Play full sentence
      var playBtn = clone.querySelector('.play-btn');
      playBtn.addEventListener('click', function () {
        speak(frText);
      });

      $cardList.appendChild(clone);
    });
  }

  function renderBreakdown(container, breakdown) {
    // Fallback: if breakdown is a string (old format), show as text
    if (!breakdown || typeof breakdown === 'string') {
      container.textContent = breakdown || '';
      return;
    }
    if (!Array.isArray(breakdown) || !breakdown.length) {
      container.textContent = '';
      return;
    }

    var table = document.createElement('table');
    table.className = 'breakdown-table';

    // Header
    var thead = document.createElement('thead');
    var headRow = document.createElement('tr');
    ['French', 'English', 'Origin', 'Grammar'].forEach(function (label) {
      var th = document.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    // Body
    var tbody = document.createElement('tbody');
    breakdown.forEach(function (entry) {
      var row = document.createElement('tr');

      // French word — tap-to-speak
      var tdWord = document.createElement('td');
      tdWord.className = 'breakdown-word';
      var wordSpan = document.createElement('span');
      wordSpan.className = 'word';
      wordSpan.textContent = entry.word || '';
      wordSpan.setAttribute('role', 'button');
      wordSpan.setAttribute('tabindex', '0');
      wordSpan.setAttribute('aria-label', 'Speak: ' + (entry.word || ''));
      wordSpan.addEventListener('click', function () {
        speakWord(wordSpan, entry.word || '');
      });
      wordSpan.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          speakWord(wordSpan, entry.word || '');
        }
      });
      tdWord.appendChild(wordSpan);
      row.appendChild(tdWord);

      // English, Origin, Grammar
      ['en', 'origin', 'grammar'].forEach(function (key) {
        var td = document.createElement('td');
        td.textContent = entry[key] || '';
        row.appendChild(td);
      });

      tbody.appendChild(row);
    });
    table.appendChild(tbody);

    container.innerHTML = '';
    container.appendChild(table);
  }

  function buildClickableWords(container, text) {
    var words = text.split(/\s+/);
    words.forEach(function (word, i) {
      var span = document.createElement('span');
      span.className = 'word';
      span.textContent = word;
      span.setAttribute('role', 'button');
      span.setAttribute('tabindex', '0');
      span.setAttribute('aria-label', 'Speak: ' + word);

      span.addEventListener('click', function () {
        speakWord(span, word);
      });
      span.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          speakWord(span, word);
        }
      });

      container.appendChild(span);

      // Add space between words
      if (i < words.length - 1) {
        container.appendChild(document.createTextNode(' '));
      }
    });
  }

  // ── TTS ──
  function stripPunctuation(word) {
    return word.replace(/^[«"'(]+/, '').replace(/[.,;:!?»"'…)\]]+$/, '');
  }

  // ── Voice cache ──
  var cachedFrenchVoice = null;

  function loadFrenchVoice() {
    var voices = speechSynthesis.getVoices();
    for (var i = 0; i < voices.length; i++) {
      if (voices[i].lang && voices[i].lang.startsWith('fr')) {
        cachedFrenchVoice = voices[i];
        return;
      }
    }
  }

  // Voices load async in most browsers — cache when ready
  loadFrenchVoice();
  if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadFrenchVoice;
  }

  function makeUtterance(text) {
    var utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'fr-FR';
    utt.rate = ttsSpeed;
    if (cachedFrenchVoice) utt.voice = cachedFrenchVoice;
    return utt;
  }

  function speak(text) {
    speechSynthesis.cancel();
    speechSynthesis.speak(makeUtterance(text));
  }

  function speakWord(span, word) {
    var clean = stripPunctuation(word);
    if (!clean) return;

    speechSynthesis.cancel();
    span.classList.add('speaking');

    var utt = makeUtterance(clean);
    utt.onend = function () { span.classList.remove('speaking'); };
    utt.onerror = function () { span.classList.remove('speaking'); };

    speechSynthesis.speak(utt);
  }

  // ── Toast ──
  function showToast(msg) {
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();

    var el = document.createElement('div');
    el.className = 'toast';

    var text = document.createElement('span');
    text.textContent = msg;
    el.appendChild(text);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Dismiss');
    closeBtn.addEventListener('click', function () { el.remove(); });
    el.appendChild(closeBtn);

    document.body.appendChild(el);
  }

  // ── Boot ──
  init();
})();
