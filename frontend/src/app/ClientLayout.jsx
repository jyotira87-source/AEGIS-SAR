"use client";

import { LiveAISProvider } from "@/context/LiveAISContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { AlertSoundProvider } from "@/context/AlertSoundContext";
import CommandHeader from "@/components/CommandHeader";
import TacticalSidebar from "@/components/TacticalSidebar";
import LiveAlertBanner from "@/components/LiveAlertBanner";
import MobileNav from "@/components/MobileNav";

/**
 * ClientLayout — global providers + command chrome shared by every route.
 * Provider nesting is intentional: LiveAIS is the root data feed, Settings
 * governs runtime controls, and AlertSound reacts to incoming spill alerts.
 */
export default function ClientLayout({ children }) {
  return (
    <LiveAISProvider>
      <SettingsProvider>
        <AlertSoundProvider>
          <div className="min-h-screen flex">
            <TacticalSidebar />
            <div className="flex-1 flex flex-col min-w-0">
              <CommandHeader />
              <LiveAlertBanner />
              <main className="flex-1 max-w-[1600px] w-full mx-auto px-6 py-6">
                {children}
              </main>
            </div>
          </div>
          <MobileNav />
        </AlertSoundProvider>
      </SettingsProvider>
    </LiveAISProvider>
  );
}