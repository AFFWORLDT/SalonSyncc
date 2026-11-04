import 'json.dart';
import 'daily_sheet.dart';
import 'overview.dart';

class MonthRow {
  const MonthRow({required this.month, required this.cells, required this.totals});
  final String month;
  final Map<int, SheetCell> cells;
  final RangeTotals totals;

  SheetCell cellFor(int id) => cells[id] ?? const SheetCell();
  bool get isEmpty => totals.sales == 0 && totals.expense == 0;

  factory MonthRow.fromJson(Map<String, dynamic> j) {
    final c = obj(j['cells'], 'cells');
    return MonthRow(
      month: str(j, 'month'),
      cells: {
        for (final e in c.entries)
          int.parse(e.key): () {
            final v = obj(e.value, 'cell');
            return SheetCell(sales: integer(v, 'sales'), count: integer(v, 'count'), commission: integer(v, 'commission'), expense: integer(v, 'expense'));
          }(),
      },
      totals: RangeTotals.fromJson(obj(j['totals'], 'totals')),
    );
  }
}

/// GET /api/reports/monthly?year=: one row per month, sales per barber.
class MonthlyReport {
  const MonthlyReport({required this.year, required this.barbers, required this.months});
  final String year;
  final List<SheetBarber> barbers;
  final List<MonthRow> months;

  /// Year totals over the months with any sales or expense (as the web's tiles).
  RangeTotals get totals {
    var s = 0, c = 0, m = 0, e = 0, p = 0, x = 0;
    for (final r in months.where((r) => !r.isEmpty)) {
      s += r.totals.sales;
      c += r.totals.count;
      m += r.totals.commission;
      e += r.totals.expense;
      p += r.totals.profit;
      x += r.totals.companyExpense;
    }
    return RangeTotals(sales: s, count: c, commission: m, expense: e, profit: p, companyExpense: x);
  }

  factory MonthlyReport.fromJson(Map<String, dynamic> j) {
    final b = j['barbers'], m = j['months'];
    if (b is! List || m is! List) throw const FormatException('Expected lists for barbers and months');
    return MonthlyReport(
      year: str(j, 'year'),
      barbers: [for (final x in b) SheetBarber(id: integer(obj(x, 'barber'), 'id'), name: str(obj(x, 'barber'), 'name'), active: (x as Map)['active'] != false)],
      months: [for (final x in m) MonthRow.fromJson(obj(x, 'month'))],
    );
  }
}
