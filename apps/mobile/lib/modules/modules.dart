import '../core/features/feature_module.dart';
import 'account/account_module.dart';
import 'home/home_module.dart';

/// Every screen of the app. Later stages (and salon-specific custom features) add their modules here.
final appModules = <FeatureModule>[
  homeModule,
  accountModule,
];
