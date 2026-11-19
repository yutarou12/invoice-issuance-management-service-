import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { createStore } from '../server/store.js';
import type { Contact, Invoice, Page } from '../shared/types.js';
import { today } from '../server/validation.js';

// 一時DBは利用者の削除制限に従い、テスト終了時にも削除しない。
test('主要API: 認証・検証・CSVの原子性・書類生成・状態遷移・永続化', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tatekae-test-'));
  const store = createStore(directory);
  let mailFails = true;
  let calls = 0;
  let mailStarted: (() => void) | undefined;
  let mailWait: Promise<void> | undefined;
  const server = createApp(store, 'test-password-123456', async () => {
    calls++;
    mailStarted?.();
    await mailWait;
    if (mailFails) throw new Error('test failure');
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  async function request(
    path: string,
    body?: unknown,
    method = 'POST',
    extra: Record<string, string> = {},
  ) {
    return fetch(`${base}/api${path}`, {
      method: body === undefined ? 'GET' : method,
      headers: {
        Authorization: `Basic ${Buffer.from('admin:test-password-123456').toString('base64')}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  try {
    assert.equal((await fetch(`${base}/api/contacts`)).status, 401);
    assert.equal(
      (
        await request('/settings', {}, 'PUT', {
          Origin: 'https://evil.example',
        })
      ).status,
      403,
    );
    assert.equal(
      (await request('/contacts', { name: '不正', email: 'bad' })).status,
      400,
    );
    const settings = {
      issuer: '立替 太郎',
      bank: 'テスト銀行',
      branch: '本店',
      accountType: '普通',
      accountNumber: '0123456',
      accountHolder: 'タテカエ タロウ',
    };
    assert.equal((await request('/settings', settings, 'PUT')).status, 200);
    const contact = (await (
      await request('/contacts', {
        name: '山田 花子',
        kana: 'やまだ はなこ',
        email: 'hanako@example.com',
        phone: '090-1234-5678',
      })
    ).json()) as Contact;
    assert(contact.id);
    assert.equal(
      (
        await request('/contacts', {
          name: '重複',
          email: 'HANAKO@example.com',
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request('/contacts/import', {
          csv: '名前,ふりがな,メールアドレス,電話番号\n鈴木,すずき,suzuki@example.com,\n不正,,bad,\n',
        })
      ).status,
      400,
    );
    assert.equal(
      ((await (await request('/contacts')).json()) as Page<Contact>).total,
      1,
    );
    assert.equal(
      (
        await request('/contacts/import', {
          csv: '\ufeff名前,ふりがな,メールアドレス,電話番号\r\n"鈴木,次郎",すずき,suzuki@example.com,\r\n',
        })
      ).status,
      201,
    );
    assert.equal(
      (
        (await (
          await request('/contacts?page=2&pageSize=1')
        ).json()) as Page<Contact>
      ).items.length,
      1,
    );
    const body = {
      contactIds: [contact.id],
      amount: 3500,
      description: '食事会 <立替> & 会費',
      dueDate: today(),
    };
    assert.equal(
      (await request('/invoices', { ...body, dueDate: '2026-02-30' })).status,
      400,
    );
    assert.equal(
      (await request('/invoices', { ...body, amount: 1.2 })).status,
      400,
    );
    const [invoice] = (await (
      await request('/invoices', body)
    ).json()) as Invoice[];
    assert(invoice.id.startsWith('INV-'));
    await request('/settings', { ...settings, bank: '変更銀行' }, 'PUT');
    const saved = (await (
      await request(`/invoices/${invoice.id}`)
    ).json()) as Invoice;
    assert.equal(saved.issuer.bank, 'テスト銀行');
    const image = await request(`/invoices/${invoice.id}/invoice/image`);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.deepEqual(
      [...new Uint8Array(await image.arrayBuffer()).slice(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
    assert.equal(
      (
        await request(`/invoices/${invoice.id}/receipt/deliver`, {
          method: 'shared',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(`/invoices/${invoice.id}/invoice/deliver`, {
          method: 'email',
        })
      ).status,
      502,
    );
    assert.equal(
      ((await (await request(`/invoices/${invoice.id}`)).json()) as Invoice)
        .status,
      'issued',
    );
    mailFails = false;
    assert.equal(
      (
        await request(`/invoices/${invoice.id}/invoice/deliver`, {
          method: 'email',
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request(`/invoices/${invoice.id}/invoice/deliver`, {
          method: 'email',
        })
      ).status,
      409,
    );
    const issuedReceipt = (await (
      await request(`/invoices/${invoice.id}/receipt`, {
        name: '山田 花子',
        description: '飲食代として',
      })
    ).json()) as Invoice;
    assert.equal(issuedReceipt.status, 'sent');
    assert.equal(issuedReceipt.receipt?.amount, 3500);
    assert.equal(
      (
        await request(`/invoices/${invoice.id}/receipt`, {
          name: '再発行',
          description: 'test',
        })
      ).status,
      409,
    );
    const completed = (await (
      await request(`/invoices/${invoice.id}/receipt/deliver`, {
        method: 'shared',
      })
    ).json()) as Invoice;
    assert.equal(completed.status, 'completed');
    assert(completed.receipt?.sentAt);
    assert.equal(
      (await request(`/invoices/${invoice.id}/receipt/image`)).status,
      200,
    );
    assert.equal((await (await request('/summary')).json()).outstanding, 0);
    assert.equal(calls, 2);
    // 再オープンした接続からもデータが残っていることを確認する。
    const reopened = createStore(directory);
    assert.equal(reopened.invoices()[0].status, 'completed');
    reopened.db.close();
    const items = [
      { description: '会場費 <A> & B', amount: 1200 },
      { description: '飲食代', amount: 2300 },
    ];
    for (const invalid of [
      [],
      [{ description: '', amount: 1 }],
      [{ description: 'A', amount: -1 }],
      [{ description: 'A', amount: 1.5 }],
      [
        { description: 'A', amount: 999999999 },
        { description: 'B', amount: 1 },
      ],
    ]) {
      assert.equal(
        (await request('/invoices', { ...body, items: invalid })).status,
        400,
      );
    }
    const response = await request('/invoices', { ...body, amount: 1, items });
    assert.equal(response.status, 201);
    const [itemInvoice] = (await response.json()) as Invoice[];
    assert.equal(itemInvoice.amount, 3500);
    assert.deepEqual(itemInvoice.items, items);
    assert.deepEqual(
      await (
        await request('/invoice-item-history?q=' + encodeURIComponent('会場'))
      ).json(),
      ['会場費 <A> & B'],
    );
    assert.equal(
      (await request(`/invoices/${itemInvoice.id}/invoice/image`)).status,
      200,
    );
    // 送信途中の取り消しを拒否し、送信完了後に取り消せる。
    let releaseMail!: () => void;
    mailWait = new Promise<void>((resolve) => {
      releaseMail = resolve;
    });
    const started = new Promise<void>((resolve) => {
      mailStarted = resolve;
    });
    mailFails = false;
    const pendingDelivery = request(
      `/invoices/${itemInvoice.id}/invoice/deliver`,
      { method: 'email' },
    );
    await started;
    try {
      assert.equal(
        (await request(`/invoices/${itemInvoice.id}/cancel`, {})).status,
        409,
      );
    } finally {
      releaseMail();
    }
    assert.equal((await pendingDelivery).status, 200);
    mailStarted = undefined;
    mailWait = undefined;
    Object.assign(
      itemInvoice,
      await (await request(`/invoices/${itemInvoice.id}`)).json(),
    );
    // 期限超過の請求を取り消すと集計から外れ、再送や領収書発行を拒否する。
    itemInvoice.dueDate = '2000-01-01';
    store.saveInvoice(itemInvoice);
    const summaryBefore = (await (await request('/summary')).json()) as {
      outstanding: number;
      overdue: number;
    };
    const cancelledResponse = await request(
      `/invoices/${itemInvoice.id}/cancel`,
      {},
    );
    assert.equal(cancelledResponse.status, 200);
    const cancelled = (await cancelledResponse.json()) as Invoice;
    assert.equal(cancelled.status, 'cancelled');
    assert(cancelled.cancelledAt);
    const summaryAfter = (await (await request('/summary')).json()) as {
      outstanding: number;
      overdue: number;
    };
    assert.equal(
      summaryAfter.outstanding,
      summaryBefore.outstanding - itemInvoice.amount,
    );
    assert.equal(summaryAfter.overdue, summaryBefore.overdue - 1);
    const filtered = (await (
      await request('/invoices?status=cancelled')
    ).json()) as Page<Invoice>;
    assert(filtered.items.some((item) => item.id === itemInvoice.id));
    const overdue = (await (
      await request('/invoices?status=overdue')
    ).json()) as Page<Invoice>;
    assert(!overdue.items.some((item) => item.id === itemInvoice.id));
    assert.equal(
      (await request(`/invoices/${itemInvoice.id}/cancel`, {})).status,
      409,
    );
    assert.equal((await request('/invoices/missing/cancel', {})).status, 404);
    const callsBefore = calls;
    for (const method of ['email', 'shared']) {
      assert.equal(
        (
          await request(`/invoices/${itemInvoice.id}/invoice/deliver`, {
            method,
            resend: true,
          })
        ).status,
        409,
      );
    }
    assert.equal(calls, callsBefore);
    assert.equal(
      (
        await request(`/invoices/${itemInvoice.id}/receipt`, {
          name: '宛名',
          description: '品代',
        })
      ).status,
      409,
    );
    // 完了済みの書類も履歴と領収書を保持して取り消せる。
    assert.equal(
      (await request(`/invoices/${invoice.id}/cancel`, {})).status,
      200,
    );
    assert.equal(
      (
        await request(`/invoices/${invoice.id}/receipt/deliver`, {
          method: 'shared',
          resend: true,
        })
      ).status,
      409,
    );
    const persisted = createStore(directory);
    assert.deepEqual(persisted.invoices()[0].items, items);
    assert.equal(persisted.invoices()[0].status, 'cancelled');
    assert.equal(persisted.invoices()[0].cancelledAt, cancelled.cancelledAt);
    persisted.db.close();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.db.close();
  }
});
