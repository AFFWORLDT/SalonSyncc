import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../core/auth/auth_controller.dart';
import '../core/features/feature_gate.dart';
import '../core/features/registry.dart';
import '../core/theme/theme_controller.dart';
import '../core/ui/haptics.dart';
import '../core/ui/photo_pick.dart';
import '../core/ui/route.dart';
import '../core/ui/salon_logo.dart';
import '../core/ui/states.dart';
import '../data/account_api.dart';
import '../models/me.dart';
import '../models/role.dart';
import '../modules/account/account_module.dart';
import '../modules/account/change_password.dart';

/// Opens my profile: who I am, every screen that isn't a tab, and my account settings, as one clean list
/// (Groww-style: a big photo, then plain rows with an icon and a hairline between them).
Future<void> openProfile(BuildContext context, FeatureRegistry registry) =>
    Navigator.of(context).push(SkRoute<void>(builder: (_) => ProfileScreen(registry: registry)));

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, required this.registry});
  final FeatureRegistry registry;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final auth = Get.find<AuthController>();
  bool _photoBusy = false;

  void _open(String id) => Navigator.of(context).push(SkRoute<void>(builder: (_) => FeatureGate(registry: widget.registry, id: id)));

  Future<void> _photo(Me me) async {
    if (_photoBusy) return;
    final c = await choosePhoto(context, hasPhoto: me.user.avatarUrl != null);
    if (c == null || !mounted) return;
    setState(() => _photoBusy = true);
    final api = AccountApi(auth.api);
    try {
      switch (c) {
        case NewPhoto(:final photo):
          await api.setPhoto(photo.$1, photo.$2);
        case RemovePhoto():
          await api.clearPhoto();
      }
      await auth.refreshMe();
      Haptic.success();
    } catch (e) {
      Haptic.error();
      if (mounted) ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(messageOf(e))));
    } finally {
      if (mounted) setState(() => _photoBusy = false);
    }
  }

  Future<void> _appearance() async {
    final theme = Get.find<ThemeController>();
    final m = await showModalBottomSheet<ThemeMode>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          for (final (mode, label, icon) in const [
            (ThemeMode.system, 'Like my phone', Icons.brightness_auto_outlined),
            (ThemeMode.light, 'Light', Icons.light_mode_outlined),
            (ThemeMode.dark, 'Dark', Icons.dark_mode_outlined),
          ])
            ListTile(
              leading: Icon(icon),
              title: Text(label),
              trailing: theme.mode.value == mode ? Icon(Icons.check_rounded, color: Theme.of(c).colorScheme.primary) : null,
              onTap: () => Navigator.pop(c, mode),
            ),
          const SizedBox(height: 8),
        ]),
      ),
    );
    if (m != null) theme.setMode(m);
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    return Obx(() {
      final me = auth.me.value;
      if (me == null) return const Scaffold();
      final mods = widget.registry.moreFor(me).where((m) => m.id != 'account').toList();
      final settings = mods.where((m) => m.id == 'settings').firstOrNull;
      final bell = mods.where((m) => m.id == 'announcements').firstOrNull;
      final theme = Get.find<ThemeController>();
      final roleLabel = me.user.role == 'owner' ? 'Owner' : (me.role == Role.barber ? 'Barber' : 'Admin');
      return Scaffold(
        appBar: AppBar(
          backgroundColor: Colors.transparent,
          surfaceTintColor: Colors.transparent,
          actions: [
            if (bell != null) IconButton(tooltip: bell.title, onPressed: () => _open(bell.id), icon: _Badged(icon: Icons.notifications_none_rounded, counts: [?bell.badge])),
            if (settings != null) IconButton(tooltip: 'Settings', onPressed: () => _open(settings.id), icon: const Icon(Icons.settings_outlined)),
            const SizedBox(width: 4),
          ],
        ),
        body: ListView(padding: const EdgeInsets.only(bottom: 32), children: [
          // Who I am.
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 4, 24, 20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              GestureDetector(
                key: const ValueKey('profile-photo'),
                onTap: () => _photo(me),
                child: Stack(clipBehavior: Clip.none, children: [
                  ClipOval(child: SalonLogo(slug: me.org.slug, name: me.user.name, logoUrl: me.user.avatarUrl, size: 92)),
                  if (_photoBusy) const Positioned.fill(child: Center(child: CircularProgressIndicator())),
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: Container(
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(color: cs.primary, shape: BoxShape.circle, border: Border.all(color: cs.surface, width: 2)),
                      child: Icon(Icons.photo_camera_rounded, size: 15, color: cs.onPrimary),
                    ),
                  ),
                ]),
              ),
              const SizedBox(height: 16),
              Text(me.user.name, style: t.headlineMedium?.copyWith(fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text('@${me.user.username} · $roleLabel · ${me.salonName}', style: t.bodyMedium?.copyWith(color: cs.onSurfaceVariant)),
            ]),
          ),
          // Everything that isn't a tab.
          for (final m in mods)
            if (m.id != 'announcements' || bell == null) _Row(icon: m.icon, title: m.title, counts: [?m.badge], onTap: () => _open(m.id)),
          // My account.
          _Row(icon: Icons.lock_reset_rounded, title: 'Change password', onTap: () => showChangePassword(context, AccountApi(auth.api))),
          _Row(
            icon: Icons.brightness_6_outlined,
            title: 'Appearance',
            value: switch (theme.mode.value) { ThemeMode.light => 'Light', ThemeMode.dark => 'Dark', _ => 'Like my phone' },
            onTap: _appearance,
          ),
          for (final b in accountExtras) b(context),
          _Row(icon: Icons.swap_horiz_rounded, title: 'Switch salon', onTap: () => auth.switchSalon()),
          _Row(icon: Icons.logout_rounded, title: 'Sign out', danger: true, last: true, onTap: () => auth.signOut()),
          const SizedBox(height: 24),
          Center(child: Text('SalonKit', style: t.bodySmall?.copyWith(color: cs.onSurfaceVariant.withValues(alpha: 0.7)))),
        ]),
      );
    });
  }
}

/// One profile row: outline icon, title (and a value on the right), hairline under it from the text on.
class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.title, required this.onTap, this.value, this.counts = const [], this.danger = false, this.last = false});
  final IconData icon;
  final String title;
  final String? value;
  final VoidCallback onTap;
  final List<ValueListenable<int>> counts;
  final bool danger, last;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final fg = danger ? cs.error : cs.onSurface;
    return InkWell(
      onTap: () {
        Haptic.tap();
        onTap();
      },
      child: Padding(
        padding: const EdgeInsets.only(left: 24),
        child: Row(children: [
          _Badged(icon: icon, counts: counts, color: danger ? cs.error : cs.onSurfaceVariant),
          const SizedBox(width: 20),
          Expanded(
            child: Container(
              height: 64,
              padding: const EdgeInsets.only(right: 20),
              decoration: BoxDecoration(border: last ? null : Border(bottom: BorderSide(color: cs.outlineVariant.withValues(alpha: 0.5)))),
              child: Row(children: [
                Expanded(child: Text(title, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w500, color: fg))),
                if (value != null) Text(value!, style: TextStyle(color: cs.onSurfaceVariant)),
                if (!danger) Padding(padding: const EdgeInsets.only(left: 6), child: Icon(Icons.chevron_right_rounded, color: cs.onSurfaceVariant.withValues(alpha: 0.6))),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

class _Badged extends StatelessWidget {
  const _Badged({required this.icon, required this.counts, this.color});
  final IconData icon;
  final List<ValueListenable<int>> counts;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final i = Icon(icon, size: 26, color: color);
    if (counts.isEmpty) return i;
    return ListenableBuilder(
      listenable: Listenable.merge(counts),
      builder: (_, _) {
        final n = counts.fold<int>(0, (s, c) => s + c.value);
        return Badge(isLabelVisible: n > 0, label: Text(n > 99 ? '99+' : '$n'), child: i);
      },
    );
  }
}
