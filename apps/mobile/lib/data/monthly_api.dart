import '../core/api/api_client.dart';
import '../models/monthly.dart';

class MonthlyApi {
  MonthlyApi(this.api);
  final ApiClient api;
  Future<MonthlyReport> year(String year) => api.get('/api/reports/monthly', (j) => MonthlyReport.fromJson(j as Map<String, dynamic>), query: {'year': year});
}
