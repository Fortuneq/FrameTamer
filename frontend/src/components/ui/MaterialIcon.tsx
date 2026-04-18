interface MaterialIconProps {
  name: string;
  className?: string;
  size?: number;
  filled?: boolean;
}

export function MaterialIcon({ name, className, size = 24, filled = false }: MaterialIconProps) {
  return (
    <span
      className={`material-symbols-rounded ${className ?? ''}`}
      style={{
        fontSize: size,
        fontVariationSettings: filled ? "'FILL' 1" : "'FILL' 0",
      }}
    >
      {name}
    </span>
  );
}
