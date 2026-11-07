import 'json.dart';
import 'role.dart';

/// GET /api/me: who is signed in, their salon, its settings and the features switched on for them.
class Me {
  const Me({required this.user, required this.org, required this.settings, required this.features, required this.today, required this.subscription, this.maxStaff});

  final MeUser user;
  final MeOrg org;
  final Map<String, dynamic> settings;
  final Set<String> features;
  final String today;
  final Subscription subscription;

  /// The plan's active-staff limit (owner not counted); null = no limit.
  final int? maxStaff;

  Role get role => roleOf(user.role);
  bool get canAddExpense => user.canAddExpense;

  /// A lapsed subscription: the server refuses new or changed bills (402), so the app hides those actions.
  bool get readOnly => !const {'trial', 'active', 'grace', 'past_due'}.contains(org.status);
  String get salonName {
    final d = settings['display_name'];
    return d is String && d.trim().isNotEmpty ? d.trim() : org.name;
  }

  factory Me.fromJson(Map<String, dynamic> j) {
    final f = j['features'];
    if (f is! List) throw const FormatException('Expected a list for features');
    return Me(
      user: MeUser.fromJson(obj(j['user'], 'user')),
      org: MeOrg.fromJson(obj(j['org'], 'org')),
      settings: obj(j['settings'], 'settings'),
      features: f.whereType<String>().toSet(),
      today: str(j, 'today'),
      subscription: Subscription.fromJson(obj(j['subscription'], 'subscription')),
      maxStaff: j['limits'] is Map && (j['limits'] as Map)['max_staff'] is int ? (j['limits'] as Map)['max_staff'] as int : null,
    );
  }
}

class MeUser {
  const MeUser({required this.id, required this.name, required this.username, required this.role, this.commissionPct, this.avatarUrl, this.bannerUrl, required this.canAddExpense});
  final int id;
  final String name, username, role;
  final num? commissionPct;
  final String? avatarUrl;

  /// The banner behind my photo on my profile.
  final String? bannerUrl;
  final bool canAddExpense;

  factory MeUser.fromJson(Map<String, dynamic> j) => MeUser(
        id: integer(j, 'id'),
        name: str(j, 'name'),
        username: str(j, 'username'),
        role: str(j, 'role'),
        commissionPct: numOrNull(j, 'commission_pct'),
        avatarUrl: strOrNull(j, 'avatar_url'),
        bannerUrl: strOrNull(j, 'banner_url'),
        canAddExpense: j['can_add_expense'] == true,
      );
}

class MeOrg {
  const MeOrg({required this.id, required this.slug, required this.name, required this.status, required this.planId});
  final String id, slug, name, status, planId;

  factory MeOrg.fromJson(Map<String, dynamic> j) =>
      MeOrg(id: str(j, 'id'), slug: str(j, 'slug'), name: str(j, 'name'), status: str(j, 'status'), planId: str(j, 'planId'));
}

class Subscription {
  const Subscription({required this.status, required this.planId, this.trialEndsAt, this.graceEndsAt});
  final String status, planId;

  /// When the free trial / the grace period after it ends (ms), for the Plan screen's banner.
  final int? trialEndsAt, graceEndsAt;

  factory Subscription.fromJson(Map<String, dynamic> j) => Subscription(
        status: str(j, 'status'),
        planId: str(j, 'planId'),
        trialEndsAt: j['trialEndsAt'] is int ? j['trialEndsAt'] as int : null,
        graceEndsAt: j['graceEndsAt'] is int ? j['graceEndsAt'] as int : null,
      );
}
