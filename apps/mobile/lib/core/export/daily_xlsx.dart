import 'dart:typed_data';

import 'package:excel/excel.dart';

import '../../models/daily_sheet.dart';
import '../format/fmt.dart';

/// "{salon} {what}.xlsx" (characters a file system refuses become spaces), as the web names it.
String workbookName(String salonName, String what) {
  final clean = salonName.replaceAll(RegExp(r'[\\/:*?"<>|]+'), ' ').replaceAll(RegExp(r'\s{2,}'), ' ').trim();
  return '${clean.isEmpty ? '' : '$clean '}$what.xlsx';
}

/// The daily sheet in the web's classic salon-record layout (apps/web/src/lib/excel.ts `exportDailySheet`):
/// "{MONTH} SALE RECORD" — Dates | Details | per barber [name, Commission] | Total Sale | Expense | Total Commission |
/// Total Profit, days with activity only, a TOTAL row and the title row; then "EXPENSES" per barber + company.
Uint8List buildDailyXlsx(DailySheet d, {required String salonName, required Fmt fmt}) {
  CellValue money(int minor) => minor % fmt.minor == 0 ? IntCellValue(minor ~/ fmt.minor) : DoubleCellValue(minor / fmt.minor);
  CellValue date(String ymd) {
    final p = DateTime.parse(ymd);
    return DateCellValue(year: p.year, month: p.month, day: p.day);
  }

  final title = '${fmt.monthLabel(d.month).toUpperCase()} SALE RECORD';
  final x = Excel.createExcel();
  final first = x.getDefaultSheet()!;
  x.rename(first, title.length > 31 ? title.substring(0, 31) : title);
  final s = x[title.length > 31 ? title.substring(0, 31) : title];
  s.appendRow([
    TextCellValue('Dates'),
    TextCellValue('Details'),
    for (final b in d.barbers) ...[TextCellValue(b.name), TextCellValue('Commission')],
    TextCellValue('Total Sale'),
    TextCellValue('Expense'),
    TextCellValue('Total Commission'),
    TextCellValue('Total Profit'),
  ]);
  for (final r in d.rows) {
    if (r.sales == 0 && r.expense == 0) continue;
    s.appendRow([
      date(r.day),
      TextCellValue('SALE/COM'),
      for (final b in d.barbers) ...[money(r.cellFor(b.id).sales), money(r.cellFor(b.id).commission)],
      money(r.sales),
      money(r.expense),
      money(r.commission),
      money(r.profit),
    ]);
  }
  final t = d.totals;
  s.appendRow([
    null,
    TextCellValue('TOTAL'),
    for (final b in d.barbers) ...[money(t.cellFor(b.id).sales), money(t.cellFor(b.id).commission)],
    money(t.sales),
    money(t.expense),
    money(t.commission),
    money(t.profit),
  ]);
  // A blank row, then the title (appendRow skips an empty row, so place the title by index).
  s.updateCell(CellIndex.indexByColumnRow(columnIndex: 1, rowIndex: s.maxRows + 1), TextCellValue('$title — $salonName'));

  final e = x['EXPENSES'];
  e.appendRow([TextCellValue('Dates'), for (final b in d.barbers) TextCellValue(b.name), TextCellValue('Company'), TextCellValue('Total')]);
  for (final r in d.rows) {
    if (r.expense == 0) continue;
    e.appendRow([date(r.day), for (final b in d.barbers) money(r.cellFor(b.id).expense), money(r.companyExpense), money(r.expense)]);
  }
  e.appendRow([null, for (final b in d.barbers) money(t.cellFor(b.id).expense), money(t.companyExpense), money(t.expense)]);
  return Uint8List.fromList(x.encode()!);
}
