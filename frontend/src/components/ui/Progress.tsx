import clsx from 'clsx';

interface ProgressProps {
  value: number;
  max?: number;
  className?: string;
  indicatorClassName?: string;
}

function Progress({ value, max = 100, className, indicatorClassName }: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      className={clsx(
        'relative h-1 w-full overflow-hidden rounded-full bg-md-surface-container-highest',
        className,
      )}
    >
      <div
        className={clsx(
          'h-full rounded-full bg-md-primary transition-all duration-300',
          indicatorClassName,
        )}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

export { Progress };
