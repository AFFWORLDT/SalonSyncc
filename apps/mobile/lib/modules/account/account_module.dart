import 'package:flutter/material.dart';

import '../../core/ui/brand.dart';
import '../../core/theme/scale.dart';
import '../../core/ui/stats.dart';
import '../../core/ui/confirm_sign_out.dart';
import '../../core/ui/avatar.dart';
import '../../core/ui/heading.dart';
import '../../core/ui/toggle.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/auth/lock_controller.dart';
import '../../core/features/feature_module.dart';
import '../../core/theme/theme_controller.dart';
import '../../data/account_api.dart';
import 'change_password.dart';
import '../../models/role.dart';

/// My account: who is signed in, change password, appearance, the biometric lock, sign out, switch salon.
final accountModule = FeatureModule(
  id: 'account',
  roles: {Role.admin, Role.barber},
  title: 'My account',
  icon: Icons.person_outline,
  order: 1000,
  builder: (_) => const AccountScreen(),
);

/// Extra rows other parts of the app add, so this screen needn't know them.
final accountExtras = <WidgetBuilder>[];

/// Adds "Unlock with Face ID / fingerprint" (shown only when the phone has biometrics). Called once at startup.
void registerLockToggle() {
  if (accountExtras.contains(_lockToggle)) return;
  accountExtras.add(_lockToggle);
}

Widget _lockToggle(BuildContext context) {
  final lock = Get.find<LockController>();
  return Obx(() => !lock.available.value
      ? const SizedBox.shrink()
      : SkSwitchTile(
          contentPadding: const EdgeInsets.fromLTRB(14, 4, 12, 4),
          secondary: const SkIconCircle(Icons.fingerprint, size: 48),
          title: const Text('Unlock with Face ID / fingerprint'),
          value: lock.enabled.value,
          onChanged: (on) => on ? lock.enable() : lock.disable(),
        ));
}

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = Get.find<AuthController>();
    final theme = Get.find<ThemeController>();
    final me = auth.me.value!;
    return ListView(padding: skPagePadding(context), children: [
      const SkHeading('My account'),
      Row(children: [
        SkAvatar(slug: me.org.slug, name: me.user.name, url: me.user.avatarUrl, size: 56),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(me.user.name, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
            Text('@${me.user.username} · ${me.role == Role.barber ? 'Barber' : 'Admin'} · ${me.salonName}', style: Theme.of(context).textTheme.bodySmall),
          ]),
        ),
      ]),
      const SizedBox(height: SkSpace.lg),
      SkFlatList(children: [
        ListTile(
          leading: const SkIconCircle(Icons.lock_reset_rounded),
          title: const Text('Change password'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => showChangePassword(context, AccountApi(auth.api)),
        ),
        Obx(() => ListTile(
              leading: const SkIconCircle(Icons.brightness_6_outlined),
              title: const Text('Appearance'),
              trailing: DropdownButton<ThemeMode>(
                value: theme.mode.value,
                underline: const SizedBox(),
                onChanged: (m) => m == null ? null : theme.setMode(m),
                items: const [
                  DropdownMenuItem(value: ThemeMode.system, child: Text('Like my phone')),
                  DropdownMenuItem(value: ThemeMode.light, child: Text('Light')),
                  DropdownMenuItem(value: ThemeMode.dark, child: Text('Dark')),
                ],
              ),
            )),
        for (final b in accountExtras) b(context),
        ListTile(leading: const SkIconCircle(Icons.swap_horiz), title: const Text('Switch salon'), onTap: () => auth.switchSalon()),
        ListTile(
          leading: SkIconCircle(Icons.logout, color: Theme.of(context).colorScheme.error),
          title: Text('Sign out', style: TextStyle(color: Theme.of(context).colorScheme.error)),
          onTap: () async {
            if (await confirmSignOut(context)) await auth.signOut();
          },
        ),
      ]),
    ]);
  }
}
