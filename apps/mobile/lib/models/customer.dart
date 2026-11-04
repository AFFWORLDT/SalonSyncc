import 'json.dart';

class Customer {
  const Customer({required this.id, this.name, this.phone, required this.visits, required this.spent, this.lastVisitAt, required this.waOptOut});
  final int id, visits, spent;
  final String? name, phone;
  final int? lastVisitAt;
  final bool waOptOut;

  factory Customer.fromJson(Map<String, dynamic> j) => Customer(
        id: integer(j, 'id'),
        name: strOrNull(j, 'name'),
        phone: strOrNull(j, 'phone'),
        visits: integer(j, 'visits'),
        spent: integer(j, 'spent'),
        lastVisitAt: j['last_visit_at'] is int ? j['last_visit_at'] as int : null,
        waOptOut: j['wa_opt_out'] == true,
      );
}

/// GET /api/customers/:id: the customer plus their visit summary.
class CustomerDetail extends Customer {
  const CustomerDetail({
    required super.id,
    super.name,
    super.phone,
    required super.visits,
    required super.spent,
    super.lastVisitAt,
    required super.waOptOut,
    this.firstVisitAt,
    required this.avgBill,
    required this.cashVisits,
    required this.cardVisits,
    required this.barbers,
    required this.services,
  });
  final int? firstVisitAt;
  final int avgBill, cashVisits, cardVisits;
  final List<(String, int)> barbers, services;

  factory CustomerDetail.fromJson(Map<String, dynamic> j) {
    final c = Customer.fromJson(j);
    List l(Object? v) => v is List ? v : const [];
    return CustomerDetail(
      id: c.id,
      name: c.name,
      phone: c.phone,
      visits: c.visits,
      spent: c.spent,
      lastVisitAt: c.lastVisitAt,
      waOptOut: c.waOptOut,
      firstVisitAt: j['first_visit_at'] is int ? j['first_visit_at'] as int : null,
      avgBill: integer(j, 'avg_bill'),
      cashVisits: integer(j, 'cash_visits'),
      cardVisits: integer(j, 'card_visits'),
      barbers: [for (final x in l(j['barbers'])) (str(obj(x, 'b'), 'name'), integer(obj(x, 'b'), 'visits'))],
      services: [for (final x in l(j['services'])) (str(obj(x, 's'), 'name'), integer(obj(x, 's'), 'qty'))],
    );
  }
}
