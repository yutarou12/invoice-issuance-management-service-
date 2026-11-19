import nodemailer from 'nodemailer';
import type { Invoice } from '../shared/types.js';
import { documentPng } from './document.js';

export const mailConfigured = () =>
  Boolean(process.env.SMTP_PASSWORD && process.env.SMTP_FROM);
/** トークンはサーバー内だけで使用し、CloudflareのTLS SMTPへ送る。 */
export async function sendDocument(
  invoice: Invoice,
  kind: 'invoice' | 'receipt',
) {
  if (!mailConfigured())
    throw new Error(
      'SMTP_FROMとSMTP_PASSWORDを.envに設定して再起動してください',
    );
  const title = kind === 'invoice' ? '請求書' : '領収書';
  const id = kind === 'invoice' ? invoice.id : invoice.receipt!.id;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.mx.cloudflare.net',
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: {
      user: process.env.SMTP_USER || 'api_token',
      pass: process.env.SMTP_PASSWORD,
    },
    connectionTimeout: 15000,
    socketTimeout: 30000,
  });
  try {
    const result = await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: invoice.contact.email,
      subject: `${title} ${id}`,
      text: `${invoice.contact.name} 様\n\n${invoice.issuer.issuer}より${title}をお送りします。\n内容: ${kind === 'receipt' ? invoice.receipt!.description : invoice.description}\n金額: ${invoice.amount.toLocaleString('ja-JP')}円\n${kind === 'invoice' ? `期日: ${invoice.dueDate}\n振込先: ${invoice.issuer.bank} ${invoice.issuer.branch} ${invoice.issuer.accountType} ${invoice.issuer.accountNumber}\n口座名義: ${invoice.issuer.accountHolder}` : '上記金額を受領いたしました。'}\n\n添付画像をご確認ください。`,
      attachments: [
        {
          filename: `${id}.png`,
          content: await documentPng(invoice, kind),
          contentType: 'image/png',
        },
      ],
    });
    if (!result.accepted?.length || result.rejected?.length)
      throw new Error('SMTPサーバーが送信先を受け付けませんでした');
  } finally {
    transport.close();
  }
}
