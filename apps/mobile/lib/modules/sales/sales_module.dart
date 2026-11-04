import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/features/feature_module.dart';
import '../../core/format/fmt.dart';
import '../../data/sales_api.dart';
import '../../data/staff_api.dart';
import '../../models/role.dart';
import '../bills/bills_screen.dart';
import '../sale/bill_screen.dart';
import '../sale/sale_sheet.dart';
import '../sale/share_buttons.dart';
import 'sales_screen.dart';

/// Every sale (admin).
final salesModule = FeatureModule(
  id: 'sales',
  featureKey: 'core_sales',
  roles: {Role.admin},
  title: 'Sales',
  icon: Icons.point_of_sale_rounded,
  tab: true,
  order: 10,
  builder: (context) {
    final auth = Get.find<AuthController>();
    final me = auth.me.value!;
    final sales = SalesApi(auth.api, me.fmt), staff = StaffApi(auth.api);
    return SalesScreen(
      me: me,
      sales: sales,
      staff: staff,
      onOpen: (s) => openBill(context, me: me, sales: sales, sale: s),
      onNewSale: () => openSaleSheet(context, me: me, sales: sales, staff: staff, doneActions: shareActionsFor),
    );
  },
);

/// Every bill, searchable (admin; barbers have "My bills").
final adminBillsModule = FeatureModule(
  id: 'all_bills',
  featureKey: 'core_sales',
  roles: {Role.admin},
  title: 'Bills',
  icon: Icons.receipt_long_outlined,
  order: 40,
  builder: (context) {
    final auth = Get.find<AuthController>();
    final me = auth.me.value!;
    final sales = SalesApi(auth.api, me.fmt);
    return BillsScreen(me: me, sales: sales, admin: true, onOpen: (s) => openBill(context, me: me, sales: sales, sale: s));
  },
);
