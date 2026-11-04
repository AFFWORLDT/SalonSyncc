import 'json.dart';

/// Sales, count, commission and expense for one day or a whole month. Money in minor units; net = sales − expense.
class Totals {
  const Totals({required this.sales, required this.count, required this.commission, required this.expense, required this.net, this.expenseNote});
  final int sales, count, commission, expense, net;
  final String? expenseNote;

  factory Totals.fromJson(Map<String, dynamic> j) => Totals(
        sales: integer(j, 'sales'),
        count: integer(j, 'count'),
        commission: integer(j, 'commission'),
        expense: integer(j, 'expense'),
        net: integer(j, 'net'),
        expenseNote: strOrNull(j, 'expense_note'),
      );
}

class DayRow extends Totals {
  const DayRow({required this.day, required super.sales, required super.count, required super.commission, required super.expense, required super.net});
  final String day;

  factory DayRow.fromJson(Map<String, dynamic> j) {
    final t = Totals.fromJson(j);
    return DayRow(day: str(j, 'day'), sales: t.sales, count: t.count, commission: t.commission, expense: t.expense, net: t.net);
  }
}

/// GET /api/reports/me?month=YYYY-MM: the signed-in barber's month (days with activity, newest first) and today.
class MyReport {
  const MyReport({required this.month, required this.days, required this.totals, required this.today});
  final String month;
  final List<DayRow> days;
  final Totals totals, today;

  factory MyReport.fromJson(Map<String, dynamic> j) {
    final d = j['days'];
    if (d is! List) throw const FormatException('Expected a list for days');
    return MyReport(
      month: str(j, 'month'),
      days: [for (final x in d) DayRow.fromJson(obj(x, 'day'))],
      totals: Totals.fromJson(obj(j['totals'], 'totals')),
      today: Totals.fromJson(obj(j['today'], 'today')),
    );
  }
}
