/** Receipt document → 32-column printed text (Sim §3.9.7). */
import type { ReceiptDoc, TimeState } from '../types';
import { fmtDateLabel, fmtMoney, fmtRateBp, fmtTime12 } from './time';

export const RECEIPT_WIDTH = 32;

function lr(left: string, right: string): string {
  const space = Math.max(1, RECEIPT_WIDTH - left.length - right.length);
  return `${left}${' '.repeat(space)}${right}`;
}
function center(s: string): string {
  const pad = Math.max(0, Math.floor((RECEIPT_WIDTH - s.length) / 2));
  return `${' '.repeat(pad)}${s}`;
}

export function receiptText(doc: ReceiptDoc, time: Pick<TimeState, 'epochDate'>): string {
  const rule = '-'.repeat(RECEIPT_WIDTH);
  const g = (c: number) => fmtMoney(c);
  const out: string[] = [doc.merchantName, doc.address, lr(`${fmtDateLabel(time, doc.printedAtMs)} ${time.epochDate.slice(0, 4)}`, fmtTime12(time, doc.printedAtMs)), `Order ${doc.orderId}`, rule];
  for (const l of doc.lines) out.push(lr(l.qty > 1 ? `${l.qty} x ${l.name}` : l.name, g(l.priceCents * l.qty)));
  out.push(rule, lr('Subtotal', g(doc.subtotalCents)), lr(`Tax (${fmtRateBp(doc.taxRateBp)})`, g(doc.taxCents)));
  if (doc.cardAdjustCents > 0) out.push(lr(`Non-cash adj. (${fmtRateBp(doc.cardAdjustBp)})`, g(doc.cardAdjustCents)));
  out.push(lr(doc.tipPct != null ? `Tip (${doc.tipPct}%)` : 'Tip', g(doc.tipCents)), lr('Total', g(doc.totalCents)));
  if (doc.brand && doc.panLast4) out.push(lr(`${doc.brand} •••• ${doc.panLast4}`, doc.entry ?? ''));
  else out.push(lr('CASH', g(doc.totalCents)));
  if (doc.authCode) out.push(lr(`Auth ${doc.authCode}`, doc.approved ? 'APPROVED' : 'DECLINED'));
  out.push(center('Thank you!'));
  return out.join('\n');
}

/** Decline reasons shown on the customer display (Sim §3.9.3). */
export const DECLINE = {
  notSupported: 'Card not supported',
  expired: 'Expired card',
  pinTries: 'PIN tries exceeded',
  timedOut: 'Timed out',
} as const;

export const TOAST = {
  cardRead: 'Card read error, try again',
  noPrinter: 'Printer not available',
  noPaper: 'Printer out of paper',
  sign: 'Please sign',
  badPin: 'Incorrect PIN',
  paymentComplete: 'Payment complete',
  wrongPasscode: 'Wrong passcode',
  steppers: 'Steppers disabled',
} as const;
