import '../core/api/api_client.dart';

class AccountApi {
  AccountApi(this.api);
  final ApiClient api;

  /// My own photo (JPEG / PNG / WebP, max 200 KB); returns its new URL.
  Future<String?> setPhoto(List<int> bytes, String type) => api.putBytes('/api/me/avatar', bytes, type, (j) => j is Map ? j['avatar_url'] as String? : null);

  Future<void> clearPhoto() => api.delete('/api/me/avatar', (_) {});

  /// The banner behind my photo (a wide JPEG, max 300 KB); returns its new URL.
  Future<String?> setBanner(List<int> bytes, String type) => api.putBytes('/api/me/banner', bytes, type, (j) => j is Map ? j['banner_url'] as String? : null);

  Future<void> clearBanner() => api.delete('/api/me/banner', (_) {});

  /// Deletes my account for good (the owner's deletes the whole salon). [confirm]: the salon ID (owner) or "DELETE".
  Future<void> deleteAccount(String confirm) => api.delete('/api/me', (_) {}, body: {'confirm': confirm});

  Future<void> changePassword(String current, String next) => api.put('/api/me/password', {'current': current, 'next': next}, (_) {});
}
