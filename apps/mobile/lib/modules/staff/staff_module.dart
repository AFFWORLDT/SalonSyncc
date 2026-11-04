import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/features/feature_module.dart';
import '../../data/staff_api.dart';
import '../../models/role.dart';
import 'staff_screen.dart';

/// Staff (admin).
final staffModule = FeatureModule(
  id: 'staff',
  featureKey: 'core_sales',
  roles: {Role.admin},
  title: 'Staff',
  icon: Icons.groups_outlined,
  order: 60,
  builder: (_) {
    final auth = Get.find<AuthController>();
    return StaffScreen(me: auth.me.value!, api: StaffApi(auth.api));
  },
);
