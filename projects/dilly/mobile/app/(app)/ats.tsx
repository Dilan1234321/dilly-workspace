import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dilly } from '../../lib/dilly';
import { colors, spacing } from '../../lib/tokens';
import AnimatedPressable from '../../components/AnimatedPressable';
import FadeInView from '../../components/FadeInView';
import ATSDeepScan, { RewriteSuggestion, KeywordCell, ATSScoreV2 } from '../../components/ATSDeepScan';
import { openDillyOverlay } from '../../hooks/useDillyOverlay';

const GOLD   = '#2B3A8E';
const GREEN  = '#34C759';
const AMBER  = '#FF9F0A';
const CORAL  = '#FF453A';
const BLUE   = '#0A84FF';
const INDIGO = '#5E5CE6';

type TabMode = 'scan' | 'company' | 'match';

// ── ATS System info ───────────────────────────────────────────────────────────

const ATS_SYSTEMS = [
  { key: 'greenhouse', name: 'Greenhouse', color: '#2ECC71', strictness: 'Lenient', usedBy: 'Stripe, Airbnb, Coinbase, Figma' },
  { key: 'workday', name: 'Workday', color: '#3498DB', strictness: 'Strict', usedBy: 'Amazon, Goldman Sachs, JP Morgan, Disney' },
  { key: 'icims', name: 'iCIMS', color: '#9B59B6', strictness: 'Moderate', usedBy: 'Nike, Target, UnitedHealth, Johnson & Johnson' },
  { key: 'taleo', name: 'Taleo', color: '#E74C3C', strictness: 'Strict', usedBy: 'Oracle, Cisco, FedEx, Starbucks' },
  { key: 'lever', name: 'Lever', color: '#F39C12', strictness: 'Lenient', usedBy: 'Netflix, Shopify, Lyft' },
  { key: 'successfactors', name: 'SuccessFactors', color: '#1ABC9C', strictness: 'Moderate', usedBy: 'Siemens, Accenture, Bosch' },
];

function scoreColor(s: number): string { return s >= 85 ? GREEN : s >= 70 ? AMBER : CORAL; }

// ── Score Card ────────────────────────────────────────────────────────────────

function ATSScoreCard({ system, score, issues, onFix, onFixInEditor }: {
  system: typeof ATS_SYSTEMS[0]; score: number; issues: string[];
  onFix: (system: string, issue: string, score?: number) => void;
  onFixInEditor: (system: string, issues: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = scoreColor(score);

  return (
    <AnimatedPressable style={ss.scoreCard} onPress={() => setExpanded(!expanded)} scaleDown={0.98}>
      <View style={ss.scoreCardHeader}>
        <View style={[ss.systemDot, { backgroundColor: system.color }]} />
        <View style={{ flex: 1 }}>
          <Text style={ss.systemName}>{system.name}</Text>
          <Text style={ss.systemStrictness}>{system.strictness} parsing</Text>
        </View>
        <View style={[ss.scoreBadge, { backgroundColor: color + '15', borderColor: color + '30' }]}>
          <Text style={[ss.scoreBadgeText, { color }]}>{score > 0 ? `${score}%` : 'N/A'}</Text>
        </View>
      </View>

      {/* Score bar */}
      {score > 0 ? (
        <View style={ss.scoreBar}>
          <View style={[ss.scoreBarFill, { width: `${score}%`, backgroundColor: color }]} />
        </View>
      ) : (
        <Text style={{ fontSize: 11, color: colors.t3, marginTop: 4 }}>Score unavailable</Text>
      )}

      {expanded && (
        <View style={ss.scoreCardExpanded}>
          <Text style={ss.usedByText}>Used by: {system.usedBy}</Text>
          {issues.length > 0 ? (
            <>
              <Text style={ss.issuesTitle}>ISSUES FOUND</Text>
              {issues.map((issue, i) => (
                <View key={i} style={ss.issueRow}>
                  <Ionicons name="alert-circle" size={12} color={CORAL} />
                  <Text style={ss.issueText}>{issue}</Text>
                  <AnimatedPressable style={ss.fixBtn} onPress={() => onFix(system.name, issue)} scaleDown={0.95}>
                    <Text style={ss.fixBtnText}>Fix</Text>
                  </AnimatedPressable>
                </View>
              ))}
              <AnimatedPressable style={ss.applyEditorBtn} onPress={() => onFixInEditor(system.name, issues)} scaleDown={0.97}>
                <Ionicons name="create-outline" size={13} color="#FFFFFF" />
                <Text style={ss.applyEditorBtnText}>Apply Fixes in Editor</Text>
              </AnimatedPressable>
            </>
          ) : (
            <View style={ss.allGoodRow}>
              <Ionicons name="checkmark-circle" size={14} color={GREEN} />
              <Text style={ss.allGoodText}>Your resume parses well on {system.name}</Text>
            </View>
          )}
        </View>
      )}
    </AnimatedPressable>
  );
}

// ── Parse Preview ─────────────────────────────────────────────────────────────

function ParsePreview({ fields }: { fields: { label: string; value: string; ok: boolean }[] }) {
  return (
    <View style={ss.parseCard}>
      <Text style={ss.parseTitleText}>WHAT ATS SYSTEMS SEE</Text>
      {fields.map((f, i) => (
        <View key={i} style={ss.parseRow}>
          <Ionicons name={f.ok ? 'checkmark-circle' : 'close-circle'} size={12} color={f.ok ? GREEN : CORAL} />
          <Text style={ss.parseLabel}>{f.label}:</Text>
          <Text style={[ss.parseValue, !f.ok && { color: CORAL }]} numberOfLines={1}>{f.value || 'Not found'}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Keyword Match Row ─────────────────────────────────────────────────────────

function KeywordRow({ keyword, count, status }: { keyword: string; count: number; status: 'strong' | 'present' | 'missing' }) {
  const cfg = { strong: { color: GREEN, icon: 'checkmark-circle' as const, label: 'Strong' }, present: { color: AMBER, icon: 'alert-circle' as const, label: 'Weak' }, missing: { color: CORAL, icon: 'close-circle' as const, label: 'Missing' } }[status];
  return (
    <View style={ss.keywordRow}>
      <Ionicons name={cfg.icon} size={12} color={cfg.color} />
      <Text style={ss.keywordText}>{keyword}</Text>
      <Text style={[ss.keywordCount, { color: cfg.color }]}>{count > 0 ? `${count}x` : 'none'}</Text>
      <View style={[ss.keywordBadge, { backgroundColor: cfg.color + '15' }]}>
        <Text style={[ss.keywordBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
      </View>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ATSScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabMode>('scan');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<Record<string, any>>({});

  // Universal scan state
  const [scanResults, setScanResults] = useState<any>(null);
  const [v2Results, setV2Results] = useState<ATSScoreV2 | null>(null);
  const [rewriteSuggestions, setRewriteSuggestions] = useState<RewriteSuggestion[]>([]);
  const [keywordCells, setKeywordCells] = useState<KeywordCell[]>([]);
  const [hasResume, setHasResume] = useState(false);

  // Company lookup state
  const [companySearch, setCompanySearch] = useState('');
  const [companyResult, setCompanyResult] = useState<any>(null);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyScanData, setCompanyScanData] = useState<any>(null);
  const [companyScanLoading, setCompanyScanLoading] = useState(false);

  // Job match state
  const [jdText, setJdText] = useState('');
  const [keywordResults, setKeywordResults] = useState<any>(null);
  const [matchLoading, setMatchLoading] = useState(false);

  // Load profile
  useEffect(() => {
    (async () => {
      try {
        const res = await dilly.fetch('/profile');
        const p = await res.json();
        setProfile(p || {});
      } catch {}
    })();
  }, []);

  // Extract bullet lines from raw resume text for the rewrite engine.
  // Keeps only lines that start with a bullet character and have real content.
  function extractBullets(raw: string): string[] {
    if (!raw) return [];
    const lines = raw.split(/\r?\n/);
    const out: string[] = [];
    const bulletRe = /^[\s]*[•·\-–—▪►➤*∙][\s]+(.{12,})$/;
    for (const line of lines) {
      const m = line.match(bulletRe);
      if (m && m[1]) {
        const cleaned = m[1].trim();
        // Skip obvious non-bullets (headers, dates alone, etc.)
        if (cleaned.split(/\s+/).length >= 4) {
          out.push(cleaned);
        }
      }
    }
    return out.slice(0, 12); // cap to avoid huge POSTs
  }

  // Map backend keyword-density response to the heatmap cells shape.
  function mapKeywordCellsFromDensity(density: any): KeywordCell[] {
    if (!density) return [];
    const kws = density.keywords || [];
    const cells: KeywordCell[] = [];
    for (const k of kws) {
      const ctx = k.contextual_count || 0;
      const bare = k.bare_count || 0;
      const total = ctx + bare;
      if (total === 0) continue;
      let placement: KeywordCell['placement'];
      if (ctx >= 2) placement = 'strong';
      else if (ctx === 1) placement = 'adequate';
      else placement = 'weak';
      cells.push({
        keyword: k.keyword, count: total, placement,
        sections: k.sections || [],
      });
    }
    return cells.slice(0, 40);
  }

  // Map /ats-rewrite response to the RewriteDiff shape, turning string
  // change descriptions into structured from/to entries when possible.
  function mapRewritesFromResponse(data: any): RewriteSuggestion[] {
    const rewrites = data?.rewrites || [];
    const out: RewriteSuggestion[] = [];
    for (const r of rewrites) {
      if (!r?.original || !r?.rewritten) continue;
      if (r.original.trim() === r.rewritten.trim()) continue;
      const changesIn: string[] = Array.isArray(r.changes) ? r.changes : [];
      const changes: RewriteSuggestion['changes'] = [];
      for (const c of changesIn) {
        // Try to parse "Replaced 'X' → 'Y'"
        const m = String(c).match(/['"]([^'"]+)['"][^'"]*['"]([^'"]+)['"]/);
        if (m) {
          changes.push({ from: m[1], to: m[2], reason: String(c) });
        } else {
          changes.push({ from: '', to: '', reason: String(c) });
        }
      }
      out.push({
        original: r.original,
        rewritten: r.rewritten,
        changes,
        confidence: r.confidence,
      });
    }
    return out.slice(0, 6);
  }

  // Run universal scan — calls GET /ats/scan which auto-loads the user's resume.
  // Then in parallel: fetch raw text → rewrite weak bullets, and run keyword density.
  async function runScan() {
    setLoading(true);
    setRewriteSuggestions([]);
    setKeywordCells([]);
    setV2Results(null);
    try {
      const res = await dilly.fetch('/ats/scan');
      const data = await res.json();

      if (!res.ok) {
        if (data.detail?.includes('No resume')) {
          setHasResume(false);
          Alert.alert('No resume found', 'Upload your resume first through New Audit or the Resume Editor.');
        } else {
          Alert.alert('Scan failed', data.detail || 'Could not run ATS scan.');
        }
        setLoading(false);
        return;
      }

      setHasResume(true);
      setScanResults(data);
      if (data?.v2) setV2Results(data.v2 as ATSScoreV2);

      // Kick off follow-on analyses in parallel — don't block the main score render.
      (async () => {
        try {
          const textRes = await dilly.fetch('/resume-text');
          const textJson = await textRes.json().catch(() => ({}));
          const rawText = textJson?.resume_text || '';
          if (!rawText || rawText.length < 100) return;

          // Keyword density (no JD — scan tab uses inferred keywords)
          dilly.fetch('/ats-keyword-density', {
            method: 'POST',
            body: JSON.stringify({ raw_text: rawText }),
          })
            .then(r => r.json())
            .then(density => setKeywordCells(mapKeywordCellsFromDensity(density)))
            .catch(() => {});

          // Bullet rewrites (pull top bullets from raw text, feed to /ats-rewrite)
          const bullets = extractBullets(rawText);
          if (bullets.length > 0) {
            const issues = (data.v2?.issues || []).map((i: any) => ({
              title: i.title, fix: i.fix, category: i.category, severity: i.severity,
            }));
            dilly.fetch('/ats-rewrite', {
              method: 'POST',
              body: JSON.stringify({ bullets, issues, use_llm: false }),
            })
              .then(r => r.json())
              .then(rw => setRewriteSuggestions(mapRewritesFromResponse(rw)))
              .catch(() => {});
          }
        } catch {}
      })();
    } catch (e: any) {
      Alert.alert('Scan failed', e.message || 'Could not run ATS scan.');
    }
    finally { setLoading(false); }
  }

  // Company lookup — find ATS system then auto-scan resume against it
  async function lookupCompany() {
    if (!companySearch.trim()) return;
    setCompanyLoading(true);
    setCompanyScanData(null);
    try {
      const res = await dilly.fetch(`/ats-company-lookup?company=${encodeURIComponent(companySearch.trim())}`);
      const data = await res.json();
      setCompanyResult(data);

      // If we found an ATS vendor, auto-scan the resume
      if (data.vendor_key) {
        setCompanyScanLoading(true);
        try {
          const scanRes = await dilly.fetch('/ats/scan');
          const scanData = await scanRes.json();
          if (scanRes.ok) {
            setCompanyScanData(scanData);
          }
        } catch { Alert.alert('Scan Error', 'Could not scan this company. Try again.'); }
        finally { setCompanyScanLoading(false); }
      }
    } catch {
      Alert.alert('Lookup failed', 'Could not find ATS information for that company.');
    }
    finally { setCompanyLoading(false); }
  }

  // Keyword match — posts both /ats-check (legacy shape for existing UI) and
  // /ats-keyword-density with the JD so we can render the heatmap + per-JD placement.
  async function runKeywordMatch() {
    if (!jdText.trim() || jdText.length < 50) {
      Alert.alert('Paste a job description', 'The description needs to be at least 50 characters.');
      return;
    }
    setMatchLoading(true);
    try {
      const [checkRes, textRes] = await Promise.all([
        dilly.fetch('/ats-check', {
          method: 'POST',
          body: JSON.stringify({ job_description: jdText }),
        }),
        dilly.fetch('/resume-text'),
      ]);
      const checkData = await checkRes.json();
      setKeywordResults(checkData);

      // Run density + JD match for the heatmap
      const textJson = await textRes.json().catch(() => ({}));
      const rawText = textJson?.resume_text || '';
      if (rawText && rawText.length >= 100) {
        const densityRes = await dilly.fetch('/ats-keyword-density', {
          method: 'POST',
          body: JSON.stringify({ raw_text: rawText, job_description: jdText }),
        });
        const density = await densityRes.json();

        // For JD mode, derive cells from jd_match.requirements (placement is explicit)
        const cells: KeywordCell[] = [];
        const jdMatch = density?.jd_match;
        if (jdMatch?.requirements) {
          for (const req of jdMatch.requirements) {
            const placement: KeywordCell['placement'] =
              req.placement === 'strong' ? 'strong' :
              req.placement === 'adequate' ? 'adequate' :
              req.placement === 'missing' ? 'missing' : 'weak';
            cells.push({
              keyword: req.keyword, count: req.count || 0, placement,
            });
          }
        }
        setKeywordCells(cells);
      }
    } catch {
      Alert.alert('Analysis failed', 'Could not analyze keywords.');
    }
    finally { setMatchLoading(false); }
  }

  // Fix with Dilly — opens AI overlay with full vendor context
  function fixWithDilly(systemName: string, issue: string, score?: number) {
    const p = profile as any;
    const firstName = p.name?.trim().split(/\s+/)[0] || 'there';
    const sys = ATS_SYSTEMS.find(s => s.name === systemName);
    const scoreNote = score != null ? ` (current score: ${score}/100)` : '';
    const strictness = sys ? `${sys.strictness} parsing` : '';

    // Store context for resume editor navigation
    const vendorKey = systemName.toLowerCase().replace(/\s+/g, '');
    const atsFixData = JSON.stringify({ vendor: systemName, vendorKey, issues: [issue] });

    openDillyOverlay({
      name: firstName,
      cohort: p.track || 'General',
      score: 0, smart: 0, grit: 0, build: 0, gap: 0, cohortBar: 75,
      referenceCompany: systemName,
      isPaid: true,
      initialMessage: [
        `My resume has an ATS compatibility issue with ${systemName}${scoreNote}.`,
        strictness ? `${systemName} uses ${strictness}.` : '',
        `The specific issue: "${issue}".`,
        `Explain exactly what I need to fix in my resume to improve my ${systemName} score. Be specific and actionable.`,
        `Then ask me if I want to go to my Resume Editor to apply these fixes.`,
        `[ATS_FIX_CTX:${atsFixData}]`,
      ].filter(Boolean).join(' '),
    });
  }

  // Navigate to resume editor with ATS fix context
  function openEditorWithFix(systemName: string, issues: string[]) {
    const vendorKey = systemName.toLowerCase().replace(/\s+/g, '');
    const sys = ATS_SYSTEMS.find(s => s.name === systemName);
    // Store context — mobile uses a simple key since no sessionStorage
    // We pass it via query params and global state
    const fixData = encodeURIComponent(JSON.stringify({
      vendor: systemName,
      vendorKey,
      issues,
      tips: [],
    }));
    router.push(`/resume-editor?ats_fix=1&ats_data=${fixData}`);
  }

  // Build mock scan results for display when we have vendor sim data
  function buildScoreCards() {
    if (!scanResults) return [];
    const vendors = scanResults.vendors || scanResults.results || {};
    return ATS_SYSTEMS.map(sys => {
      const v = vendors[sys.key] || {};
      return {
        system: sys,
        score: v.score ?? v.overall_score ?? 0,
        issues: v.issues || v.warnings || [],
      };
    });
  }

  // Build parse preview fields
  function buildParseFields() {
    if (!scanResults) return [];
    const parsed = scanResults.parsed_fields || scanResults.parse_preview || {};
    return [
      { label: 'Name', value: parsed.name || profile.name || '', ok: !!(parsed.name || profile.name) },
      { label: 'Email', value: parsed.email || '', ok: !!parsed.email },
      { label: 'Phone', value: parsed.phone || '', ok: !!parsed.phone },
      { label: 'Education', value: parsed.education || '', ok: !!parsed.education },
      { label: 'Experience', value: parsed.experience_count ? `${parsed.experience_count} entries found` : '', ok: !!parsed.experience_count },
      { label: 'Skills', value: parsed.skills_count ? `${parsed.skills_count} skills found` : '', ok: !!parsed.skills_count },
    ];
  }

  return (
    <View style={[ss.container, { paddingTop: insets.top }]}>

      {/* Nav */}
      <FadeInView delay={0}>
        <View style={ss.navBar}>
          <AnimatedPressable onPress={() => router.back()} scaleDown={0.9} hitSlop={12}>
            <Ionicons name="chevron-back" size={22} color={colors.t1} />
          </AnimatedPressable>
          <Text style={ss.navTitle}>ATS Scanner</Text>
          <View style={{ width: 22 }} />
        </View>
      </FadeInView>

      {/* Tab selector */}
      <FadeInView delay={40}>
        <View style={ss.tabRow}>
          {([
            { key: 'scan' as TabMode, label: 'Universal Scan', icon: 'shield-checkmark' },
            { key: 'company' as TabMode, label: 'Company', icon: 'business' },
            { key: 'match' as TabMode, label: 'Job Match', icon: 'git-compare' },
          ]).map(t => (
            <AnimatedPressable
              key={t.key}
              style={[ss.tab, tab === t.key && ss.tabActive]}
              onPress={() => setTab(t.key)}
              scaleDown={0.95}
            >
              <Ionicons name={t.icon as any} size={12} color={tab === t.key ? GOLD : colors.t3} />
              <Text style={[ss.tabText, tab === t.key && ss.tabTextActive]}>{t.label}</Text>
            </AnimatedPressable>
          ))}
        </View>
      </FadeInView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[ss.scroll, { paddingBottom: insets.bottom + 40 }]}>

        {/* ── Universal Scan ──────────────────────────────────────────── */}
        {tab === 'scan' && (
          <>
            <FadeInView delay={80}>
              <View style={ss.scanHeader}>
                <Ionicons name="shield-checkmark" size={20} color={GOLD} />
                <View>
                  <Text style={ss.scanTitle}>ATS Compatibility Check</Text>
                  <Text style={ss.scanSub}>See how your resume parses across all major ATS systems</Text>
                </View>
              </View>

              {!scanResults ? (
                <AnimatedPressable
                  style={[ss.scanBtn, loading && { opacity: 0.6 }]}
                  onPress={runScan}
                  disabled={loading}
                  scaleDown={0.97}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="scan" size={16} color="#FFFFFF" />
                      <Text style={ss.scanBtnText}>Scan My Resume</Text>
                    </>
                  )}
                </AnimatedPressable>
              ) : (
                <AnimatedPressable style={ss.rescanBtn} onPress={() => { setScanResults(null); runScan(); }} scaleDown={0.97}>
                  <Ionicons name="refresh" size={14} color={GOLD} />
                  <Text style={ss.rescanBtnText}>Re-scan</Text>
                </AnimatedPressable>
              )}
            </FadeInView>

            {scanResults && (
              <>
                {/* v2 deep scan — hero, red flags, global fixes, per-vendor breakdown,
                    rewrites, and keyword heatmap. Falls back to legacy score cards
                    when v2 isn't present (e.g. backend rolled back). */}
                {v2Results ? (
                  <FadeInView delay={100}>
                    <ATSDeepScan
                      v2={v2Results}
                      rewrites={rewriteSuggestions}
                      keywords={keywordCells}
                      onFixPress={(vendorName, iss) => fixWithDilly(vendorName, iss.title, undefined)}
                    />
                  </FadeInView>
                ) : (
                  <>
                    {/* Legacy fallback */}
                    <FadeInView delay={100}>
                      <View style={ss.gridWrap}>
                        {buildScoreCards().map(({ system, score, issues }) => (
                          <ATSScoreCard
                            key={system.key}
                            system={system}
                            score={score}
                            issues={issues}
                            onFix={fixWithDilly}
                            onFixInEditor={openEditorWithFix}
                          />
                        ))}
                      </View>
                    </FadeInView>
                    <FadeInView delay={200}>
                      <ParsePreview fields={buildParseFields()} />
                    </FadeInView>
                  </>
                )}

                {/* Overall advice */}
                <FadeInView delay={300}>
                  <View style={ss.adviceCard}>
                    <Ionicons name="bulb" size={14} color={GOLD} />
                    <Text style={ss.adviceText}>
                      For maximum ATS compatibility: use a single-column layout, standard section headers (Education, Experience, Skills), avoid tables and text boxes, and save as PDF with selectable text.
                    </Text>
                  </View>
                </FadeInView>
              </>
            )}
          </>
        )}

        {/* ── Company Lookup ──────────────────────────────────────────── */}
        {tab === 'company' && (
          <>
            <FadeInView delay={80}>
              <View style={ss.scanHeader}>
                <Ionicons name="business" size={20} color={GOLD} />
                <View>
                  <Text style={ss.scanTitle}>Company ATS Breakdown</Text>
                  <Text style={ss.scanSub}>See exactly what a company's ATS sees on your resume</Text>
                </View>
              </View>

              <View style={ss.companySearchWrap}>
                <Ionicons name="search" size={16} color={colors.t3} />
                <TextInput
                  style={ss.companySearchInput}
                  value={companySearch}
                  onChangeText={setCompanySearch}
                  placeholder="Type a company name..."
                  placeholderTextColor={colors.t3}
                  returnKeyType="search"
                  onSubmitEditing={lookupCompany}
                />
                <AnimatedPressable style={ss.companySearchBtn} onPress={lookupCompany} disabled={companyLoading} scaleDown={0.95}>
                  {companyLoading ? <ActivityIndicator size="small" color={GOLD} /> : <Ionicons name="arrow-forward" size={16} color={GOLD} />}
                </AnimatedPressable>
              </View>
            </FadeInView>

            {companyResult && companyResult.vendor_name && (
              <>
                {/* Company + ATS header */}
                <FadeInView delay={100}>
                  <View style={ss.companyCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <Text style={ss.companyName}>{companyResult.company || companySearch}</Text>
                      {companyScanData && (() => {
                        const vendorKey = companyResult.vendor_key;
                        const vendorData = companyScanData.vendors?.[vendorKey];
                        const score = vendorData?.score ?? 0;
                        const color = scoreColor(score);
                        return (
                          <View style={[ss.scoreBadge, { backgroundColor: color + '15', borderColor: color + '30' }]}>
                            <Text style={[ss.scoreBadgeText, { color }]}>{score}%</Text>
                          </View>
                        );
                      })()}
                    </View>
                    <View style={ss.companyAtsRow}>
                      <Text style={ss.companyAtsLabel}>ATS System:</Text>
                      <View style={[ss.companyAtsBadge, { backgroundColor: BLUE + '15', borderColor: BLUE + '30' }]}>
                        <Text style={[ss.companyAtsBadgeText, { color: BLUE }]}>{companyResult.vendor_name}</Text>
                      </View>
                      {(() => {
                        const sys = ATS_SYSTEMS.find(s => s.key === companyResult.vendor_key);
                        if (!sys) return null;
                        const strictColor = sys.strictness === 'Strict' ? CORAL : sys.strictness === 'Moderate' ? AMBER : GREEN;
                        return (
                          <View style={[ss.companyAtsBadge, { backgroundColor: strictColor + '15', borderColor: strictColor + '30', marginLeft: 6 }]}>
                            <Text style={[ss.companyAtsBadgeText, { color: strictColor }]}>{sys.strictness}</Text>
                          </View>
                        );
                      })()}
                    </View>
                  </View>
                </FadeInView>

                {/* Loading scan */}
                {companyScanLoading && (
                  <FadeInView delay={120}>
                    <View style={{ alignItems: 'center', padding: 24 }}>
                      <ActivityIndicator size="small" color={GOLD} />
                      <Text style={{ fontSize: 12, color: colors.t3, marginTop: 8 }}>Scanning your resume against {companyResult.vendor_name}...</Text>
                    </View>
                  </FadeInView>
                )}

                {/* Deep breakdown */}
                {companyScanData && (() => {
                  const vendorKey = companyResult.vendor_key;
                  const vendorData = companyScanData.vendors?.[vendorKey];
                  if (!vendorData) return null;
                  const score = vendorData.score ?? 0;
                  const issues = vendorData.issues || [];
                  const passed = vendorData.passed || [];
                  const parsed = companyScanData.parsed_fields || {};
                  const color = scoreColor(score);
                  const sys = ATS_SYSTEMS.find(s => s.key === vendorKey);

                  return (
                    <>
                      {/* Score bar */}
                      <FadeInView delay={140}>
                        <View style={ss.companyBreakdownCard}>
                          <Text style={ss.breakdownTitle}>{companyResult.vendor_name} COMPATIBILITY</Text>
                          <View style={ss.scoreBar}>
                            <View style={[ss.scoreBarFill, { width: `${score}%`, backgroundColor: color }]} />
                          </View>
                          <Text style={[ss.breakdownScore, { color }]}>
                            {score >= 85 ? 'Your resume parses well on ' + companyResult.vendor_name
                              : score >= 70 ? 'Some issues detected — fixable'
                              : 'Significant issues — fix before applying'}
                          </Text>
                        </View>
                      </FadeInView>

                      {/* What the ATS sees */}
                      <FadeInView delay={180}>
                        <View style={ss.parseCard}>
                          <Text style={ss.parseTitleText}>WHAT {companyResult.vendor_name.toUpperCase()} SEES</Text>
                          {[
                            { label: 'Name', value: parsed.name || profile.name || '', ok: !!(parsed.name || profile.name) },
                            { label: 'Email', value: parsed.email || '', ok: !!parsed.email },
                            { label: 'Phone', value: parsed.phone || '', ok: !!parsed.phone },
                            { label: 'Education', value: parsed.education || '', ok: !!parsed.education },
                            { label: 'Experience', value: parsed.experience_count ? `${parsed.experience_count} entries` : '', ok: !!parsed.experience_count },
                            { label: 'Skills', value: parsed.skills_count ? `${parsed.skills_count} skills` : '', ok: !!parsed.skills_count },
                          ].map((f, i) => (
                            <View key={i} style={ss.parseRow}>
                              <Ionicons name={f.ok ? 'checkmark-circle' : 'close-circle'} size={14} color={f.ok ? GREEN : CORAL} />
                              <Text style={ss.parseLabel}>{f.label}:</Text>
                              <Text style={[ss.parseValue, !f.ok && { color: CORAL }]} numberOfLines={1}>{f.value || 'Not found'}</Text>
                            </View>
                          ))}
                        </View>
                      </FadeInView>

                      {/* Issues */}
                      {issues.length > 0 && (
                        <FadeInView delay={220}>
                          <View style={ss.companyBreakdownCard}>
                            <Text style={[ss.breakdownTitle, { color: CORAL }]}>ISSUES FOR {companyResult.vendor_name.toUpperCase()}</Text>
                            {issues.map((issue: string, i: number) => (
                              <View key={i} style={ss.issueRow}>
                                <Ionicons name="alert-circle" size={13} color={CORAL} />
                                <Text style={ss.issueText}>{issue}</Text>
                                <AnimatedPressable style={ss.fixBtn} onPress={() => fixWithDilly(companyResult.vendor_name, issue)} scaleDown={0.95}>
                                  <Text style={ss.fixBtnText}>Fix</Text>
                                </AnimatedPressable>
                              </View>
                            ))}
                          </View>
                        </FadeInView>
                      )}

                      {/* What passed */}
                      {passed.length > 0 && (
                        <FadeInView delay={260}>
                          <View style={ss.companyBreakdownCard}>
                            <Text style={[ss.breakdownTitle, { color: GREEN }]}>PASSING</Text>
                            {passed.map((p: string, i: number) => (
                              <View key={i} style={ss.allGoodRow}>
                                <Ionicons name="checkmark-circle" size={13} color={GREEN} />
                                <Text style={ss.allGoodText}>{p}</Text>
                              </View>
                            ))}
                          </View>
                        </FadeInView>
                      )}

                      {/* Fix all with Dilly */}
                      <FadeInView delay={300}>
                        <AnimatedPressable
                          style={ss.fixAllBtn}
                          onPress={() => {
                            const p = profile as any;
                            const firstName = p.name?.trim().split(/\s+/)[0] || 'there';
                            const issueList = issues.join('; ');
                            openDillyOverlay({
                              name: firstName,
                              cohort: p.track || 'General',
                              score: 0, smart: 0, grit: 0, build: 0, gap: 0, cohortBar: 75,
                              referenceCompany: companyResult.company || companySearch,
                              isPaid: true,
                              initialMessage: `I'm applying to ${companyResult.company || companySearch}, which uses ${companyResult.vendor_name} (${sys?.strictness || 'unknown'} parsing). My resume scored ${score}% on ${companyResult.vendor_name}. Here are the issues: ${issueList}. What specific formatting and content changes should I make to pass ${companyResult.vendor_name}'s ATS filter?`,
                            });
                          }}
                          scaleDown={0.97}
                        >
                          <Ionicons name="chatbubble" size={14} color={GOLD} />
                          <Text style={ss.fixAllBtnText}>Fix all issues with Dilly</Text>
                        </AnimatedPressable>
                      </FadeInView>

                      {/* Advice card */}
                      <FadeInView delay={340}>
                        <View style={ss.adviceCard}>
                          <Ionicons name="bulb" size={14} color={GOLD} />
                          <Text style={ss.adviceText}>
                            {companyResult.vendor_key === 'workday' || companyResult.vendor_key === 'taleo'
                              ? `${companyResult.vendor_name} is strict. Use a single-column layout, standard section headers (Education, Experience, Skills), no tables or text boxes, and save as PDF with selectable text. Contact info must be in the body, not a header.`
                              : companyResult.vendor_key === 'icims'
                              ? `${companyResult.vendor_name} needs skills listed individually (not in paragraphs) and standard date formats (Month YYYY). Avoid creative section headers.`
                              : `${companyResult.vendor_name} is lenient and handles most formats well. Focus on content quality and keyword density rather than formatting.`}
                          </Text>
                        </View>
                      </FadeInView>
                    </>
                  );
                })()}
              </>
            )}

            {companyResult && !companyResult.vendor_name && (
              <FadeInView delay={100}>
                <View style={ss.companyCard}>
                  <Text style={ss.companyName}>{companySearch}</Text>
                  <Text style={ss.companyNotFound}>
                    We don't have ATS data for this company yet. Try checking their careers page URL for clues (greenhouse.io, myworkdayjobs.com, etc.)
                  </Text>
                </View>
              </FadeInView>
            )}

            {/* Popular companies */}
            <FadeInView delay={!companyResult ? 150 : 380}>
              <Text style={ss.popularTitle}>POPULAR LOOKUPS</Text>
              <View style={ss.popularGrid}>
                {['Google', 'Goldman Sachs', 'Amazon', 'Apple', 'JPMorgan', 'Meta', 'Netflix', 'Microsoft', 'Deloitte', 'McKinsey', 'Stripe', 'Tesla'].map(c => (
                  <AnimatedPressable
                    key={c}
                    style={ss.popularChip}
                    onPress={() => { setCompanySearch(c); setCompanyResult(null); setCompanyScanData(null); }}
                    scaleDown={0.95}
                  >
                    <Text style={ss.popularChipText}>{c}</Text>
                  </AnimatedPressable>
                ))}
              </View>
            </FadeInView>
          </>
        )}

        {/* ── Job Match ───────────────────────────────────────────────── */}
        {tab === 'match' && (
          <>
            <FadeInView delay={80}>
              <View style={ss.scanHeader}>
                <Ionicons name="git-compare" size={20} color={GOLD} />
                <View>
                  <Text style={ss.scanTitle}>Keyword Match</Text>
                  <Text style={ss.scanSub}>Compare your resume against a specific job description</Text>
                </View>
              </View>

              <TextInput
                style={ss.jdInput}
                value={jdText}
                onChangeText={setJdText}
                placeholder="Paste the full job description here..."
                placeholderTextColor={colors.t3}
                multiline
                textAlignVertical="top"
              />

              <AnimatedPressable
                style={[ss.scanBtn, (matchLoading || jdText.length < 50) && { opacity: 0.6 }]}
                onPress={runKeywordMatch}
                disabled={matchLoading || jdText.length < 50}
                scaleDown={0.97}
              >
                {matchLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="analytics" size={16} color="#FFFFFF" />
                    <Text style={ss.scanBtnText}>Analyze Keywords</Text>
                  </>
                )}
              </AnimatedPressable>
            </FadeInView>

            {keywordResults && (
              <FadeInView delay={100}>
                {/* Ready status */}
                <View style={[ss.readyCard, { borderColor: keywordResults.ready ? GREEN + '30' : CORAL + '30' }]}>
                  <Ionicons name={keywordResults.ready ? 'checkmark-circle' : 'alert-circle'} size={18} color={keywordResults.ready ? GREEN : CORAL} />
                  <Text style={[ss.readyText, { color: keywordResults.ready ? GREEN : CORAL }]}>
                    {keywordResults.ready ? 'Your resume has good keyword coverage for this role' : 'Missing critical keywords for this role'}
                  </Text>
                </View>

                {/* Missing keywords */}
                {keywordResults.missing && keywordResults.missing.length > 0 && (
                  <View style={ss.missingCard}>
                    <Text style={ss.missingSectionTitle}>MISSING KEYWORDS</Text>
                    {keywordResults.missing.map((kw: string, i: number) => (
                      <KeywordRow key={i} keyword={kw} count={0} status="missing" />
                    ))}
                  </View>
                )}

                {/* Suggestions */}
                {keywordResults.suggestions && keywordResults.suggestions.length > 0 && (
                  <View style={ss.suggestionsCard}>
                    <Text style={ss.missingSectionTitle}>SUGGESTIONS</Text>
                    {keywordResults.suggestions.map((s: string, i: number) => (
                      <View key={i} style={ss.suggestionRow}>
                        <Ionicons name="flash" size={12} color={GOLD} />
                        <Text style={ss.suggestionText}>{s}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Fix all with Dilly */}
                <AnimatedPressable
                  style={ss.fixAllBtn}
                  onPress={() => {
                    const missing = (keywordResults.missing || []).join(', ');
                    const p = profile as any;
                    openDillyOverlay({
                      name: p.name?.trim().split(/\s+/)[0] || 'there',
                      cohort: p.track || 'General',
                      score: 0, smart: 0, grit: 0, build: 0, gap: 0, cohortBar: 75,
                      isPaid: true,
                      initialMessage: `I'm missing these keywords from my resume for a job I want to apply to: ${missing}. Help me naturally incorporate them into my existing bullet points without keyword stuffing. Here's the job description: ${jdText.slice(0, 500)}`,
                    });
                  }}
                  scaleDown={0.97}
                >
                  <Ionicons name="chatbubble" size={14} color={GOLD} />
                  <Text style={ss.fixAllBtnText}>Fix all with Dilly</Text>
                </AnimatedPressable>
              </FadeInView>
            )}
          </>
        )}

      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.b1 },
  navTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 14, letterSpacing: 1, color: colors.t1 },
  scroll: { paddingHorizontal: spacing.xl, paddingTop: 16 },

  // Tabs
  tabRow: { flexDirection: 'row', gap: 6, paddingHorizontal: spacing.xl, paddingVertical: 10 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: colors.s3, borderRadius: 10, borderWidth: 1, borderColor: colors.b1, paddingVertical: 9 },
  tabActive: { backgroundColor: GOLD + '15', borderColor: GOLD + '35' },
  tabText: { fontSize: 10, fontWeight: '600', color: colors.t3 },
  tabTextActive: { color: GOLD },

  // Scan header
  scanHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  scanTitle: { fontSize: 16, fontWeight: '700', color: colors.t1 },
  scanSub: { fontSize: 12, color: colors.t3, marginTop: 2, lineHeight: 17 },

  // Scan button
  scanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: GOLD, borderRadius: 14, paddingVertical: 15, marginBottom: 16, shadowColor: GOLD, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
  scanBtnText: { fontFamily: 'Cinzel_700Bold', fontSize: 13, letterSpacing: 0.5, color: '#FFFFFF' },
  rescanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: GOLD + '40', borderRadius: 12, paddingVertical: 10, marginBottom: 16 },
  rescanBtnText: { fontSize: 12, color: GOLD, fontWeight: '600' },

  // Score cards
  gridWrap: { gap: 10, marginBottom: 16 },
  scoreCard: { backgroundColor: colors.s2, borderRadius: 14, borderWidth: 1, borderColor: colors.b1, padding: 14 },
  scoreCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  systemDot: { width: 10, height: 10, borderRadius: 5 },
  systemName: { fontSize: 14, fontWeight: '700', color: colors.t1 },
  systemStrictness: { fontSize: 10, color: colors.t3, marginTop: 1 },
  scoreBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  scoreBadgeText: { fontSize: 14, fontWeight: '800' },
  scoreBar: { height: 4, backgroundColor: colors.b1, borderRadius: 999, overflow: 'hidden' },
  scoreBarFill: { height: '100%', borderRadius: 999 },
  scoreCardExpanded: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.b1, paddingTop: 10 },
  usedByText: { fontSize: 10, color: colors.t3, marginBottom: 8 },
  issuesTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1.5, color: CORAL, marginBottom: 8 },
  issueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  issueText: { flex: 1, fontSize: 11, color: colors.t2, lineHeight: 16 },
  fixBtn: { backgroundColor: GOLD + '15', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  fixBtnText: { fontSize: 9, fontWeight: '700', color: GOLD },
  applyEditorBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: GOLD, borderRadius: 10, paddingVertical: 9, marginTop: 8 },
  applyEditorBtnText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  allGoodRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  allGoodText: { fontSize: 12, color: GREEN },

  // Parse preview
  parseCard: { backgroundColor: colors.s2, borderRadius: 14, borderWidth: 1, borderColor: colors.b1, padding: 14, marginBottom: 16 },
  parseTitleText: { fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1.5, color: GOLD, marginBottom: 10 },
  parseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  parseLabel: { fontSize: 11, fontWeight: '700', color: colors.t2, width: 70 },
  parseValue: { flex: 1, fontSize: 11, color: colors.t1 },

  // Advice
  adviceCard: { flexDirection: 'row', gap: 10, backgroundColor: 'rgba(201,168,76,0.06)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(201,168,76,0.15)', padding: 14, marginBottom: 16, alignItems: 'flex-start' },
  adviceText: { flex: 1, fontSize: 11, color: colors.t2, lineHeight: 17 },

  // Company lookup
  companySearchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.s2, borderRadius: 12, borderWidth: 1, borderColor: colors.b1, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 16 },
  companySearchInput: { flex: 1, fontSize: 15, color: colors.t1, paddingVertical: 10 },
  companySearchBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: GOLD + '15', alignItems: 'center', justifyContent: 'center' },
  companyCard: { backgroundColor: colors.s2, borderRadius: 14, borderWidth: 1, borderColor: colors.b1, padding: 16, marginBottom: 16 },
  companyName: { fontSize: 18, fontWeight: '700', color: colors.t1, marginBottom: 10 },
  companyAtsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  companyAtsLabel: { fontSize: 12, color: colors.t3 },
  companyAtsBadge: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  companyAtsBadgeText: { fontSize: 12, fontWeight: '700' },
  companyAdvice: { fontSize: 12, color: colors.t2, lineHeight: 18, marginBottom: 12 },
  companyScanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: GOLD, borderRadius: 11, paddingVertical: 11 },
  companyScanBtnText: { fontFamily: 'Cinzel_700Bold', fontSize: 11, letterSpacing: 0.3, color: '#FFFFFF' },
  companyNotFound: { fontSize: 12, color: colors.t3, lineHeight: 18 },
  companyBreakdownCard: { backgroundColor: colors.s2, borderRadius: 14, borderWidth: 1, borderColor: colors.b1, padding: 14, marginBottom: 12 },
  breakdownTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1.5, color: GOLD, marginBottom: 10 },
  breakdownScore: { fontSize: 12, fontWeight: '600', marginTop: 8 },
  popularTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1.5, color: GOLD, marginBottom: 8, marginTop: 8 },
  popularGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  popularChip: { backgroundColor: colors.s3, borderRadius: 8, borderWidth: 1, borderColor: colors.b1, paddingHorizontal: 10, paddingVertical: 6 },
  popularChipText: { fontSize: 11, color: colors.t2, fontWeight: '500' },

  // Job match
  jdInput: { backgroundColor: colors.s2, borderRadius: 14, borderWidth: 1, borderColor: colors.b1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, color: colors.t1, minHeight: 120, marginBottom: 12, lineHeight: 20 },
  readyCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.s2, borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12 },
  readyText: { flex: 1, fontSize: 13, fontWeight: '600' },
  missingCard: { backgroundColor: colors.s2, borderRadius: 14, borderWidth: 1, borderColor: colors.b1, padding: 14, marginBottom: 12 },
  missingSectionTitle: { fontFamily: 'Cinzel_700Bold', fontSize: 8, letterSpacing: 1.5, color: CORAL, marginBottom: 10 },
  keywordRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  keywordText: { flex: 1, fontSize: 12, color: colors.t1, fontWeight: '600' },
  keywordCount: { fontSize: 10, fontWeight: '700' },
  keywordBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  keywordBadgeText: { fontSize: 8, fontWeight: '700', textTransform: 'uppercase' },
  suggestionsCard: { backgroundColor: colors.s2, borderRadius: 14, borderWidth: 1, borderColor: colors.b1, padding: 14, marginBottom: 12 },
  suggestionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  suggestionText: { flex: 1, fontSize: 12, color: colors.t2, lineHeight: 17 },
  fixAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: GOLD + '40', borderRadius: 12, paddingVertical: 12, marginBottom: 16 },
  fixAllBtnText: { fontSize: 13, fontWeight: '700', color: GOLD },
});