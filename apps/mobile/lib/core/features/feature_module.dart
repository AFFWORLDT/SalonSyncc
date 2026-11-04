import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import '../../models/me.dart';
import '../../models/role.dart';

/// One screen of the app, tied to a server feature switch and the roles that may use it. The shell builds its tabs
/// and "More" menu from these; adding a feature (or a salon's custom one) is one module added to `appModules`.
class FeatureModule {
  const FeatureModule({
    required this.id,
    this.featureKey,
    required this.roles,
    required this.title,
    required this.icon,
    this.tab = false,
    this.order = 100,
    this.visibleWhen,
    this.badge,
    this.onRefresh,
    required this.builder,
  });

  final String id;

  /// A FeatureKey from @ss/features; null = always on (e.g. My account).
  final String? featureKey;
  final Set<Role> roles;
  final String title;
  final IconData icon;

  /// Wants a bottom-bar tab (at most 4 fit; the rest go under "More").
  final bool tab;
  final int order;

  /// An extra rule on top of the switch, e.g. barbers see Expenses only when allowed to add them.
  final bool Function(Me me)? visibleWhen;
  final WidgetBuilder builder;

  /// A count shown on the module's tab or "More" row (e.g. unread announcements); 0 hides it.
  final ValueListenable<int>? badge;

  /// Re-reads what [badge] counts. The shell calls it on open, on return to the app and when a push arrives.
  final Future<void> Function()? onRefresh;

  bool visibleFor(Me me) =>
      (featureKey == null || me.features.contains(featureKey)) && roles.contains(me.role) && (visibleWhen?.call(me) ?? true);
}
