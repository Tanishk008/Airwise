"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  LayoutDashboard,
  Wind,
  ClipboardCheck,
  ShieldAlert,
  History,
  Menu,
  X,
  Radio,
} from "lucide-react";
import { useApp } from "@/lib/context";
import { clsx } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/air", label: "Air Intelligence", icon: Wind },
  { href: "/assessment", label: "Assessment", icon: ClipboardCheck },
  { href: "/response", label: "Response Centre", icon: ShieldAlert },
  { href: "/history", label: "Reports & History", icon: History },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { backendOnline, alerts } = useApp();
  const [open, setOpen] = useState(false);

  const pendingPlanAlerts = alerts.filter(a => a.type === "draft_plan").length;
  const criticalAssessAlerts = alerts.filter(a => a.type === "action_recommended").length;

  const NavLinks = () => (
    <>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        const badgeCount =
          href === "/response" && pendingPlanAlerts > 0
            ? pendingPlanAlerts
            : href === "/assessment" && criticalAssessAlerts > 0
            ? criticalAssessAlerts
            : 0;

        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={clsx(
              "flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 group relative",
              active
                ? "text-[#f1f5f9] bg-[#14b8a6]/10 border border-[#14b8a6]/30"
                : "text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-[#0f1a2e]"
            )}
          >
            <div className="flex items-center gap-3">
              <Icon
                size={16}
                className={clsx(
                  "transition-colors",
                  active ? "text-[#14b8a6]" : "text-[#64748b] group-hover:text-[#94a3b8]"
                )}
              />
              <span>{label}</span>
            </div>
            {badgeCount > 0 && (
              <span className={clsx(
                "px-1.5 py-0.5 text-[9px] font-bold rounded-full",
                href === "/response" ? "bg-[#fbbf24] text-slate-950" : "bg-[#f87171] text-white"
              )}>
                {badgeCount}
              </span>
            )}
          </Link>
        );
      })}
    </>
  );

  return (
    <>
      <button
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-[#0f1a2e] border border-[#1e2f4d] text-[#94a3b8] hover:text-[#f1f5f9]"
        onClick={() => setOpen(!open)}
        aria-label="Toggle navigation"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-xs"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="lg:hidden fixed left-0 top-0 bottom-0 z-50 w-64 bg-[#070c14] border-r border-[#1e2f4d] flex flex-col"
          >
            <SidebarContent backendOnline={backendOnline} NavLinks={NavLinks} />
          </motion.aside>
        )}
      </AnimatePresence>

      <aside className="hidden lg:flex w-60 flex-col bg-[#070c14] border-r border-[#1e2f4d] shrink-0 z-10">
        <SidebarContent backendOnline={backendOnline} NavLinks={NavLinks} />
      </aside>
    </>
  );
}

function SidebarContent({
  backendOnline,
  NavLinks,
}: {
  backendOnline: boolean;
  NavLinks: () => React.JSX.Element;
}) {
  return (
    <>
      <div className="p-5 border-b border-[#1e2f4d]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#14b8a6] to-[#0f766e] flex items-center justify-center shadow-md shadow-teal-950">
            <Radio size={16} className="text-white" />
          </div>
          <div>
            <div className="font-bold text-sm tracking-wider text-[#f1f5f9] flex items-center gap-1.5">
              AIRWISE
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#14b8a6]/20 text-[#2dd4bf] font-mono font-medium">v2.0</span>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-[#64748b] font-semibold mt-0.5">
              Delhi-NCR Decision Support
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#64748b]">
          Console
        </div>
        <NavLinks />
      </nav>

      {/* Closed loop helper footer */}
      <div className="p-3 mx-3 mb-3 rounded-lg bg-[#0b1322] border border-[#1e2f4d]/60 text-[11px] text-[#64748b]">
        <p className="font-semibold text-[#94a3b8] mb-1">Decision Loop</p>
        <div className="flex items-center justify-between text-[10px] text-[#64748b] font-mono">
          <span>Measure</span>→<span>Assess</span>→<span>Act</span>
        </div>
      </div>

      <div className="p-3 border-t border-[#1e2f4d] flex items-center justify-between">
        <div className="flex items-center gap-2.5 px-2 py-1">
          <div className={clsx("relative flex items-center justify-center", backendOnline ? "live-dot" : "")}>
            <div className={clsx("w-2 h-2 rounded-full", backendOnline ? "bg-[#34d399]" : "bg-[#ef4444]")} />
          </div>
          <span className="text-[11px] text-[#94a3b8] font-medium">
            {backendOnline ? "API Online" : "Disconnected"}
          </span>
        </div>
        <span className="text-[10px] text-[#64748b] font-mono px-2">CAMS / WHO</span>
      </div>
    </>
  );
}

