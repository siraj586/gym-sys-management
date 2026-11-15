import { Link, type LinkProps } from 'react-router';

type Props = LinkProps & { variant?: 'primary' | 'outline' };

const variants = {
  primary: 'bg-lime text-ink hover:brightness-110',
  outline: 'border border-fg text-fg hover:border-lime hover:text-lime',
};

/** A link that looks like Button, for actions that open another page. */
export function ButtonLink({ variant = 'primary', className = '', ...props }: Props) {
  return (
    <Link
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-5 text-sm font-semibold transition ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
