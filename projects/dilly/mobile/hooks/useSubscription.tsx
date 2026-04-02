import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dilly } from '../lib/dilly';

// ── Constants ─────────────────────────────────────────────────────────────────

const FREE_AI_MESSAGES_PER_DAY = 3;
const FREE_AUDITS_TOTAL = 1;
const AI_COUNT_KEY = 'dilly_ai_msg_count';
const AI_COUNT_DATE_KEY = 'dilly_ai_msg_date';
const SUBSCRIPTION_CACHE_KEY = 'dilly_subscription_status';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SubscriptionState {
  isPaid: boolean;
  loading: boolean;

  // Free tier limits
  aiMessagesUsedToday: number;
  aiMessagesRemaining: number;
  canSendAIMessage: boolean;
  auditsUsed: number;
  canRunAudit: boolean;

  // Actions
  incrementAIMessage: () => Promise<void>;
  incrementAudit: () => void;
  showPaywall: () => void;
  refresh: () => Promise<void>;

  // Paywall state
  paywallVisible: boolean;
  paywallFeature: string;
  dismissPaywall: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const SubscriptionContext = createContext<SubscriptionState>({
  isPaid: false,
  loading: true,
  aiMessagesUsedToday: 0,
  aiMessagesRemaining: FREE_AI_MESSAGES_PER_DAY,
  canSendAIMessage: true,
  auditsUsed: 0,
  canRunAudit: true,
  incrementAIMessage: async () => {},
  incrementAudit: () => {},
  showPaywall: () => {},
  refresh: async () => {},
  paywallVisible: false,
  paywallFeature: '',
  dismissPaywall: () => {},
});

export function useSubscription() {
  return useContext(SubscriptionContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [isPaid, setIsPaid] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiMessagesUsedToday, setAiMessagesUsedToday] = useState(0);
  const [auditsUsed, setAuditsUsed] = useState(0);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [paywallFeature, setPaywallFeature] = useState('');

  // Check subscription status from backend
  const refresh = useCallback(async () => {
    try {
      const res = await dilly.fetch('/profile');
      // Guard: non-2xx (401 expired token, 500 outage) must not be parsed as a
      // profile object — that would wipe out subscription state silently.
      if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
      const profile = await res.json();

      // Backend can set a 'subscribed' flag on the profile
      // For now, also check a local override for testing
      const backendPaid = !!(profile?.subscribed || profile?.is_paid || profile?.subscription_active);
      const localOverride = await AsyncStorage.getItem(SUBSCRIPTION_CACHE_KEY);

      setIsPaid(backendPaid || localOverride === 'true');

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

  const aiMessagesRemaining = isPaid ? 999 : Math.max(0, FREE_AI_MESSAGES_PER_DAY - aiMessagesUsedToday);
  const canSendAIMessage = isPaid || aiMessagesUsedToday < FREE_AI_MESSAGES_PER_DAY;
  const canRunAudit = isPaid || auditsUsed < FREE_AUDITS_TOTAL;

  const incrementAIMessage = useCallback(async () => {
    if (isPaid) return;
    const newCount = aiMessagesUsedToday + 1;
    setAiMessagesUsedToday(newCount);
    const today = new Date().toISOString().slice(0, 10);
    await AsyncStorage.setItem(AI_COUNT_DATE_KEY, today);
    await AsyncStorage.setItem(AI_COUNT_KEY, String(newCount));
  }, [isPaid, aiMessagesUsedToday]);

  const incrementAudit = useCallback(() => {
    setAuditsUsed(prev => prev + 1);
  }, []);

  const showPaywall = useCallback((feature: string = '') => {
    setPaywallFeature(feature);
    setPaywallVisible(true);
  }, []);

  const dismissPaywall = useCallback(() => {
    setPaywallVisible(false);
    setPaywallFeature('');
  }, []);

  return (
    <SubscriptionContext.Provider value={{
      isPaid, loading,
      aiMessagesUsedToday, aiMessagesRemaining, canSendAIMessage,
      auditsUsed, canRunAudit,
      incrementAIMessage, incrementAudit,
      showPaywall, refresh,
      paywallVisible, paywallFeature, dismissPaywall,
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
}
