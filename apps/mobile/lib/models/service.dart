import 'json.dart';

/// A catalogue service (GET /api/services). Price in minor units.
class Service {
  const Service({required this.id, required this.category, required this.name, this.description, required this.price, this.sortOrder = 0, required this.active});
  final int id, price, sortOrder;
  final String category, name;
  final String? description;
  final bool active;

  factory Service.fromJson(Map<String, dynamic> j) => Service(
        id: integer(j, 'id'),
        category: str(j, 'category'),
        name: str(j, 'name'),
        description: strOrNull(j, 'description'),
        price: integer(j, 'price'),
        sortOrder: j['sort_order'] is int ? j['sort_order'] as int : 0,
        active: j['active'] != false,
      );

  static List<Service> listFromJson(Object? j) {
    if (j is! List) throw const FormatException('Expected a list of services');
    return [for (final x in j) Service.fromJson(obj(x, 'service'))];
  }
}
