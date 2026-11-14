import type { ComponentProps } from 'react';

type Props = ComponentProps<'button'> & { variant?: 'primary' | 'outline' };

const variants = {
  primary: 'bg-lime text-ink hover:brightness-110',
  outline: 'border border-fg text-fg hover:border-lime hover:text-lime',
};

export function Button({ variant = 'primary', className = '', type = 'button', ...props }: Props) {
  return (
    <button
      type={type}
      className={`min-h-11 rounded-md px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
