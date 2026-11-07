import '../core/api/api_client.dart';

class AccountApi {
  AccountApi(this.api);
  final ApiClient api;

  /// My own photo (JPEG / PNG / WebP, max 200 KB); returns its new URL.
  Future<String?> setPhoto(List<int> bytes, String type) => api.putBytes('/api/me/avatar', bytes, type, (j) => j is Map ? j['avatar_url'] as String? : null);

  Future<void> clearPhoto() => api.delete('/api/me/avatar', (_) {});

  Future<void> changePassword(String current, String next) => api.put('/api/me/password', {'current': current, 'next': next}, (_) {});
}
