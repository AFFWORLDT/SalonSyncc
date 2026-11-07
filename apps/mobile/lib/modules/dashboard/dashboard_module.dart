import 'package:flutter/material.dart';
import '../../core/ui/toast.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/features/feature_module.dart';
import '../../core/format/fmt.dart';
import '../../data/admin_reports_api.dart';
import '../../data/expenses_api.dart';
import '../../data/sales_api.dart';
import '../../data/staff_api.dart';
import '../../models/role.dart';
import '../../shell/nav.dart';
import '../expenses/expenses_screen.dart';
import '../sale/bill_screen.dart';
import '../sale/sale_sheet.dart';
import '../sale/share_buttons.dart';
import 'dashboard_screen.dart';

/// The owner's and admins' home.
final dashboardModule = FeatureModule(
  id: 'dashboard',
  featureKey: 'core_sales',
  roles: {Role.admin},
  title: 'Dashboard',
  icon: Icons.space_dashboard_outlined,
  tab: true,
  order: 0,
  builder: (context) {
    final auth = Get.find<AuthController>();
    final me = auth.me.value!;
    final sales = SalesApi(auth.api, me.fmt);
    return DashboardScreen(
      me: me,
      reports: AdminReportsApi(auth.api),
      onOpenSale: (s) => openBill(context, me: me, sales: sales, sale: s),
      onAllSales: (day) {
        salesDayRequest.value = day;
        openModule('sales');
      },
      onDailySheet: () => openModule('sheet'),
      onAddCompanyExpense: () async {
        final r = await showCompanyExpenseSheet(context, api: ExpensesApi(auth.api), me: me);
        if (r != null && context.mounted) showSkToast(context, r);
      },
      onNewSale: () => openSaleSheet(context, me: me, sales: sales, staff: StaffApi(auth.api), doneActions: shareActionsFor),
    );
  },
);
