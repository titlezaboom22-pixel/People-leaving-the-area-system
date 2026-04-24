import * as XLSX from 'xlsx';

/**
 * Export ข้อมูลเป็นไฟล์ Excel (.xlsx)
 *
 * @param {Array} data - Array ของ objects
 * @param {Array} columns - [{ key, label }] — ระบุ column + header
 * @param {string} filename - ไม่ต้องใส่ .xlsx
 * @param {string} sheetName - ชื่อ sheet (default: Sheet1)
 */
export function exportToExcel(data, columns, filename, sheetName = 'Sheet1') {
  if (!data || data.length === 0) {
    alert('ไม่มีข้อมูลให้ export');
    return;
  }

  // แปลง data ตาม columns spec
  const rows = data.map((row) => {
    const out = {};
    columns.forEach((col) => {
      const val = typeof col.value === 'function' ? col.value(row) : row[col.key];
      out[col.label] = val == null ? '' : val;
    });
    return out;
  });

  // สร้าง worksheet
  const ws = XLSX.utils.json_to_sheet(rows);

  // ปรับความกว้าง column อัตโนมัติ (ประมาณการ)
  const colWidths = columns.map((col) => {
    const maxLen = Math.max(
      col.label.length,
      ...rows.slice(0, 100).map((r) => String(r[col.label] || '').length),
    );
    return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
  });
  ws['!cols'] = colWidths;

  // สร้าง workbook + save
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const timestamp = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `${filename}_${timestamp}.xlsx`);
}

/**
 * Helper: format Firestore Timestamp เป็น string
 */
export function formatTs(ts) {
  if (!ts) return '';
  try {
    const d = ts.toDate ? ts.toDate() : (ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts));
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('th-TH', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return String(ts);
  }
}
