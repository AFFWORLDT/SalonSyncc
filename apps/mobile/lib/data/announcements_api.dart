import '../core/api/api_client.dart';
import '../models/announcement.dart';

class AnnouncementsApi {
  AnnouncementsApi(this.api);
  final ApiClient api;

  Future<List<Announcement>> list() => api.get('/api/announcements', Announcement.listFromJson);

  /// To everyone, or to one barber when [barberId] is given.
  Future<Announcement> send({required String title, required String body, int? barberId, bool email = false}) => api.post(
        '/api/announcements',
        {'title': title.trim(), 'body': body.trim(), 'audience': barberId == null ? 'all' : 'barber', 'barber_id': ?barberId, 'email': email},
        (j) => Announcement.fromJson(j as Map<String, dynamic>),
      );
}
