import { DecisionReceipt } from "@/lib/api";
import { X, FileText, CheckCircle, Clock, MapPin, Hash, ShieldCheck, AlertTriangle, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { fmtDate } from "@/lib/utils";

export function DecisionReceiptModal({
  receipt,
  onClose
}: {
  receipt: DecisionReceipt;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-2xl rounded-xl border border-[#1e2f4d] bg-[#0b1322] shadow-2xl my-8"
        >
          <div className="flex items-center justify-between border-b border-[#1e2f4d] p-4 bg-[#070c14] rounded-t-xl sticky top-0 z-10">
            <h3 className="text-lg font-bold text-[#f1f5f9] flex items-center gap-2">
              <FileText className="text-[#38bdf8]" size={20} />
              Decision Receipt
            </h3>
            <button
              onClick={onClose}
              className="rounded p-1 text-[#64748b] hover:bg-[#1e2f4d] hover:text-[#f1f5f9] transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-6">
            <div className="bg-[#14b8a6]/10 border border-[#14b8a6]/30 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle className="text-[#14b8a6] mt-0.5" size={20} />
              <div>
                <h4 className="text-sm font-bold text-[#f1f5f9]">Immutable Evidence Trace</h4>
                <p className="text-xs text-[#cbd5e1] mt-1 leading-relaxed">
                  This receipt captures the exact data, rules, and uncertainties that existed at the moment this decision was made. 
                  It provides an explainable and auditable trail linking environmental evidence to operational action.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-bold text-[#64748b] tracking-wider flex items-center gap-1">
                  <MapPin size={12} /> Campus
                </p>
                <p className="text-sm text-[#f1f5f9]">{receipt.campusId.replace(/_/g, " ").toUpperCase()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-bold text-[#64748b] tracking-wider flex items-center gap-1">
                  <Activity size={12} /> Activity Profile
                </p>
                <p className="text-sm text-[#f1f5f9] capitalize">{receipt.activity.replace(/_/g, " ")}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-bold text-[#64748b] tracking-wider flex items-center gap-1">
                  <Clock size={12} /> Assessed At
                </p>
                <p className="text-sm text-[#f1f5f9]">{fmtDate(receipt.assessmentTimestamp)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase font-bold text-[#64748b] tracking-wider flex items-center gap-1">
                  <ShieldCheck size={12} /> Selected Pathway
                </p>
                <p className="text-sm text-[#38bdf8] font-bold capitalize">{receipt.selectedAlternative.replace(/_/g, " ")}</p>
              </div>
            </div>

            <div>
              <p className="text-[10px] uppercase font-bold text-[#64748b] tracking-wider mb-2 border-b border-[#1e2f4d] pb-1">
                Environmental Evidence Snapshot
              </p>
              <div className="bg-[#070c14] border border-[#1e2f4d] rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#0f1a2e] text-[#64748b]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Pollutant</th>
                      <th className="px-3 py-2 font-medium text-right">Value (24h)</th>
                      <th className="px-3 py-2 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1e2f4d]">
                    {Object.entries(receipt.evidence).map(([pollutant, data]) => (
                      <tr key={pollutant} className="hover:bg-[#1e2f4d]/30">
                        <td className="px-3 py-2 text-[#cbd5e1] font-mono uppercase">{pollutant.replace("_", ".")}</td>
                        <td className="px-3 py-2 text-right text-[#f1f5f9] font-mono">
                          {data.mean24h.toFixed(1)} <span className="text-[#64748b]">{data.unit}</span>
                        </td>
                        <td className="px-3 py-2 text-[#94a3b8] truncate max-w-[150px]" title={data.provider}>
                          {data.provider}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {receipt.dataQuality?.warnings?.length > 0 && (
              <div>
                <p className="text-[10px] uppercase font-bold text-[#fbbf24] tracking-wider mb-2 flex items-center gap-1">
                  <AlertTriangle size={12} /> Data Limitations & Uncertainties
                </p>
                <ul className="space-y-1 bg-[#fbbf24]/5 border border-[#fbbf24]/20 p-3 rounded-lg">
                  {receipt.dataQuality.warnings.map((w: string, i: number) => (
                    <li key={i} className="text-xs text-[#fbbf24] flex items-start gap-1.5">
                      <span className="text-[#fbbf24]/50 mt-0.5">•</span> {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="text-[10px] uppercase font-bold text-[#64748b] tracking-wider mb-2 border-b border-[#1e2f4d] pb-1 flex items-center gap-1">
                <Hash size={12} /> Cryptographic Proof (Tamper-Evident)
              </p>
              <div className="bg-[#070c14] border border-[#1e2f4d] rounded p-3 font-mono text-[10px] text-[#94a3b8] break-all">
                {receipt.hash}
              </div>
              <p className="text-[10px] text-[#64748b] mt-1.5 italic">
                Hash generated at {fmtDate(receipt.generatedAt)}. Stored in current persistence layer.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
