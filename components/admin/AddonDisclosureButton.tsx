'use client';

import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AddonDisclosureButton({ open, controls, onToggle, disabled, closedLabel = 'Sumar adicional' }: {
  open: boolean; controls: string; onToggle: () => void; disabled?: boolean; closedLabel?: string;
}) {
  const Icon = open ? X : Plus;
  return <Button type="button" size="sm" variant="outline" aria-expanded={open} aria-controls={controls} onClick={onToggle} disabled={disabled}>
    <Icon className="h-3.5 w-3.5" aria-hidden="true" />{open ? 'Cerrar' : closedLabel}
  </Button>;
}
