import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/ui/glass.dart';
import '../../core/ui/haptics.dart';
import '../../core/ui/tour.dart';
import '../../shell/nav.dart';
import '../../models/setup.dart';

/// "Get your salon ready": the first-run steps, until all are done or the admin hides the card (per salon).
class SetupChecklist extends StatefulWidget {
  const SetupChecklist({super.key, required this.slug, required this.setup, required this.withRatings});
  final String slug;
  final SetupState setup;
  final bool withRatings;

  @override
  State<SetupChecklist> createState() => _SetupChecklistState();
}

class _SetupChecklistState extends State<SetupChecklist> {
  bool? _hidden;
  String get _key => 'sk.setup.dismissed.${widget.slug}';

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((p) => mounted ? setState(() => _hidden = p.getBool(_key) ?? false) : null, onError: (_) {
      if (mounted) setState(() => _hidden = false);
    });
  }

  Future<void> _hide() async {
    setState(() => _hidden = true);
    try {
      (await SharedPreferences.getInstance()).setBool(_key, true);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.setup;
    // Each step opens where it is done.
    final steps = [
      ('Upload your salon logo', s.logo, 'settings'),
      ('Add your salon address and phone', s.details, 'settings'),
      ('Add your services and prices', s.services, 'services'),
      ('Add your staff', s.staff, 'staff'),
      ('Set up VAT on bills', s.vat, 'settings'),
      if (widget.withRatings) ('Add your Google review link', s.googleReview, 'settings'),
    ];
    final done = steps.where((x) => x.$2).length;
    if (_hidden != false || done == steps.length) return const SizedBox.shrink();
    final t = Theme.of(context).textTheme, cs = Theme.of(context).colorScheme;
    return tourTarget('setup', Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: SkGlass(blur: false, 
        padding: const EdgeInsets.fromLTRB(16, 10, 6, 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text('Get your salon ready', style: t.titleSmall?.copyWith(fontWeight: FontWeight.w600))),
            Text('$done of ${steps.length} done', style: t.bodySmall),
            IconButton(tooltip: 'Hide', onPressed: _hide, icon: const Icon(Icons.close_rounded, size: 20)),
          ]),
          for (final (label, ok, module) in steps)
            InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: ok
                  ? null
                  : () {
                      Haptic.tap();
                      openModule(module);
                    },
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 7),
                child: Row(children: [
                  Icon(ok ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded, size: 20, color: ok ? cs.primary : cs.onSurfaceVariant),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(label, style: t.bodyMedium?.copyWith(decoration: ok ? TextDecoration.lineThrough : null, color: ok ? cs.onSurfaceVariant : null)),
                  ),
                  if (!ok) Padding(padding: const EdgeInsets.only(right: 8), child: Icon(Icons.chevron_right_rounded, size: 20, color: cs.onSurfaceVariant)),
                ]),
              ),
            ),
        ]),
      ),
    ));
  }
}
