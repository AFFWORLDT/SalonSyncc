import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/features/feature_module.dart';
import '../../core/format/fmt.dart';
import '../../data/sales_api.dart';
import '../../models/role.dart';
import '../sale/bill_screen.dart';
import 'bills_screen.dart';

/// My bills: the barber's own bills, searchable (core_sales is always on).
final billsModule = FeatureModule(
  id: 'bills',
  featureKey: 'core_sales',
  roles: {Role.barber},
  title: 'My bills',
  icon: Icons.receipt_long_outlined,
  tab: true,
  order: 10,
  builder: (context) {
    final auth = Get.find<AuthController>();
    final me = auth.me.value!;
    final sales = SalesApi(auth.api, me.fmt);
    return BillsScreen(me: me, sales: sales, onOpen: (s) => openBill(context, me: me, sales: sales, sale: s));
  },
);
