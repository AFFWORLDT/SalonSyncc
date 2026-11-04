import '../core/api/api_client.dart';
import '../models/ratings.dart';

class RatingsApi {
  RatingsApi(this.api);
  final ApiClient api;
  Future<RatingsReport> report(String from, String to) => api.get('/api/ratings', (j) => RatingsReport.fromJson(j as Map<String, dynamic>), query: {'from': from, 'to': to});
}
