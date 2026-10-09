"use client";

import { motion } from "framer-motion";
import { clsx } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}

export function Card({ children, className, onClick, hover }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={clsx(
        "bg-[#0f1a2e] border border-[#1e2f4d] rounded-xl p-4 md:p-5 shadow-sm",
        hover && "cursor-pointer hover:border-[#2d436b] hover:bg-[#15233d] transition-all",
        className
      )}
    >
      {children}
    </motion.div>
  );
}

export function StatCard({ label, value, unit, sub, color, large }: {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  color?: string;
  large?: boolean;
}) {
  return (
    <Card className="flex flex-col justify-between">
      <div>
        <p className="text-[11px] text-[#94a3b8] uppercase tracking-wider font-semibold mb-2">{label}</p>
        <div className={clsx("flex items-baseline gap-1.5", large ? "mb-1" : "mb-0.5")}>
          <span className={clsx("font-bold tracking-tight mono", large ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl", color ?? "text-[#f1f5f9]")}>
            {value}
          </span>
          {unit && <span className="text-[#64748b] text-xs font-mono">{unit}</span>}
        </div>
      </div>
      {sub && <p className="text-[11px] text-[#64748b] mt-1.5 leading-snug">{sub}</p>}
    </Card>
  );
}

export function LoadingCard({ lines = 3 }: { lines?: number }) {
  const widths = [74, 92, 63, 84, 68, 79];
  return (
    <Card>
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="shimmer rounded-md h-4" style={{ width: `${widths[i % widths.length]}%` }} />
        ))}
      </div>
    </Card>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="border-[#ef4444]/40 bg-[#ef4444]/5">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-[#ef4444]/15 flex items-center justify-center shrink-0">
          <span className="text-[#f87171] text-sm font-bold">!</span>
        </div>
        <div className="flex-1">
          <p className="text-[#f87171] text-xs font-bold uppercase tracking-wider">Service Error</p>
          <p className="text-[#94a3b8] text-xs mt-1">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 px-3 py-1 text-xs font-semibold rounded-md bg-[#1e2f4d] border border-[#2d436b] text-[#f1f5f9] hover:bg-[#2d436b] transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

export function Badge({ children, variant = "default" }: {
  children: React.ReactNode;
  variant?: "default" | "blue" | "green" | "amber" | "red" | "purple" | "teal";
}) {
  const variants = {
    default: "bg-[#0b1322] border-[#1e2f4d] text-[#94a3b8]",
    teal: "bg-[#14b8a6]/10 border-[#14b8a6]/30 text-[#2dd4bf]",
    blue: "bg-[#38bdf8]/10 border-[#38bdf8]/30 text-[#38bdf8]",
    green: "bg-[#34d399]/10 border-[#34d399]/30 text-[#34d399]",
    amber: "bg-[#fbbf24]/10 border-[#fbbf24]/30 text-[#fbbf24]",
    red: "bg-[#f87171]/10 border-[#f87171]/30 text-[#f87171]",
    purple: "bg-[#a78bfa]/10 border-[#a78bfa]/30 text-[#a78bfa]",
  };
  return (
    <span className={clsx("px-2 py-0.5 text-[10px] rounded-md font-semibold tracking-wide border", variants[variant])}>
      {children}
    </span>
  );
}

export function Button({ children, onClick, variant = "primary", size = "md", disabled, loading, icon, className }: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost" | "teal";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  className?: string;
}) {
  const variants = {
    primary: "bg-[#f1f5f9] hover:bg-white text-[#070c14] border-transparent font-bold shadow",
    teal: "bg-[#14b8a6] hover:bg-[#2dd4bf] text-[#070c14] border-transparent font-bold shadow-md shadow-teal-950",
    secondary: "bg-[#0b1322] hover:bg-[#15233d] border-[#1e2f4d] hover:border-[#2d436b] text-[#f1f5f9]",
    danger: "bg-[#ef4444]/15 hover:bg-[#ef4444]/25 border-[#ef4444]/30 text-[#f87171]",
    ghost: "bg-transparent hover:bg-[#15233d] border-transparent text-[#94a3b8] hover:text-[#f1f5f9]",
  };
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-xs",
    lg: "px-5 py-2.5 text-sm",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg border transition-all duration-150 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#14b8a6]",
        variants[variant],
        sizes[size],
        (disabled || loading) && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {loading ? (
        <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon}
      {children}
    </button>
  );
}

export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode; }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#1e2f4d]">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-[#f1f5f9] tracking-tight">{title}</h1>
        {description && <p className="text-[#94a3b8] text-xs mt-1">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function DataProvenance({ mode, provider, timestamp }: { mode: string; provider?: string; timestamp?: string; }) {
  const isObserved = mode === "observed";
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant={isObserved ? "green" : "teal"}>{isObserved ? "Measured" : "Modelled"}</Badge>
      {provider && <span className="text-[11px] text-[#64748b]">{provider}</span>}
      {timestamp && <span className="text-[10px] text-[#64748b] mono">{timestamp}</span>}
    </div>
  );
}

export function WarnBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-lg bg-[#fbbf24]/10 border border-[#fbbf24]/25 text-[#fbbf24] text-xs">
      <span className="shrink-0 mt-0.5 text-xs font-bold">⚠</span>
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

export function Disclaimer() {
  return (
    <p className="text-[11px] text-[#64748b] text-center pt-4 pb-8 border-t border-[#1e2f4d]/40">
      Decision support only — not medical advice or an official government alert. Threshold standards: WHO AQG 2021 (24h) & India CPCB NAAQS 2009.
    </p>
  );
}

