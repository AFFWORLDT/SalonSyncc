import 'json.dart';

/// A barber's expense for one day (one entry per barber per day).
class Expense {
  const Expense({required this.id, required this.barberId, required this.barberName, required this.day, required this.amount, this.note});
  final int id, barberId, amount;
  final String barberName, day;
  final String? note;

  factory Expense.fromJson(Map<String, dynamic> j) => Expense(
        id: integer(j, 'id'),
        barberId: integer(j, 'barber_id'),
        barberName: str(j, 'barber_name'),
        day: str(j, 'day'),
        amount: integer(j, 'amount'),
        note: strOrNull(j, 'note'),
      );

  static List<Expense> listFromJson(Object? j) {
    if (j is! List) throw const FormatException('Expected a list of expenses');
    return [for (final x in j) Expense.fromJson(obj(x, 'expense'))];
  }
}

/// A shop cost (rent, bills, supplies); several a day; comes off the shop profit.
class CompanyExpense {
  const CompanyExpense({required this.id, required this.day, required this.amount, required this.note, required this.paidFrom, this.createdByName});
  final int id, amount;
  final String day, note, paidFrom;
  final String? createdByName;

  factory CompanyExpense.fromJson(Map<String, dynamic> j) => CompanyExpense(
        id: integer(j, 'id'),
        day: str(j, 'day'),
        amount: integer(j, 'amount'),
        note: str(j, 'note'),
        paidFrom: strOrNull(j, 'paid_from') ?? 'cash',
        createdByName: strOrNull(j, 'created_by_name'),
      );

  static List<CompanyExpense> listFromJson(Object? j) {
    if (j is! List) throw const FormatException('Expected a list of company expenses');
    return [for (final x in j) CompanyExpense.fromJson(obj(x, 'company expense'))];
  }
}
