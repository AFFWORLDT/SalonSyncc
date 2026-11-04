import 'json.dart';

/// A staff member (GET /api/users). commissionPct null = the shop default.
class Staff {
  const Staff({
    required this.id,
    required this.name,
    required this.username,
    this.phone,
    required this.role,
    this.commissionPct,
    required this.sortOrder,
    required this.active,
    required this.canAddExpense,
    this.avatarUrl,
  });
  final int id, sortOrder;
  final String name, username, role;
  final String? phone, avatarUrl;
  final num? commissionPct;
  final bool active, canAddExpense;

  bool get isOwner => role == 'owner';
  bool get isAdmin => role == 'admin' || role == 'owner';
  bool get isBarber => role == 'barber';

  factory Staff.fromJson(Map<String, dynamic> j) => Staff(
        id: integer(j, 'id'),
        name: str(j, 'name'),
        username: str(j, 'username'),
        phone: strOrNull(j, 'phone'),
        role: str(j, 'role'),
        commissionPct: numOrNull(j, 'commission_pct'),
        sortOrder: j['sort_order'] is int ? j['sort_order'] as int : 0,
        active: j['active'] != false,
        canAddExpense: j['can_add_expense'] == true,
        avatarUrl: strOrNull(j, 'avatar_url'),
      );

  static List<Staff> listFromJson(Object? j) {
    if (j is! List) throw const FormatException('Expected a list of users');
    return [for (final x in j) Staff.fromJson(obj(x, 'user'))];
  }
}
