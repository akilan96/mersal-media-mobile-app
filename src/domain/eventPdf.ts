import { balanceAmount, formatTime, money, paidAmount, paymentLabel } from './helpers';
import type { Client, StudioEvent } from './types';
import { eventPdfWordmark } from './eventPdfWordmark';

const layout = {
  top: 22, bottom: 18, header: 88, booking: 152,
  detailsTop: 14, detailsHeading: 27, detailsRow: 65,
  paymentGap: 8, payment: 118, footer: 68,
  historyHeading: 31, historyRow: 50,
};

export function eventPdfPage(event: StudioEvent) {
  const extraRow = event.crew.length > 0 || event.equipment.length > 0;
  const fixedHeight = layout.top + layout.bottom + layout.header + layout.booking
    + layout.detailsTop + layout.detailsHeading + layout.paymentGap + layout.payment + layout.footer;
  const historyHeight = event.status === 'Completed'
    ? layout.historyHeading + layout.historyRow * Math.max(1, event.payments.length)
    : 0;
  return { width: 595, height: fixedHeight + layout.detailsRow * (extraRow ? 3 : 2) + historyHeight + 4 };
}

function escapeHtml(value: string) {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return value.replace(/[&<>"']/g, character => entities[character]);
}

function bookingStatus(status: StudioEvent['status']) {
  return status === 'Scheduled' ? 'Booked' : status;
}

export function eventPdfFileName(event: StudioEvent, client?: Client) {
  const date = new Date(event.date);
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const safeClient = Array.from((client?.name ?? '').normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim())
    .slice(0, 48).join('').replace(/[. ]+$/, '');
  return `${(safeClient || 'Client').replace(/ /g, '_')}+${year}-${month}-${day}+${bookingStatus(event.status)}.pdf`;
}

function field(label: string, value: string) {
  return `<div class="field"><span class="label">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

// Image artwork stays in the PDF when the print engine suppresses CSS backgrounds.
function colorPanel(start: string, end: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100" preserveAspectRatio="none"><defs><linearGradient id="panel"><stop stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient></defs><rect width="400" height="100" fill="url(#panel)"/></svg>`;
  return `<img class="panel-art" src="data:image/svg+xml,${encodeURIComponent(svg)}" alt="">`;
}

export function eventPdfHtml(event: StudioEvent, client?: Client, fonts?: { regular: string; bold: string }) {
  const fontCss = fonts ? `
    @font-face { font-family: Inter; src: url(data:font/ttf;base64,${fonts.regular}) format('truetype'); font-weight: 400; }
    @font-face { font-family: Inter; src: url(data:font/ttf;base64,${fonts.bold}) format('truetype'); font-weight: 700; }
  ` : '';
  const date = new Date(event.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const due = balanceAmount(event);
  const page = eventPdfPage(event);
  const status = bookingStatus(event.status);
  const statusClass = event.status.toLowerCase();
  const payments = event.status === 'Completed'
    ? [...event.payments].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    : [];
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  ${fontCss}
  @page { size: ${page.width}pt ${page.height}pt; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #13233e; background: #fff; font: 12pt/1.35 Inter, Arial, sans-serif; }
  .ticket { margin: ${layout.top}pt auto ${layout.bottom}pt; width: calc(100% - 64pt); max-width: 530pt; }
  header { display: flex; align-items: center; justify-content: space-between; height: ${layout.header}pt; gap: 16pt; padding-bottom: 10pt; }
  .brand { flex: 1; min-width: 0; }
  .wordmark { display: block; width: 197pt; max-width: 100%; height: auto; }
  .address { margin: 4pt 0 0; color: #526482; font-size: 10pt; }
  .document-label { text-align: right; }
  .document-label strong { display: block; font-size: 13pt; color: #18366a; }
  .eyebrow, .label { font-size: 9.5pt; letter-spacing: .8pt; text-transform: uppercase; font-weight: 700; }
  .eyebrow { color: #526482; margin: 3pt 0 0; }
  .booking, .balance-box { position: relative; isolation: isolate; overflow: hidden; }
  .panel-art { display: block; position: absolute; inset: 0; width: 100%; height: 100%; z-index: -1; }
  .booking { display: flex; flex-direction: column; justify-content: center; height: ${layout.booking}pt; border-radius: 14pt; padding: 12pt 20pt; color: #fff; background: #114994; border: 1pt solid #174b9e; }
  .booking .eyebrow { color: #e3edff; margin: 0; }
  h1 { margin: 7pt 0 12pt; font-size: 26pt; line-height: 1.15; }
  .booking-meta { display: flex; align-items: center; justify-content: space-between; gap: 10pt; border-top: 1pt solid #7da8e6; padding-top: 8pt; }
  .date { margin: 0; font-weight: 700; }
  .booking-status { position: relative; isolation: isolate; overflow: hidden; display: inline-flex; align-items: center; gap: 5pt; white-space: nowrap; padding: 4pt 8pt; font-size: 10pt; font-weight: 700; color: #12396b; border: 1pt solid #b8d5fb; border-radius: 14pt; }
  .booking-status.editing { color: #694300; border-color: #f8d781; }
  .booking-status.completed { color: #0b5c37; border-color: #9fdbb9; }
  .booking-status.cancelled { color: #9f1734; border-color: #ffb2be; }
  .status-icon { width: 10pt; height: 10pt; flex-shrink: 0; }
  h2 { margin: 0 0 9pt; font-size: 15pt; color: #18366a; }
  section.details { padding: ${layout.detailsTop}pt 0 0; }
  section.details h2 { height: ${layout.detailsHeading}pt; margin: 0; }
  .details-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: ${layout.detailsRow}pt; column-gap: 20pt; }
  .field { min-width: 0; }
  .details-grid .field { border-top: 1pt solid #e0e7f1; padding: 4pt 0; }
  .label { display: block; color: #526482; margin-bottom: 3pt; }
  .field strong { font-size: 12pt; }
  h1, .field strong { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; }
  .details-grid .field strong { -webkit-line-clamp: 3; }
  .payment { height: ${layout.payment}pt; border-top: 1pt dashed #b4c4db; padding-top: 8pt; margin-top: ${layout.paymentGap}pt; }
  .payment-heading { display: flex; justify-content: space-between; align-items: baseline; gap: 10pt; }
  .payment-heading span { font-size: 10.5pt; font-weight: 700; color: #214b91; }
  .amounts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: center; gap: 10pt; padding: 9pt 0; }
  .amounts > .field { padding-left: 7pt; }
  .amounts .field strong { font-size: 14pt; }
  .balance-box { padding: 9pt 10pt; border: 1pt solid #ead6a6; border-radius: 10pt; }
  .balance-box .label { color: #634711; }
  .history h2 { height: ${layout.historyHeading}pt; margin: 0; padding-top: 3pt; }
  .history-row { display: grid; grid-template-columns: minmax(0, 1fr) 100pt 122pt; gap: 10pt; align-items: center; height: ${layout.historyRow}pt; border-top: 1pt solid #e0e7f1; }
  .history-note { font-size: 12pt; line-height: 1.25; font-weight: 700; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; overflow-wrap: anywhere; }
  .history-date { color: #526482; font-size: 11pt; }
  .history-amount { color: #126344; font-size: 13pt; font-weight: 700; font-variant-numeric: tabular-nums; text-align: right; overflow-wrap: anywhere; }
  footer { height: ${layout.footer}pt; border-top: 1pt solid #e0e7f1; padding-top: 8pt; text-align: center; color: #526482; font-size: 9.5pt; }
  .socials { display: flex; justify-content: center; align-items: center; gap: 8pt; margin-top: 4pt; }
  .socials a { display: inline-flex; align-items: center; gap: 4pt; color: #174b9e; font-weight: 700; text-decoration: underline; }
  .socials svg { width: 13pt; height: 13pt; }
  .company-credit { display: flex; justify-content: center; align-items: center; gap: 5pt; margin-top: calc(4pt + 10px); font-weight: 400; }
  .crafted-by { font-style: italic; }
  .credit-heart { display: inline-block; width: 10pt; height: 8pt; vertical-align: -1pt; margin-left: 4pt; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head>
<body><main class="ticket">
  <header>
    <div class="brand">
      <img class="wordmark" src="${eventPdfWordmark}" alt="Mersal Media Photography">
      <p class="address">RAMARMADAM, South St, Prathamaramapuram, Tamil Nadu 611110</p>
    </div>
    <div class="document-label"><strong>Event Booking</strong><p class="eyebrow">Client copy</p></div>
  </header>
  <section class="booking">
    ${colorPanel('#102C62', '#175FD1')}
    <p class="eyebrow">Photography booking</p>
    <h1>${escapeHtml(`${client?.name || 'Client'} - ${event.type}`)}</h1>
    <div class="booking-meta">
      <p class="date">${escapeHtml(date)} &nbsp;·&nbsp; ${escapeHtml(formatTime(event.date).toUpperCase())}</p>
      <span class="booking-status ${statusClass}">
        ${event.status === 'Cancelled' ? colorPanel('#FFD1D9', '#FFF0F2')
          : event.status === 'Completed' ? colorPanel('#BDEFD0', '#EAFBF1')
          : event.status === 'Editing' ? colorPanel('#FFE29B', '#FFF4D6')
          : colorPanel('#C8E1FF', '#EBF4FF')}
        <svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          ${event.status === 'Cancelled' ? '<path d="M6 6l12 12M18 6 6 18"/>'
            : event.status === 'Editing' ? '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
            : '<path d="m5 12 4 4L19 6"/>'}
        </svg>
        ${escapeHtml(status)}
      </span>
    </div>
  </section>
  <section class="details">
    <h2>Booking details</h2>
    <div class="details-grid">
      ${field('Client', client?.name || '—')}
      ${field('Venue', event.location)}
      ${field('Phone', client?.phone || '—')}
      ${field('Expected guests', String(event.attendees))}
      ${event.crew.length ? field('Crew', event.crew.join(', ')) : ''}
      ${event.equipment.length ? field('Equipment', event.equipment.join(', ')) : ''}
    </div>
  </section>
  <section class="payment">
    <div class="payment-heading"><h2>Payment summary</h2><span>${escapeHtml(paymentLabel(event))}</span></div>
    <div class="amounts">
      ${field('Total amount', money(event.totalAmount))}
      ${field('Amount received', money(paidAmount(event)))}
      <div class="balance-box">${colorPanel('#FFE7AE', '#FFF5DF')}${field('Balance due', money(due))}</div>
    </div>
  </section>
  ${event.status === 'Completed' ? `<section class="history">
    <h2>Payments Added</h2>
    ${payments.length ? payments.map(payment => `<div class="history-row">
      <span class="history-note">${escapeHtml(payment.note || 'Payment received')}</span>
      <span class="history-date">${escapeHtml(new Date(payment.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }))}</span>
      <span class="history-amount">${escapeHtml(money(payment.amount))}</span>
    </div>`).join('') : '<div class="history-row">No payments recorded.</div>'}
  </section>` : ''}
  <footer>
    <div class="socials">
      <span>Follow Us on:</span>
      <a href="https://www.youtube.com/@mersalmediapoovai8342">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="4.5" width="22" height="15" rx="4" fill="#FF0033"/><path d="M10 8.5v7l6-3.5z" fill="#fff"/></svg>
        <span>YouTube</span>
      </a>
      <span aria-hidden="true">|</span>
      <a href="https://www.instagram.com/mmpphotography555/">
        <svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="instagram" x1="0%" y1="100%" x2="100%" y2="0%"><stop stop-color="#FCAF45"/><stop offset=".5" stop-color="#E1306C"/><stop offset="1" stop-color="#833AB4"/></linearGradient></defs><rect x="1" y="1" width="22" height="22" rx="6" fill="url(#instagram)"/><rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="12" r="3.1" fill="none" stroke="#fff" stroke-width="1.6"/><circle cx="16.4" cy="7.7" r="1" fill="#fff"/></svg>
        <span>Instagram</span>
      </a>
    </div>
    <div class="company-credit">
      <span class="crafted-by">Crafted by:</span>
      <span>Ameyy Digital Services<svg class="credit-heart" viewBox="2 4 20 18" aria-hidden="true"><path fill="#168454" d="M12 21s-9-5.4-9-11a4.8 4.8 0 0 1 9-2.3A4.8 4.8 0 0 1 21 10c0 5.6-9 11-9 11z"/></svg></span>
    </div>
  </footer>
</main></body></html>`;
}
