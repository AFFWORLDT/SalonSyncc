import 'json.dart';

/// One row of the notification feed (announcements, "your sale was changed", …).
class Notice {
  const Notice({required this.id, required this.title, this.body, this.path, required this.createdAt, this.readAt});
  final int id, createdAt;
  final String title;
  final String? body, path;
  final int? readAt;
  bool get isRead => readAt != null;

  factory Notice.fromJson(Map<String, dynamic> j) => Notice(
        id: integer(j, 'id'),
        title: str(j, 'title'),
        body: strOrNull(j, 'body'),
        path: strOrNull(j, 'path'),
        createdAt: integer(j, 'created_at'),
        readAt: j['read_at'] is int ? j['read_at'] as int : null,
      );
}

/// GET /api/notifications: newest first, plus the unread count.
class NoticeFeed {
  const NoticeFeed({required this.items, required this.unread});
  final List<Notice> items;
  final int unread;

  factory NoticeFeed.fromJson(Map<String, dynamic> j) {
    final l = j['items'];
    if (l is! List) throw const FormatException('Expected a list for items');
    return NoticeFeed(items: [for (final x in l) Notice.fromJson(obj(x, 'notice'))], unread: integer(j, 'unread'));
  }
}
