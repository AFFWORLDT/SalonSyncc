import '../core/api/api_client.dart';
import '../models/notice.dart';

class NoticesApi {
  NoticesApi(this.api);
  final ApiClient api;

  Future<NoticeFeed> list() => api.get('/api/notifications', (j) => NoticeFeed.fromJson(j as Map<String, dynamic>), query: {'limit': 50});

  /// No ids = mark everything read (the web does this when the bell opens).
  Future<void> markAllRead() => api.post('/api/notifications/read', <String, Object?>{}, (_) {});
}
