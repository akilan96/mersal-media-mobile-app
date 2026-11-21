import type { Client, StudioEvent } from './types';
export const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
export const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
export const paidAmount = (event: StudioEvent) => Math.round(event.payments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
export const balanceAmount = (event: StudioEvent) => Math.max(0, Math.round((event.totalAmount - paidAmount(event)) * 100) / 100);
export const paymentLabel = (event: StudioEvent) => balanceAmount(event) === 0 ? 'Paid' : paidAmount(event) > 0 ? 'Partially Paid' : 'Pending';
export const eventSummary = (event: StudioEvent, client?: Client) => [
  'MERSAL MEDIA · EVENT RECORD', event.title, `${formatDate(event.date)} · ${formatTime(event.date)}`,
  `Venue: ${event.location}`, `Type: ${event.type}`, `Status: ${event.status}`,
  ...(client ? [`Client: ${client.name}`, `Phone: ${client.phone}`] : []),
  `Guests: ${event.attendees}`, `Crew: ${event.crew.join(', ') || 'None assigned'}`,
  `Equipment: ${event.equipment.join(', ') || 'None added'}`, `Total: ${money(event.totalAmount)}`,
  `Received: ${money(paidAmount(event))}`, `Balance: ${money(balanceAmount(event))}`,
  ...event.payments.map(p => `${formatDate(p.date)} · ${p.note}: ${money(p.amount)}`),
  ...(event.notes ? [`Notes: ${event.notes}`] : []),
].join('\n');
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
export const upcomingEvents = (events: StudioEvent[], now = new Date()) => events.filter(e => e.status === 'Scheduled' && new Date(e.date).getTime() >= now.getTime()).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
