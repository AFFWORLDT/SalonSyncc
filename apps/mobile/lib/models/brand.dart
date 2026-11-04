import 'json.dart';

/// GET /api/public/brand on a salon's host: its name and logo; name null = no such (live) salon.
class Brand {
  const Brand({this.name, this.logoUrl});
  final String? name;
  final String? logoUrl;
  bool get found => name != null;

  factory Brand.fromJson(Map<String, dynamic> j) => Brand(name: strOrNull(j, 'name'), logoUrl: strOrNull(j, 'logo_url'));
}
