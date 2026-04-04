"use client";

import { ErrorBoundary } from "./ErrorBoundary";
import { GlobalPullToRefresh } from "./GlobalPullToRefresh";
import { ToastProvider } from "@/hooks/useToast";
import { AppProvider } from "@/context/AppContext";
import { DillyVoiceNotificationProvider } from "@/context/DillyVoiceNotificationContext";
import { NavigationProvider } from "@/contexts/NavigationContext";
import { AuditScoreProvider } from "@/contexts/AuditScoreContext";
import { VoiceProvider } from "@/contexts/VoiceContext";
import { AppLaunchSequence } from "@/components/launch/AppLaunchSequence";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <AppProvider>
        <NavigationProvider>
          <AuditScoreProvider>
            <VoiceProvider>
            <DillyVoiceNotificationProvider>
              <ToastProvider>
                <AppLaunchSequence />
                <GlobalPullToRefresh />
                {children}
              </ToastProvider>
            </DillyVoiceNotificationProvider>
          </VoiceProvider>
          </AuditScoreProvider>
        </NavigationProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}
