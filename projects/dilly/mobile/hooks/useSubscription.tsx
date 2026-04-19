import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dilly } from '../lib/dilly';

// -- Constants ----------------------------------------------------------------

// Chat with Dilly is a paid feature. Free tier gets 0 per day so
// tapping the chat surface immediately shows the upgrade sheet
// instead of burning 3 free turns (the Haiku cost of those 3 was
// the single biggest item on the per-user LLM bill pre-gating).
// The backend enforces this with a 402 on /ai/chat for starter;
// the client value matches so we don't even round-trip.
const FREE_AI_MESSAGES_PER_DAY = 0;
const DILLY_AI_MESSAGES_PER_DAY = 50;   // matches api/chat_quota_store DAILY_CAPS
const PRO_AI_MESSAGES_PER_DAY = 500;    // matches api/chat_quota_store DAILY_CAPS
const FREE_AUDITS_TOTAL = 1;
const AI_COUNT_KEY = 'dilly_ai_msg_count';
const AI_COUNT_DATE_KEY = 'dilly_ai_msg_date';
const SUBSCRIPTION_CACHE_KEY = 'dilly_subscription_status';

// -- Types --------------------------------------------------------------------

export type DillyPlan = 'starter' | 'dilly' | 'pro';

const PLAN_ORDER: Record<DillyPlan, number> = {
  starter: 0,
  dilly: 1,
  pro: 2,
};

function aiLimitForPlan(plan: DillyPlan): number {
  if (plan === 'pro') return PRO_AI_MESSAGES_PER_DAY;
  if (plan === 'dilly') return DILLY_AI_MESSAGES_PER_DAY;
  return FREE_AI_MESSAGES_PER_DAY;
}

interface SubscriptionState {
  plan: DillyPlan;
  isPaid: boolean; // backward compat: plan !== 'starter'
  isStudent: boolean;
  loading: boolean;

  // Plan helpers
  atLeast: (tier: DillyPlan) => boolean;

  // Free tier limits
  aiMessagesUsedToday: number;
  aiMessagesRemaining: number;
  canSendAIMessage: boolean;
  auditsUsed: number;
  canRunAudit: boolean;

  // Actions
  incrementAIMessage: () => Promise<void>;
  incrementAudit: () => void;
  showGate: (message: string, requiredPlan?: DillyPlan) => void;
  /** @deprecated use showGate */
  showPaywall: (feature?: string) => void;
  refresh: () => Promise<void>;

  // Gate state
  gateVisible: boolean;
  gateMessage: string;
  gateRequiredPlan: 'dilly' | 'pro';
  dismissGate: () => void;

  // Legacy aliases (backward compat)
  paywallVisible: boolean;
  paywallFeature: string;
  dismissPaywall: () => void;
}

// -- Context ------------------------------------------------------------------

const SubscriptionContext = createContext<SubscriptionState>({
  plan: 'starter',
  isPaid: false,
  isStudent: false,
  loading: true,
  atLeast: () => false,
  aiMessagesUsedToday: 0,
  aiMessagesRemaining: FREE_AI_MESSAGES_PER_DAY,
  canSendAIMessage: true,
  auditsUsed: 0,
  canRunAudit: true,
  incrementAIMessage: async () => {},
  incrementAudit: () => {},
  showGate: () => {},
  showPaywall: () => {},
  refresh: async () => {},
  gateVisible: false,
  gateMessage: '',
  gateRequiredPlan: 'dilly',
  dismissGate: () => {},
  paywallVisible: false,
  paywallFeature: '',
  dismissPaywall: () => {},
});

export function useSubscription() {
  return useContext(SubscriptionContext);
}

// -- Provider -----------------------------------------------------------------

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [plan, setPlan] = useState<DillyPlan>('starter');
  const [isStudent, setIsStudent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiMessagesUsedToday, setAiMessagesUsedToday] = useState(0);
  const [auditsUsed, setAuditsUsed] = useState(0);

  // Gate state
  const [gateVisible, setGateVisible] = useState(false);
  const [gateMessage, setGateMessage] = useState('');
  const [gateRequiredPlan, setGateRequiredPlan] = useState<'dilly' | 'pro'>('dilly');

  const isPaid = plan !== 'starter';

  const atLeast = useCallback(
    (tier: DillyPlan): boolean => PLAN_ORDER[plan] >= PLAN_ORDER[tier],
    [plan],
  );

  // Check subscription status from backend
  const refresh = useCallback(async () => {
    try {
      const res = await dilly.fetch('/profile');
      // Guard: non-2xx (401 expired token, 500 outage) must not be parsed as a
      // profile object -- that would wipe out subscription state silently.
      if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
      const profile = await res.json();

      // Determine plan from backend
      const backendPlan: DillyPlan =
        profile?.plan === 'pro' ? 'pro' :
        profile?.plan === 'dilly' ? 'dilly' :
        // Legacy fallback: old subscribed / is_paid flags map to 'dilly'
        (profile?.subscribed || profile?.is_paid || profile?.subscription_active)
          ? 'dilly'
          : 'starter';

      // Allow a local override for testing
      const localOverride = await AsyncStorage.getItem(SUBSCRIPTION_CACHE_KEY);
      if (localOverride === 'true' && backendPlan === 'starter') {
        setPlan('dilly');
      } else {
        setPlan(backendPlan);
      }

      // Detect a plan upgrade since last refresh and fire the
      // celebration overlay. This is the Stripe-checkout path: the
      // user pays on hellodilly.com, comes back to the app, we refresh
      // /profile and see the plan flipped. Without this detector, the
      // moment would pass silently.
      try {
        const LAST_SEEN_KEY = 'dilly_last_seen_plan_v1';
        const lastSeen = await AsyncStorage.getItem(LAST_SEEN_KEY);
        const current = localOverride === 'true' && backendPlan === 'starter' ? 'dilly' : backendPlan;
        // Fire only on the transition (starter → dilly, starter → pro,
        // or dilly → pro). useCelebration persists per-milestone so
        // repeated triggers on each refresh are a no-op after the first.
        if (lastSeen !== current && current !== 'starter') {
          const { triggerCelebration } = await import('./useCelebration');
          setTimeout(() => {
            triggerCelebration(current === 'pro' ? 'unlocked-pro' : 'unlocked-dilly');
          }, 500);
        }
        await AsyncStorage.setItem(LAST_SEEN_KEY, current);
      } catch {}

      setIsStudent(!!profile?.is_student);

      // Count audits from history
      try {
        const auditRes = await dilly.fetch('/audit/history');
        const auditData = await auditRes.json();
        setAuditsUsed((auditData?.audits || []).length);
      } catch {}
    } catch {}
    finally { setLoading(false); }
  }, []);

  // Load AI message count for today
  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const savedDate = await AsyncStorage.getItem(AI_COUNT_DATE_KEY);
      if (savedDate === today) {
        const count = parseInt(await AsyncStorage.getItem(AI_COUNT_KEY) || '0', 10);
        setAiMessagesUsedToday(count);
      } else {
        // New day, reset count
        await AsyncStorage.setItem(AI_COUNT_DATE_KEY, today);
        await AsyncStorage.setItem(AI_COUNT_KEY, '0');
        setAiMessagesUsedToday(0);
      }
    })();
  }, []);

  // Check subscription on mount
  useEffect(() => { refresh(); }, [refresh]);

  const dailyLimit = aiLimitForPlan(plan);
  const aiMessagesRemaining = Math.max(0, dailyLimit - aiMessagesUsedToday);
  const canSendAIMessage = aiMessagesUsedToday < dailyLimit;
  const canRunAudit = isPaid || auditsUsed < FREE_AUDITS_TOTAL;

  const incrementAIMessage = useCallback(async () => {
    if (plan === 'pro') return; // unlimited
    const newCount = aiMessagesUsedToday + 1;
    setAiMessagesUsedToday(newCount);
    const today = new Date().toISOString().slice(0, 10);
    await AsyncStorage.setItem(AI_COUNT_DATE_KEY, today);
    await AsyncStorage.setItem(AI_COUNT_KEY, String(newCount));
  }, [plan, aiMessagesUsedToday]);

  const incrementAudit = useCallback(() => {
    setAuditsUsed(prev => prev + 1);
  }, []);

  const showGate = useCallback((message: string, requiredPlan: DillyPlan = 'dilly') => {
    setGateMessage(message);
    setGateRequiredPlan(requiredPlan === 'starter' ? 'dilly' : requiredPlan);
    setGateVisible(true);
  }, []);

  // Legacy alias for backward compatibility
  const showPaywall = useCallback((feature: string = '') => {
    showGate(feature || 'Upgrade to unlock this feature.');
  }, [showGate]);

  const dismissGate = useCallback(() => {
    setGateVisible(false);
    setGateMessage('');
  }, []);

  return (
    <SubscriptionContext.Provider value={{
      plan, isPaid, isStudent, loading, atLeast,
      aiMessagesUsedToday, aiMessagesRemaining, canSendAIMessage,
      auditsUsed, canRunAudit,
      incrementAIMessage, incrementAudit,
      showGate, showPaywall, refresh,
      gateVisible, gateMessage, gateRequiredPlan, dismissGate,
      // Legacy aliases
      paywallVisible: gateVisible,
      paywallFeature: gateMessage,
      dismissPaywall: dismissGate,
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
}
