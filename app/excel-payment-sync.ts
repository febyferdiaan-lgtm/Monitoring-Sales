export type ExcelPaymentRow = {
  id: number;
  amount: number;
  raw_json: string;
};

export type ExcelPaymentUpdate = {
  id: number;
  paymentStatus: "OPEN" | "CLOSED";
  rawJson: string;
};

function toAmount(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export function planExcelPaymentSync(
  rows: ExcelPaymentRow[],
  paidTotal: number,
  transferDate: string,
): ExcelPaymentUpdate[] {
  const parsedRows = rows.map((row) => {
    let raw: Record<string, unknown> = {};
    try {
      raw = JSON.parse(row.raw_json || "{}") as Record<string, unknown>;
    } catch {
      raw = {};
    }
    const lineAmount = toAmount(raw.total_ar) || toAmount(raw.invoice_amount) || toAmount(row.amount);
    return { row, raw, lineAmount };
  });
  const invoiceAmount = parsedRows.reduce((sum, item) => sum + item.lineAmount, 0);
  const normalizedPaidTotal = Math.max(0, Number(paidTotal) || 0);
  const paymentStatus: "OPEN" | "CLOSED" = invoiceAmount > 0 && normalizedPaidTotal >= invoiceAmount - 0.01
    ? "CLOSED"
    : "OPEN";
  let remainingPaid = normalizedPaidTotal;

  return parsedRows.map(({ row, raw, lineAmount }) => {
    const allocatedPayment = Math.min(lineAmount, remainingPaid);
    remainingPaid = Math.max(0, remainingPaid - allocatedPayment);
    raw.payment_amount = allocatedPayment;
    raw.transfer_date = allocatedPayment > 0 ? transferDate : "";
    raw.payment_status = paymentStatus;
    raw.payment_difference = Math.max(0, lineAmount - allocatedPayment);
    return {
      id: row.id,
      paymentStatus,
      rawJson: JSON.stringify(raw),
    };
  });
}
