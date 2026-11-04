import 'json.dart';

/// One bill line: a catalogue service (serviceId) or an extra item (serviceId null). Price is per unit, minor units.
class SaleItem {
  const SaleItem({this.serviceId, required this.name, required this.price, required this.qty});
  final int? serviceId;
  final String name;
  final int price, qty;
  int get total => price * qty;

  factory SaleItem.fromJson(Map<String, dynamic> j) =>
      SaleItem(serviceId: j['service_id'] is int ? j['service_id'] as int : null, name: str(j, 'name'), price: integer(j, 'price'), qty: integer(j, 'qty'));
}

/// A bill (GET/POST /api/sales). Money in minor units; VAT is inside [amount].
class Sale {
  const Sale({
    required this.id,
    required this.billNo,
    required this.token,
    required this.day,
    required this.barberId,
    required this.barberName,
    required this.customerLabel,
    this.customerPhone,
    required this.amount,
    required this.payment,
    this.note,
    required this.commission,
    required this.vatRate,
    required this.vatAmount,
    required this.createdAt,
    required this.items,
  });

  final int id, barberId, amount, commission, vatAmount, createdAt;
  final String billNo, token, day, barberName, customerLabel, payment;
  final String? customerPhone, note;
  final num vatRate;
  final List<SaleItem> items;

  /// A walk-in the server named "Customer N" (no real name to greet).
  bool get isWalkIn => RegExp(r'^Customer \d+$').hasMatch(customerLabel);

  factory Sale.fromJson(Map<String, dynamic> j) {
    final l = j['items'];
    if (l is! List) throw const FormatException('Expected a list for items');
    return Sale(
      id: integer(j, 'id'),
      billNo: str(j, 'bill_no'),
      token: str(j, 'token'),
      day: str(j, 'day'),
      barberId: integer(j, 'barber_id'),
      barberName: str(j, 'barber_name'),
      customerLabel: str(j, 'customer_label'),
      customerPhone: strOrNull(j, 'customer_phone'),
      amount: integer(j, 'amount'),
      payment: str(j, 'payment_mode'),
      note: strOrNull(j, 'note'),
      commission: integer(j, 'commission'),
      vatRate: numOrNull(j, 'vat_rate') ?? 0,
      vatAmount: integer(j, 'vat_amount'),
      createdAt: integer(j, 'created_at'),
      items: [for (final x in l) SaleItem.fromJson(obj(x, 'item'))],
    );
  }
}

/// A customer suggestion while typing (a barber sees only their own customers).
class CustomerHint {
  const CustomerHint({required this.id, required this.name, this.phone});
  final int id;
  final String name;
  final String? phone;

  factory CustomerHint.fromJson(Map<String, dynamic> j) => CustomerHint(id: integer(j, 'id'), name: str(j, 'name'), phone: strOrNull(j, 'phone'));
}
