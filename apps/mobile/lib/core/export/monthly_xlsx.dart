import 'dart:typed_data';

import 'package:excel/excel.dart';

import '../../models/monthly.dart';
import '../format/fmt.dart';

/// The year summary as the web's `exportMonthly`: one sheet "{year} SUMMARY", Month | per barber [name, Commission,
/// Expense] | Total Sale | Expense | Total Commission | Total Profit; one row per month with activity, no totals row.
Uint8List buildMonthlyXlsx(MonthlyReport r, {required Fmt fmt}) {
  CellValue money(int minor) => minor % fmt.minor == 0 ? IntCellValue(minor ~/ fmt.minor) : DoubleCellValue(minor / fmt.minor);
  final x = Excel.createExcel();
  final name = '${r.year} SUMMARY';
  x.rename(x.getDefaultSheet()!, name);
  final s = x[name];
  s.appendRow([
    TextCellValue('Month'),
    for (final b in r.barbers) ...[TextCellValue(b.name), TextCellValue('Commission'), TextCellValue('Expense')],
    TextCellValue('Total Sale'),
    TextCellValue('Expense'),
    TextCellValue('Total Commission'),
    TextCellValue('Total Profit'),
  ]);
  for (final m in r.months) {
    if (m.isEmpty) continue;
    s.appendRow([
      TextCellValue(fmt.monthLabel(m.month)),
      for (final b in r.barbers) ...[money(m.cellFor(b.id).sales), money(m.cellFor(b.id).commission), money(m.cellFor(b.id).expense)],
      money(m.totals.sales),
      money(m.totals.expense),
      money(m.totals.commission),
      money(m.totals.profit),
    ]);
  }
  return Uint8List.fromList(x.encode()!);
}
