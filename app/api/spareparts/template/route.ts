import * as XLSX from "xlsx";

export async function GET() {
  const worksheet = XLSX.utils.json_to_sheet([
    {
      part_number: "",
      name: "",
      category: "",
      brand: "",
      unit: "Pcs",
      selling_price: 0,
      notes: "",
    },
  ]);
  worksheet["!cols"] = [
    { wch: 22 },
    { wch: 32 },
    { wch: 18 },
    { wch: 18 },
    { wch: 12 },
    { wch: 18 },
    { wch: 32 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Spareparts");
  const file = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return new Response(file, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="template-import-sparepart.xlsx"',
      "Cache-Control": "private, no-store",
    },
  });
}
