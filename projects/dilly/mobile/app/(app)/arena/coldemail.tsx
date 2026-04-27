/**
 * Cold Email Studio - student tile. A template with four real
 * inputs (name, hook, fact, ask) that produces a real cold email
 * copy-ready to send. Seeds Dilly chat if the student needs
 * help filling a slot.
 */

import { useEffect, useState, useMemo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Share } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { dilly } from '../../../lib/dilly'
import { useResolvedTheme } from '../../../hooks/useTheme'
import ArenaPage from '../../../components/arena/ArenaPage'
import { openDillyOverlay } from '../../../hooks/useDillyOverlay'
import { resolvePlaybook, type CohortPlaybook } from '../../../lib/arena/cohort-playbook'
import { showToast } from '../../../lib/globalToast';

export default function ColdEmailStudio() {
  const theme = useResolvedTheme()
  const [profile, setProfile] = useState<any>(null)
  const [to, setTo] = useState('')
  const [hook, setHook] = useState('')
  const [fact, setFact] = useState('')
  const [ask, setAsk] = useState('a 20-minute call next week')

  useEffect(() => {
    (async () => {
      const prof = await dilly.get('/profile').catch(() => null)
      setProfile(prof)
    })()
  }, [])

  const playbook = useMemo<CohortPlaybook>(
    () => resolvePlaybook(profile?.cohorts || []),
    [profile],
  )

  const draft = useMemo(() => {
    const fname = profile?.first_name || ''
    const recipient = to.trim() || '[Their first name]'
    const hookLine = hook.trim()
      || `I've been following your work in ${playbook.shortName} for a while, and the thing you shipped recently hit a problem I've been chewing on too`
    const factLine = fact.trim()
      || `As a ${playbook.shortName} student, I've been building [one specific project or experience]`
    const askLine = ask.trim() || 'a 20-minute call next week'
    return [
      `Hi ${recipient},`,
      '',
      `${hookLine}.`,
      '',
      `${factLine}.`,
      '',
      `Would you be open to ${askLine}? I'll bring one specific question, not a general "pick your brain."`,
      '',
      `Thanks for reading${fname ? ',\n' + fname : '.'}`,
    ].join('\n')
  }, [to, hook, fact, ask, profile, playbook])

  const copy = async () => {
    await Clipboard.setStringAsync(draft)
    showToast({ message: 'The email draft is on your clipboard.', type: 'info' })
  }

  return (
    <ArenaPage
      eyebrow="COLD EMAIL · STUDIO"
      title="Four lines. Real names. Copy + send."
      subtitle="The best cold email is short, specific, and has one real ask. Fill the four slots."
    >
      <View style={{ paddingHorizontal: 16 }}>
        <Field theme={theme} label="TO" hint="First name" value={to} onChange={setTo} />
        <Field theme={theme} label="HOOK" hint="Why you noticed them" value={hook} onChange={setHook} multiline />
        <Field theme={theme} label="FACT" hint="One specific thing about you" value={fact} onChange={setFact} multiline />
        <Field theme={theme} label="ASK" hint="One concrete ask" value={ask} onChange={setAsk} />
      </View>

      <View style={[s.draft, { backgroundColor: theme.surface.s1, borderColor: theme.accentBorder }]}>
        <Text style={[s.draftLabel, { color: theme.accent }]}>YOUR EMAIL</Text>
        <Text style={[s.draftText, { color: theme.surface.t1 }]}>{draft}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={copy}
            style={[s.btn, { backgroundColor: theme.accent }]}
          >
            <Ionicons name="copy" size={13} color="#FFF" />
            <Text style={s.btnText}>Copy</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => Share.share({ message: draft })}
            style={[s.btnGhost, { borderColor: theme.accentBorder }]}
          >
            <Ionicons name="share-outline" size={13} color={theme.accent} />
            <Text style={[s.btnGhostText, { color: theme.surface.t1 }]}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => openDillyOverlay({ initialMessage: `Help me sharpen this cold email. Make it shorter and more specific. Push back on weak wording.\n\n${draft}` })}
            style={[s.btnGhost, { borderColor: theme.accentBorder }]}
          >
            <Ionicons name="sparkles" size={13} color={theme.accent} />
            <Text style={[s.btnGhostText, { color: theme.surface.t1 }]}>Sharpen</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ArenaPage>
  )
}

function Field({
  theme, label, hint, value, onChange, multiline,
}: {
  theme: ReturnType<typeof useResolvedTheme>
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={[s.fLabel, { color: theme.accent }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={hint}
        placeholderTextColor={theme.surface.t3}
        multiline={multiline}
        style={[
          s.input,
          multiline ? { minHeight: 70, textAlignVertical: 'top' } : null,
          { backgroundColor: theme.surface.s1, borderColor: theme.surface.border, color: theme.surface.t1 },
        ]}
      />
    </View>
  )
}

const s = StyleSheet.create({
  fLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1.4, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  draft: { marginHorizontal: 16, marginTop: 18, padding: 16, borderRadius: 14, borderWidth: 1 },
  draftLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  draftText: { fontSize: 14, lineHeight: 21, marginTop: 10, fontFamily: 'Menlo' },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10 },
  btnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  btnGhost: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  btnGhostText: { fontSize: 12, fontWeight: '800' },
})
