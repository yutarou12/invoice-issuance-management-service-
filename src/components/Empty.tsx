import { type ReactNode } from 'react';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';

export default function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <ReceiptLongOutlinedIcon sx={{ fontSize: 22 }} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
