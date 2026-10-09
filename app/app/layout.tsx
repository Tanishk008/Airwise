import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/lib/context";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";

export const metadata: Metadata = {
  title: "AIRWISE — Air Quality Intelligence & Response System",
  description:
    "Closed-loop decision support for Delhi-NCR campus air quality: Measure → Assess → Decide → Act → Verify impact",
  keywords: ["air quality", "AQI", "Delhi", "campus", "pollution", "decision support"],
  openGraph: {
    title: "AIRWISE",
    description: "Air Quality Intelligence & Response System for Delhi-NCR campuses",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="flex h-screen overflow-hidden">
        <AppProvider>
          <Sidebar />
          <div className="flex-1 flex flex-col overflow-hidden">
            <TopBar />
            <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
              {children}
            </main>
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
