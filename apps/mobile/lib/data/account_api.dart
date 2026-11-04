import '../core/api/api_client.dart';

class AccountApi {
  AccountApi(this.api);
  final ApiClient api;

  Future<void> changePassword(String current, String next) => api.put('/api/me/password', {'current': current, 'next': next}, (_) {});
}
