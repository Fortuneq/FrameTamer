import { type ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  default:
    'bg-md-primary text-md-on-primary hover:brightness-110 shadow-sm',
  destructive:
    'bg-md-error text-white hover:brightness-110 shadow-sm',
  outline:
    'border border-md-outline bg-transparent text-md-primary hover:bg-md-surface-container-high',
  secondary:
    'bg-md-secondary-container text-md-on-secondary-container hover:brightness-95',
  ghost:
    'text-md-primary hover:bg-md-surface-container-high',
  link:
    'text-md-primary underline-offset-4 hover:underline',
};

const sizeStyles: Record<ButtonSize, string> = {
  default: 'h-10 px-6 py-2',
  sm: 'h-8 px-4 text-xs',
  lg: 'h-12 px-8',
  icon: 'h-10 w-10',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={clsx(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          'cursor-pointer',
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

Button.displayName = 'Button';
export { Button, type ButtonProps };
