import 'dart:async';

import 'package:flutter/material.dart';
import 'auth_layout.dart';
import 'package:get/get.dart';

import '../core/api/api_error.dart';
import '../core/auth/auth_controller.dart';
import '../core/config.dart';
import '../core/ui/motion.dart';
import '../core/ui/salon_logo.dart';
import '../models/brand.dart';

const kSalonDebounce = Duration(milliseconds: 400);
const kNotFound = "We couldn't find that salon. Check the ID with your salon owner.";

/// First launch: the salon's ID, checked as it is typed; the salon's logo and name appear when found.
class SalonScreen extends StatefulWidget {
  const SalonScreen({super.key});
  @override
  State<SalonScreen> createState() => _SalonScreenState();
}

class _SalonScreenState extends State<SalonScreen> {
  final auth = Get.find<AuthController>();
  final _ctrl = TextEditingController();
  Timer? _debounce;
  int _seq = 0;
  bool _checking = false;
  String? _error;
  ({String slug, Brand brand})? _found;

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  void _changed(String v) {
    _debounce?.cancel();
    setState(() {
      _found = null;
      _error = null;
    });
    if (normalizeSlug(v).length < 2) return;
    _debounce = Timer(kSalonDebounce, () => _check(v));
  }

  Future<void> _check(String v) async {
    final seq = ++_seq;
    setState(() => _checking = true);
    String? error;
    ({String slug, Brand brand})? found;
    try {
      final b = await auth.checkSalon(v);
      if (b.found) {
        found = (slug: normalizeSlug(v), brand: b);
      } else {
        error = kNotFound;
      }
    } on Offline {
      error = "You're offline";
    } on ApiError catch (e) {
      error = e.message;
    }
    if (!mounted || seq != _seq) return; // a newer keystroke won
    setState(() {
      _checking = false;
      _found = found;
      _error = error;
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    final c = Theme.of(context).colorScheme;
    final f = _found;
    return SkAuthLayout(
      badge: Image.asset('assets/brand/icon.png', fit: BoxFit.cover),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text('Enter your salon ID', style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.4)),
                  const SizedBox(height: 6),
                  Text('Your salon owner can tell you this.', style: t.bodyMedium?.copyWith(color: c.onSurfaceVariant)),
                  const SizedBox(height: 20),
                  TextField(
                    controller: _ctrl,
                    autofocus: true,
                    autocorrect: false,
                    enableSuggestions: false,
                    textInputAction: TextInputAction.go,
                    decoration: InputDecoration(
                      hintText: 'e.g. supersalon',
                      suffixIcon: _checking ? const Padding(padding: EdgeInsets.all(14), child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))) : null,
                    ),
                    onChanged: _changed,
                    onSubmitted: (_) => f == null ? null : _continue(f),
                  ),
                  AnimatedSwitcher(
                    key: const Key('salon-reveal'),
                    duration: skDuration(context),
                    transitionBuilder: (child, a) => FadeTransition(opacity: a, child: ScaleTransition(scale: Tween(begin: 0.94, end: 1.0).animate(a), child: child)),
                    child: f != null
                        ? Padding(
                            key: ValueKey(f.slug),
                            padding: const EdgeInsets.only(top: 24),
                            child: Column(children: [
                              SalonLogo(slug: f.slug, name: f.brand.name!, logoUrl: f.brand.logoUrl),
                              const SizedBox(height: 12),
                              Text(f.brand.name!, style: t.titleLarge?.copyWith(fontWeight: FontWeight.w600), textAlign: TextAlign.center),
                              const SizedBox(height: 20),
                              FilledButton(style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)), onPressed: () => _continue(f), child: const Text('Continue')),
                            ]),
                          )
                        : _error != null
                            ? Padding(
                                key: ValueKey(_error),
                                padding: const EdgeInsets.only(top: 16),
                                child: Text(_error!, style: t.bodyMedium?.copyWith(color: c.error)),
                              )
                            : const SizedBox(key: ValueKey('empty')),
                  ),
                ]),
    );
  }

  void _continue(({String slug, Brand brand}) f) => auth.chooseSalon(SavedSalon(slug: f.slug, name: f.brand.name!, logoUrl: f.brand.logoUrl));
}
