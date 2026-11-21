// App.js
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { WebView } from 'react-native-webview';
import { PAGE_BRIDGE_JS } from './src/pageBridge';
import { detectProvider, extractCodeBlocks, generateWithRetries, parseVerdictText } from './src/aiClient';
import { PRIVACY_POLICY_TEXT, TERMS_OF_USE_TEXT } from './src/legalContent';
import { THEMES } from './src/themes';

const STORAGE_KEYS = {
  acceptedLegal: '@mrsw_accepted_legal_v2',
  aiConfig: '@mrsw_ai_config_v2',
  targetUrl: '@mrsw_target_url_v2',
  themeId: '@mrsw_theme_id_v2',
};

const DEFAULT_AI_CONFIG = {
  providerPref: 'auto',
  apiKey: '',
  model: '',
  baseUrl: '',
  maxRetries: 4,
  maxFixRounds: 3,
};

const MODEL_PRESETS = [
  'gemini-2.5-flash',
  'gpt-4o-mini',
  'claude-sonnet-4-5',
  'deepseek/deepseek-chat',
];

function PulsingBrandBadge({ label = 'M.R.S.W', subtitle = 'Workspace', theme }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const floatY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a1 = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const a2 = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -5, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 5, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    a1.start();
    a2.start();
    return () => {
      a1.stop();
      a2.stop();
    };
  }, [pulse, floatY]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.75] });

  return (
    <Animated.View
      style={[
        styles.brandBadge,
        {
          backgroundColor: theme.surfaceElevated,
          borderColor: theme.accent,
          transform: [{ translateY: floatY }, { scale }],
        },
      ]}
    >
      <Animated.View style={[styles.brandGlow, { borderColor: theme.accent, opacity: glowOpacity }]} />
      <Text style={[styles.brandBadgeText, { color: theme.text }]}>
        {theme.badge} {label}
      </Text>
      <Text style={[styles.brandBadgeSub, { color: theme.statusText }]}>{subtitle}</Text>
    </Animated.View>
  );
}

function AnimatedActionButton({ title, onPress, disabled, variant = 'primary', style, theme }) {
  const pressScale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(pressScale, { toValue: 0.95, useNativeDriver: true, friction: 6 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
  };

  const bg =
    variant === 'accent'
      ? theme.success
      : variant === 'secondary'
      ? theme.accentSoft
      : variant === 'ghost'
      ? theme.surfaceElevated
      : theme.accent;

  const txtColor =
    variant === 'accent'
      ? '#ffffff'
      : variant === 'secondary' || variant === 'ghost'
      ? theme.text
      : theme.accentText;

  return (
    <Animated.View style={[{ transform: [{ scale: pressScale }] }, style]}>
      <TouchableOpacity
        disabled={disabled}
        activeOpacity={0.85}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        style={[
          styles.actionBtn,
          { backgroundColor: bg, borderColor: theme.border },
          (variant === 'secondary' || variant === 'ghost') && { borderWidth: 1 },
          disabled && styles.btnDisabled,
        ]}
      >
        <Text style={[styles.actionBtnText, { color: txtColor }]}>{title}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function App() {
  const webViewRef = useRef(null);
  const pendingRef = useRef(new Map());
  const reqCounterRef = useRef(0);
  const controllerRef = useRef(null);

  const welcomeFade = useRef(new Animated.Value(0)).current;
  const welcomeSlide = useRef(new Animated.Value(24)).current;
  const sectionAnim = useRef(new Animated.Value(1)).current;

  const [booted, setBooted] = useState(false);
  const [themeId, setThemeId] = useState('obsidian');
  const theme = THEMES[themeId] || THEMES.obsidian;

  const [legalAccepted, setLegalAccepted] = useState(false);
  const [agreeCheck, setAgreeCheck] = useState(false);
  const [section, setSection] = useState('workspace');
  const [legalTab, setLegalTab] = useState('privacy');
  const [viewMode, setViewMode] = useState('split');
  const [showApiKey, setShowApiKey] = useState(false);

  const [targetUrl, setTargetUrl] = useState('https://me-tp.qureo.education');
  const [aiConfig, setAiConfig] = useState(DEFAULT_AI_CONFIG);

  const [busy, setBusy] = useState(false);
  const [roundBadge, setRoundBadge] = useState('');
  const [status, setStatus] = useState('جاهز');
  const [logs, setLogs] = useState([]);
  const [outputText, setOutputText] = useState('');
  const [question, setQuestion] = useState('');
  const [copiedNotice, setCopiedNotice] = useState(false);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(welcomeFade, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(welcomeSlide, { toValue: 0, friction: 8, tension: 55, useNativeDriver: true }),
    ]).start();
  }, [welcomeFade, welcomeSlide]);

  useEffect(() => {
    sectionAnim.setValue(0.86);
    Animated.timing(sectionAnim, {
      toValue: 1,
      duration: 210,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [section, sectionAnim]);

  useEffect(() => {
    (async () => {
      try {
        const [acceptedVal, cfgVal, urlVal, savedTheme] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.acceptedLegal),
          AsyncStorage.getItem(STORAGE_KEYS.aiConfig),
          AsyncStorage.getItem(STORAGE_KEYS.targetUrl),
          AsyncStorage.getItem(STORAGE_KEYS.themeId),
        ]);
        if (savedTheme && THEMES[savedTheme]) setThemeId(savedTheme);
        if (acceptedVal === 'true') setLegalAccepted(true);
        const parsedCfg = cfgVal ? JSON.parse(cfgVal) : {};
        setAiConfig({ ...DEFAULT_AI_CONFIG, ...parsedCfg });
        if (urlVal) setTargetUrl(urlVal);
      } catch (_) {}
      setBooted(true);
    })();
  }, []);

  async function selectTheme(nextId) {
    if (!THEMES[nextId]) return;
    setThemeId(nextId);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.themeId, nextId);
    } catch (_) {}
  }

  const pushLog = (msg) => {
    const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs((prev) => [`[${stamp}] ${msg}`, ...prev].slice(0, 40));
  };

  async function acceptWelcome() {
    setLegalAccepted(true);
    await AsyncStorage.setItem(STORAGE_KEYS.acceptedLegal, 'true');
    pushLog('تم قبول سياسة الخصوصية وشروط الاستخدام والدخول إلى M.R.S.W Workspace.');
  }

  async function saveAiConfig() {
    await AsyncStorage.setItem(STORAGE_KEYS.aiConfig, JSON.stringify(aiConfig));
    await AsyncStorage.setItem(STORAGE_KEYS.targetUrl, targetUrl.trim() || 'https://me-tp.qureo.education');
    const detected = detectProvider(aiConfig.apiKey, aiConfig.providerPref);
    setStatus(`تم الحفظ ✓ (${detected.toUpperCase()})`);
    pushLog(`Saved AI config (provider=${detected}, retries=${aiConfig.maxRetries}).`);
  }

  async function handleCopyOutput() {
    if (!outputText) return;
    try {
      await Clipboard.setStringAsync(outputText);
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 1500);
    } catch (_) {}
  }

  function sendBridge(type, extra = {}, timeoutMs = 6000) {
    const requestId = `mrsw_${++reqCounterRef.current}`;
    const messageObj = Object.assign({ type, requestId }, extra);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingRef.current.delete(requestId);
        reject(new Error(`انتهت مهلة الاتصال بالصفحة (${type})`));
      }, timeoutMs);

      pendingRef.current.set(requestId, {
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
      });

      const js = `window.__qshMobileHandleCommand && window.__qshMobileHandleCommand(${JSON.stringify(messageObj)}); true;`;
      webViewRef.current?.injectJavaScript(js);
    });
  }

  function onWebViewMessage(event) {
    let parsed;
    try {
      parsed = JSON.parse(event.nativeEvent.data);
    } catch (_) {
      return;
    }
    if (parsed.type === 'BRIDGE_READY') {
      setStatus('الجسر متصل بالصفحة ✓');
      return;
    }
    if (parsed.requestId && pendingRef.current.has(parsed.requestId)) {
      const { resolve } = pendingRef.current.get(parsed.requestId);
      pendingRef.current.delete(parsed.requestId);
      resolve(parsed.data);
    }
  }

  async function runMode(mode, customQuestion = '') {
    if (busy) return;
    setBusy(true);
    setRoundBadge('LIVE');
    const ac = new AbortController();
    controllerRef.current = ac;

    try {
      setStatus('قراءة محتوى الصفحة...');
      const ctx = await sendBridge('READ_CONTEXT');
      if (customQuestion) ctx.question = customQuestion;
      if (mode === 'hint') ctx.hintLevel = 2;

      const aiRes = await generateWithRetries(
        aiConfig,
        mode,
        ctx,
        (st) => {
          setStatus(st);
          pushLog(st);
        },
        ac.signal
      );

      if (!aiRes.ok) {
        setStatus(aiRes.aborted ? 'تم الإيقاف.' : `فشل: ${aiRes.error}`);
        pushLog(`Error (${mode}): ${aiRes.error}`);
        if (!aiRes.aborted) setOutputText(`⚠️ ${aiRes.error}`);
        return;
      }

      setOutputText(aiRes.text);
      setStatus(`تم الرد (${aiRes.provider.toUpperCase()} / محاولة ${aiRes.attempts}) ✓`);
      pushLog(`Completed ${mode} via ${aiRes.provider} in ${aiRes.attempts} attempt(s).`);
    } catch (err) {
      setStatus(err.message || 'خطأ غير متوقع');
      pushLog(`Exception: ${err.message}`);
    } finally {
      controllerRef.current = null;
      setRoundBadge('');
      setBusy(false);
    }
  }

  async function autoSolveLoop() {
    if (busy) return;
    setBusy(true);
    const ac = new AbortController();
    controllerRef.current = ac;
    const history = [];
    const triedSigs = new Set();

    try {
      setRoundBadge('READ');
      setStatus('قراءة الدرس والحقول...');
      let ctx = await sendBridge('READ_CONTEXT');
      const fields = ctx.fields || [];
      if (!fields.length) {
        setStatus('لم يتم العثور على حقول قابلة للكتابة في الصفحة.');
        pushLog('Auto-solve stopped: no editable fields found.');
        return;
      }

      const maxRounds = Math.min(8, Math.max(1, Number(aiConfig.maxFixRounds) || 3));
      let hasWrittenAndRun = false;

      for (let round = 0; round <= maxRounds; round++) {
        if (ac.signal.aborted) {
          setStatus('تم الإيقاف بواسطة المستخدم.');
          break;
        }

        setRoundBadge(`R${round}/${maxRounds}`);
        const shouldCheck = round > 0 && hasWrittenAndRun;
        const mode = shouldCheck ? 'check' : 'auto';
        setStatus(shouldCheck ? `مراجعة وتصحيح (جولة ${round}/${maxRounds})...` : 'توليد الكود...');
        pushLog(`Auto-solve round ${round} (${mode}) starting.`);

        const aiRes = await generateWithRetries(
          aiConfig,
          mode,
          { ...ctx, history },
          (st) => setStatus(st),
          ac.signal
        );

        if (!aiRes.ok) {
          setStatus(aiRes.aborted ? 'تم الإيقاف بواسطة المستخدم.' : `فشل الذكاء الاصطناعي: ${aiRes.error}`);
          pushLog(`Round ${round} failed: ${aiRes.error}`);
          break;
        }

        if (shouldCheck) {
          const { verdict, note } = parseVerdictText(aiRes.text);
          pushLog(`Check verdict: ${verdict} — ${note}`);
          if (verdict === 'PASS') {
            setStatus('تم اجتياز المهمة بنجاح ✓');
            setOutputText(aiRes.text);
            break;
          }
          history.push(`Round ${round} verdict=${verdict}: ${note}`);
          if (round === maxRounds) {
            setStatus('انتهت جولات التصحيح — راجع المخرجات.');
            setOutputText(aiRes.text);
            break;
          }
        }

        const blocks = extractCodeBlocks(aiRes.text, fields.length);
        if (!blocks.length) {
          history.push(`Round ${round} did not produce a valid code block.`);
          setOutputText(aiRes.text);
          continue;
        }

        const sig = blocks.map((b) => `${b.index}:${b.code.replace(/\s+/g, ' ')}`).join('|');
        if (triedSigs.has(sig)) {
          history.push(`CRITICAL: Code signature [${sig}] already tried; produce a different valid fix.`);
          pushLog('Detected repeated code signature; injecting anti-repeat instruction.');
        }
        triedSigs.add(sig);

        let wroteAny = false;
        for (const blk of blocks) {
          const targetIdx = blk.index < fields.length ? blk.index : 0;
          const wr = await sendBridge('WRITE_FIELD', { index: targetIdx, code: blk.code });
          if (wr?.ok) {
            wroteAny = true;
            pushLog(`Wrote code to field #${targetIdx}.`);
          }
        }

        if (!wroteAny) {
          history.push(`Round ${round} failed to write into target fields.`);
          continue;
        }

        setStatus('تشغيل الكود ومراقبة النتيجة...');
        const runRes = await sendBridge('RUN_AND_CAPTURE');
        hasWrittenAndRun = Boolean(runRes?.clicked);
        ctx = await sendBridge('READ_CONTEXT');
        ctx.afterRun = runRes?.afterRun || '';
        ctx.errors = runRes?.errors || '';
        setOutputText(aiRes.text);

        if (!runRes?.clicked) {
          setStatus('تمت كتابة الكود (لم يُعثر على زر تشغيل تلقائي).');
          break;
        }
      }
    } catch (err) {
      setStatus(err.message || 'خطأ أثناء الحل التلقائي');
      pushLog(`Auto-solve error: ${err.message}`);
    } finally {
      controllerRef.current = null;
      setRoundBadge('');
      setBusy(false);
    }
  }

  function stopLoop() {
    controllerRef.current?.abort();
    setStatus('جاري إيقاف الحلقة...');
    pushLog('User requested immediate stop.');
  }

  async function resetAllData() {
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.acceptedLegal,
      STORAGE_KEYS.aiConfig,
      STORAGE_KEYS.targetUrl,
      STORAGE_KEYS.themeId,
    ]);
    setAiConfig(DEFAULT_AI_CONFIG);
    setThemeId('obsidian');
    setAgreeCheck(false);
    setLegalAccepted(false);
    setLogs([]);
    setOutputText('');
    setStatus('تمت إعادة الضبط.');
  }

  if (!booted) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={[styles.splashLoading, { backgroundColor: theme.bg }]}>
          <PulsingBrandBadge label="M.R.S.W" subtitle="Initializing..." theme={theme} />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  if (!legalAccepted) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={[styles.welcomeRoot, { backgroundColor: theme.bg }]}>
          <Animated.View
            style={[
              styles.welcomeCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                opacity: welcomeFade,
                transform: [{ translateY: welcomeSlide }],
              },
            ]}
          >
            <PulsingBrandBadge label="M.R.S.W" subtitle="Study & Automation Engine" theme={theme} />

            <Text style={[styles.welcomeTitle, { color: theme.text }]}>أهلاً بك في M.R.S.W Workspace</Text>
            <Text style={[styles.welcomeSub, { color: theme.textMuted }]}>
              منصة ذكية للمذاكرة وحل التمارين التفاعلية مع سمات متعددة، دعم أي مفتاح API، وحلقات إعادة محاولة مستمرة.
            </Text>

            <View style={styles.themePickerRow}>
              {Object.values(THEMES).map((t) => {
                const active = t.id === theme.id;
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[
                      styles.themePill,
                      {
                        backgroundColor: active ? theme.accentSoft : theme.surfaceElevated,
                        borderColor: active ? theme.accent : theme.border,
                      },
                    ]}
                    onPress={() => selectTheme(t.id)}
                  >
                    <Text style={[styles.themePillTxt, { color: theme.text }]}>
                      {t.badge} {t.id}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.featureBox, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
              <Text style={[styles.featureLine, { color: theme.text }]}>• 4 سمات قابلة للتبديل وحركة سلسة وهوية M.R.S.W</Text>
              <Text style={[styles.featureLine, { color: theme.text }]}>• دعم أي مفتاح API أو Endpoint مخصص بدون قيود</Text>
              <Text style={[styles.featureLine, { color: theme.text }]}>• حل تلقائي مع إعادة محاولة وتصحيح متكرر حتى النجاح</Text>
            </View>

            <View style={styles.legalTabsRow}>
              <TouchableOpacity
                style={[
                  styles.miniTab,
                  {
                    backgroundColor: legalTab === 'privacy' ? theme.accentSoft : theme.surfaceElevated,
                    borderColor: legalTab === 'privacy' ? theme.accent : theme.border,
                  },
                ]}
                onPress={() => setLegalTab('privacy')}
              >
                <Text style={[styles.miniTabText, { color: theme.text }]}>سياسة الخصوصية</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.miniTab,
                  {
                    backgroundColor: legalTab === 'terms' ? theme.accentSoft : theme.surfaceElevated,
                    borderColor: legalTab === 'terms' ? theme.accent : theme.border,
                  },
                ]}
                onPress={() => setLegalTab('terms')}
              >
                <Text style={[styles.miniTabText, { color: theme.text }]}>شروط الاستخدام</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={[styles.legalScrollBox, { backgroundColor: theme.bg, borderColor: theme.border }]}>
              <Text style={[styles.legalText, { color: theme.textMuted }]}>
                {legalTab === 'privacy' ? PRIVACY_POLICY_TEXT : TERMS_OF_USE_TEXT}
              </Text>
            </ScrollView>

            <TouchableOpacity style={styles.checkRow} onPress={() => setAgreeCheck((v) => !v)}>
              <View
                style={[
                  styles.checkbox,
                  { borderColor: theme.border },
                  agreeCheck && { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}
              >
                {agreeCheck && <Text style={[styles.checkmark, { color: theme.accentText }]}>✓</Text>}
              </View>
              <Text style={[styles.checkLabel, { color: theme.text }]}>أوافق على سياسة الخصوصية وشروط الاستخدام</Text>
            </TouchableOpacity>

            <AnimatedActionButton
              title="ابدأ الآن • Enter Workspace"
              disabled={!agreeCheck}
              onPress={acceptWelcome}
              theme={theme}
              style={{ marginTop: 10 }}
            />
          </Animated.View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  const webFlexStyle =
    viewMode === 'focus-panel' ? { flex: 0.34 } : viewMode === 'focus-web' ? { flex: 1.85 } : { flex: 1.05 };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.appRoot, { backgroundColor: theme.bg }]}>
        <KeyboardAvoidingView
          style={styles.flex1}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <View style={styles.headerBrandRow}>
              <View style={[styles.eagleMark, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                <Text style={styles.eagleMarkTxt}>{theme.badge}</Text>
              </View>
              <View style={styles.flex1}>
                <Text style={[styles.headerTitle, { color: theme.text }]}>M.R.S.W Workspace</Text>
                <Text style={[styles.headerStatus, { color: theme.statusText }]} numberOfLines={1}>
                  {roundBadge ? `[${roundBadge}] ` : ''}
                  {status}
                </Text>
              </View>
            </View>
            {busy && (
              <TouchableOpacity
                style={[styles.stopPill, { backgroundColor: theme.danger }]}
                onPress={stopLoop}
              >
                <Text style={styles.stopPillTxt}>■ إيقاف</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.navBar, { backgroundColor: theme.bg, borderBottomColor: theme.border }]}>
            {[
              { id: 'workspace', label: 'Workspace' },
              { id: 'ai', label: 'AI & Keys' },
              { id: 'legal', label: 'Themes & Legal' },
            ].map((tab) => {
              const active = section === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    styles.navItem,
                    {
                      backgroundColor: active ? theme.accentSoft : theme.surfaceElevated,
                      borderColor: active ? theme.accent : theme.border,
                      borderWidth: 1,
                    },
                  ]}
                  onPress={() => setSection(tab.id)}
                >
                  <Text style={[styles.navText, { color: active ? theme.text : theme.textMuted }]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Animated.View style={[styles.flex1, { opacity: sectionAnim }]}>
            {section === 'workspace' && (
              <View style={styles.flex1}>
                <View style={[styles.webContainer, { borderBottomColor: theme.border }, webFlexStyle]}>
                  <WebView
                    ref={webViewRef}
                    source={{ uri: targetUrl }}
                    injectedJavaScriptBeforeContentLoaded={PAGE_BRIDGE_JS}
                    injectedJavaScript={PAGE_BRIDGE_JS}
                    onMessage={onWebViewMessage}
                    javaScriptEnabled
                    domStorageEnabled
                  />
                </View>

                <View style={[styles.layoutBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
                  <TouchableOpacity
                    style={[styles.miniAction, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
                    onPress={() => webViewRef.current?.goBack()}
                  >
                    <Text style={[styles.layoutChipTxt, { color: theme.text }]}>←</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.miniAction, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
                    onPress={() => webViewRef.current?.reload()}
                  >
                    <Text style={[styles.layoutChipTxt, { color: theme.text }]}>↻</Text>
                  </TouchableOpacity>
                  {[
                    { id: 'focus-panel', label: 'أدوات' },
                    { id: 'split', label: 'متوازن' },
                    { id: 'focus-web', label: 'صفحة' },
                  ].map((m) => (
                    <TouchableOpacity
                      key={m.id}
                      style={[
                        styles.layoutChip,
                        {
                          backgroundColor: viewMode === m.id ? theme.accentSoft : theme.surfaceElevated,
                          borderColor: viewMode === m.id ? theme.accent : theme.border,
                        },
                      ]}
                      onPress={() => setViewMode(m.id)}
                    >
                      <Text style={[styles.layoutChipTxt, { color: theme.text }]}>{m.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <ScrollView
                  style={[styles.panel, { backgroundColor: theme.bg }]}
                  contentContainerStyle={styles.panelContent}
                  keyboardShouldPersistTaps="handled"
                >
                  <View style={styles.gridRow}>
                    <AnimatedActionButton
                      title="⚡ حل تلقائي مستمر"
                      disabled={busy}
                      variant="accent"
                      onPress={autoSolveLoop}
                      theme={theme}
                      style={styles.half}
                    />
                    <AnimatedActionButton
                      title="اشرح المطلوب"
                      disabled={busy}
                      variant="primary"
                      onPress={() => runMode('explain')}
                      theme={theme}
                      style={styles.half}
                    />
                  </View>

                  <View style={styles.gridRow}>
                    <AnimatedActionButton
                      title="تلميح"
                      disabled={busy}
                      variant="secondary"
                      onPress={() => runMode('hint')}
                      theme={theme}
                      style={styles.third}
                    />
                    <AnimatedActionButton
                      title="الحل بالكود"
                      disabled={busy}
                      variant="secondary"
                      onPress={() => runMode('solution')}
                      theme={theme}
                      style={styles.third}
                    />
                    <AnimatedActionButton
                      title="راجع كودي"
                      disabled={busy}
                      variant="ghost"
                      onPress={() => runMode('review')}
                      theme={theme}
                      style={styles.third}
                    />
                  </View>

                  <View style={styles.askRow}>
                    <TextInput
                      style={[
                        styles.askInput,
                        { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border },
                      ]}
                      value={question}
                      onChangeText={setQuestion}
                      placeholder="اسأل المساعد عن الدرس أو الكود..."
                      placeholderTextColor={theme.textMuted}
                    />
                    <AnimatedActionButton
                      title="إرسال"
                      disabled={busy || !question.trim()}
                      theme={theme}
                      onPress={() => {
                        const q = question.trim();
                        setQuestion('');
                        runMode('ask', q);
                      }}
                    />
                  </View>

                  {!!outputText && (
                    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                      <View style={styles.cardHeaderRow}>
                        <Text style={[styles.cardTitle, { color: theme.text }]}>رد المساعد</Text>
                        <TouchableOpacity
                          style={[styles.copyBtn, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
                          onPress={handleCopyOutput}
                        >
                          <Text style={[styles.copyBtnTxt, { color: theme.statusText }]}>
                            {copiedNotice ? 'تم النسخ ✓' : 'نسخ'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={[styles.outputTxt, { color: theme.text }]}>{outputText}</Text>
                    </View>
                  )}

                  <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={[styles.cardTitle, { color: theme.text }]}>سجل المحاولات ({logs.length})</Text>
                    {logs.length === 0 ? (
                      <Text style={[styles.muted, { color: theme.textMuted }]}>لا توجد محاولات مسجلة بعد.</Text>
                    ) : (
                      logs.slice(0, 8).map((line, i) => (
                        <Text key={i} style={[styles.logLine, { color: theme.statusText }]}>{line}</Text>
                      ))
                    )}
                  </View>
                </ScrollView>
              </View>
            )}

            {section === 'ai' && (
              <ScrollView
                style={[styles.panel, { backgroundColor: theme.bg }]}
                contentContainerStyle={styles.panelContent}
                keyboardShouldPersistTaps="handled"
              >
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>إعدادات أي مفتاح API</Text>
                  <Text style={[styles.muted, { color: theme.textMuted }]}>
                    يدعم أي مفتاح أو Endpoint: Gemini (`AIza...`)، OpenAI / OpenRouter / Groq / Custom، أو Anthropic (`sk-ant-...`).
                  </Text>

                  <Text style={[styles.label, { color: theme.text }]}>نوع المزود (Provider)</Text>
                  <View style={styles.chipRow}>
                    {['auto', 'gemini', 'openai', 'anthropic'].map((p) => {
                      const active = aiConfig.providerPref === p;
                      return (
                        <TouchableOpacity
                          key={p}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: active ? theme.accentSoft : theme.surfaceElevated,
                              borderColor: active ? theme.accent : theme.border,
                            },
                          ]}
                          onPress={() => setAiConfig((c) => ({ ...c, providerPref: p }))}
                        >
                          <Text style={[styles.chipTxt, { color: theme.text }]}>{p.toUpperCase()}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.cardHeaderRow}>
                    <Text style={[styles.label, { color: theme.text }]}>API Key</Text>
                    <TouchableOpacity onPress={() => setShowApiKey((v) => !v)}>
                      <Text style={[styles.toggleTxt, { color: theme.statusText }]}>
                        {showApiKey ? 'إخفاء' : 'إظهار'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.surfaceElevated, color: theme.text, borderColor: theme.border }]}
                    value={aiConfig.apiKey}
                    onChangeText={(apiKey) => setAiConfig((c) => ({ ...c, apiKey }))}
                    placeholder="الصق أي مفتاح API هنا..."
                    placeholderTextColor={theme.textMuted}
                    secureTextEntry={!showApiKey}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <Text style={[styles.label, { color: theme.text }]}>اسم الموديل (اختياري)</Text>
                  <View style={styles.chipRow}>
                    {MODEL_PRESETS.map((m) => (
                      <TouchableOpacity
                        key={m}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: aiConfig.model === m ? theme.accentSoft : theme.surfaceElevated,
                            borderColor: aiConfig.model === m ? theme.accent : theme.border,
                          },
                        ]}
                        onPress={() => setAiConfig((c) => ({ ...c, model: m }))}
                      >
                        <Text style={[styles.chipTxt, { color: theme.text }]}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.surfaceElevated, color: theme.text, borderColor: theme.border }]}
                    value={aiConfig.model}
                    onChangeText={(model) => setAiConfig((c) => ({ ...c, model }))}
                    placeholder="اكتب اسم أي موديل..."
                    placeholderTextColor={theme.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <Text style={[styles.label, { color: theme.text }]}>Custom Base URL (اختياري)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.surfaceElevated, color: theme.text, borderColor: theme.border }]}
                    value={aiConfig.baseUrl}
                    onChangeText={(baseUrl) => setAiConfig((c) => ({ ...c, baseUrl }))}
                    placeholder="مثال: https://openrouter.ai/api/v1"
                    placeholderTextColor={theme.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <View style={styles.gridRow}>
                    <View style={styles.half}>
                      <Text style={[styles.label, { color: theme.text }]}>إعادة المحاولات</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: theme.surfaceElevated, color: theme.text, borderColor: theme.border }]}
                        keyboardType="numeric"
                        value={String(aiConfig.maxRetries)}
                        onChangeText={(v) => setAiConfig((c) => ({ ...c, maxRetries: Number(v.replace(/[^0-9]/g, '')) || 1 }))}
                      />
                    </View>
                    <View style={styles.half}>
                      <Text style={[styles.label, { color: theme.text }]}>جولات التصحيح</Text>
                      <TextInput
                        style={[styles.input, { backgroundColor: theme.surfaceElevated, color: theme.text, borderColor: theme.border }]}
                        keyboardType="numeric"
                        value={String(aiConfig.maxFixRounds)}
                        onChangeText={(v) => setAiConfig((c) => ({ ...c, maxFixRounds: Number(v.replace(/[^0-9]/g, '')) || 1 }))}
                      />
                    </View>
                  </View>

                  <Text style={[styles.label, { color: theme.text }]}>رابط الصفحة (WebView URL)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: theme.surfaceElevated, color: theme.text, borderColor: theme.border }]}
                    value={targetUrl}
                    onChangeText={setTargetUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  <AnimatedActionButton
                    title="حفظ الإعدادات"
                    onPress={saveAiConfig}
                    theme={theme}
                    style={{ marginTop: 12 }}
                  />
                </View>
              </ScrollView>
            )}

            {section === 'legal' && (
              <ScrollView style={[styles.panel, { backgroundColor: theme.bg }]} contentContainerStyle={styles.panelContent}>
                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>السمات والمظهر (Themes)</Text>
                  <View style={styles.themeGrid}>
                    {Object.values(THEMES).map((t) => {
                      const active = t.id === theme.id;
                      return (
                        <TouchableOpacity
                          key={t.id}
                          style={[
                            styles.themeCardBtn,
                            {
                              backgroundColor: t.surfaceElevated,
                              borderColor: active ? theme.accent : theme.border,
                              borderWidth: active ? 2 : 1,
                            },
                          ]}
                          onPress={() => selectTheme(t.id)}
                        >
                          <Text style={[styles.themeCardTitle, { color: t.text }]}>
                            {t.badge} {t.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.legalTabsRow}>
                  <TouchableOpacity
                    style={[
                      styles.miniTab,
                      {
                        backgroundColor: legalTab === 'privacy' ? theme.accentSoft : theme.surfaceElevated,
                        borderColor: legalTab === 'privacy' ? theme.accent : theme.border,
                      },
                    ]}
                    onPress={() => setLegalTab('privacy')}
                  >
                    <Text style={[styles.miniTabText, { color: theme.text }]}>سياسة الخصوصية</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.miniTab,
                      {
                        backgroundColor: legalTab === 'terms' ? theme.accentSoft : theme.surfaceElevated,
                        borderColor: legalTab === 'terms' ? theme.accent : theme.border,
                      },
                    ]}
                    onPress={() => setLegalTab('terms')}
                  >
                    <Text style={[styles.miniTabText, { color: theme.text }]}>شروط الاستخدام</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={[styles.legalText, { color: theme.textMuted }]}>
                    {legalTab === 'privacy' ? PRIVACY_POLICY_TEXT : TERMS_OF_USE_TEXT}
                  </Text>
                </View>

                <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>إدارة البيانات</Text>
                  <AnimatedActionButton
                    title="إعادة ضبط التطبيق والمفاتيح"
                    variant="ghost"
                    theme={theme}
                    onPress={resetAllData}
                  />
                </View>
              </ScrollView>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  splashLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  welcomeRoot: { flex: 1, justifyContent: 'center', padding: 16 },
  welcomeCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
  },
  brandBadge: {
    alignSelf: 'center',
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  brandGlow: {
    position: 'absolute',
    top: -4,
    right: -4,
    bottom: -4,
    left: -4,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  brandBadgeText: { fontSize: 21, fontWeight: '900', letterSpacing: 1.2 },
  brandBadgeSub: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  welcomeTitle: { fontSize: 19, fontWeight: '800', textAlign: 'center', marginBottom: 6 },
  welcomeSub: { fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginBottom: 12 },
  themePickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  themePill: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  themePillTxt: { fontSize: 11.5, fontWeight: '700' },
  featureBox: {
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    marginBottom: 12,
    gap: 4,
  },
  featureLine: { fontSize: 12 },
  legalTabsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  miniTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  miniTabText: { fontWeight: '700', fontSize: 12 },
  legalScrollBox: {
    maxHeight: 130,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginBottom: 12,
  },
  legalText: { fontSize: 12, lineHeight: 19 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { fontWeight: '900', fontSize: 13 },
  checkLabel: { fontSize: 12.5, flex: 1 },

  appRoot: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  eagleMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eagleMarkTxt: { fontSize: 18 },
  headerTitle: { fontWeight: '800', fontSize: 15 },
  headerStatus: { fontSize: 11.5, marginTop: 1 },
  stopPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  stopPillTxt: { color: '#ffffff', fontWeight: '700', fontSize: 12 },

  navBar: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    borderBottomWidth: 1,
  },
  navItem: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  navText: { fontWeight: '700', fontSize: 12 },

  webContainer: { borderBottomWidth: 1 },
  layoutBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    borderBottomWidth: 1,
  },
  miniAction: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
  },
  layoutChip: {
    flex: 1,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
  },
  layoutChipTxt: { fontSize: 11, fontWeight: '700' },

  panel: { flex: 1 },
  panelContent: { padding: 12, gap: 10, paddingBottom: 28 },

  gridRow: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
  third: { flex: 1 },
  actionBtn: {
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  actionBtnText: { fontWeight: '700', fontSize: 12.5 },

  askRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  askInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },

  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontWeight: '800', fontSize: 13.5 },
  copyBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  copyBtnTxt: { fontSize: 11, fontWeight: '700' },
  muted: { fontSize: 12, lineHeight: 18 },
  outputTxt: { fontSize: 12.5, lineHeight: 19 },
  logLine: { fontSize: 11.5, fontFamily: 'monospace' },

  label: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  toggleTxt: { fontSize: 11.5, fontWeight: '700', marginTop: 6 },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 12.5,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipTxt: { fontSize: 11.5, fontWeight: '700' },

  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  themeCardBtn: {
    width: '48%',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  themeCardTitle: { fontSize: 12, fontWeight: '800' },
});