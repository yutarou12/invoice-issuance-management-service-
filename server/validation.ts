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
const money = z.number().int().min(1).max(999999999);
const invoiceItems = z
  .array(z.object({ description: text(160), amount: money }))
  .min(1)
  .max(100)
  .refine(
    (items) => items.reduce((sum, item) => sum + item.amount, 0) <= 999999999,
    '合計金額は999,999,999円以下にしてください',
  );
export const invoiceSchema = z
  .object({
    contactIds: z
      .array(z.uuid())
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length),
    dueDate: dateSchema,
  })
  .and(
    z.union([
      z.object({ items: invoiceItems }),
      z.object({
        items: z.never().optional(),
        amount: money,
        description: text(160),
      }),
    ]),
  )
  .transform((data) => {
    const items = data.items ?? [
      { description: data.description, amount: data.amount },
    ];
    return {
      ...data,
      items,
      amount: items.reduce((sum, item) => sum + item.amount, 0),
      description: items.map((item) => item.description).join(' / '),
    };
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
