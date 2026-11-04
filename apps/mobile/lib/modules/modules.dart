import '../core/features/feature_module.dart';
import 'account/account_module.dart';
import 'announcements/announcements_module.dart';
import 'bills/bills_module.dart';
import 'dashboard/dashboard_module.dart';
import 'expenses/expenses_module.dart';
import 'history/history_module.dart';
import 'ledger/ledger_module.dart';
import 'monthly/monthly_module.dart';
import 'sales/sales_module.dart';
import 'sheet/sheet_module.dart';
import 'staff/staff_module.dart';
import 'home/home_module.dart';

/// Every screen of the app. Later stages (and salon-specific custom features) add their modules here.
final appModules = <FeatureModule>[
  homeModule,
  dashboardModule,
  salesModule,
  adminBillsModule,
  sheetModule,
  staffModule,
  monthlyModule,
  ledgerModule,
  expensesModule,
  billsModule,
  historyModule,
  announcementsModule,
  accountModule,
];
