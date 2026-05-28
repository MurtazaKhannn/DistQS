const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * PDF task — generates a real PDF with PDFKit into PDF_OUTPUT_DIR (default ./output).
 */
async function runPdfTask(payload, ctx) {
  const { logger } = ctx;
  const baseDir =
    process.env.PDF_OUTPUT_DIR || path.join(process.cwd(), "output");
  ensureDir(baseDir);

  const fileName = `${payload.title.replace(/[^a-zA-Z0-9-_]+/g, "_")}_${Date.now()}.pdf`;
  const filePath = path.join(baseDir, fileName);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    doc.fontSize(20).text(payload.title, { underline: true });
    doc.moveDown();
    doc
      .fontSize(12)
      .text(
        `Generated at ${new Date().toISOString()} for distributed task processing demo.`,
        { align: "left" }
      );
    if (
      payload.data != null &&
      typeof payload.data === "object" &&
      !Array.isArray(payload.data)
    ) {
      doc.moveDown();
      doc.fontSize(14).text("Data", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).text(JSON.stringify(payload.data, null, 2), {
        align: "left",
      });
    }
    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  logger.info({ event: "pdf_generated", filePath }, "PDF generated");
}

module.exports = { runPdfTask };
