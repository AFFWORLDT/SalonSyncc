import 'package:animations/animations.dart';
import '../core/ui/tour.dart';
import '../core/ui/toast.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:get/get.dart';

import '../core/api/api_error.dart';
import '../core/auth/auth_controller.dart';
import '../core/features/feature_gate.dart';
import '../core/features/registry.dart';
import '../core/push/deep_link.dart';
import '../core/ui/route.dart';
import '../models/me.dart';
import 'profile_screen.dart';
import 'search_screen.dart';
import 'top_bar.dart';

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
    if (me == null || _tab.isEmpty) return;
    if (!widget.registry.isVisible(_tab, me)) {
      setState(() => _tab = '');
      if (!mounted) return;
      showSkToast(context, kSwitchedOff);
    }
  }

  /// Opens a module named by a tapped notification: its tab, or its screen from "More".
  void _open(String? id) {
    final me = auth.me.value;
    if (id == null || me == null || !mounted) return;
    pendingRoute.value = null;
    if (widget.registry.tabsFor(me).any((m) => m.id == id)) {
      // A tab sits under any screen opened on top (e.g. Monthly → its daily sheet): close those first.
      Navigator.of(context).popUntil((r) => r.isFirst);
      setState(() => _tab = id);
    } else if (widget.registry.isVisible(id, me)) {
      Navigator.of(context).push(SkRoute<void>(builder: (_) => FeatureGate(registry: widget.registry, id: id)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final me = auth.me.value;
      if (me == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
      final tabs = widget.registry.tabsFor(me);
      final more = widget.registry.moreFor(me);
      // Everything that isn't a tab lives in the profile (the photo in the top bar), Groww-style.
      final ids = [for (final m in tabs) m.id];
      final current = ids.contains(_tab) ? _tab : ids.first;
      final index = ids.indexOf(current);
      return Scaffold(
        backgroundColor: Colors.transparent,
        body: SafeArea(
          bottom: false,
          child: Column(children: [
            SkTopBar(
              me: me,
              badge: [for (final m in more) ?m.badge],
              onSearch: () => openSearch(context, widget.registry),
              onAi: () => showAiSoon(context),
              onProfile: () => openProfile(context, widget.registry),
            ),
            Expanded(
              child: PageTransitionSwitcher(
                duration: MediaQuery.of(context).disableAnimations ? Duration.zero : const Duration(milliseconds: 160),
                transitionBuilder: (child, a, b) => FadeThroughTransition(animation: a, secondaryAnimation: b, fillColor: Colors.transparent, child: child),
                child: KeyedSubtree(key: ValueKey(current), child: tabs[index].builder(context)),
              ),
            ),
          ]),
        ),
        bottomNavigationBar: ids.length < 2
            ? null
            : NavigationBar(
                selectedIndex: index,
                onDestinationSelected: (i) {
                  if (i != index) HapticFeedback.selectionClick();
                  setState(() => _tab = ids[i]);
                },
                destinations: [for (final m in tabs) NavigationDestination(icon: tourTarget('tab-${m.id}', _Badged(icon: m.icon, counts: [?m.badge])), label: m.title)],
              ),
      );
    });
  }
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
