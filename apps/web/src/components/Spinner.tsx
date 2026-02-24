"use client";

type Props = {
  size?: number;        // px, например 16, 20, 24, 96
  thickness?: number;   // px, например 2, 3, 4, 8
  className?: string;
};

export function Spinner({ size = 16, thickness = 3, className = "" }: Props) {
  return (
    <div
      className={`rounded-full border-sky-400/20 border-t-sky-400/50 animate-spin ${className}`}
      style={{
        width: size,
        height: size,
        borderWidth: thickness,
      }}
      aria-label="Loading"
      role="status"
    />
  );
}