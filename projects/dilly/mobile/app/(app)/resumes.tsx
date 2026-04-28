/**
 * Resumes — beautifully built gallery of every tailored resume the
 * user has generated. Replaces the inline list that lived in My Dilly.
 *
 * Layout:
 *   - Hero: total count + "Tailored to your Profile" subtitle
 *   - Filter chips (All / Recent / By company)
 *   - Card grid: each card shows a styled "page" preview thumbnail
 *     with the company name, role, date, ATS chip, sourced %.
 *   - Tap → /resume-generate?viewId=<id>
 *
 * Design notes:
 *   - Cards have a paper-like cream surface even on dark themes so
 *     the "resume document" metaphor reads instantly.
 *   - Truth Ledger sourced % shown prominently when available — it's
 *     the moat indicator and we want users to see it on the gallery,
 *     not just the editor.
 */
import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Linking, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { dilly } from '../../lib/dilly';
import { useResolvedTheme } from '../../hooks/useTheme';
import { DillyFace } from '../../components/DillyFace';
import { FadeInView } from '../../components/FadeInView';

interface GeneratedResume {
  id: string;
  job_title: string;
  company: string;
  ats_system?: string;
  ats_parse_score?: number;
  keyword_coverage_pct?: number;
  truth_ledger?: { sourced_pct?: number; total_bullets?: number; sourced_bullets?: number; fully_sourced?: boolean };
  created_at: string;
  share_token?: string;
  share_url?: string;
}

export default function ResumesGallery() {
  const insets = useSafeAreaInsets();
  const theme = useResolvedTheme();
  const [resumes, setResumes] = useState<GeneratedResume[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await dilly.get('/generated-resumes');
      const list: GeneratedResume[] = data?.resumes || data?.items || data || [];
      if (Array.isArray(list)) {
        // Sort newest first.
        list.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
        setResumes(list);
      }
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function open(r: GeneratedResume) {
    Linking.openURL(`dilly:///(app)/resume-generate?viewId=${encodeURIComponent(r.id)}`);
  }

  async function shareResume(r: GeneratedResume) {
    try {
      const url = r.share_url || `https://trydilly.com/r/${r.share_token || r.id}`;
      await Share.share({
        message: `${r.job_title} at ${r.company} — tailored with Dilly: ${url}`,
        url,
      });
    } catch {}
  }

  async function deleteResume(id: string) {
    try {
      await dilly.fetch(`/generated-resumes/${id}`, { method: 'DELETE' });
      setResumes(prev => prev.filter(r => r.id !== id));
    } catch {}
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.surface.bg, alignItems: 'center', justifyContent: 'center' }}>
        <DillyFace size={88} mood="thoughtful" />
        <Text style={{ marginTop: 16, fontSize: 13, color: theme.surface.t2 }}>Loading your library…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.surface.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: insets.bottom + 80, paddingHorizontal: 18 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={theme.accent}
          />
        }
      >
        <FadeInView delay={0}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
              <Ionicons name="chevron-back" size={24} color={theme.surface.t1} />
            </TouchableOpacity>
            <Text style={{
              fontFamily: theme.type.display,
              fontSize: 24, fontWeight: '800',
              color: theme.surface.t1,
              letterSpacing: 0.4,
            }}>
              My Resumes
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: theme.surface.t2, lineHeight: 18, marginBottom: 18 }}>
            {resumes.length === 0
              ? "You haven't tailored a resume yet."
              : `${resumes.length} tailored ${resumes.length === 1 ? 'resume' : 'resumes'}, each grounded in your Dilly Profile.`}
          </Text>
        </FadeInView>

        {/* Empty state */}
        {resumes.length === 0 && (
          <FadeInView delay={120}>
            <View style={{
              backgroundColor: theme.surface.s1, borderColor: theme.surface.border,
              borderWidth: 1, borderRadius: 14, padding: 22, alignItems: 'center', gap: 12,
              marginTop: 16,
            }}>
              <Ionicons name="document-text-outline" size={32} color={theme.surface.t3} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: theme.surface.t1, textAlign: 'center' }}>
                Tailor your first resume
              </Text>
              <Text style={{ fontSize: 12, color: theme.surface.t2, textAlign: 'center', lineHeight: 17 }}>
                Pick a job, paste the JD, and Dilly turns your Profile into a sourced one-pager.
              </Text>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => router.push('/(app)/resume-generate' as any)}
                style={{
                  backgroundColor: theme.accent,
                  paddingHorizontal: 22, paddingVertical: 11,
                  borderRadius: 22,
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  marginTop: 4,
                }}
              >
                <Ionicons name="add" size={14} color="#FFF" />
                <Text style={{ color: '#FFF', fontSize: 13, fontWeight: '800' }}>
                  Tailor a resume
                </Text>
              </TouchableOpacity>
            </View>
          </FadeInView>
        )}

        {/* Card grid — single column for clarity (each card is rich) */}
        <View style={{ gap: 12 }}>
          {resumes.map((r, i) => {
            const date = new Date(r.created_at);
            const dateStr = date.toLocaleString('default', { month: 'short', day: 'numeric', year: 'numeric' });
            const sourcedPct = r.truth_ledger?.sourced_pct;
            const fullySourced = !!r.truth_ledger?.fully_sourced;
            return (
              <FadeInView key={r.id} delay={120 + i * 40}>
                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={() => open(r)}
                  style={{
                    backgroundColor: theme.surface.s1,
                    borderColor: theme.surface.border,
                    borderWidth: 1, borderRadius: 16,
                    overflow: 'hidden',
                    shadowColor: '#000',
                    shadowOpacity: 0.06,
                    shadowOffset: { width: 0, height: 4 },
                    shadowRadius: 10,
                    elevation: 2,
                  }}
                >
                  {/* Page-like preview band: cream rectangle that
                      reads as "a resume document" with stylized lines
                      drawn as solid bars. Persistent across themes so
                      the metaphor is unmistakable. */}
                  <View style={{
                    backgroundColor: '#FAF7F0',
                    paddingHorizontal: 18, paddingTop: 16, paddingBottom: 14,
                    borderBottomWidth: 1, borderBottomColor: '#E8E1D2',
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <Text style={{ fontSize: 11, fontWeight: '900', letterSpacing: 1.2, color: '#7C7368' }}>
                        TAILORED RESUME
                      </Text>
                      {sourcedPct !== undefined && (
                        <View style={{
                          flexDirection: 'row', alignItems: 'center', gap: 3,
                          paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
                          backgroundColor: fullySourced ? '#DCFCE7' : '#FEF3C7',
                        }}>
                          <Ionicons
                            name={fullySourced ? 'shield-checkmark' : 'shield-half'}
                            size={9}
                            color={fullySourced ? '#15803D' : '#92400E'}
                          />
                          <Text style={{ fontSize: 9, fontWeight: '800', color: fullySourced ? '#15803D' : '#92400E', letterSpacing: 0.3 }}>
                            {sourcedPct}% SOURCED
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Faux page lines — simulate text bars */}
                    <View style={{ gap: 4, opacity: 0.35 }}>
                      <View style={{ height: 6, borderRadius: 3, backgroundColor: '#3A2912', width: '78%' }} />
                      <View style={{ height: 4, borderRadius: 2, backgroundColor: '#3A2912', width: '42%' }} />
                      <View style={{ height: 1, backgroundColor: '#3A2912', marginTop: 6, marginBottom: 4 }} />
                      <View style={{ height: 4, borderRadius: 2, backgroundColor: '#3A2912', width: '92%' }} />
                      <View style={{ height: 4, borderRadius: 2, backgroundColor: '#3A2912', width: '85%' }} />
                      <View style={{ height: 4, borderRadius: 2, backgroundColor: '#3A2912', width: '70%' }} />
                    </View>
                  </View>

                  {/* Detail row */}
                  <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: theme.surface.t1, fontFamily: theme.type.body }} numberOfLines={1}>
                        {r.job_title}
                      </Text>
                      <Text style={{ fontSize: 12, color: theme.surface.t2 }} numberOfLines={1}>
                        {r.company} · {dateStr}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                        {r.ats_system ? (
                          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: theme.surface.s2 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: theme.surface.t3, textTransform: 'capitalize' }}>
                              {r.ats_system}
                            </Text>
                          </View>
                        ) : null}
                        {r.keyword_coverage_pct !== undefined && r.keyword_coverage_pct > 0 ? (
                          <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: theme.accentSoft }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: theme.accent }}>
                              {r.keyword_coverage_pct}% keyword match
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <TouchableOpacity
                      hitSlop={10}
                      onPress={(e) => { e.stopPropagation?.(); shareResume(r); }}
                      style={{
                        width: 32, height: 32, borderRadius: 16,
                        backgroundColor: theme.accentSoft,
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="share-outline" size={15} color={theme.accent} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      hitSlop={10}
                      onPress={(e) => { e.stopPropagation?.(); deleteResume(r.id); }}
                      style={{
                        width: 32, height: 32, borderRadius: 16,
                        backgroundColor: theme.surface.s2,
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="trash-outline" size={14} color={theme.surface.t3} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              </FadeInView>
            );
          })}
        </View>

        {/* Footer CTA — always visible at bottom so library is one tap from "tailor another" */}
        {resumes.length > 0 && (
          <FadeInView delay={200 + resumes.length * 40}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => router.push('/(app)/resume-generate' as any)}
              style={{
                marginTop: 22,
                backgroundColor: theme.accent,
                paddingVertical: 14, borderRadius: 12,
                alignItems: 'center',
                flexDirection: 'row', justifyContent: 'center', gap: 6,
              }}
            >
              <Ionicons name="add" size={15} color="#FFF" />
              <Text style={{ color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.3 }}>
                Tailor another resume
              </Text>
            </TouchableOpacity>
          </FadeInView>
        )}
      </ScrollView>
    </View>
  );
}
