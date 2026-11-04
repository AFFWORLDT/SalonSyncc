import '../core/api/api_client.dart';
import '../core/format/fmt.dart';
import '../models/paged.dart';
import '../models/sale.dart';
import '../models/service.dart';

/// One line of a bill being made. [price] is per unit in minor units (the catalogue price, or the barber's override).
class DraftLine {
  const DraftLine({this.serviceId, required this.name, required this.price, this.qty = 1});
  final int? serviceId;
  final String name;
  final int price, qty;

  DraftLine copyWith({int? price, int? qty}) => DraftLine(serviceId: serviceId, name: name, price: price ?? this.price, qty: qty ?? this.qty);
}

/// A bill to save: either [lines] or a plain [amount] (minor units), as the web sends them.
class SaleDraft {
  const SaleDraft({this.lines = const [], this.amount, required this.payment, this.customerName, this.customerPhone, this.note});
  final List<DraftLine> lines;
  final int? amount;
  final String payment;
  final String? customerName, customerPhone, note;

  int get total => lines.isNotEmpty ? lines.fold(0, (s, l) => s + l.price * l.qty) : (amount ?? 0);

  Map<String, Object?> toJson(Fmt fmt) => {
        if (lines.isNotEmpty)
          'items': [
            for (final l in lines)
              l.serviceId != null
                  ? {'service_id': l.serviceId, 'price': fmt.toInput(l.price), 'qty': l.qty}
                  : {'name': l.name, 'price': fmt.toInput(l.price), 'qty': l.qty},
          ]
        else
          'amount': fmt.toInput(amount ?? 0),
        'payment_mode': payment,
        'customer_name': customerName,
        'customer_phone': customerPhone,
        'note': note,
      };
}

/// Bills, the catalogue, customer suggestions and the day's expense, for the signed-in barber.
class SalesApi {
  SalesApi(this.api, this.fmt);
  final ApiClient api;
  final Fmt fmt;

  static Sale _sale(Object? j) => Sale.fromJson(j as Map<String, dynamic>);
  static Paged<Sale> _page(Object? j) => Paged.fromJson(j as Map<String, dynamic>, Sale.fromJson);

  Future<Paged<Sale>> today(String day) => api.get('/api/sales', _page, query: {'day': day, 'page_size': 200});

  /// [page] is 1-based; the server caps [pageSize] at 200, so long lists page instead of growing the size.
  Future<Paged<Sale>> search({String q = '', String? day, int page = 1, int pageSize = 50}) => api.get('/api/sales', _page,
      query: {if (q.trim().isNotEmpty) 'q': q.trim(), 'day': ?day, if (page > 1) 'page': page, 'page_size': pageSize});

  Future<Sale> create(SaleDraft d) => api.post('/api/sales', d.toJson(fmt), _sale);
  Future<Sale> update(int id, SaleDraft d) => api.put('/api/sales/$id', d.toJson(fmt), _sale);
  Future<void> delete(int id) => api.delete('/api/sales/$id', (_) {});

  Future<List<Service>> services() async => (await api.get('/api/services', Service.listFromJson)).where((s) => s.active).toList();

  Future<List<CustomerHint>> customers(String q) => api.get(
        '/api/customers',
        (j) => Paged.fromJson(j as Map<String, dynamic>, CustomerHint.fromJson).items,
        query: q.trim().isEmpty ? {'page_size': 8} : {'q': q.trim(), 'page_size': 6},
      );

  /// Today's own expense; an empty or 0 amount removes it.
  Future<void> saveExpense(String amount, String note) => api.put('/api/expenses', {'amount': amount, 'note': note}, (_) {});

  /// Cloud WhatsApp: send the bill, then read its status. Returns the status word ("queued", "sent", …).
  Future<String> sendWhatsApp(int id) => api.post('/api/sales/$id/whatsapp', <String, Object?>{}, _status);
  Future<String?> whatsAppStatus(int id) => api.get('/api/sales/$id/whatsapp', (j) => j == null ? null : _status(j));
  static String _status(Object? j) => (j is Map && j['status'] is String) ? j['status'] as String : 'queued';
}
