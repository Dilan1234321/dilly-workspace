"use client";

import { useState } from "react";

export function AddMemorySheet({
  open,
  title,
  initialLabel = "",
  initialValue = "",
  onCancel,
  onSave,
}: {
  open: boolean;
  title: string;
  initialLabel?: string;
  initialValue?: string;
  onCancel: () => void;
  onSave: (payload: { label: string; value: string }) => void;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [value, setValue] = useState(initialValue);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        onClick={onCancel}
        aria-label="Close memory editor"
      />
      <div
        className="absolute left-0 right-0 bottom-0 rounded-t-[20px] p-4 border"
        style={{ background: "var(--s2)", borderColor: "var(--bbdr)" }}
      >
        <p className="text-[14px] font-semibold mb-3" style={{ color: "var(--t1)" }}>
          {title}
        </p>
        <label className="block mb-2">
          <span className="text-[11px]" style={{ color: "var(--t3)" }}>
            Label
          </span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="mt-1 w-full rounded-[12px] px-3 py-2 text-[13px] border"
            style={{ background: "var(--bg)", borderColor: "var(--bbdr)", color: "var(--t1)" }}
            maxLength={50}
          />
        </label>
        <label className="block">
          <span className="text-[11px]" style={{ color: "var(--t3)" }}>
            Details
          </span>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1 w-full rounded-[12px] px-3 py-2 text-[13px] border min-h-[92px]"
            style={{ background: "var(--bg)", borderColor: "var(--bbdr)", color: "var(--t1)" }}
            maxLength={200}
          />
        </label>
        <div className="flex items-center justify-end gap-3 mt-3">
          <button type="button" onClick={onCancel} className="text-[12px]" style={{ color: "var(--t3)" }}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!label.trim() || !value.trim()}
            onClick={() => onSave({ label: label.trim(), value: value.trim() })}
            className="rounded-[10px] px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
            style={{ background: "var(--blue)", color: "#fff" }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

