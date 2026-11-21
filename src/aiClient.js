// src/aiClient.js
function abortableSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('تم إيقاف العملية بواسطة المستخدم.'));
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new Error('تم إيقاف العملية بواسطة المستخدم.'));
    };

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function detectProvider(apiKey = '', explicitProvider = 'auto') {
  if (explicitProvider && explicitProvider !== 'auto') return explicitProvider;
  const k = String(apiKey || '').trim();
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('AIza')) return 'gemini';
  return 'openai';
}

export function defaultModelForProvider(provider) {
  switch (provider) {
    case 'gemini':
      return 'gemini-2.5-flash';
    case 'anthropic':
      return 'claude-sonnet-4-5';
    case 'openai':
    default:
      return 'gpt-4o-mini';
  }
}

function buildSystemPrompt(mode, ctx) {
  const base = [
    'You are M.R.S.W Study Assistant helping a student on QUREO coding/lesson pages.',
    'Be clear, accurate, and concise. Reply in Arabic unless the user asks in another language.',
  ];

  if (mode === 'explain') {
    base.push('Explain what the lesson asks step by step without giving away the complete final solution.');
  } else if (mode === 'hint') {
    base.push(`Give a progressive hint (level ${ctx.hintLevel || 1}/3) pointing toward the right approach.`);
  } else if (mode === 'solution') {
    base.push('Provide the working solution code clearly inside fenced code blocks.');
  } else if (mode === 'auto') {
    base.push(
      'Output ONLY the code needed to complete the task inside fenced code blocks (```...```). If multiple fields exist, start each block with [0], [1], etc. Never put explanations inside code blocks.'
    );
  } else if (mode === 'review') {
    base.push('Review the student code and run output/errors, identify what is wrong or missing, and explain how to fix it.');
  } else if (mode === 'check') {
    base.push(
      'Evaluate whether the current code and run output satisfy the lesson requirement. Start your first line with VERDICT: PASS, VERDICT: FAIL, or VERDICT: UNSURE followed by a brief reason. If not PASS, provide corrected code inside a fenced code block.'
    );
  }

  return base.join('\n');
}

function buildUserPayload(mode, ctx) {
  const fieldsSummary = (ctx.fields || [])
    .map((f) => `[${f.index}] (${f.tag}) ${f.label || 'field'}: ${JSON.stringify(f.value || '')}`)
    .join('\n');

  const historyText =
    Array.isArray(ctx.history) && ctx.history.length
      ? `Previous Attempts (DO NOT repeat failed solutions identically):\n${ctx.history.join('\n')}`
      : '';

  const runInfo = [
    ctx.afterRun ? `After Run Output:\n${ctx.afterRun}` : '',
    ctx.errors ? `Detected Errors:\n${ctx.errors}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  return [
    `Page Title: ${ctx.title || ''}`,
    `URL: ${ctx.url || ''}`,
    `Lesson Text:\n${ctx.lesson || '(none)'}`,
    `Editable Fields:\n${fieldsSummary || '(none)'}`,
    runInfo,
    historyText,
    ctx.question ? `Student Question:\n${ctx.question}` : '',
    `Requested Mode: ${mode}`,
  ]
    .filter(Boolean)
    .join('\n\n---\n\n');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 25000, parentSignal) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error('انتهت مهلة انتظار استجابة النموذج.')),
    timeoutMs
  );

  const onParentAbort = () => controller.abort(new Error('تم إيقاف العملية بواسطة المستخدم.'));
  if (parentSignal) {
    if (parentSignal.aborted) {
      clearTimeout(timer);
      throw new Error('تم إيقاف العملية بواسطة المستخدم.');
    }
    parentSignal.addEventListener('abort', onParentAbort, { once: true });
  }

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
}

async function callSingleProvider({ provider, apiKey, model, baseUrl, systemPrompt, userPrompt, signal }) {
  const cleanKey = String(apiKey || '').trim();
  const chosenModel = (model || '').trim() || defaultModelForProvider(provider);

  if (provider === 'gemini') {
    const endpoint = (baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
    const url = `${endpoint}/models/${encodeURIComponent(chosenModel)}:generateContent?key=${encodeURIComponent(cleanKey)}`;
    const resp = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        }),
      },
      25000,
      signal
    );
    const rawText = await resp.text();
    const json = rawText ? JSON.parse(rawText) : {};
    if (!resp.ok) {
      const err = new Error(json?.error?.message || `Gemini HTTP ${resp.status}`);
      err.status = resp.status;
      throw err;
    }
    const text =
      json?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || '')
        .join('')
        .trim() || '';
    return { text, model: chosenModel, provider };
  }

  if (provider === 'anthropic') {
    const endpoint = (baseUrl || 'https://api.anthropic.com/v1/messages').replace(/\/+$/, '');
    const url = endpoint.endsWith('/messages') ? endpoint : `${endpoint}/v1/messages`;
    const resp = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cleanKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: chosenModel,
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      },
      25000,
      signal
    );
    const rawText = await resp.text();
    const json = rawText ? JSON.parse(rawText) : {};
    if (!resp.ok) {
      const err = new Error(json?.error?.message || `Anthropic HTTP ${resp.status}`);
      err.status = resp.status;
      throw err;
    }
    const text = (json?.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text || '')
      .join('\n')
      .trim();
    return { text, model: chosenModel, provider };
  }

  const rawBase = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const url = rawBase.endsWith('/chat/completions') ? rawBase : `${rawBase}/chat/completions`;
  const resp = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cleanKey}`,
      },
      body: JSON.stringify({
        model: chosenModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    },
    25000,
    signal
  );
  const rawText = await resp.text();
  const json = rawText ? JSON.parse(rawText) : {};
  if (!resp.ok) {
    const err = new Error(json?.error?.message || `API HTTP ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  const text = json?.choices?.[0]?.message?.content?.trim() || '';
  return { text, model: chosenModel, provider };
}

function isNonRetriableError(err, signal) {
  if (signal?.aborted) return true;
  if (err?.status === 401 || err?.status === 403 || err?.status === 404) return true;
  return false;
}

export async function generateWithRetries(config, mode, ctx, onStatus, signal) {
  const { apiKey, providerPref = 'auto', model = '', baseUrl = '', maxRetries = 4 } = config;
  if (!apiKey || !apiKey.trim()) {
    return { ok: false, error: 'أدخل مفتاح API أولًا من قسم AI & API Key.' };
  }

  const provider = detectProvider(apiKey, providerPref);
  const systemPrompt = buildSystemPrompt(mode, ctx);
  const attemptsLimit = Math.min(10, Math.max(1, Number(maxRetries) || 4));
  const seenOutputs = new Set();
  const localHistory = [...(ctx.history || [])];

  let lastError = null;
  for (let attempt = 1; attempt <= attemptsLimit; attempt++) {
    if (signal?.aborted) {
      return { ok: false, aborted: true, error: 'تم إيقاف العملية بواسطة المستخدم.' };
    }

    try {
      onStatus?.(
        attempt === 1
          ? `الاتصال بـ ${provider.toUpperCase()}...`
          : `إعادة محاولة (${attempt}/${attemptsLimit})...`
      );

      const userPrompt = buildUserPayload(mode, { ...ctx, history: localHistory });
      const result = await callSingleProvider({
        provider,
        apiKey,
        model,
        baseUrl,
        systemPrompt,
        userPrompt,
        signal,
      });

      if (!result.text) {
        throw new Error('النموذج أرجع ردًا فارغًا.');
      }

      if (seenOutputs.has(result.text) && attempt < attemptsLimit) {
        seenOutputs.add(result.text);
        localHistory.push(`Attempt ${attempt} repeated identical output; try a different valid approach.`);
        await abortableSleep(500 * attempt, signal);
        continue;
      }

      seenOutputs.add(result.text);
      return { ok: true, ...result, attempts: attempt };
    } catch (err) {
      lastError = err;
      if (signal?.aborted) {
        return { ok: false, aborted: true, error: 'تم إيقاف العملية بواسطة المستخدم.' };
      }
      if (isNonRetriableError(err, signal) || attempt >= attemptsLimit) {
        break;
      }
      const backoffMs = Math.min(4000, 600 * Math.pow(2, attempt - 1));
      onStatus?.(`فشل مؤقت (${err.message}) — إعادة المحاولة بعد ${Math.round(backoffMs / 100) / 10}ث...`);
      try {
        await abortableSleep(backoffMs, signal);
      } catch (sleepErr) {
        return { ok: false, aborted: true, error: sleepErr.message };
      }
    }
  }

  return {
    ok: false,
    error: lastError?.message || 'تعذّر إتمام الطلب بعد عدة محاولات.',
  };
}

export function extractCodeBlocks(markdownText = '', fieldCount = 1) {
  if (fieldCount <= 0) return [];
  const blocks = [];
  const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(markdownText)) !== null) {
    const rawBody = (match[2] || '').trim();
    if (!rawBody) continue;
    const indexMatch = rawBody.match(/^\[(\d+)\]\s*\n([\s\S]*)$/);
    if (indexMatch) {
      blocks.push({ index: Number(indexMatch[1]), code: indexMatch[2].trim() });
    } else {
      blocks.push({ index: blocks.length, code: rawBody });
    }
  }

  if (blocks.length) return blocks;

  const cleaned = markdownText.replace(/^VERDICT:\s*(PASS|FAIL|UNSURE).*$/gim, '').trim();
  const hasArabic = /[\u0600-\u06FF]/.test(cleaned);
  if (cleaned && !hasArabic && cleaned.length <= 300 && !cleaned.includes('\n\n')) {
    return [{ index: 0, code: cleaned }];
  }
  return [];
}

export function parseVerdictText(text = '') {
  const m = text.match(/VERDICT:\s*(PASS|FAIL|UNSURE)/i);
  const verdict = m ? m[1].toUpperCase() : 'FAIL';
  const note = text.replace(/VERDICT:\s*(PASS|FAIL|UNSURE)/i, '').trim().slice(0, 220);
  return { verdict, note };
}