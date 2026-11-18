const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const exportAsCSV = (res, filename, columns, rows) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);

  const headerLine = columns.map((c) => `"${c.header}"`).join(',');
  const bodyLines = rows.map((row) =>
    columns
      .map((c) => {
        const val = row[c.key] ?? '';
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(',')
  );

  res.send([headerLine, ...bodyLines].join('\n'));
};

const exportAsExcel = async (res, filename, sheetTitle, columns, rows) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetTitle);

  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 22 }));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF198754' } };

  rows.forEach((r) => sheet.addRow(r));

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
};

const exportAsPDF = (res, filename, title, farmName, columns, rows) => {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  doc.pipe(res);

  // Header Banner
  doc.fillColor('#198754').fontSize(20).text('PoultryPro Farm Report', { align: 'left' });
  doc.fillColor('#1F2937').fontSize(13).text(`${title} — ${farmName}`);
  doc.fontSize(9).fillColor('#6B7280').text(`Generated on: ${new Date().toLocaleString()}`);
  doc.moveDown(1.2);

  // Table Headers
  const colWidth = (doc.page.width - 80) / columns.length;
  let y = doc.y;
  doc.rect(40, y, doc.page.width - 80, 22).fill('#14532D');
  doc.fillColor('#FFFFFF').fontSize(9);
  columns.forEach((col, i) => {
    doc.text(col.header, 45 + i * colWidth, y + 6, { width: colWidth - 8, ellipsis: true });
  });

  y += 26;
  doc.fillColor('#1F2937').fontSize(8.5);
  rows.forEach((row, idx) => {
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = 40;
    }
    if (idx % 2 === 1) {
      doc.rect(40, y - 3, doc.page.width - 80, 18).fill('#F7F9F7');
      doc.fillColor('#1F2937');
    }
    columns.forEach((col, i) => {
      doc.text(String(row[col.key] ?? '-'), 45 + i * colWidth, y, {
        width: colWidth - 8,
        ellipsis: true,
      });
    });
    y += 18;
  });

  doc.end();
};

module.exports = { exportAsCSV, exportAsExcel, exportAsPDF };