import { type TextareaHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={clsx(
          'flex min-h-[60px] w-full rounded-[4px] border border-md-outline bg-transparent px-3 py-2 text-sm text-md-on-surface transition-colors',
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

Textarea.displayName = 'Textarea';
export { Textarea };
