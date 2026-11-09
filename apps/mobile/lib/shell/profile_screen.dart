import 'package:flutter/foundation.dart';
import '../core/ui/confirm_sign_out.dart';
import '../core/ui/tour.dart';
import '../core/ui/toast.dart';
import '../core/ui/avatar.dart';
import '../core/ui/profile_banner.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:url_launcher/url_launcher.dart';

import '../auth_ui/auth_layout.dart' show SkWordmark;
import '../core/config.dart';
import '../core/format/fmt.dart';
import '../core/features/feature_module.dart';

import '../core/auth/auth_controller.dart';
import '../core/features/feature_gate.dart';
import '../core/features/registry.dart';
import '../core/theme/theme_controller.dart';
import '../core/ui/haptics.dart';
import '../core/ui/photo_pick.dart';
import '../core/ui/route.dart';
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
  bool _photoBusy = false, _bannerBusy = false;

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
      if (mounted) showSkToast(context, messageOf(e), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _photoBusy = false);
    }
  }

  Future<void> _banner(Me me) async {
    if (_bannerBusy) return;
    final c = await choosePhoto(context, hasPhoto: me.user.bannerUrl != null, shape: PhotoShape.banner, noun: 'banner');
    if (c == null || !mounted) return;
    setState(() => _bannerBusy = true);
    final api = AccountApi(auth.api);
    try {
      switch (c) {
        case NewPhoto(:final photo):
          await api.setBanner(photo.$1, photo.$2);
        case RemovePhoto():
          await api.clearBanner();
      }
      await auth.refreshMe();
      Haptic.success();
    } catch (e) {
      if (mounted) showSkToast(context, messageOf(e), kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _bannerBusy = false);
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
      final rows = [for (final m in mods) if (m.id != 'settings' && (m.id != 'announcements' || bell == null)) m];
      final mine = [for (final m in rows) if (_personal.contains(m.id)) m];
      final business = [for (final m in rows) if (!_personal.contains(m.id)) m];
      Widget moduleRow(FeatureModule m) => _Row(icon: m.icon, title: m.title, subtitle: _subtitles[m.id], counts: [?m.badge], onTap: () => _open(m.id));
      return Scaffold(
        body: SafeArea(
          bottom: false,
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 32), children: [
            // Top: back, the SalonKit mark, notifications and salon settings.
            Row(children: [
              _RoundButton(key: const ValueKey('profile-back'), tooltip: 'Back', icon: const Icon(Icons.arrow_back_rounded), onTap: () => Navigator.of(context).maybePop()),
              const SizedBox(width: 12),
              SkWordmark(color: Theme.of(context).brightness == Brightness.dark ? Colors.white : const Color(0xFF0B4A3A), size: 24),
              const Spacer(),
              if (bell != null) _RoundButton(tooltip: bell.title, icon: _Badged(icon: Icons.notifications_none_rounded, counts: [?bell.badge], color: cs.onSurface), onTap: () => _open(bell.id)),
              if (settings != null) ...[
                const SizedBox(width: 8),
                _RoundButton(key: const ValueKey('profile-settings'), tooltip: 'Settings', icon: const Icon(Icons.settings_outlined), onTap: () => _open(settings.id)),
              ],
            ]),
            const SizedBox(height: 16),
            // Who I am: my photo, name, username and a gold "Owner · Salon" badge, over my banner (faded).
            Stack(clipBehavior: Clip.none, children: [
              Positioned.fill(
                child: GestureDetector(
                  key: const ValueKey('profile-banner'),
                  onTap: () => _banner(me),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(28),
                    child: ShaderMask(
                      blendMode: BlendMode.dstIn,
                      shaderCallback: (r) => const LinearGradient(colors: [Color(0x14000000), Color(0x66000000)]).createShader(r),
                      child: LayoutBuilder(builder: (_, c) => SkProfileBanner(slug: me.org.slug, url: me.user.bannerUrl, height: c.maxHeight)),
                    ),
                  ),
                ),
              ),
              if (_bannerBusy) const Positioned.fill(child: Center(child: CircularProgressIndicator())),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 14, 12, 14),
                child: Row(children: [
                  GestureDetector(
                    key: const ValueKey('profile-photo'),
                    onTap: () => _photo(me),
                    child: Stack(clipBehavior: Clip.none, children: [
                      Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          color: cs.surface,
                          shape: BoxShape.circle,
                          boxShadow: const [BoxShadow(color: Color(0x1F000000), blurRadius: 16, offset: Offset(0, 6))],
                        ),
                        child: SkAvatar(slug: me.org.slug, name: me.user.name, url: me.user.avatarUrl, size: 104),
                      ),
                      if (_photoBusy) const Positioned.fill(child: Center(child: CircularProgressIndicator())),
                      Positioned(
                        right: 0,
                        bottom: 2,
                        child: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(color: _deep, shape: BoxShape.circle, border: Border.all(color: cs.surface, width: 3)),
                          child: const Icon(Icons.photo_camera_rounded, size: 16, color: Colors.white),
                        ),
                      ),
                    ]),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(me.user.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -0.5)),
                      const SizedBox(height: 2),
                      Text('@${me.user.username}', maxLines: 1, overflow: TextOverflow.ellipsis, style: t.bodyMedium?.copyWith(color: cs.onSurfaceVariant)),
                      const SizedBox(height: 10),
                      _RoleBadge(text: '$roleLabel · ${me.salonName}', owner: me.user.role == 'owner'),
                    ]),
                  ),
                ]),
              ),
              Positioned(
                right: 6,
                top: 6,
                child: IconButton(
                  key: const ValueKey('profile-banner-edit'),
                  tooltip: me.user.bannerUrl == null ? 'Add a banner' : 'Change banner',
                  onPressed: () => _banner(me),
                  icon: Icon(Icons.wallpaper_rounded, size: 20, color: cs.onSurfaceVariant),
                ),
              ),
            ]),
            const SizedBox(height: 16),
            _SalonCard(me: me, onView: settings == null ? null : () => _open(settings.id)),
            if (mine.isNotEmpty) ...[const SizedBox(height: 16), _Group(children: [for (final m in mine) moduleRow(m)])],
            if (business.isNotEmpty) ...[const SizedBox(height: 16), _Group(children: [for (final m in business) moduleRow(m)])],
            const SizedBox(height: 16),
            _Group(children: [
              _Row(icon: Icons.lock_reset_rounded, title: 'Change password', subtitle: 'Keep your account safe', onTap: () => showChangePassword(context, AccountApi(auth.api))),
              _Row(
                icon: Icons.brightness_6_outlined,
                title: 'Appearance',
                value: switch (theme.mode.value) { ThemeMode.light => 'Light', ThemeMode.dark => 'Dark', _ => 'Like my phone' },
                onTap: _appearance,
              ),
              for (final b in accountExtras) b(context),
              _Row(
                icon: Icons.tour_outlined,
                title: 'Replay the tour',
                subtitle: 'A quick look around the app',
                onTap: () async {
                  // Back to the tabs first (the tour points at them), then play it from the navigator, which stays.
                  final nav = Navigator.of(context);
                  nav.pop();
                  await Future<void>.delayed(const Duration(milliseconds: 260));
                  if (!nav.mounted) return;
                  await maybeShowTour(nav.context, slug: me.org.slug, userId: me.user.id, steps: tourSteps(salonName: me.salonName, admin: me.role == Role.admin), force: true);
                },
              ),
              _Row(icon: Icons.swap_horiz_rounded, title: 'Switch salon', onTap: () => auth.switchSalon()),
              _Row(icon: Icons.logout_rounded, title: 'Sign out', danger: true, onTap: () async {
                if (await confirmSignOut(context)) await auth.signOut();
              }),
            ]),
            const SizedBox(height: 16),
            const _HelpCard(),
            const SizedBox(height: 20),
            Center(child: Text('SalonKit', style: t.bodySmall?.copyWith(color: cs.onSurfaceVariant.withValues(alpha: 0.7)))),
          ]),
        ),
      );
    });
  }
}

const _deep = Color(0xFF0E5A48);

/// My own records come first; the salon's tools after.
const _personal = {'history', 'monthly', 'ledger', 'bills', 'all_bills'};

/// One line under each row's title.
const _subtitles = {
  'history': 'Your past sales',
  'monthly': 'Your month at a glance',
  'ledger': 'Advances, payouts and balances',
  'bills': 'View and share your bills',
  'all_bills': 'Every bill, to view and share',
  'customers': 'Manage your customers',
  'expenses': 'Track salon expenses',
  'services': 'Your services and prices',
  'staff': 'Manage your team',
  'send_announcements': 'Send updates to your team',
  'announcements': 'Updates from your salon',
  'ratings': 'What customers say',
  'audit': 'Who changed what, and when',
  'plan': 'Your SalonKit plan',
};

/// "👑 Owner · Groot Salon" on a soft gold pill (a plain mint pill for other roles).
class _RoleBadge extends StatelessWidget {
  const _RoleBadge({required this.text, required this.owner});
  final String text;
  final bool owner;
  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final bg = owner ? (dark ? const Color(0x33D9A14E) : const Color(0xFFFBEBCB)) : _deep.withValues(alpha: dark ? 0.3 : 0.1);
    final fg = owner ? (dark ? const Color(0xFFF2C27A) : const Color(0xFF6B4A12)) : (dark ? const Color(0xFF7FE3B0) : _deep);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999), border: owner ? Border.all(color: const Color(0x55D9A14E)) : null),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(owner ? Icons.workspace_premium_rounded : Icons.badge_outlined, size: 16, color: owner ? const Color(0xFFD9A14E) : fg),
        const SizedBox(width: 6),
        Flexible(child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: fg))),
      ]),
    );
  }
}

/// The salon: a shop icon, its name and address, and "View salon" (its settings) for admins.
class _SalonCard extends StatelessWidget {
  const _SalonCard({required this.me, this.onView});
  final Me me;
  final VoidCallback? onView;
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final address = me.salon.address?.trim();
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: LinearGradient(colors: dark ? [cs.primary.withValues(alpha: 0.12), cs.primary.withValues(alpha: 0.2)] : const [Color(0xFFEAF5EE), Color(0xFFF4F9F5)]),
        border: Border.all(color: dark ? cs.primary.withValues(alpha: 0.3) : const Color(0xFFD5EADD)),
      ),
      child: Row(children: [
        Icon(Icons.storefront_rounded, size: 34, color: dark ? const Color(0xFF7FE3B0) : _deep),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(me.salonName, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            if (address != null && address.isNotEmpty) ...[
              const SizedBox(height: 2),
              Row(children: [
                Icon(Icons.location_on_outlined, size: 15, color: cs.onSurfaceVariant),
                const SizedBox(width: 3),
                Expanded(child: Text(address, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant))),
              ]),
            ],
          ]),
        ),
        if (onView != null)
          Material(
            color: cs.surface,
            shape: StadiumBorder(side: BorderSide(color: cs.outlineVariant.withValues(alpha: 0.6))),
            child: InkWell(
              customBorder: const StadiumBorder(),
              onTap: onView,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Text('View salon', style: TextStyle(fontWeight: FontWeight.w700, color: dark ? const Color(0xFF7FE3B0) : _deep)),
                  const SizedBox(width: 4),
                  Icon(Icons.arrow_forward_rounded, size: 17, color: dark ? const Color(0xFF7FE3B0) : _deep),
                ]),
              ),
            ),
          ),
      ]),
    );
  }
}

/// Rows in one white rounded card with hairlines between them.
class _Group extends StatelessWidget {
  const _Group({required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      decoration: BoxDecoration(
        color: cs.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: cs.outlineVariant.withValues(alpha: dark ? 0.6 : 0.35)),
        boxShadow: dark ? null : const [BoxShadow(color: Color(0x0D1C1B18), blurRadius: 18, offset: Offset(0, 6))],
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(
        type: MaterialType.transparency,
        child: Column(children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) Divider(height: 1, thickness: 1, indent: 76, endIndent: 16, color: cs.outlineVariant.withValues(alpha: 0.45)),
            children[i],
          ],
        ]),
      ),
    );
  }
}

/// "Need help? Contact our support team" with a Get support button (emails support).
class _HelpCard extends StatelessWidget {
  const _HelpCard();
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 10, 12),
      decoration: BoxDecoration(
        color: cs.surface,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: cs.outlineVariant.withValues(alpha: 0.5)),
      ),
      child: Row(children: [
        Icon(Icons.headset_mic_outlined, size: 30, color: cs.onSurface),
        const SizedBox(width: 14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Need help?', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            Text('Contact our support team', style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
          ]),
        ),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: _deep, foregroundColor: Colors.white, shape: const StadiumBorder(), padding: const EdgeInsets.symmetric(horizontal: 16)),
          onPressed: () => launchUrl(Uri(scheme: 'mailto', path: 'support@$kRootDomain', query: 'subject=SalonKit help')),
          child: const Row(mainAxisSize: MainAxisSize.min, children: [Text('Get support'), SizedBox(width: 4), Icon(Icons.arrow_forward_rounded, size: 17)]),
        ),
      ]),
    );
  }
}

/// A 44px white circle button for the top row.
class _RoundButton extends StatelessWidget {
  const _RoundButton({super.key, required this.tooltip, required this.icon, required this.onTap});
  final String tooltip;
  final Widget icon;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Tooltip(
      message: tooltip,
      child: Material(
        color: cs.surface,
        shape: CircleBorder(side: BorderSide(color: cs.outlineVariant.withValues(alpha: 0.6))),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: () {
            Haptic.tap();
            onTap();
          },
          child: SizedBox(width: 44, height: 44, child: Center(child: IconTheme(data: IconThemeData(color: cs.onSurface, size: 22), child: icon))),
        ),
      ),
    );
  }
}

/// One row: the icon in a soft mint circle, a title with a line under it, and a chevron (or a value).
class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.title, required this.onTap, this.subtitle, this.value, this.counts = const [], this.danger = false});
  final IconData icon;
  final String title;
  final String? subtitle, value;
  final VoidCallback onTap;
  final List<ValueListenable<int>> counts;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final tint = danger ? cs.error : (dark ? const Color(0xFF7FE3B0) : _deep);
    return InkWell(
      onTap: () {
        Haptic.tap();
        onTap();
      },
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
        child: Row(children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(color: tint.withValues(alpha: dark ? 0.16 : 0.09), shape: BoxShape.circle),
            child: Center(child: _Badged(icon: icon, counts: counts, color: tint)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: TextStyle(fontSize: 16.5, fontWeight: FontWeight.w600, color: danger ? cs.error : cs.onSurface)),
              if (subtitle != null) ...[
                const SizedBox(height: 2),
                Text(subtitle!, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant)),
              ],
            ]),
          ),
          if (value != null) Text(value!, style: TextStyle(color: cs.onSurfaceVariant)),
          if (!danger) Padding(padding: const EdgeInsets.only(left: 6), child: Icon(Icons.chevron_right_rounded, color: cs.onSurfaceVariant)),
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
    final i = Icon(icon, size: 24, color: color);
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
