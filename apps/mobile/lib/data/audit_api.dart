import '../core/api/api_client.dart';
import '../models/audit.dart';
import '../models/paged.dart';

class AuditApi {
  AuditApi(this.api);
  final ApiClient api;

  /// While [q] is typed the dates are left out (the web hides them too).
  Future<Paged<AuditEntry>> list({String q = '', String? from, String? to, String? entity, int? actorId, int page = 1, int pageSize = 50}) {
    final search = q.trim().isNotEmpty;
    return api.get('/api/audit', (j) => Paged.fromJson(j as Map<String, dynamic>, AuditEntry.fromJson), query: {
      if (search) 'q': q.trim(),
      if (!search) 'from': ?from,
      if (!search) 'to': ?to,
      'entity': ?entity,
      'actor_id': ?actorId,
      if (page > 1) 'page': page,
      'page_size': pageSize,
    });
  }
}
