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
    `書類ID: ${receipt?.id ?? invoice.id}`,
    `発行日: ${date(receipt?.issuedAt ?? invoice.issuedAt)}`,
    `請求書ID: ${invoice.id}`,
    '',
    `${receipt?.name ?? invoice.contact.name} 様`,
    '',
    `金額  ¥${invoice.amount.toLocaleString('ja-JP')}`,
    '',
    ...(receipt
      ? ['上記金額を受領いたしました。', '']
      : [`お支払期日: ${invoice.dueDate}`, '']),
    `但書: ${receipt?.description ?? invoice.description}`,
    '',
    `発行者: ${invoice.issuer.issuer}`,
    ...(receipt
      ? []
      : [
          '',
          'お振込先',
          `${invoice.issuer.bank} ${invoice.issuer.branch}`,
          `${invoice.issuer.accountType} ${invoice.issuer.accountNumber}`,
          `口座名義: ${invoice.issuer.accountHolder}`,
        ]),
  ];
  const wrapped = lines.flatMap((line) => {
    const chars = Array.from(line);
    return chars.length
      ? Array.from({ length: Math.ceil(chars.length / 34) }, (_, i) =>
          chars.slice(i * 34, (i + 1) * 34).join(''),
        )
      : [''];
  });
  const height = Math.max(1120, 120 + wrapped.length * 38);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}"><rect width="100%" height="100%" fill="white"/><rect x="60" y="45" width="880" height="6" fill="#0031d8"/><g font-family="Noto Sans CJK JP,Noto Sans JP,Hiragino Sans,sans-serif" fill="#1a1a1c">${wrapped.map((line, index) => `<text x="70" y="${105 + index * 38}" font-size="${index === 0 ? 36 : 24}">${escapeXml(line)}</text>`).join('')}</g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
