import 'dart:typed_data';

import 'package:excel/excel.dart';

import '../../models/ledger.dart';
import '../format/fmt.dart';

const kAccountLabel = {'all': 'Cash + Bank', 'cash': 'Cash drawer', 'bank': 'Bank'};

/// The shop ledger as the web's `exportShopLedger`: sheet "LEDGER", a title row, a blank row, then
/// Date | Time | Account | Type | Ref | Memo | In | Out | Balance, the opening row and one row per line.
Uint8List buildLedgerXlsx(ShopLedger l, {required Fmt fmt}) {
  CellValue money(int minor) => minor % fmt.minor == 0 ? IntCellValue(minor ~/ fmt.minor) : DoubleCellValue(minor / fmt.minor);
  final x = Excel.createExcel();
  x.rename(x.getDefaultSheet()!, 'LEDGER');
  final s = x['LEDGER'];
  s.appendRow([TextCellValue('Shop ledger · ${kAccountLabel[l.account] ?? l.account} · ${l.from} to ${l.to}')]);
  final header = ['Date', 'Time', 'Account', 'Type', 'Ref', 'Memo', 'In', 'Out', 'Balance'];
  for (final (i, h) in header.indexed) {
    s.updateCell(CellIndex.indexByColumnRow(columnIndex: i, rowIndex: 2), TextCellValue(h));
  }
  s.appendRow([null, null, null, TextCellValue('Opening'), null, null, null, null, money(l.opening)]);
  for (final line in l.lines) {
    final d = DateTime.parse(line.day);
    s.appendRow([
      DateCellValue(year: d.year, month: d.month, day: d.day),
      TextCellValue(fmt.time(line.at)),
      line.account == null ? null : TextCellValue(line.account == 'bank' ? 'Bank' : 'Cash'),
      TextCellValue(line.kind),
      line.ref == null ? null : TextCellValue(line.ref!),
      TextCellValue(line.memo),
      line.amount > 0 ? money(line.amount) : null,
      line.amount < 0 ? money(-line.amount) : null,
      money(line.balance),
    ]);
  }
  return Uint8List.fromList(x.encode()!);
}
