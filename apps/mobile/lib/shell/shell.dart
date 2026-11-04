import 'package:animations/animations.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../core/api/api_error.dart';
import '../core/auth/auth_controller.dart';
import '../core/features/feature_gate.dart';
import '../core/features/feature_module.dart';
import '../core/features/registry.dart';
import '../core/push/deep_link.dart';
import '../models/me.dart';

const kSwitchedOff = 'That feature was switched off for your salon';

/// One-time steps after the shell opens (biometric offer, then push permission), run in order.
final postSignInSteps = <Future<void> Function(BuildContext context)>[];

/// The signed-in app: bottom tabs and a "More" list, both built from the modules switched on for this user.
/// Switches are re-read when the app returns to the foreground; if the open tab is switched off, back to home.
class Shell extends StatefulWidget {
  const Shell({super.key, required this.registry});
  final FeatureRegistry registry;

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> with WidgetsBindingObserver {
  final auth = Get.find<AuthController>();
  String _tab = '';
  late final Worker _watch;
  late final Worker _route;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _watch = ever<Me?>(auth.me, _onMe);
    _route = ever<String?>(pendingRoute, _open);
    pushArrived.addListener(_refreshBadges);
    _refreshBadges();
    if (pendingRoute.value != null) WidgetsBinding.instance.addPostFrameCallback((_) => _open(pendingRoute.value));
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      for (final step in postSignInSteps) {
        if (!mounted) return;
        await step(context);
      }
    });
  }

  @override
  void dispose() {
    _watch.dispose();
    _route.dispose();
    pushArrived.removeListener(_refreshBadges);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    if (s == AppLifecycleState.resumed) {
      auth.refreshMe().then((_) {}, onError: (Object e) => e is ApiError ? null : throw e);
      _refreshBadges();
    }
  }

  /// Re-reads every visible module's badge (unread counts); a failure just keeps the old count.
  void _refreshBadges() {
    final me = auth.me.value;
    if (me == null) return;
    for (final m in widget.registry.visibleFor(me)) {
      m.onRefresh?.call().then((_) {}, onError: (_) {});
    }
  }

  void _onMe(Me? me) {
    if (me == null || _tab.isEmpty || _tab == '_more') return;
    if (!widget.registry.isVisible(_tab, me)) {
      setState(() => _tab = '');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text(kSwitchedOff)));
    }
  }

  /// Opens a module named by a tapped notification: its tab, or its screen from "More".
  void _open(String? id) {
    final me = auth.me.value;
    if (id == null || me == null || !mounted) return;
    pendingRoute.value = null;
    if (widget.registry.tabsFor(me).any((m) => m.id == id)) {
      setState(() => _tab = id);
    } else if (widget.registry.isVisible(id, me)) {
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => FeatureGate(registry: widget.registry, id: id)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final me = auth.me.value;
      if (me == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
      final tabs = widget.registry.tabsFor(me);
      final more = widget.registry.moreFor(me);
      final ids = [...tabs.map((m) => m.id), if (more.isNotEmpty) '_more'];
      final current = ids.contains(_tab) ? _tab : ids.first;
      final index = ids.indexOf(current);
      final body = current == '_more' ? _MoreList(registry: widget.registry, modules: more) : tabs[index].builder(context);
      return Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          bottom: false,
          child: PageTransitionSwitcher(
            duration: MediaQuery.of(context).disableAnimations ? Duration.zero : const Duration(milliseconds: 250),
            transitionBuilder: (child, a, b) => FadeThroughTransition(animation: a, secondaryAnimation: b, fillColor: Colors.transparent, child: child),
            child: KeyedSubtree(key: ValueKey(current), child: body),
          ),
        ),
        bottomNavigationBar: ids.length < 2
            ? null
            : NavigationBar(
                selectedIndex: index,
                onDestinationSelected: (i) => setState(() => _tab = ids[i]),
                destinations: [
                  for (final m in tabs) NavigationDestination(icon: _Badged(icon: m.icon, counts: [?m.badge]), label: m.title),
                  if (more.isNotEmpty) NavigationDestination(icon: _Badged(icon: Icons.menu, counts: [for (final m in more) ?m.badge]), label: 'More'),
                ],
              ),
      );
    });
  }
}

class _MoreList extends StatelessWidget {
  const _MoreList({required this.registry, required this.modules});
  final FeatureRegistry registry;
  final List<FeatureModule> modules;

  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.symmetric(vertical: 12),
        children: [
          Padding(padding: const EdgeInsets.fromLTRB(20, 8, 20, 12), child: Text('More', style: Theme.of(context).textTheme.headlineSmall)),
          for (final m in modules)
            ListTile(
              leading: _Badged(icon: m.icon, counts: [?m.badge]),
              title: Text(m.title),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => FeatureGate(registry: registry, id: m.id))),
            ),
        ],
      );
}

/// An icon with a count bubble: the sum of [counts], hidden at 0.
class _Badged extends StatelessWidget {
  const _Badged({required this.icon, required this.counts});
  final IconData icon;
  final List<ValueListenable<int>> counts;

  @override
  Widget build(BuildContext context) {
    if (counts.isEmpty) return Icon(icon);
    return ListenableBuilder(
      listenable: Listenable.merge(counts),
      builder: (context, _) {
        final n = counts.fold<int>(0, (s, c) => s + c.value);
        return Badge(isLabelVisible: n > 0, label: Text(n > 99 ? '99+' : '$n'), child: Icon(icon));
      },
    );
  }
}
