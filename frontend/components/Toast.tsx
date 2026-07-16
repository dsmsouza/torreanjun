import React, { useEffect, useState } from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";

export type ToastType = "success" | "error";

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type, onClose, duration = 3000 }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300); // Wait for fade out animation
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const bgColor = type === "success" ? "bg-emerald-500/10" : "bg-destructive/10";
  const borderColor = type === "success" ? "border-emerald-500/20" : "border-destructive/20";
  const textColor = type === "success" ? "text-emerald-500" : "text-destructive";

  return (
    <div className={`fixed bottom-4 right-4 z-[9999] transition-all duration-300 ease-in-out transform ${
      visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
    }`}>
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-lg ${bgColor} ${borderColor}`}>
        {type === "success" ? (
          <CheckCircle2 className={`w-5 h-5 ${textColor}`} />
        ) : (
          <XCircle className={`w-5 h-5 ${textColor}`} />
        )}
        <p className="text-sm font-medium text-white">{message}</p>
        <button onClick={() => setVisible(false)} className="ml-2 text-slate-400 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
