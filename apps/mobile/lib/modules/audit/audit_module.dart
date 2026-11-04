import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/features/feature_module.dart';
import '../../data/audit_api.dart';
import '../../data/ratings_api.dart';
import '../../data/staff_api.dart';
import '../../models/role.dart';
import '../ratings/ratings_screen.dart';
import 'audit_screen.dart';

/// Ratings and reviews (admin).
final ratingsModule = FeatureModule(
  id: 'ratings',
  featureKey: 'ratings',
  roles: {Role.admin},
  title: 'Ratings',
  icon: Icons.star_outline_rounded,
  order: 70,
  builder: (_) {
    final auth = Get.find<AuthController>();
    return RatingsScreen(me: auth.me.value!, api: RatingsApi(auth.api));
  },
);

/// The audit log (admin).
final auditModule = FeatureModule(
  id: 'audit',
  featureKey: 'audit_log',
  roles: {Role.admin},
  title: 'Audit log',
  icon: Icons.history_rounded,
  order: 75,
  builder: (_) {
    final auth = Get.find<AuthController>();
    return AuditScreen(me: auth.me.value!, api: AuditApi(auth.api), staff: StaffApi(auth.api));
  },
);
