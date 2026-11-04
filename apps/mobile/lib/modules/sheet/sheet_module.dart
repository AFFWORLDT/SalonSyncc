import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/features/feature_module.dart';
import '../../data/admin_reports_api.dart';
import '../../models/role.dart';
import '../../shell/nav.dart';
import 'sheet_screen.dart';

/// The daily sheet (admin).
final sheetModule = FeatureModule(
  id: 'sheet',
  featureKey: 'daily_sheet',
  roles: {Role.admin},
  title: 'Daily sheet',
  icon: Icons.grid_on_rounded,
  tab: true,
  order: 20,
  builder: (_) {
    final auth = Get.find<AuthController>();
    return SheetScreen(
      me: auth.me.value!,
      reports: AdminReportsApi(auth.api),
      onDay: (day) {
        salesDayRequest.value = day;
        openModule('sales');
      },
    );
  },
);
