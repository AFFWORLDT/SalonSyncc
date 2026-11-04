import '../core/api/api_client.dart';
import '../models/daily_sheet.dart';
import '../models/overview.dart';
import '../models/setup.dart';

class AdminReportsApi {
  AdminReportsApi(this.api);
  final ApiClient api;

  Future<Overview> overview(String from, String to) =>
      api.get('/api/reports/overview', (j) => Overview.fromJson(j as Map<String, dynamic>), query: {'from': from, 'to': to});

  Future<DailySheet> daily(String month) => api.get('/api/reports/daily', (j) => DailySheet.fromJson(j as Map<String, dynamic>), query: {'month': month});

  Future<SetupState> setup() => api.get('/api/settings/setup', (j) => SetupState.fromJson(j as Map<String, dynamic>));
}
