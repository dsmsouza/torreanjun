"use client";

import React from "react";
import { LucideIcon } from "lucide-react";

interface StitchCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  indicator?: string;
  indicatorType?: "success" | "warning" | "danger" | "neutral";
  loading?: boolean;
}

export default function StitchCard({
  title,
  value,
  icon: Icon,
  indicator,
  indicatorType = "neutral",
  loading = false,
}: StitchCardProps) {
  const getIndicatorClass = () => {
    switch (indicatorType) {
      case "success":
        return "text-success bg-success/10 border-success/20";
      case "warning":
        return "text-warning bg-warning/10 border-warning/20";
      case "danger":
        return "text-destructive bg-destructive/10 border-destructive/20";
      case "neutral":
      default:
        return "text-muted-foreground bg-slate-800/60 border-border";
    }
  };

  if (loading) {
    return (
      <div className="glass-card p-6 min-h-[135px] flex flex-col justify-between animate-pulse">
        <div className="flex justify-between items-start">
          <div className="h-4 w-28 bg-slate-800 rounded"></div>
          <div className="w-8 h-8 rounded-lg bg-slate-800"></div>
        </div>
        <div className="h-8 w-20 bg-slate-800 rounded mt-4"></div>
        <div className="h-3 w-36 bg-slate-800 rounded mt-2"></div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 min-h-[135px] flex flex-col justify-between">
      <div className="flex justify-between items-start">
        <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">
          {title}
        </span>
        <div className="w-8 h-8 rounded-lg bg-slate-800/60 border border-border flex items-center justify-center text-muted-foreground">
          <Icon className="w-4 h-4" />
        </div>
      </div>
      
      <div className="mt-2">
        <p className="text-2xl font-bold text-white tracking-tight leading-none">
          {value}
        </p>
        
        {indicator && (
          <div className="mt-3 flex">
            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${getIndicatorClass()}`}>
              {indicator}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
