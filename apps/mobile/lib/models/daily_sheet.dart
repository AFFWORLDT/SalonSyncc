import 'json.dart';

class SheetCell {
  const SheetCell({this.sales = 0, this.commission = 0, this.expense = 0, this.count = 0});
  final int sales, commission, expense, count;
  factory SheetCell.fromJson(Map<String, dynamic> j) =>
      SheetCell(sales: integer(j, 'sales'), commission: integer(j, 'commission'), expense: integer(j, 'expense'), count: integer(j, 'count'));
}

/// One day of the sheet (or the month's totals): per-barber cells and the shop columns.
class SheetRow {
  const SheetRow({required this.day, required this.cells, required this.sales, required this.expense, required this.companyExpense, required this.commission, required this.profit});
  final String day;
  final Map<int, SheetCell> cells;
  final int sales, expense, companyExpense, commission, profit;

  SheetCell cellFor(int barberId) => cells[barberId] ?? const SheetCell();
  bool get isEmpty => sales == 0 && expense == 0 && commission == 0;

  factory SheetRow.fromJson(Map<String, dynamic> j, {String day = ''}) {
    final c = obj(j['cells'], 'cells');
    return SheetRow(
      day: j['day'] is String ? j['day'] as String : day,
      cells: {for (final e in c.entries) int.parse(e.key): SheetCell.fromJson(obj(e.value, 'cell'))},
      sales: integer(j, 'sales'),
      expense: integer(j, 'expense'),
      companyExpense: integer(j, 'company_expense'),
      commission: integer(j, 'commission'),
      profit: integer(j, 'profit'),
    );
  }
}

class SheetBarber {
  const SheetBarber({required this.id, required this.name, required this.active});
  final int id;
  final String name;
  final bool active;
}

/// GET /api/reports/daily?month=: one row per day of the month, a column per barber.
class DailySheet {
  const DailySheet({required this.month, required this.barbers, required this.rows, required this.totals});
  final String month;
  final List<SheetBarber> barbers;
  final List<SheetRow> rows;
  final SheetRow totals;

  factory DailySheet.fromJson(Map<String, dynamic> j) {
    final b = j['barbers'], r = j['rows'];
    if (b is! List || r is! List) throw const FormatException('Expected lists for barbers and rows');
    return DailySheet(
      month: str(j, 'month'),
      barbers: [
        for (final x in b)
          SheetBarber(id: integer(obj(x, 'barber'), 'id'), name: str(obj(x, 'barber'), 'name'), active: (x as Map)['active'] != false),
      ],
      rows: [for (final x in r) SheetRow.fromJson(obj(x, 'row'))],
      totals: SheetRow.fromJson(obj(j['totals'], 'totals'), day: 'Total'),
    );
  }
}
