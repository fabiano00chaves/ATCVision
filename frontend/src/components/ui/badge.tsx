import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        pane: 'border-red-300 dark:border-red-900 bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 font-bold',
        jump: 'border-amber-300 dark:border-amber-900 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold',
        success: 'border-emerald-300 dark:border-emerald-900 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300',
        info: 'border-sky-300 dark:border-sky-900 bg-sky-100 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300',
        purple: 'border-purple-300 dark:border-purple-900 bg-purple-100 dark:bg-purple-950/60 text-purple-800 dark:text-purple-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
