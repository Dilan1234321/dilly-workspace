import { buildTransitionContext } from "./buildTransitionContext";
import { orderFeedCards } from "./orderFeed";
import { generateCardStrip } from "./generateCardStrip";
import { generateHomeInsight } from "./generateHomeInsight";
import { hashInsight, isMostlySameObservation } from "./stringSimilarity";
import type { AppProfile } from "@/types/dilly";
import type {
  CardStripContext,
  CardStripType,
  FeedCard,
  FeedCardType,
  FeedOrderContext,
  HomeInsightContext,
  TransitionContext,
  TransitionSource,
} from "./types";

const TWO_H_MS = 2 * 60 * 60 * 1000;
const MAX_UNPROMPTED = 6;
const STORAGE_LAST_INSIGHT = "dilly_presence_last_insight";
const STORAGE_LAST_AT = "dilly_presence_last_insight_at";

function storageKey(uid: string, k: string) {
  return `dilly_presence_${uid}_${k}`;
}

export class DillyPresenceManager {
  private recentObservations: string[] = [];
  private hashSeen = new Set<string>();
  private unpromptedCount = 0;
  /** undefined = not resolved yet; null = no insight */
  private homeInsightResult: string | null | undefined = undefined;
  private homeInFlight: Promise<string | null> | null = null;
  private stripCache = new Map<string, string | null>();
  private uid: string | null = null;

  setUid(uid: string) {
    this.uid = uid;
  }

  /** Merge persisted last-insight fields into context; call before getHomeInsight. */
  hydrateHomeContext(uid: string, ctx: HomeInsightContext): HomeInsightContext {
    this.setUid(uid);
    const out = { ...ctx };
    if (typeof window === "undefined") return out;
    try {
      out.last_insight = localStorage.getItem(storageKey(uid, STORAGE_LAST_INSIGHT));
      out.last_insight_at = localStorage.getItem(storageKey(uid, STORAGE_LAST_AT));
    } catch {
      /* ignore */
    }
    return out;
  }

  /** Optional: kick off home insight in background after hydrate (non-blocking). */
  prefetchHomeInsight(profile: AppProfile, ctx: HomeInsightContext): void {
    void this.getHomeInsight(profile, ctx);
  }

  async getHomeInsight(profile: AppProfile, ctx: HomeInsightContext): Promise<string | null> {
    if (this.unpromptedCount >= MAX_UNPROMPTED) return null;
    if (this.homeInsightResult !== undefined) return this.homeInsightResult;
    if (this.homeInFlight) return this.homeInFlight;

    const uid = this.uid ?? "anon";
    let lastAtMs = 0;
    let lastText: string | null = ctx.last_insight ?? null;
    try {
      const raw = localStorage.getItem(storageKey(uid, STORAGE_LAST_AT));
      if (raw) lastAtMs = new Date(raw).getTime();
      const li = localStorage.getItem(storageKey(uid, STORAGE_LAST_INSIGHT));
      if (li) lastText = li;
    } catch {
      /* ignore */
    }

    const now = Date.now();
    if (lastText && now - lastAtMs < TWO_H_MS && !this.isNearDuplicate(lastText)) {
      this.recordObservation(lastText);
      this.unpromptedCount++;
      this.homeInsightResult = lastText;
      return lastText;
    }

    this.homeInFlight = (async () => {
      const insight = await generateHomeInsight(uid, profile, {
        ...ctx,
        last_insight: lastText,
        last_insight_at: lastAtMs ? new Date(lastAtMs).toISOString() : ctx.last_insight_at,
      });
      if (!insight) {
        this.homeInsightResult = null;
        return null;
      }
      if (lastText && isMostlySameObservation(insight, lastText)) {
        this.homeInsightResult = null;
        return null;
      }
      if (this.isNearDuplicate(insight)) {
        this.homeInsightResult = null;
        return null;
      }
      this.recordObservation(insight);
      this.unpromptedCount++;
      this.homeInsightResult = insight;
      try {
        localStorage.setItem(storageKey(uid, STORAGE_LAST_INSIGHT), insight);
        localStorage.setItem(storageKey(uid, STORAGE_LAST_AT), new Date().toISOString());
      } catch {
        /* ignore */
      }
      return insight;
    })();

    const out = await this.homeInFlight;
    this.homeInFlight = null;
    return out;
  }

  async getCardStrip(card_type: CardStripType, uid: string, context: CardStripContext): Promise<string | null> {
    if (this.unpromptedCount >= MAX_UNPROMPTED) return null;
    const key = `${uid}:${card_type}`;
    if (this.stripCache.has(key)) {
      const c = this.stripCache.get(key);
      return c === undefined ? null : c;
    }

    const strip = await generateCardStrip(card_type, uid, context);
    if (!strip) {
      this.stripCache.set(key, null);
      return null;
    }
    if (this.isNearDuplicate(strip)) {
      this.stripCache.set(key, null);
      return null;
    }
    this.recordObservation(strip);
    this.unpromptedCount++;
    this.stripCache.set(key, strip);
    return strip;
  }

  orderFeed(cards: { id: string; type: FeedCardType }[], context: FeedOrderContext): FeedCard[] {
    return orderFeedCards(cards, context);
  }

  markInsightSeen(_uid: string, insight: string): void {
    this.recordObservation(insight);
  }

  buildTransitionContext(source: TransitionSource, data: Record<string, unknown>): TransitionContext {
    return buildTransitionContext(source, data);
  }

  invalidateCardStrip(card_type: CardStripType, uid: string) {
    this.stripCache.delete(`${uid}:${card_type}`);
  }

  private isNearDuplicate(text: string): boolean {
    const h = hashInsight(text);
    if (this.hashSeen.has(h)) return true;
    for (const p of this.recentObservations) {
      if (isMostlySameObservation(text, p)) return true;
    }
    return false;
  }

  private recordObservation(text: string): void {
    const h = hashInsight(text);
    this.hashSeen.add(h);
    this.recentObservations.unshift(text);
    this.recentObservations = this.recentObservations.slice(0, 12);
  }

  invalidateHomeInsight() {
    this.homeInsightResult = undefined;
  }
}

export const dillyPresenceManager = new DillyPresenceManager();
