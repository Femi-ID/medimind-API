import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import PDFDocument from 'pdfkit';

interface VitalRow {
  recordedAt: Date;
  systolicBp: number | null;
  diastolicBp: number | null;
  heartRate: number | null;
  weight: number | null;
  bloodGlucose: number | null;
}

interface ChartSpec {
  title: string;
  labels: string[];
  datasets: Array<{
    label: string;
    data: (number | null)[];
    borderColor: string;
    backgroundColor: string;
  }>;
  yLabel: string;
}

const TEAL = '#0d9488';
const RED = '#ef4444';
const EMERALD = '#10b981';
const AMBER = '#f59e0b';
const ZINC_700 = '#3f3f46';
const ZINC_400 = '#a1a1aa';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);
  private readonly QUICKCHART_URL = 'https://quickchart.io/chart';

  constructor(private readonly prisma: PrismaService) {}

  /* ------------------------------------------------------------------ PDF */

  async generatePdf(userId: string): Promise<Buffer> {
    const { user, vitals } = await this.fetchData(userId);

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: 'MediMind Health Report',
        Author: 'MediMind',
        Subject: `Health report for ${user.firstName} ${user.lastName}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    // ── Cover / header ──
    doc
      .fontSize(24)
      .fillColor(TEAL)
      .text('MediMind', { align: 'center' })
      .moveDown(0.3)
      .fontSize(14)
      .fillColor(ZINC_700)
      .text('Personal Health Report', { align: 'center' })
      .moveDown(1.5);

    doc
      .fontSize(10)
      .fillColor(ZINC_400)
      .text(
        `Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} · ` +
          `${user.firstName} ${user.lastName} (${user.email})`,
        { align: 'center' },
      )
      .moveDown(0.5);

    this.hr(doc);

    // ── Summary stats ──
    doc
      .moveDown(0.8)
      .fontSize(16)
      .fillColor(ZINC_700)
      .text('Summary')
      .moveDown(0.4);

    const latest = this.latestPerParam(vitals);
    const summaryLines = [
      latest.systolicBp != null && latest.diastolicBp != null
        ? `Blood Pressure: ${latest.systolicBp}/${latest.diastolicBp} mmHg`
        : null,
      latest.heartRate != null ? `Heart Rate: ${latest.heartRate} bpm` : null,
      latest.bloodGlucose != null
        ? `Blood Glucose: ${latest.bloodGlucose} mmol/L`
        : null,
      latest.weight != null ? `Weight: ${latest.weight} kg` : null,
      `Total readings: ${vitals.length}`,
      `Date range: ${vitals.length > 0 ? this.fmtDate(vitals[0].recordedAt) + ' – ' + this.fmtDate(vitals[vitals.length - 1].recordedAt) : 'N/A'}`,
    ].filter(Boolean) as string[];

    for (const line of summaryLines) {
      doc.fontSize(11).fillColor(ZINC_700).text(`  •  ${line}`);
    }

    // ── Charts (last 30 days) ──
    const recent = vitals.filter(
      (v) => v.recordedAt >= new Date(Date.now() - 30 * 864e5),
    );

    if (recent.length >= 2) {
      const charts = this.buildChartSpecs(recent);

      for (const spec of charts) {
        const img = await this.renderChart(spec);
        if (!img) continue;

        // Ensure enough space; otherwise start a new page.
        if (doc.y > 520) doc.addPage();

        doc
          .moveDown(1.2)
          .fontSize(13)
          .fillColor(ZINC_700)
          .text(spec.title)
          .moveDown(0.3);
        doc.image(img, {
          width: 480,
          align: 'center',
        });
      }
    }

    // ── Tabular data ──
    doc.addPage();
    doc.fontSize(16).fillColor(ZINC_700).text('All Readings').moveDown(0.6);

    this.drawTable(doc, vitals);

    // ── Disclaimer ──
    const disclaimerY = doc.y + 30 > 750 ? (doc.addPage(), 50) : doc.y + 30;
    doc
      .fontSize(8)
      .fillColor(ZINC_400)
      .text(
        'This report is for informational purposes only and does not constitute medical advice. ' +
          'Always consult a qualified healthcare professional for clinical decisions.',
        50,
        disclaimerY,
        { width: 495, align: 'center' },
      );

    doc.end();

    return new Promise((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  /* ------------------------------------------------------------------ CSV */

  async generateCsv(userId: string): Promise<string> {
    const { vitals } = await this.fetchData(userId);

    const header =
      'Date,Time,Systolic BP (mmHg),Diastolic BP (mmHg),Heart Rate (bpm),Blood Glucose (mmol/L),Weight (kg)';
    const rows = vitals.map((v) => {
      const d = new Date(v.recordedAt);
      return [
        d.toISOString().slice(0, 10),
        d.toISOString().slice(11, 19),
        v.systolicBp ?? '',
        v.diastolicBp ?? '',
        v.heartRate ?? '',
        v.bloodGlucose ?? '',
        v.weight ?? '',
      ].join(',');
    });

    return [header, ...rows].join('\n');
  }

  /* ----------------------------------------------------------- data fetch */

  private async fetchData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        age: true,
        gender: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const vitals = await this.prisma.vital.findMany({
      where: { userId },
      orderBy: { recordedAt: 'asc' },
      select: {
        recordedAt: true,
        systolicBp: true,
        diastolicBp: true,
        heartRate: true,
        weight: true,
        bloodGlucose: true,
      },
    });

    return { user, vitals };
  }

  /* --------------------------------------------------------- chart render */

  private buildChartSpecs(vitals: VitalRow[]): ChartSpec[] {
    const labels = vitals.map((v) => this.fmtDate(v.recordedAt));
    const specs: ChartSpec[] = [];

    const hasBp = vitals.some((v) => v.systolicBp != null);
    if (hasBp) {
      specs.push({
        title: 'Blood Pressure (30 days)',
        labels,
        datasets: [
          {
            label: 'Systolic',
            data: vitals.map((v) => v.systolicBp),
            borderColor: RED,
            backgroundColor: RED + '20',
          },
          {
            label: 'Diastolic',
            data: vitals.map((v) => v.diastolicBp),
            borderColor: AMBER,
            backgroundColor: AMBER + '20',
          },
        ],
        yLabel: 'mmHg',
      });
    }

    const hasHr = vitals.some((v) => v.heartRate != null);
    if (hasHr) {
      specs.push({
        title: 'Heart Rate (30 days)',
        labels,
        datasets: [
          {
            label: 'Heart Rate',
            data: vitals.map((v) => v.heartRate),
            borderColor: EMERALD,
            backgroundColor: EMERALD + '20',
          },
        ],
        yLabel: 'bpm',
      });
    }

    const hasGlucose = vitals.some((v) => v.bloodGlucose != null);
    if (hasGlucose) {
      specs.push({
        title: 'Blood Glucose (30 days)',
        labels,
        datasets: [
          {
            label: 'Blood Glucose',
            data: vitals.map((v) => v.bloodGlucose),
            borderColor: TEAL,
            backgroundColor: TEAL + '20',
          },
        ],
        yLabel: 'mmol/L',
      });
    }

    const hasWeight = vitals.some((v) => v.weight != null);
    if (hasWeight) {
      specs.push({
        title: 'Weight (30 days)',
        labels,
        datasets: [
          {
            label: 'Weight',
            data: vitals.map((v) => v.weight),
            borderColor: ZINC_700,
            backgroundColor: ZINC_700 + '20',
          },
        ],
        yLabel: 'kg',
      });
    }

    return specs;
  }

  /**
   * Calls QuickChart.io (free, no key) to render a Chart.js config as PNG.
   * Returns null on any failure — the PDF renders without that chart rather
   * than crashing the entire export.
   */
  private async renderChart(spec: ChartSpec): Promise<Buffer | null> {
    const chartConfig = {
      type: 'line',
      data: { labels: spec.labels, datasets: spec.datasets },
      options: {
        responsive: false,
        spanGaps: true,
        plugins: {
          legend: { position: 'bottom' as const },
          title: { display: false },
        },
        scales: {
          y: {
            title: { display: true, text: spec.yLabel },
          },
          x: {
            ticks: { maxTicksLimit: 10 },
          },
        },
        elements: { point: { radius: 2 }, line: { tension: 0.3 } },
      },
    };

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(this.QUICKCHART_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chart: chartConfig,
          width: 700,
          height: 300,
          backgroundColor: '#ffffff',
          format: 'png',
          version: '4',
        }),
      }).finally(() => clearTimeout(timer));

      if (!res.ok) {
        this.logger.warn(
          `QuickChart ${res.status}; skipping chart "${spec.title}".`,
        );
        return null;
      }

      const arrayBuf = await res.arrayBuffer();
      return Buffer.from(arrayBuf);
    } catch (err) {
      this.logger.warn(
        `QuickChart failed (${(err as Error).message}); skipping chart "${spec.title}".`,
      );
      return null;
    }
  }

  /* ------------------------------------------------------- PDF table draw */

  private drawTable(doc: PDFKit.PDFDocument, vitals: VitalRow[]) {
    const cols = [
      { header: 'Date', width: 80, key: 'date' },
      { header: 'Sys', width: 50, key: 'systolicBp' },
      { header: 'Dia', width: 50, key: 'diastolicBp' },
      { header: 'HR', width: 50, key: 'heartRate' },
      { header: 'Glucose', width: 65, key: 'bloodGlucose' },
      { header: 'Weight', width: 60, key: 'weight' },
    ];
    const startX = 50;
    const rowHeight = 18;

    // Header row
    let x = startX;
    doc.fontSize(9).fillColor(TEAL);
    for (const col of cols) {
      doc.text(col.header, x, doc.y, { width: col.width, continued: false });
      x += col.width;
    }
    const headerBottom = doc.y + 4;
    this.hr(doc, headerBottom);
    doc.y = headerBottom + 6;

    // Data rows
    doc.fontSize(8.5).fillColor(ZINC_700);
    for (const v of vitals) {
      if (doc.y > 740) {
        doc.addPage();
        doc.y = 50;
      }
      x = startX;
      const cells: string[] = [
        this.fmtDate(v.recordedAt),
        v.systolicBp?.toString() ?? '–',
        v.diastolicBp?.toString() ?? '–',
        v.heartRate?.toString() ?? '–',
        v.bloodGlucose?.toString() ?? '–',
        v.weight?.toString() ?? '–',
      ];
      const y = doc.y;
      for (let i = 0; i < cols.length; i++) {
        doc.text(cells[i], x, y, { width: cols[i].width });
        x += cols[i].width;
      }
      doc.y = y + rowHeight;
    }
  }

  /* ---------------------------------------------------------------- utils */

  private latestPerParam(vitals: VitalRow[]) {
    const latest = {
      systolicBp: null as number | null,
      diastolicBp: null as number | null,
      heartRate: null as number | null,
      bloodGlucose: null as number | null,
      weight: null as number | null,
    };
    // Vitals are sorted asc by recordedAt; walk backwards to find each latest.
    for (let i = vitals.length - 1; i >= 0; i--) {
      const v = vitals[i];
      if (latest.systolicBp == null && v.systolicBp != null) {
        latest.systolicBp = v.systolicBp;
        latest.diastolicBp = v.diastolicBp;
      }
      if (latest.heartRate == null && v.heartRate != null)
        latest.heartRate = v.heartRate;
      if (latest.bloodGlucose == null && v.bloodGlucose != null)
        latest.bloodGlucose = v.bloodGlucose;
      if (latest.weight == null && v.weight != null) latest.weight = v.weight;
    }
    return latest;
  }

  private fmtDate(d: Date): string {
    return new Date(d).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
    });
  }

  private hr(doc: PDFKit.PDFDocument, y?: number) {
    const lineY = y ?? doc.y + 4;
    doc
      .strokeColor('#e4e4e7')
      .lineWidth(0.5)
      .moveTo(50, lineY)
      .lineTo(545, lineY)
      .stroke();
    doc.y = lineY + 2;
  }
}
