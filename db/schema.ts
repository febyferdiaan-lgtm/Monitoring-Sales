import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sales = sqliteTable("sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceKey: text("source_key").notNull().unique(),
  customer: text("customer").notNull(),
  location: text("location").notNull().default(""),
  transactionType: text("transaction_type").notNull().default(""),
  project: text("project").notNull().default(""),
  rfqNo: text("rfq_no").notNull().default(""),
  quotationNo: text("quotation_no").notNull().default(""),
  poNo: text("po_no").notNull().default(""),
  deliveryNo: text("delivery_no").notNull().default(""),
  invoiceNo: text("invoice_no").notNull().default(""),
  invoiceAmount: real("invoice_amount").notNull().default(0),
  amountPaid: real("amount_paid").notNull().default(0),
  dueDate: text("due_date").notNull().default(""),
  paymentDate: text("payment_date").notNull().default(""),
  paymentStatus: text("payment_status").notNull().default("OPEN"),
  transactionStatus: text("transaction_status").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
