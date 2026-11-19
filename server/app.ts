import express from 'express';
import { randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';
import { ZodError, z } from 'zod';
import type { Invoice, Page } from '../shared/types.js';
import type { Store } from './store.js';
import {
  contactSchema,
  invoiceSchema,
  receiptSchema,
  settingsSchema,
  today,
} from './validation.js';
import { documentPng } from './document.js';
import { mailConfigured, sendDocument } from './mail.js';

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const check = (condition: unknown, status: number, message: string): void => {
  if (!condition) throw new HttpError(status, message);
};

export function createApp(
  store: Store,
  password: string,
  mailer = sendDocument,
) {
  const app = express();
  app.disable('x-powered-by');
  // Basic認証もVPN内のHTTPS経由で使用する。認証情報はハッシュ後に一定時間比較する。
  const digest = (value: string) => createHash('sha256').update(value).digest();
  const failures = new Map<string, { count: number; reset: number }>();
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    });
    const key = req.ip || 'local';
    const failed = failures.get(key);
    if (failed && failed.reset > Date.now() && failed.count >= 20) {
      res
        .status(429)
        .send('認証の試行回数を超えました。15分後に再試行してください。');
      return;
    }
    const credentials = Buffer.from(
      (req.headers.authorization || '').replace(/^Basic /, ''),
      'base64',
    ).toString();
    if (!timingSafeEqual(digest(credentials), digest(`admin:${password}`))) {
      // 古い記録だけを掃除し、ファイルや利用者データには触れない。
      if (failures.size > 1000)
        for (const [ip, entry] of failures)
          if (entry.reset <= Date.now()) failures.delete(ip);
      failures.set(key, {
        count: failed && failed.reset > Date.now() ? failed.count + 1 : 1,
        reset:
          failed && failed.reset > Date.now()
            ? failed.reset
            : Date.now() + 900000,
      });
      res
        .set('WWW-Authenticate', 'Basic realm="Tatekae", charset="UTF-8"')
        .status(401)
        .send('認証が必要です');
      return;
    }
    failures.delete(key);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers['sec-fetch-site'] === 'cross-site') {
        res
          .status(403)
          .json({ error: '別サイトからの操作は許可されていません' });
        return;
      }
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) {
        res.status(403).json({ error: '送信元が一致しません' });
        return;
      }
      if (!req.is('application/json')) {
        res.status(415).json({ error: 'JSON形式で送信してください' });
        return;
      }
    }
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  function paginate<T>(items: T[], query: express.Request['query']): Page<T> {
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .parse(query.page ?? 1);
    const pageSize = z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .parse(query.pageSize ?? 10);
    return {
      items: items.slice((page - 1) * pageSize, page * pageSize),
      total: items.length,
      page,
      pageSize,
    };
  }
  const queryText = (value: unknown) =>
    typeof value === 'string' ? value.slice(0, 200).toLocaleLowerCase() : '';
  function findInvoice(id: string): Invoice {
    const invoice = store.invoices().find((item) => item.id === id);
    if (!invoice) throw new HttpError(404, '請求書が見つかりません');
    return invoice;
  }
  app.get('/api/settings', (_req, res) =>
    res.json({ settings: store.settings(), mailConfigured: mailConfigured() }),
  );
  app.put('/api/settings', (req, res) => {
    const settings = settingsSchema.parse(req.body);
    store.saveSettings(settings);
    res.json(settings);
  });
  app.get('/api/summary', (_req, res) => {
    const items = store.invoices();
    res.json({
      outstanding: items
        .filter(
          (item) => item.status !== 'completed' && item.status !== 'cancelled',
        )
        .reduce((sum, item) => sum + item.amount, 0),
      overdue: items.filter(
        (item) =>
          item.status !== 'completed' &&
          item.status !== 'cancelled' &&
          item.dueDate < today(),
      ).length,
      completed: items.filter((item) => item.status === 'completed').length,
      total: items.length,
    });
  });
  app.get('/api/contacts', (req, res) => {
    const q = queryText(req.query.q);
    const items = store
      .contacts()
      .filter((item) =>
        [item.name, item.kana, item.email, item.phone].some((value) =>
          value.toLocaleLowerCase().includes(q),
        ),
      )
      .sort((a, b) => (a.kana || a.name).localeCompare(b.kana || b.name, 'ja'));
    res.json(paginate(items, req.query));
  });
  app.post('/api/contacts', (req, res) => {
    const data = contactSchema.parse(req.body);
    check(
      !store
        .contacts()
        .some((item) => item.email.toLowerCase() === data.email.toLowerCase()),
      409,
      'このメールアドレスは登録済みです',
    );
    const contact = { ...data, id: randomUUID() };
    store.saveContact(contact);
    res.status(201).json(contact);
  });
  app.put('/api/contacts/:id', (req, res) => {
    const data = contactSchema.parse(req.body);
    check(
      store.contacts().some((item) => item.id === req.params.id),
      404,
      '連絡先が見つかりません',
    );
    check(
      !store
        .contacts()
        .some(
          (item) =>
            item.id !== req.params.id &&
            item.email.toLowerCase() === data.email.toLowerCase(),
        ),
      409,
      'このメールアドレスは登録済みです',
    );
    const contact = { ...data, id: req.params.id };
    store.saveContact(contact);
    res.json(contact);
  });
  app.get('/api/contacts/template', (_req, res) =>
    res
      .type('text/csv; charset=utf-8')
      .attachment('contacts-template.csv')
      .send(
        '\ufeff名前,ふりがな,メールアドレス,電話番号\r\n山田 太郎,やまだ たろう,taro@example.com,090-1234-5678\r\n',
      ),
  );
  app.post('/api/contacts/import', (req, res) => {
    const { csv } = z.object({ csv: z.string().max(1000000) }).parse(req.body);
    let rows: Record<string, string>[];
    try {
      rows = parse(csv, {
        columns: true,
        bom: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch {
      throw new HttpError(
        400,
        'CSVの形式が不正です。テンプレートを使用してください',
      );
    }
    check(
      rows.length > 0 && rows.length <= 1000,
      400,
      'CSVは1〜1000行で指定してください',
    );
    const emails = new Set(
      store.contacts().map((item) => item.email.toLowerCase()),
    );
    const errors: string[] = [];
    const contacts = rows.map((row, index) => {
      const parsed = contactSchema.safeParse({
        name: row['名前'],
        kana: row['ふりがな'],
        email: row['メールアドレス'],
        phone: row['電話番号'],
      });
      if (!parsed.success) {
        errors.push(
          `${index + 2}行目: 氏名・メール・電話番号を確認してください`,
        );
        return undefined;
      }
      const email = parsed.data.email.toLowerCase();
      if (emails.has(email))
        errors.push(`${index + 2}行目: メールアドレスが重複しています`);
      emails.add(email);
      return { ...parsed.data, id: randomUUID() };
    });
    check(errors.length === 0, 400, errors.slice(0, 10).join('\n'));
    store.transaction(() =>
      contacts.forEach((contact) => {
        if (contact) store.saveContact(contact);
      }),
    );
    res.status(201).json({ imported: contacts.length });
  });
  app.get('/api/invoice-item-history', (req, res) => {
    const q = queryText(req.query.q);
    const descriptions = store
      .invoices()
      .flatMap((invoice) =>
        (invoice.items ?? [{ description: invoice.description }]).map(
          (item) => item.description,
        ),
      );
    res.json(
      [...new Set(descriptions)].filter((value) =>
        value.toLocaleLowerCase().includes(q),
      ),
    );
  });
  app.get('/api/invoices', (req, res) => {
    const q = queryText(req.query.q);
    const status = queryText(req.query.status);
    const items = store
      .invoices()
      .filter(
        (item) =>
          [item.id, item.contact.name, item.description].some((value) =>
            value.toLocaleLowerCase().includes(q),
          ) &&
          (!status ||
            (status === 'overdue'
              ? item.status !== 'completed' &&
                item.status !== 'cancelled' &&
                item.dueDate < today()
              : item.status === status)),
      );
    res.json(paginate(items, req.query));
  });
  app.post('/api/invoices', (req, res) => {
    const data = invoiceSchema.parse(req.body);
    const issuer = store.settings();
    check(issuer, 400, '先に発行者・振込先を設定してください');
    check(data.dueDate >= today(), 400, '期日は本日以降を指定してください');
    const contacts = data.contactIds.map((id) =>
      store.contacts().find((item) => item.id === id),
    );
    check(contacts.every(Boolean), 400, '選択された連絡先が見つかりません');
    const invoices: Invoice[] = contacts.map((contact) => ({
      id: `INV-${randomUUID()}`,
      contact: contact!,
      issuer: issuer!,
      items: data.items,
      amount: data.amount,
      description: data.description,
      dueDate: data.dueDate,
      issuedAt: new Date().toISOString(),
      status: 'issued',
    }));
    store.transaction(() => invoices.forEach(store.saveInvoice));
    res.status(201).json(invoices);
  });
  app.get('/api/invoices/:id', (req, res) =>
    res.json(findInvoice(req.params.id)),
  );
  // 同一書類の送信中は再送・領収書変更を拒否し、非同期処理による上書きを防ぐ。
  const sending = new Set<string>();
  app.post('/api/invoices/:id/cancel', (req, res) => {
    z.object({}).strict().parse(req.body);
    const invoice = findInvoice(req.params.id);
    check(
      !sending.has(invoice.id),
      409,
      '送信処理中です。完了をお待ちください',
    );
    check(invoice.status !== 'cancelled', 409, 'この請求書は取り消し済みです');
    invoice.status = 'cancelled';
    invoice.cancelledAt = new Date().toISOString();
    store.saveInvoice(invoice);
    res.json(invoice);
  });
  app.post('/api/invoices/:id/receipt', (req, res) => {
    const invoice = findInvoice(req.params.id);
    check(
      invoice.status !== 'cancelled',
      409,
      '取り消し済みの請求書には領収書を発行できません',
    );
    const data = receiptSchema.parse(req.body);
    check(!sending.has(invoice.id), 409, '送信処理中です');
    check(!invoice.receipt, 409, '領収書は発行済みです');
    invoice.receipt = {
      ...data,
      id: `REC-${randomUUID()}`,
      amount: invoice.amount,
      issuedAt: new Date().toISOString(),
    };
    store.saveInvoice(invoice);
    res.status(201).json(invoice);
  });
  app.get('/api/invoices/:id/:kind/image', async (req, res) => {
    const kind = z.enum(['invoice', 'receipt']).parse(req.params.kind);
    const invoice = findInvoice(req.params.id);
    check(
      kind !== 'receipt' || invoice.receipt,
      404,
      '領収書が発行されていません',
    );
    res.type('png').send(await documentPng(invoice, kind));
  });
  app.post('/api/invoices/:id/:kind/deliver', async (req, res) => {
    const kind = z.enum(['invoice', 'receipt']).parse(req.params.kind);
    const { method, resend } = z
      .object({
        method: z.enum(['email', 'shared']),
        resend: z.boolean().default(false),
      })
      .parse(req.body);
    const invoice = findInvoice(req.params.id);
    check(
      kind !== 'receipt' || invoice.receipt,
      400,
      '先に領収書を発行してください',
    );
    check(
      !sending.has(invoice.id),
      409,
      '送信処理中です。完了をお待ちください',
    );
    check(
      invoice.status !== 'cancelled',
      409,
      '取り消し済みの請求書は送信できません',
    );
    const alreadySent =
      kind === 'invoice' ? invoice.sentAt : invoice.receipt?.sentAt;
    check(!alreadySent || resend, 409, '送信済みです。再送の確認が必要です');
    sending.add(invoice.id);
    try {
      if (method === 'email') {
        try {
          await mailer(invoice, kind);
        } catch {
          throw new HttpError(
            502,
            'メールを送信できませんでした。SMTP設定・Cloudflareのログを確認してください。状態は変更していません。',
          );
        }
      }
      const now = new Date().toISOString();
      if (kind === 'receipt') {
        invoice.receipt!.sentAt = now;
        invoice.status = 'completed';
      } else {
        invoice.sentAt = now;
        if (invoice.status !== 'completed') invoice.status = 'sent';
      }
      store.saveInvoice(invoice);
      res.json(invoice);
    } finally {
      sending.delete(invoice.id);
    }
  });
  app.use('/api', (_req, res) =>
    res.status(404).json({ error: 'APIが見つかりません' }),
  );
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join('\n'),
        });
        return;
      }
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      if (error instanceof SyntaxError) {
        res.status(400).json({ error: 'JSONの形式が不正です' });
        return;
      }
      console.error(
        '処理エラー:',
        error instanceof Error ? error.message : 'unknown',
      );
      res.status(500).json({
        error: '処理に失敗しました。入力とサーバーログを確認してください。',
      });
    },
  );
  return app;
}
