"use client";

import { useApp } from "@/lib/context";
import { Card, SectionHeader, Disclaimer } from "@/components/ui/Card";
import { Beaker, AlertTriangle, CloudRain, Clock } from "lucide-react";

export default function ForecastLabPage() {
  const { selectedCampus } = useApp();

  return (
    <div className="space-y-6 max-w-5xl">
      <SectionHeader 
        title="Forecast Accuracy Lab" 
        description="Evaluate Open-Meteo prediction models against historical ground truth observations."
      />

      <Card className="p-8 flex flex-col items-center justify-center text-center min-h-[400px]">
        <div className="bg-[#fbbf24]/10 p-4 rounded-full border border-[#fbbf24]/30 mb-6">
          <Beaker size={32} className="text-[#fbbf24]" />
        </div>
        
        <h2 className="text-xl font-bold text-[#f1f5f9] mb-2">Insufficient Ground-Truth Data</h2>
        
        <p className="text-[#94a3b8] max-w-xl leading-relaxed mb-6">
          To calculate accurate Mean Absolute Error (MAE) and Root Mean Squared Error (RMSE) for {selectedCampus?.name || 'this campus'}, 
          we require a sufficient sample of archived historical forecasts time-aligned with validated 24-hour sensor observations.
        </p>

        <div className="grid sm:grid-cols-3 gap-4 w-full max-w-3xl text-left">
          <div className="p-4 bg-[#070c14] border border-[#1e2f4d] rounded-xl">
            <CloudRain size={16} className="text-[#38bdf8] mb-2" />
            <h4 className="text-[11px] font-bold text-[#f1f5f9] uppercase tracking-wider mb-1">Archived Forecasts</h4>
            <p className="text-[10px] text-[#64748b]">Stored in memory. History resets on restart.</p>
            <div className="mt-2 text-xs font-mono text-[#cbd5e1]">0 Records</div>
          </div>
          
          <div className="p-4 bg-[#070c14] border border-[#1e2f4d] rounded-xl">
            <AlertTriangle size={16} className="text-[#14b8a6] mb-2" />
            <h4 className="text-[11px] font-bold text-[#f1f5f9] uppercase tracking-wider mb-1">Matched Ground Truth</h4>
            <p className="text-[10px] text-[#64748b]">Requires continuous CPCB / OpenAQ ingest.</p>
            <div className="mt-2 text-xs font-mono text-[#cbd5e1]">0 Matches</div>
          </div>

          <div className="p-4 bg-[#070c14] border border-[#1e2f4d] rounded-xl">
            <Clock size={16} className="text-[#fbbf24] mb-2" />
            <h4 className="text-[11px] font-bold text-[#f1f5f9] uppercase tracking-wider mb-1">Data Collection Target</h4>
            <p className="text-[10px] text-[#64748b]">Minimum 72 hours of stable time-series.</p>
            <div className="mt-2 text-xs font-mono text-[#cbd5e1]">Pending...</div>
          </div>
        </div>

        <p className="text-xs text-[#64748b] mt-8 max-w-lg italic">
          AIRWISE explicitly rejects generating synthetic matches or interpolating sparse points to fill this chart. 
          Scientific rigor requires distinguishing a modelled forecast from a measured observation.
        </p>
      </Card>

      <Disclaimer />
    </div>
  );
}
