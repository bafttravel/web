export const salesChannels = [
  { value: 'front', label: 'Front' },
  { value: 'web', label: 'Web' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'friend', label: 'Amigo' },
  { value: 'released', label: 'Liberado' },
] as const;
export const salesChannelValues = ['front', 'web', 'whatsapp', 'friend', 'released', 'backoffice', 'hotel', 'other'] as const;
export type SalesChannel = typeof salesChannelValues[number];
export function salesChannelLabel(value: string): string {
  return salesChannels.find((channel) => channel.value === value)?.label ?? ({ backoffice: 'Administración (anterior)', hotel: 'Hotel (anterior)', other: 'Otro (anterior)' } as Record<string, string>)[value] ?? 'Sin informar';
}
