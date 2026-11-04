import '../core/api/api_client.dart';
import '../models/report.dart';

class ReportApi {
  ReportApi(this.api);
  final ApiClient api;

  /// The signed-in barber's month ("YYYY-MM") and today.
  Future<MyReport> me(String month) => api.get('/api/reports/me', (j) => MyReport.fromJson(j as Map<String, dynamic>), query: {'month': month});
}
