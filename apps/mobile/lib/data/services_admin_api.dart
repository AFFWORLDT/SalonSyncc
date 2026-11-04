import '../core/api/api_client.dart';
import '../models/service.dart';

/// The add / edit service form as the API takes it; [price] in major units as typed.
class ServiceForm {
  const ServiceForm({required this.category, required this.name, this.description, required this.price, required this.sortOrder, this.active = true});
  final String category, name, price;
  final String? description;
  final int sortOrder;
  final bool active;

  Map<String, Object?> toJson() => {
        'category': category.trim(),
        'name': name.trim(),
        'description': (description ?? '').trim().isEmpty ? null : description!.trim(),
        'price': price.trim(),
        'sort_order': sortOrder,
        'active': active,
      };
}

class ServicesAdminApi {
  ServicesAdminApi(this.api);
  final ApiClient api;

  /// Hidden services included (admins only).
  Future<List<Service>> all() => api.get('/api/services', Service.listFromJson, query: {'all': 1});
  Future<void> save(ServiceForm f, {int? id}) => id == null ? api.post('/api/services', f.toJson(), (_) {}) : api.put('/api/services/$id', f.toJson(), (_) {});
  Future<void> delete(int id) => api.delete('/api/services/$id', (_) {});
  Future<void> starter() => api.post('/api/services/starter', <String, Object?>{}, (_) {});
}
