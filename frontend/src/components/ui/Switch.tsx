import clsx from 'clsx';

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

function Switch({ checked, onCheckedChange, disabled = false, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={clsx(
        'relative inline-flex h-8 w-[52px] shrink-0 cursor-pointer items-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-md-primary focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked
          ? 'bg-md-primary'
          : 'bg-md-surface-container-highest border-2 border-md-outline',
        className,
      )}
      onClick={() => onCheckedChange(!checked)}
    >
      <span
        className={clsx(
          'pointer-events-none block rounded-full shadow-sm ring-0 transition-all',
          checked
            ? 'h-6 w-6 translate-x-[26px] bg-md-on-primary'
            : 'h-4 w-4 translate-x-[6px] bg-md-outline',
        )}
      />
    </button>
  );
}

export { Switch };
