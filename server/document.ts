import sharp from 'sharp';
import type { Invoice } from '../shared/types.js';

const escapeXml = (text: string) =>
  text.replace(
    /[<>&"']/g,
    (char) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;',
      })[char]!,
  );
const date = (value: string) =>
  new Date(value).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
const fontFamily = 'Noto Sans CJK JP,Noto Sans JP,Hiragino Sans,sans-serif';

/** 本文と同じフォントで測定し、左右70pxの余白内に収まる位置で折り返す。 */
async function wrapId(line: string): Promise<string[]> {
  const chars = Array.from(line);
  const lines: string[] = [];
  while (chars.length) {
    let low = 1;
    let high = chars.length;
    while (low < high) {
      const count = Math.ceil((low + high) / 2);
      const text = escapeXml(chars.slice(0, count).join(''));
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${count * 36 + 20}" height="80"><rect width="100%" height="100%" fill="white"/><text x="10" y="45" font-family="${fontFamily}" font-size="24">${text}</text></svg>`;
      const { info } = await sharp(Buffer.from(svg))
        .trim({ background: 'white', threshold: 0 })
        .png()
        .toBuffer({ resolveWithObject: true });
      if (info.width <= 860) low = count;
      else high = count - 1;
    }
    lines.push(chars.splice(0, low).join(''));
  }
  return lines;
}

/** SVGの文字は必ずエスケープし、固定幅で折り返してPNGに変換する。 */
export async function documentPng(
  invoice: Invoice,
  kind: 'invoice' | 'receipt',
): Promise<Buffer> {
  const receipt = kind === 'receipt' ? invoice.receipt : undefined;
  if (kind === 'receipt' && !receipt)
    throw new Error('領収書が発行されていません');
  const lines: string[] = [
    kind === 'invoice' ? '請求書' : '領収書',
    '',
    ...(receipt ? [`書類ID: ${receipt.id}`] : []),
    `発行日: ${date(receipt?.issuedAt ?? invoice.issuedAt)}`,
    `請求書ID: ${invoice.id}`,
    '',
    `${receipt?.name ?? invoice.contact.name} 様`,
    '',
    ...(receipt
      ? [`金額  ¥${invoice.amount.toLocaleString('ja-JP')}`, '']
      : []),
    ...(receipt
      ? ['上記金額を受領いたしました。', '']
      : [`お支払期日: ${invoice.dueDate}`, '']),
    ...(receipt ? [`但書: ${receipt.description}`] : ['\u0000TABLE']),
    '',
    `発行者: ${invoice.issuer.issuer}`,
    ...(receipt
      ? []
      : [
          '',
          'お振込先',
          `・金融機関：${invoice.issuer.bank}`,
          `・支店：${invoice.issuer.branch}`,
          `・口座種別：${invoice.issuer.accountType}`,
          `・口座番号：${invoice.issuer.accountNumber}`,
          `・口座名義：${invoice.issuer.accountHolder}`,
        ]),
  ];
  const wrapped = (
    await Promise.all(
      lines.map(async (line) => {
        if (line.startsWith('請求書ID: ')) return wrapId(line);
        const chars = Array.from(line);
        return chars.length
          ? Array.from({ length: Math.ceil(chars.length / 34) }, (_, i) =>
              chars.slice(i * 34, (i + 1) * 34).join(''),
            )
          : [''];
      }),
    )
  ).flat();
  let y = 105;
  const elements: string[] = [];
  const text = (value: string, x: number, baseline: number, extra = '') =>
    `<text x="${x}" y="${baseline}" font-size="24" ${extra}>${escapeXml(value)}</text>`;
  for (const [index, line] of wrapped.entries()) {
    if (line === '\u0000TABLE') {
      const row = (label: string, amount: string, header = false) => {
        const chars = Array.from(label);
        const labels = Array.from(
          { length: Math.max(1, Math.ceil(chars.length / 24)) },
          (_, i) => chars.slice(i * 24, (i + 1) * 24).join(''),
        );
        const height = Math.max(54, labels.length * 34 + 20);
        elements.push(
          `<rect x="70" y="${y}" width="860" height="${height}" fill="${header ? '#eef2ff' : 'white'}" stroke="#bbc2d0"/><path d="M700 ${y}v${height}" stroke="#bbc2d0"/>`,
        );
        labels.forEach((label, i) =>
          elements.push(
            text(
              label,
              86,
              y + 35 + i * 34,
              header ? 'font-weight="bold"' : '',
            ),
          ),
        );
        elements.push(text(amount, 914, y + 35, 'text-anchor="end"'));
        y += height;
      };
      row('内容', '金額', true);
      for (const item of invoice.items ?? [
        { description: invoice.description, amount: invoice.amount },
      ]) {
        row(item.description, `¥${item.amount.toLocaleString('ja-JP')}`);
      }
      row('合計金額', `¥${invoice.amount.toLocaleString('ja-JP')}`, true);
      y += 38;
    } else {
      elements.push(
        index === 0
          ? `<text x="70" y="${y}" font-size="36">${escapeXml(line)}</text>`
          : text(line, 70, y),
      );
      y += 38;
    }
  }
  const height = Math.max(1120, y + 70);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}"><rect width="100%" height="100%" fill="white"/><rect x="60" y="45" width="880" height="6" fill="#0031d8"/><g font-family="${fontFamily}" fill="#1a1a1c">${elements.join('')}</g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
