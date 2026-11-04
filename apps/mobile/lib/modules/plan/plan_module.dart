import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/features/feature_module.dart';
import '../../data/billing_api.dart';
import '../../models/role.dart';
import 'plan_screen.dart';

/// The plan and billing (admin; still open when the subscription has lapsed).
final planModule = FeatureModule(
  id: 'plan',
  roles: {Role.admin},
  title: 'Plan',
  icon: Icons.workspace_premium_outlined,
  order: 95,
  builder: (_) {
    final auth = Get.find<AuthController>();
    return PlanScreen(me: auth.me.value!, api: BillingApi(auth.api), onChanged: () => auth.refreshMe().then((_) {}, onError: (_) {}));
  },
);
