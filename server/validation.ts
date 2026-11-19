import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max);
export const contactSchema = z.object({
  name: text(60),
  kana: z.string().trim().max(100).default(''),
  email: z.email().max(254),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+()\s-]*$/)
    .default(''),
});
export const settingsSchema = z.object({
  issuer: text(60),
  bank: text(60),
  branch: text(60),
  accountType: z.enum(['普通', '当座', '貯蓄']),
  accountNumber: z.string().regex(/^\d{7}$/, '口座番号は7桁で入力してください'),
  accountHolder: text(100),
});
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, '有効な日付を入力してください');
export const invoiceSchema = z.object({
  contactIds: z
    .array(z.uuid())
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length),
  amount: z.number().int().min(1).max(999999999),
  description: text(160),
  dueDate: dateSchema,
});
export const receiptSchema = z.object({
  name: text(60),
  description: text(160),
});
export function today(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(
    new Date(),
  );
}
