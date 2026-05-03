import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-[transform,background-color,color,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        arcade:
          'rounded-full border-2 border-[var(--retro-ink)] bg-[var(--retro-orange)] text-[var(--retro-ivory)] shadow-[4px_4px_0px_0px_rgba(15,17,31,0.94)] hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-[var(--retro-orange-soft)] hover:shadow-[2px_2px_0px_0px_rgba(15,17,31,0.94)]',
        arcadeOutline:
          'rounded-full border-2 border-[rgba(15,17,31,0.2)] bg-[rgba(255,255,255,0.94)] text-[var(--retro-ink)] shadow-[3px_3px_0px_0px_rgba(15,17,31,0.12)] hover:border-[var(--retro-orange)] hover:text-[var(--retro-orange)]',
        arcadeDark:
          'rounded-full border-2 border-[var(--retro-ink)] bg-[var(--retro-gold)] text-[var(--retro-ink)] shadow-[4px_4px_0px_0px_rgba(15,17,31,0.94)] hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-[#ffe27b] hover:shadow-[2px_2px_0px_0px_rgba(15,17,31,0.94)]',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        xl: 'h-12 rounded-full px-10 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
