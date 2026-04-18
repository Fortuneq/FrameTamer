import { type SelectHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';
import { MaterialIcon } from './MaterialIcon';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[];
  placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, placeholder, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          className={clsx(
            'flex h-10 w-full appearance-none rounded-[4px] border border-md-outline bg-transparent px-3 py-2 pr-8 text-sm text-md-on-surface transition-colors',
            'focus-visible:outline-none focus-visible:border-md-primary focus-visible:ring-1 focus-visible:ring-md-primary',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          ref={ref}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <MaterialIcon
          name="expand_more"
          size={20}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-md-on-surface-variant"
        />
      </div>
    );
  },
);

Select.displayName = 'Select';
export { Select };
