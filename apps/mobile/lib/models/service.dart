import 'json.dart';

/// A catalogue service (GET /api/services). Price in minor units.
class Service {
  const Service({required this.id, required this.category, required this.name, required this.price, required this.active});
  final int id, price;
  final String category, name;
  final bool active;

  factory Service.fromJson(Map<String, dynamic> j) =>
      Service(id: integer(j, 'id'), category: str(j, 'category'), name: str(j, 'name'), price: integer(j, 'price'), active: j['active'] != false);

  static List<Service> listFromJson(Object? j) {
    if (j is! List) throw const FormatException('Expected a list of services');
    return [for (final x in j) Service.fromJson(obj(x, 'service'))];
  }
}
