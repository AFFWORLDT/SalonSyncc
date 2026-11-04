import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/features/feature_module.dart';
import '../../data/monthly_api.dart';
import '../../models/role.dart';
import '../../shell/nav.dart';
import 'monthly_screen.dart';

/// Monthly and yearly report (admin).
final monthlyModule = FeatureModule(
  id: 'monthly',
  featureKey: 'reports_advanced',
  roles: {Role.admin},
  title: 'Monthly',
  icon: Icons.calendar_month_outlined,
  order: 30,
  builder: (_) {
    final auth = Get.find<AuthController>();
    return MonthlyScreen(
      me: auth.me.value!,
      api: MonthlyApi(auth.api),
      onMonth: (m) {
        sheetMonthRequest.value = m;
        openModule('sheet');
      },
    );
  },
);
