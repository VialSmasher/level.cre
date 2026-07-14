import fs from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';
import {
  applyPropertyImportSource,
  chooseBestPursuitImportSheet,
  detectPropertyImportSource,
  parsePursuitImportSheet,
  type ParsedPursuitImportSheet,
} from '../../apps/web/src/lib/pursuitSpreadsheetImport';

function usage(): never {
  console.error('Usage: npm run normalize:property-spreadsheet -- <input.xlsx|xls|csv> [--output <normalized.json>]');
  process.exit(1);
}

function outputArgument(args: string[]): string | null {
  const index = args.indexOf('--output');
  if (index < 0) return null;
  return args[index + 1] || usage();
}

async function parseWorkbook(filePath: string): Promise<ParsedPursuitImportSheet[]> {
  const extension = path.extname(filePath).toLowerCase();
  if (!['.xlsx', '.xls', '.csv'].includes(extension)) usage();

  const workbook = extension === '.csv'
    ? XLSX.read(await fs.readFile(filePath, 'utf8'), { type: 'string', cellDates: true })
    : XLSX.read(await fs.readFile(filePath), { type: 'buffer', cellDates: true });

  return workbook.SheetNames.flatMap((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return [];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: '', raw: true });
    const parsed = parsePursuitImportSheet(matrix, sheetName, 5_000);
    return parsed ? [parsed] : [];
  });
}

async function main() {
  const args = process.argv.slice(2);
  const inputPath = args.find((argument) => !argument.startsWith('--') && argument !== outputArgument(args));
  if (!inputPath) usage();

  const absoluteInput = path.resolve(inputPath);
  const candidates = await parseWorkbook(absoluteInput);
  const selected = chooseBestPursuitImportSheet(candidates);
  if (!selected) throw new Error('No sheet with a usable Address column was found.');

  const sourceSystem = detectPropertyImportSource(path.basename(absoluteInput), selected);
  const normalized = applyPropertyImportSource(selected, sourceSystem);
  const result = {
    schemaVersion: 1,
    normalizedAt: new Date().toISOString(),
    source: {
      fileName: path.basename(absoluteInput),
      sourceSystem,
      sheetName: normalized.sheetName,
      headerRow: normalized.headerRow,
      importKind: normalized.importKind,
      detectedFields: normalized.detectedFields,
    },
    recordCount: normalized.rows.length,
    records: normalized.rows,
  };
  const json = `${JSON.stringify(result, null, 2)}\n`;
  const outputPath = outputArgument(args);
  if (outputPath) {
    const absoluteOutput = path.resolve(outputPath);
    await fs.mkdir(path.dirname(absoluteOutput), { recursive: true });
    await fs.writeFile(absoluteOutput, json, 'utf8');
    console.log(absoluteOutput);
  } else {
    process.stdout.write(json);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
