import React from "react";

export function SectionBox({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative border border-slate-800 rounded-[10px] p-3">
      <span className="absolute -top-2 left-1 bg-slate-900/50 px-3 text-[11px] text-slate-500">
        {title}
      </span>

      <div className="text-slate-400">
        {children}
      </div>
    </div>
  );
}

export function Section({
  title,
  actions,
  children,
  roundedTop = true,
  roundedBottom = true,
  borderBottom = true,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  roundedTop?: boolean;
  roundedBottom?: boolean;
  borderBottom?: boolean;
}) {
  return (
    <div className={`
        border border-slate-800 bg-slate-950/30
        ${roundedTop ? "rounded-t-2xl" : ""}
        ${roundedBottom ? "rounded-b-2xl" : ""}
        ${borderBottom ? "" : "border-b-0"}
      `}>
      {/* HEADER */}
      <div className="flex items-center justify-between px-3 pt-2 border-slate-800">
        <div className="text-[13px] text-slate-400">
          {title}
        </div>

        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {/* BODY */}
      <div className="p-2 space-y-3">
        {children}
      </div>
    </div>
  );
}


export function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[9px] mb-1 text-slate-400">{children}</div>;
}


type NumProps = {
  value: number;
  onChange: (v: number) => void;
  readOnly?: boolean;
  disabled?: boolean;
};

export function Num({ value, onChange, readOnly, disabled }: NumProps) {
  return (
    <input
      type="number"
      className="ui-num w-12 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[9px]"

      value={value}
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      readOnly={readOnly}
      disabled={disabled}
    />
  );
}


export function stripQuery(pathOrUrl: string) {
  const i = pathOrUrl.indexOf("?");
  return i >= 0 ? pathOrUrl.slice(0, i) : pathOrUrl;
}

export function layerTitleForText(text?: string | null) {
  const s = (text ?? "").trim();
  if (!s) return "Text";
  return s.length > 28 ? s.slice(0, 28) + "…" : s;
}