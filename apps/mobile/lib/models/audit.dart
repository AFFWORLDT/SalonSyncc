import 'json.dart';

/// One audit row: who did what to which record, with the before / after snapshots.
class AuditEntry {
  const AuditEntry({required this.id, required this.at, required this.actorName, required this.entity, this.ref, required this.action, this.before, this.after, required this.changed});
  final int id, at;
  final String actorName, entity, action;
  final String? ref;
  final Map<String, dynamic>? before, after;
  final List<String> changed;

  factory AuditEntry.fromJson(Map<String, dynamic> j) => AuditEntry(
        id: integer(j, 'id'),
        at: integer(j, 'at'),
        actorName: strOrNull(j, 'actor_name') ?? '',
        entity: str(j, 'entity'),
        ref: strOrNull(j, 'ref'),
        action: str(j, 'action'),
        before: j['before'] is Map<String, dynamic> ? j['before'] as Map<String, dynamic> : null,
        after: j['after'] is Map<String, dynamic> ? j['after'] as Map<String, dynamic> : null,
        changed: j['changed'] is List ? (j['changed'] as List).whereType<String>().toList() : const [],
      );
}
