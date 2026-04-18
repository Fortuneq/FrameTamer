import { type InputHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

type InputProps = InputHTMLAttributes<HTMLInputElement>;

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        type={type}
        className={clsx(
          'flex h-10 w-full rounded-[4px] border border-md-outline bg-transparent px-3 py-2 text-sm text-md-on-surface transition-colors',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'placeholder:text-md-on-surface-variant',
          'focus-visible:outline-none focus-visible:border-md-primary focus-visible:ring-1 focus-visible:ring-md-primary',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);

Input.displayName = 'Input';
export { Input };
