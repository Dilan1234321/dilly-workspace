"use client";

import { ErrorBoundary } from "./ErrorBoundary";
import { GlobalPullToRefresh } from "./GlobalPullToRefresh";
import { ToastProvider } from "@/hooks/useToast";
import { AppProvider } from "@/context/AppContext";
import { DillyVoiceNotificationProvider } from "@/context/DillyVoiceNotificationContext";
import { NavigationProvider } from "@/contexts/NavigationContext";
import { AppLaunchSequence } from "@/components/launch/AppLaunchSequence";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <AppProvider>
        <NavigationProvider>
          <DillyVoiceNotificationProvider>
            <ToastProvider>
              <AppLaunchSequence />
              <GlobalPullToRefresh />
              {children}
            </ToastProvider>
          </DillyVoiceNotificationProvider>
        </NavigationProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}
