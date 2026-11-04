import 'json.dart';

class Announcement {
  const Announcement({required this.id, required this.senderName, required this.audience, this.targetName, required this.title, required this.body, required this.recipients, required this.createdAt});
  final int id, recipients, createdAt;
  final String senderName, audience, title, body;
  final String? targetName;

  factory Announcement.fromJson(Map<String, dynamic> j) => Announcement(
        id: integer(j, 'id'),
        senderName: strOrNull(j, 'sender_name') ?? '',
        audience: str(j, 'audience'),
        targetName: strOrNull(j, 'target_name'),
        title: str(j, 'title'),
        body: str(j, 'body'),
        recipients: integer(j, 'recipients'),
        createdAt: integer(j, 'created_at'),
      );

  static List<Announcement> listFromJson(Object? j) {
    if (j is! List) throw const FormatException('Expected a list of announcements');
    return [for (final x in j) Announcement.fromJson(obj(x, 'announcement'))];
  }
}
