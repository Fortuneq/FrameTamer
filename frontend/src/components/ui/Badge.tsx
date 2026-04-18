import type { HTMLAttributes } from 'react';
import clsx from 'clsx';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';

interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, string> = {
  default:
    'bg-md-primary text-md-on-primary',
  secondary:
    'bg-md-secondary-container text-md-on-secondary-container',
  destructive:
    'bg-md-error text-white',
  outline:
    'border border-md-outline text-md-on-surface',
  success:
    'bg-emerald-100 text-emerald-700 border border-emerald-200',
  warning:
    'bg-amber-100 text-amber-700 border border-amber-200',
};

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
        variantStyles[variant],
        className,
      )}
      {...props}
    />
  );
}

export { Badge, type BadgeProps };
