import 'json.dart';
import 'sale.dart';

/// Shop totals over a range. Expense includes company expenses; profit = sales − expense − commission (server).
class RangeTotals {
  const RangeTotals({required this.sales, required this.count, required this.commission, required this.expense, required this.profit, required this.companyExpense});
  final int sales, count, commission, expense, profit, companyExpense;

  factory RangeTotals.fromJson(Map<String, dynamic> j) => RangeTotals(
        sales: integer(j, 'sales'),
        count: integer(j, 'count'),
        commission: integer(j, 'commission'),
        expense: integer(j, 'expense'),
        profit: integer(j, 'profit'),
        companyExpense: integer(j, 'company_expense'),
      );
}

class BarberDay {
  const BarberDay({required this.id, required this.name, this.avatarUrl, required this.sales, required this.count, required this.commission, required this.expense, required this.expenseEntered});
  final int id, sales, count, commission, expense;
  final String name;
  final String? avatarUrl;
  final bool expenseEntered;

  factory BarberDay.fromJson(Map<String, dynamic> j) => BarberDay(
        id: integer(j, 'id'),
        name: str(j, 'name'),
        avatarUrl: strOrNull(j, 'avatar_url'),
        sales: integer(j, 'sales'),
        count: integer(j, 'count'),
        commission: integer(j, 'commission'),
        expense: integer(j, 'expense'),
        expenseEntered: j['expense_entered'] == true,
      );
}

class SeriesPoint {
  const SeriesPoint({required this.key, required this.sales, required this.profit});
  final String key;
  final int sales, profit;
  factory SeriesPoint.fromJson(Map<String, dynamic> j) => SeriesPoint(key: str(j, 'key'), sales: integer(j, 'sales'), profit: integer(j, 'profit'));
}

/// GET /api/reports/overview?from=&to=: the admin dashboard.
class Overview {
  const Overview({required this.today, required this.from, required this.to, required this.seriesByMonth, required this.totals, required this.prev, required this.perBarber, required this.series, required this.recent});
  final String today, from, to;
  final bool seriesByMonth;
  final RangeTotals totals, prev;
  final List<BarberDay> perBarber;
  final List<SeriesPoint> series;
  final List<Sale> recent;

  factory Overview.fromJson(Map<String, dynamic> j) {
    List<T> list<T>(String k, T Function(Map<String, dynamic>) f) {
      final l = j[k];
      if (l is! List) throw FormatException('Expected a list for $k');
      return [for (final x in l) f(obj(x, k))];
    }

    return Overview(
      today: str(j, 'today'),
      from: str(j, 'from'),
      to: str(j, 'to'),
      seriesByMonth: j['series_by'] == 'month',
      totals: RangeTotals.fromJson(obj(j['totals'], 'totals')),
      prev: RangeTotals.fromJson(obj(j['prev_totals'], 'prev_totals')),
      perBarber: list('per_barber', BarberDay.fromJson),
      series: list('series', SeriesPoint.fromJson),
      recent: list('recent', Sale.fromJson),
    );
  }
}
