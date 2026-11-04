import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/features/feature_module.dart';
import '../../data/services_admin_api.dart';
import '../../models/role.dart';
import 'services_screen.dart';

/// The price list (admin).
final servicesModule = FeatureModule(
  id: 'services',
  featureKey: 'core_sales',
  roles: {Role.admin},
  title: 'Services',
  icon: Icons.content_cut_rounded,
  order: 55,
  builder: (_) {
    final auth = Get.find<AuthController>();
    return ServicesScreen(me: auth.me.value!, api: ServicesAdminApi(auth.api));
  },
);
