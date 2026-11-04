import 'json.dart';

/// A page of a list endpoint: `{items, total, page, page_size, sum?}` (sum: total amount, for sales).
class Paged<T> {
  const Paged({required this.items, required this.total, required this.page, required this.pageSize, this.sum});
  final List<T> items;
  final int total, page, pageSize;
  final int? sum;

  factory Paged.fromJson(Map<String, dynamic> j, T Function(Map<String, dynamic>) item) {
    final l = j['items'];
    if (l is! List) throw const FormatException('Expected a list for items');
    return Paged(
      items: [for (final x in l) item(obj(x, 'item'))],
      total: integer(j, 'total'),
      page: integer(j, 'page'),
      pageSize: integer(j, 'page_size'),
      sum: j['sum'] is int ? j['sum'] as int : null,
    );
  }
}
