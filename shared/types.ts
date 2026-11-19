/** 書類には発行時点の連絡先と振込先を保存し、後の設定変更から保護する。 */
export interface Contact {
  id: string;
  name: string;
  kana: string;
  email: string;
  phone: string;
}
export interface Settings {
  issuer: string;
  bank: string;
  branch: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
}
export interface Receipt {
  id: string;
  name: string;
  amount: number;
  description: string;
  issuedAt: string;
  sentAt?: string;
}
export interface Invoice {
  id: string;
  contact: Contact;
  issuer: Settings;
  amount: number;
  description: string;
  dueDate: string;
  issuedAt: string;
  status: 'issued' | 'sent' | 'completed';
  sentAt?: string;
  receipt?: Receipt;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Summary {
  outstanding: number;
  overdue: number;
  completed: number;
  total: number;
}
