const PDFDocument = require('pdfkit');

function streamCaseSummary(res, report) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${report.case_id}.pdf`);

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);
  doc.fontSize(18).text('Sentinel CCRTS — Case Summary', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12);
  doc.text(`Case ID: ${report.case_id}`);
  doc.text(`Type: ${report.type}`);
  doc.text(`Status: ${report.status}`);
  doc.moveDown();
  doc.text('Description:', { underline: true });
  doc.text(report.description || '');
  doc.moveDown();
  doc.text('Resolution Note:', { underline: true });
  doc.text(report.resolution_note || 'N/A');
  doc.end();
}

module.exports = { streamCaseSummary };
