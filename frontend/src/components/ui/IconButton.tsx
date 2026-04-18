import { type ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'sm' | 'default' | 'lg';
}

const variantStyles = {
  default:
    'bg-md-primary text-md-on-primary hover:brightness-110',
  ghost:
    'text-md-on-surface-variant hover:bg-md-surface-container-high',
  outline:
    'border border-md-outline text-md-on-surface-variant hover:bg-md-surface-container-high',
};

const sizeStyles = {
  sm: 'h-7 w-7',
  default: 'h-10 w-10',
  lg: 'h-12 w-12',
};

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = 'ghost', size = 'default', ...props }, ref) => {
    return (
      <button
        className={clsx(
          'inline-flex items-center justify-center rounded-full transition-all cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-primary',
          'disabled:pointer-events-none disabled:opacity-50',
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);

IconButton.displayName = 'IconButton';
export { IconButton };
