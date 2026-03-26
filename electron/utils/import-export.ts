import * as xlsx from 'xlsx';
import * as fs from 'fs';

export function exportData(filePath: string, data: any[]) {
  if (filePath.endsWith('.json')) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } else if (filePath.endsWith('.xlsx')) {
    const worksheet = xlsx.utils.json_to_sheet(data);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Profiles');
    xlsx.writeFile(workbook, filePath);
  } else {
    throw new Error('Unsupported file format');
  }
}

export function importData(filePath: string): any[] {
  if (filePath.endsWith('.json')) {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } else if (filePath.endsWith('.xlsx')) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('Empty Excel file');
    const worksheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(worksheet);
  } else {
    throw new Error('Unsupported file format');
  }
}
